'use strict';
const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');
const acme = require('./acme');
const pkg = require('../package.json');

const HTTP_PORT = +(process.env.HTTP_PORT || 8080);
const HTTPS_PORT = +(process.env.HTTPS_PORT || 8443);
const PUBLIC_HTTPS_PORT = +(process.env.PUBLIC_HTTPS_PORT || 443);
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
const MAX_UPLOAD = +(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
const PUBLIC = path.join(__dirname, '..', 'public');

/* ---------- helpers ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function baseHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === 'string';
  const data = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
const fail = (res, status, error, code) => send(res, status, { error, code });
function readJson(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
const idOk = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);

/* ---------- static files ---------- */
function serveStatic(req, res, rel) {
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return fail(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return fail(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', ETag: etag, 'Cache-Control': ['.png', '.woff2', '.ico'].includes(ext) ? 'public, max-age=604800' : 'no-cache' };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    if (rel === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- live updates (server-sent events) ---------- */
const streams = new Set();
store.listeners.add(rev => { for (const s of streams) s.write(`data: ${rev}\n\n`); });
setInterval(() => { for (const s of streams) s.write(': ping\n\n'); }, 25000).unref();

/* ---------- ACME job state ---------- */
const job = { running: false, log: [], error: null, finished: null };
async function runIssue(cfg) {
  if (job.running) return;
  Object.assign(job, { running: true, log: [], error: null, finished: null });
  const log = m => { job.log.push(`${new Date().toLocaleTimeString()}  ${m}`); console.log('[acme]', m); };
  try {
    await acme.issue(cfg, log);
    reloadTls();
    log('HTTPS is on. Restart is not needed.');
    store.kvSet('acme', { ...store.kvGet('acme', {}), lastIssued: Date.now(), lastError: null });
  } catch (e) {
    job.error = e.message; log('Stopped: ' + e.message);
    store.kvSet('acme', { ...store.kvGet('acme', {}), lastError: e.message, lastErrorAt: Date.now() });
  } finally { job.running = false; job.finished = Date.now(); }
}
// Daily renewal check: renew when fewer than 30 days remain.
setInterval(() => {
  const cfg = store.kvGet('acme', {}); const info = acme.certInfo();
  if (!cfg.autoRenew || !cfg.domain || !info || info.error) return;
  if (new Date(info.validTo) - Date.now() < 30 * 864e5) runIssue({ domain: cfg.domain, email: cfg.email, staging: info.staging });
}, 12 * 3600 * 1000).unref();

/* ---------- request handling ---------- */
async function handle(req, res) {
  req.secure = !!req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
  req.ip = clientIp(req);
  baseHeaders(res, req);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // ACME HTTP-01 challenge (must stay on plain HTTP)
  if (p.startsWith('/.well-known/acme-challenge/')) {
    const token = p.split('/').pop();
    const ka = acme.challenges.get(token) || (selfTest.token === token ? selfTest.value : null);
    return ka ? send(res, 200, ka) : fail(res, 404, 'Not found');
  }

  // Redirect plain HTTP to HTTPS for the configured domain once a certificate exists.
  const cfg = store.kvGet('acme', {});
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (!req.secure && httpsServer && cfg.domain && host === cfg.domain && cfg.redirect !== false) {
    res.writeHead(301, { Location: `https://${cfg.domain}${PUBLIC_HTTPS_PORT === 443 ? '' : ':' + PUBLIC_HTTPS_PORT}${req.url}` });
    return res.end();
  }

  const session = auth.sessionFrom(req);

  // Pages
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (p === '/' || p === '/index.html') return session ? serveStatic(req, res, '/app.html') : redirect(res, '/login');
    if (p === '/login') return session ? redirect(res, '/') : serveStatic(req, res, '/login.html');
    if (p === '/admin') return session ? serveStatic(req, res, '/admin.html') : redirect(res, '/login');
    if (p === '/app.html' || p === '/admin.html') return redirect(res, '/');
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);
  }

  if (!p.startsWith('/api/')) return fail(res, 404, 'Not found');
  // CSRF guard: every state-changing API call must carry a custom header,
  // which browsers refuse to send cross-site without CORS (never enabled here).
  if (req.method !== 'GET' && req.headers['x-cb'] !== '1') return fail(res, 403, 'Missing request header.', 'csrf');

  try {
    /* ---- session endpoints (no login needed) ---- */
    if (p === '/api/session' && req.method === 'GET') {
      return send(res, 200, { user: session ? session.user : null, setupNeeded: auth.userCount() === 0, version: pkg.version });
    }
    if (p === '/api/setup' && req.method === 'POST') {
      if (auth.userCount() > 0) return fail(res, 409, 'An account already exists. Sign in instead.');
      const b = await readJson(req);
      const username = String(b.username || '').trim();
      if (!/^[A-Za-z0-9_.@-]{2,60}$/.test(username)) return fail(res, 400, 'Use 2–60 letters, numbers, or . _ @ - for the username.');
      const prob = auth.passwordProblem(b.password); if (prob) return fail(res, 400, prob);
      const id = auth.createUser(username, b.password, 'admin');
      const token = auth.createSession(id, req);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(token, req.secure) });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const wait = auth.throttled(req.ip);
      if (wait) return fail(res, 429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''}.`);
      const b = await readJson(req);
      const u = auth.q.byName.get(String(b.username || '').trim());
      const okPw = u ? auth.verifyPassword(String(b.password || ''), u.pass) : (auth.verifyPassword('x', 'scrypt$32768$8$1$AAAA$AAAA'), false);
      if (!okPw) { auth.noteFail(req.ip); return fail(res, 401, 'Wrong username or password.'); }
      if (u.totp) {
        if (!b.code) return fail(res, 401, 'Enter the 6-digit code from your authenticator app.', 'totp_required');
        if (!auth.verifyTotp(u.totp, b.code, u.id)) { auth.noteFail(req.ip); return fail(res, 401, 'That code didn\'t match. Codes change every 30 seconds.', 'totp_required'); }
      }
      auth.noteSuccess(req.ip);
      const token = auth.createSession(u.id, req);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(token, req.secure) });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      if (session) auth.q.sDel.run(session.tokenHash);
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', req.secure, true) });
    }

    /* ---- everything below needs a session ---- */
    if (!session) return fail(res, 401, 'Sign in first.', 'unauth');
    const user = session.user;

    if (p === '/api/state' && req.method === 'GET') return send(res, 200, { ...store.state(), user });

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 4000\ndata: ${store.getRev()}\n\n`);
      streams.add(res); req.on('close', () => streams.delete(res));
      return;
    }

    let m = p.match(/^\/api\/docs\/([a-z]+)\/([^/]+)$/);
    if (m) {
      const [, coll, id] = m;
      if (!store.COLLECTIONS.has(coll) || !idOk(id)) return fail(res, 400, 'Unknown record.');
      if (req.method === 'PUT') { const b = await readJson(req); if (!b || typeof b !== 'object' || Array.isArray(b)) return fail(res, 400, 'Invalid record.'); store.putDoc(coll, id, b); store.bump(); return send(res, 200, { ok: true }); }
      if (req.method === 'PATCH') { const b = await readJson(req); if (!store.patchDoc(coll, id, b)) return fail(res, 404, 'That record no longer exists.'); store.bump(); return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { store.deleteDoc(coll, id); store.bump(); return send(res, 200, { ok: true }); }
    }
    if (p === '/api/batch' && req.method === 'POST') {
      const b = await readJson(req);
      const writes = Array.isArray(b.writes) ? b.writes.slice(0, 2000) : [];
      store.transaction(() => {
        for (const w of writes) {
          if (!store.COLLECTIONS.has(w.coll) || !idOk(w.id)) continue;
          if (w.op === 'set' && w.data && typeof w.data === 'object') store.putDoc(w.coll, w.id, w.data);
          else if (w.op === 'update' && w.data) store.patchDoc(w.coll, w.id, w.data);
          else if (w.op === 'delete') store.deleteDoc(w.coll, w.id);
        }
      });
      store.bump();
      return send(res, 200, { ok: true, count: writes.length });
    }

    /* ---- files ---- */
    if (p === '/api/files' && req.method === 'GET') {
      const appt = url.searchParams.get('appt');
      if (!idOk(appt)) return fail(res, 400, 'Missing appointment.');
      return send(res, 200, { files: store.q.filesFor.all(appt) });
    }
    if (p === '/api/files' && req.method === 'POST') {
      const appt = url.searchParams.get('appt');
      if (!idOk(appt) || !store.getDoc('appointments', appt)) return fail(res, 404, 'Save the appointment before adding files.');
      const name = String(url.searchParams.get('name') || 'file').replace(/[\\/\0\r\n"]/g, '_').slice(0, 180) || 'file';
      const mime = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 120);
      const declared = +req.headers['content-length'] || 0;
      if (declared > MAX_UPLOAD) return fail(res, 413, `Files can be up to ${MAX_UPLOAD / 1048576} MB.`);
      const id = crypto.randomUUID();
      const dest = path.join(store.UPLOAD_DIR, id);
      const out = fs.createWriteStream(dest, { mode: 0o600 });
      let size = 0, aborted = false;
      await new Promise((resolve, reject) => {
        req.on('data', c => { size += c.length; if (size > MAX_UPLOAD && !aborted) { aborted = true; out.destroy(); req.destroy(); reject(Object.assign(new Error(`Files can be up to ${MAX_UPLOAD / 1048576} MB.`), { status: 413 })); } });
        req.pipe(out);
        out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
      }).catch(e => { try { fs.unlinkSync(dest); } catch {} throw e; });
      store.q.addFile.run(id, appt, name, mime, size, Date.now());
      store.bump();
      return send(res, 200, { id, name, size, mime });
    }
    m = p.match(/^\/api\/files\/([0-9a-f-]{36})$/);
    if (m) {
      const f = store.q.getFile.get(m[1]);
      if (!f) return fail(res, 404, 'File not found.');
      if (req.method === 'DELETE') { store.removeFile(f.id); store.bump(); return send(res, 200, { ok: true }); }
      if (req.method === 'GET') {
        const file = path.join(store.UPLOAD_DIR, f.id);
        if (!fs.existsSync(file)) return fail(res, 404, 'File is missing from storage.');
        // Only show known-safe types inline; everything else downloads.
        const safeInline = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf|text\/plain)$/i.test(f.mime || '');
        const dl = url.searchParams.has('download') || !safeInline;
        res.writeHead(200, {
          'Content-Type': safeInline ? f.mime : 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${f.name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
          'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        });
        return fs.createReadStream(file).pipe(res);
      }
    }

    /* ---- admin ---- */
    if (p === '/api/admin/status' && req.method === 'GET') {
      const dbFile = path.join(store.DATA_DIR, 'cadence.db');
      let uploadsBytes = 0; for (const f of store.q.allFiles.all()) uploadsBytes += f.size || 0;
      return send(res, 200, {
        version: pkg.version, node: process.version, dataDir: store.DATA_DIR,
        dbBytes: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0, uploadsBytes,
        acme: store.kvGet('acme', {}), cert: acme.certInfo(), httpsListening: !!httpsServer, ports: { http: HTTP_PORT, https: HTTPS_PORT },
        job: { running: job.running, log: job.log, error: job.error, finished: job.finished },
        sessions: auth.q.sCount.get(user.id, Date.now()).n, totp: user.totp, username: user.username,
      });
    }
    if (p === '/api/admin/acme' && req.method === 'POST') {
      const b = await readJson(req);
      const cfg = { ...store.kvGet('acme', {}), domain: String(b.domain || '').trim().toLowerCase(), email: String(b.email || '').trim(), autoRenew: b.autoRenew !== false, redirect: b.redirect !== false };
      store.kvSet('acme', cfg);
      return send(res, 200, { ok: true, acme: cfg });
    }
    if (p === '/api/admin/acme/test' && req.method === 'POST') {
      const cfg = store.kvGet('acme', {});
      if (!cfg.domain) return fail(res, 400, 'Save a domain first.');
      selfTest.token = crypto.randomBytes(16).toString('hex'); selfTest.value = crypto.randomBytes(16).toString('hex');
      try {
        const r = await fetch(`http://${cfg.domain}/.well-known/acme-challenge/${selfTest.token}`, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
        const t = await r.text();
        return send(res, 200, { ok: t.trim() === selfTest.value, status: r.status });
      } catch (e) { return send(res, 200, { ok: false, error: e.cause?.code || e.message }); }
      finally { selfTest.token = null; }
    }
    if (p === '/api/admin/acme/issue' && req.method === 'POST') {
      const b = await readJson(req); const cfg = store.kvGet('acme', {});
      if (!cfg.domain) return fail(res, 400, 'Save a domain first.');
      if (job.running) return fail(res, 409, 'A request is already running.');
      runIssue({ domain: cfg.domain, email: cfg.email, staging: !!b.staging });
      return send(res, 202, { ok: true });
    }
    if (p === '/api/admin/password' && req.method === 'POST') {
      const b = await readJson(req); const u = auth.q.byId.get(user.id);
      if (!auth.verifyPassword(String(b.current || ''), u.pass)) return fail(res, 400, 'Your current password is wrong.');
      const prob = auth.passwordProblem(b.next); if (prob) return fail(res, 400, prob);
      auth.q.setPass.run(auth.hashPassword(b.next), user.id);
      auth.q.sDelUser.run(user.id, session.tokenHash);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/totp/begin' && req.method === 'POST') {
      const secret = auth.newTotpSecret();
      pendingTotp.set(user.id, { secret, exp: Date.now() + 10 * 60000 });
      const issuer = 'Sales Cadence Tool';
      const uri = `otpauth://totp/${encodeURIComponent(issuer + ':' + user.username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
      return send(res, 200, { secret, uri });
    }
    if (p === '/api/admin/totp/enable' && req.method === 'POST') {
      const b = await readJson(req); const pend = pendingTotp.get(user.id);
      if (!pend || pend.exp < Date.now()) return fail(res, 400, 'Setup expired. Start again.');
      if (!auth.verifyTotp(pend.secret, b.code, user.id)) return fail(res, 400, 'That code didn\'t match. Check the time on your phone and try the next code.');
      auth.q.setTotp.run(pend.secret, user.id); pendingTotp.delete(user.id);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/totp/disable' && req.method === 'POST') {
      const b = await readJson(req); const u = auth.q.byId.get(user.id);
      if (!auth.verifyPassword(String(b.password || ''), u.pass)) return fail(res, 400, 'Your password is wrong.');
      auth.q.setTotp.run(null, user.id);
      return send(res, 200, { ok: true });
    }
    if (p === '/api/admin/logout-others' && req.method === 'POST') { auth.q.sDelUser.run(user.id, session.tokenHash); return send(res, 200, { ok: true }); }
    if (p === '/api/admin/backup' && req.method === 'GET') {
      const s = store.state();
      const body = JSON.stringify({ app: 'cadence-book', version: pkg.version, exported: new Date().toISOString(), customers: s.customers, appointments: s.appointments, settings: s.settings, files: store.q.allFiles.all() }, null, 1);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="cadence-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (p === '/api/admin/restore' && req.method === 'POST') {
      const b = await readJson(req, 64 * 1024 * 1024);
      if (b.app !== 'cadence-book' || !Array.isArray(b.customers) || !Array.isArray(b.appointments)) return fail(res, 400, 'That file isn\'t a Sales Cadence Tool backup.');
      store.transaction(() => {
        store.q.clearDocs.run();
        for (const c of b.customers) { const { id, ...d } = c; if (idOk(id)) store.putDoc('customers', id, d); }
        for (const a of b.appointments) { const { id, ...d } = a; if (idOk(id)) store.putDoc('appointments', id, d); }
        if (b.settings && typeof b.settings === 'object') store.putDoc('config', 'settings', b.settings);
      });
      store.bump();
      return send(res, 200, { ok: true, customers: b.customers.length, appointments: b.appointments.length });
    }

    return fail(res, 404, 'Not found');
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Something went wrong on the server.');
  }
}
const selfTest = { token: null, value: null };
const pendingTotp = new Map();
function redirect(res, to) { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); }

/* ---------- servers ---------- */
let httpsServer = null;
function tlsContext() {
  const p = acme.certPaths();
  if (!fs.existsSync(p.key) || !fs.existsSync(p.cert)) return null;
  return tls.createSecureContext({ key: fs.readFileSync(p.key), cert: fs.readFileSync(p.cert) });
}
function reloadTls() {
  const ctx = tlsContext(); if (!ctx) return;
  const p = acme.certPaths();
  if (httpsServer) httpsServer.setSecureContext({ key: fs.readFileSync(p.key), cert: fs.readFileSync(p.cert) });
  else {
    httpsServer = https.createServer({ key: fs.readFileSync(p.key), cert: fs.readFileSync(p.cert), minVersion: 'TLSv1.2' }, handle);
    httpsServer.listen(HTTPS_PORT, () => console.log(`HTTPS listening on :${HTTPS_PORT}`));
  }
}
http.createServer(handle).listen(HTTP_PORT, () => {
  console.log(`Sales Cadence Tool ${pkg.version} — HTTP listening on :${HTTP_PORT}, data in ${store.DATA_DIR}`);
  if (auth.userCount() === 0) console.log('No account yet: open the app in a browser to create one.');
});
reloadTls();

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { store.db.close(); } catch {} process.exit(0); });
