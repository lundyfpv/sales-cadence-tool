'use strict';
// Minimal ACME (RFC 8555) client for Let's Encrypt using the HTTP-01 challenge.
// No dependencies: JWS signing, CSR building and PEM handling use node:crypto.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const DIRECTORIES = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
};
const challenges = new Map(); // token -> keyAuthorization (served on port 80)

const b64u = b => Buffer.from(b).toString('base64url');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- DER helpers for the CSR ---------- */
function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = []; while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]); };
function oid(str) {
  const p = str.split('.').map(Number); const out = [40 * p[0] + p[1]];
  for (const n of p.slice(2)) { const enc = [n & 0x7f]; let v = n >> 7; while (v > 0) { enc.unshift((v & 0x7f) | 0x80); v >>= 7; } out.push(...enc); }
  return tlv(0x06, Buffer.from(out));
}
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);

function buildCsr(domains, key) {
  const spki = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
  const subject = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(domains[0])))));
  const san = seq(...domains.map(d => tlv(0x82, Buffer.from(d))));
  const extReq = seq(oid('1.2.840.113549.1.9.14'), set(seq(seq(oid('2.5.29.17'), tlv(0x04, san)))));
  const info = seq(tlv(0x02, Buffer.from([0])), subject, spki, tlv(0xa0, extReq));
  const sig = crypto.sign('sha256', info, key); // DER-encoded ECDSA signature
  return seq(info, seq(oid('1.2.840.10045.4.3.2')), tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
}

/* ---------- account key + JWS ---------- */
function accountKey() {
  const file = path.join(store.CERT_DIR, 'account.key');
  if (!fs.existsSync(file)) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  return crypto.createPrivateKey(fs.readFileSync(file));
}
function publicJwk(key) { const j = crypto.createPublicKey(key).export({ format: 'jwk' }); return { crv: j.crv, kty: j.kty, x: j.x, y: j.y }; }
function thumbprint(key) { const j = publicJwk(key); return b64u(crypto.createHash('sha256').update(JSON.stringify({ crv: j.crv, kty: j.kty, x: j.x, y: j.y })).digest()); }

class Acme {
  constructor({ staging, log }) {
    this.dirUrl = staging ? DIRECTORIES.staging : DIRECTORIES.production;
    this.key = accountKey();
    this.log = log || (() => {});
    this.nonce = null; this.kid = null;
  }
  async init() {
    const r = await fetch(this.dirUrl);
    if (!r.ok) throw new Error(`Couldn't reach Let's Encrypt (${r.status}).`);
    this.dir = await r.json();
  }
  async getNonce() {
    if (this.nonce) { const n = this.nonce; this.nonce = null; return n; }
    const r = await fetch(this.dir.newNonce, { method: 'HEAD' });
    return r.headers.get('replay-nonce');
  }
  async post(url, payload, { retry = true, accept } = {}) {
    const header = { alg: 'ES256', nonce: await this.getNonce(), url };
    if (this.kid) header.kid = this.kid; else header.jwk = publicJwk(this.key);
    const prot = b64u(JSON.stringify(header));
    const pay = payload === '' ? '' : b64u(JSON.stringify(payload));
    const signature = b64u(crypto.sign('sha256', Buffer.from(`${prot}.${pay}`), { key: this.key, dsaEncoding: 'ieee-p1363' }));
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/jose+json', ...(accept ? { Accept: accept } : {}) }, body: JSON.stringify({ protected: prot, payload: pay, signature }) });
    this.nonce = r.headers.get('replay-nonce');
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) {
      if (retry && body && body.type === 'urn:ietf:params:acme:error:badNonce') return this.post(url, payload, { retry: false, accept });
      const err = new Error((body && body.detail) || `ACME request failed (${r.status})`);
      err.acme = body; throw err;
    }
    return { body, location: r.headers.get('location'), headers: r.headers };
  }
  async account(email) {
    const payload = { termsOfServiceAgreed: true };
    if (email) payload.contact = ['mailto:' + email];
    const r = await this.post(this.dir.newAccount, payload);
    this.kid = r.location;
  }
  async poll(url, done, what) {
    for (let i = 0; i < 40; i++) {
      const { body } = await this.post(url, '');
      if (done(body)) return body;
      if (body.status === 'invalid') {
        const chErr = (body.challenges || []).map(c => c.error && c.error.detail).filter(Boolean)[0];
        throw new Error(`${what} failed: ${chErr || (body.error && body.error.detail) || 'Let\'s Encrypt rejected it.'}`);
      }
      await sleep(i < 5 ? 2000 : 4000);
    }
    throw new Error(`${what} timed out.`);
  }
}

/* ---------- public API ---------- */
function certPaths() { return { key: path.join(store.CERT_DIR, 'privkey.pem'), cert: path.join(store.CERT_DIR, 'fullchain.pem') }; }
function certInfo() {
  const p = certPaths();
  if (!fs.existsSync(p.cert)) return null;
  try {
    const pem = fs.readFileSync(p.cert, 'utf8');
    const x = new crypto.X509Certificate(pem);
    const domains = (x.subjectAltName || '').split(',').map(s => s.trim().replace(/^DNS:/, '')).filter(Boolean);
    return { domains, issuer: x.issuer.replace(/\n/g, ', '), validFrom: new Date(x.validFrom).toISOString(), validTo: new Date(x.validTo).toISOString(), staging: /STAGING|Fake|\(STAGING\)/i.test(x.issuer) };
  } catch (e) { return { error: 'Certificate file could not be read: ' + e.message }; }
}

async function issue({ domain, email, staging }, log) {
  domain = String(domain || '').trim().toLowerCase();
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error('Enter a full domain name, like planner.example.com.');
  const acme = new Acme({ staging, log });
  log(`Contacting Let's Encrypt (${staging ? 'staging, for testing' : 'production'})…`);
  await acme.init();
  await acme.account(email);
  log('Account ready.');
  const order = await acme.post(acme.dir.newOrder, { identifiers: [{ type: 'dns', value: domain }] });
  const orderUrl = order.location;
  const thumb = thumbprint(acme.key);
  for (const authUrl of order.body.authorizations) {
    const { body: authz } = await acme.post(authUrl, '');
    if (authz.status === 'valid') { log(`${authz.identifier.value} is already verified.`); continue; }
    const ch = authz.challenges.find(c => c.type === 'http-01');
    if (!ch) throw new Error('Let\'s Encrypt did not offer an HTTP challenge for this domain.');
    challenges.set(ch.token, `${ch.token}.${thumb}`);
    log(`Waiting for Let's Encrypt to load http://${authz.identifier.value}/.well-known/acme-challenge/… through your router`);
    try {
      await acme.post(ch.url, {});
      await acme.poll(authUrl, b => b.status === 'valid', 'Domain check');
    } finally { challenges.delete(ch.token); }
    log('Domain verified.');
  }
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const csr = buildCsr([domain], privateKey);
  log('Requesting the certificate…');
  const fin = await acme.post(order.body.finalize, { csr: b64u(csr) });
  let ord = fin.body;
  if (ord.status !== 'valid') ord = await acme.poll(orderUrl, b => b.status === 'valid', 'Certificate order');
  const { body: chain } = await acme.post(ord.certificate, '', { accept: 'application/pem-certificate-chain' });
  const p = certPaths();
  fs.writeFileSync(p.key + '.tmp', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(p.cert + '.tmp', chain);
  fs.renameSync(p.key + '.tmp', p.key);
  fs.renameSync(p.cert + '.tmp', p.cert);
  log('Certificate saved.');
  return certInfo();
}

module.exports = { challenges, issue, certInfo, certPaths, buildCsr, thumbprint };
