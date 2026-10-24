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
const forbidden = () => Object.assign(new Error('You don\'t have access to that.'), { status: 403 });
// Managers and admins edit the company-wide lists (product categories, brands, distributors, holidays); TSMs only read them
const canEditCompany = user => auth.isAdmin(user) || auth.rank(user.role) >= auth.rank('rsm');

// One write to customers, appointments or settings, limited to records the user can see.
// New customers go to `owner` when given (a manager adding for a team member); new appointments go to their customer's owner.
function writeDoc(user, owners, op, coll, id, data, owner) {
  if (!store.COLLECTIONS.has(coll) || !idOk(id)) throw Object.assign(new Error('Unknown record.'), { status: 400 });
  if (coll === 'config') {
    if (id !== 'settings') throw forbidden();
    if (op === 'delete') throw forbidden();
    const cur = store.settingsFor(user.id);
    store.saveSettings(user.id, op === 'update' ? { ...cur, ...data } : data, canEditCompany(user));
    return;
  }
  const cur = store.docOwner(coll, id);
  if (cur !== undefined && !owners.includes(cur)) throw forbidden();
  if (data && coll === 'appointments' && data.customerId) {
    const co = store.docOwner('customers', data.customerId);
    if (co !== undefined && !owners.includes(co)) throw forbidden();
    if (cur === undefined && co !== undefined) owner = co;
  }
  if (op === 'delete') { if (cur !== undefined) store.deleteDoc(coll, id); return; }
  if (op === 'update') { if (cur === undefined || !store.patchDoc(coll, id, data)) throw Object.assign(new Error('That record no longer exists.'), { status: 404 }); }
  else store.putDoc(coll, id, data, cur !== undefined ? cur : (owner && owners.includes(owner) ? owner : user.id));
  if (coll === 'appointments' && data && Object.keys(MENTION_FIELDS).some(f => f in data)) notifyMentions(user, id);
}
/* ---------- @mentions ---------- */
// "@username" in an appointment's agenda, recap or action items notifies that person once per field.
const MENTION_FIELDS = { notes: 'agenda', recap: 'recap', actions: 'action items' };
const nq = {
  sent: store.db.prepare('SELECT 1 FROM mentions_sent WHERE appt_id = ? AND field = ? AND user_id = ?'),
  markSent: store.db.prepare('INSERT OR IGNORE INTO mentions_sent (appt_id, field, user_id) VALUES (?, ?, ?)'),
  add: store.db.prepare('INSERT INTO notifications (id, user_id, from_id, appt_id, field, text, customer, date, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  forUser: store.db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created DESC LIMIT 50'),
  read: store.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?'),
  readAll: store.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?'),
  wasTagged: store.db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND appt_id = ? LIMIT 1'),
};
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a username can contain . _ @ -, so match each known username rather than guessing where a mention ends
const mentioned = (text, u) => new RegExp('(^|[^A-Za-z0-9_.@-])@' + reEsc(u.username) + '(?![A-Za-z0-9_@-]|\\.[A-Za-z0-9])', 'i').test(text);
function notifyMentions(author, apptId) {
  const a = store.getDoc('appointments', apptId); if (!a) return;
  const cust = a.customerId ? store.getDoc('customers', a.customerId) : null;
  const people = auth.allUsers().filter(u => u.active && u.id !== author.id);
  for (const [field, label] of Object.entries(MENTION_FIELDS)) {
    const text = String(a[field] || ''); if (!text.includes('@')) continue;
    for (const u of people) {
      if (!mentioned(text, u) || nq.sent.get(apptId, field, u.id)) continue;
      nq.markSent.run(apptId, field, u.id);
      // keep the lines that mention them (or the start of the text) so the note reads on its own
      const lines = text.split('\n').filter(l => mentioned(l, u));
      nq.add.run(crypto.randomUUID(), u.id, author.id, apptId, label, (lines.length ? lines.join('\n') : text).slice(0, 600), cust ? (cust.name || cust.contact || '') : (a.name || ''), a.date || '', Date.now());
    }
  }
}
const apptVisible = (owners, apptId) => { const o = store.docOwner('appointments', apptId); return o !== undefined && owners.includes(o); };

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
      const id = auth.createUser(username, b.password, 'tsm', '', null, true);
      store.migrate(id);
      store.kvSet('rolesV2', true);
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
      if (!u.active) return fail(res, 403, 'This account is turned off. Ask your manager to turn it back on.');
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
    const users = auth.allUsers(), owners = auth.visibleOwners(user, users);
    const adminOnly = () => { if (!auth.isAdmin(user)) throw forbidden(); };

    if (p === '/api/state' && req.method === 'GET') {
      return send(res, 200, { ...store.state(owners, user.id), user, canEditCompany: canEditCompany(user), roles: auth.ROLES,
        users: users.filter(u => owners.includes(u.id)).map(auth.publicUser),
        // everyone who can be @mentioned, and this person's notifications
        directory: users.filter(u => u.active).map(u => ({ id: u.id, username: u.username, name: u.name || '', role: u.role, photo: u.photo || null })),
        notifications: nq.forUser.all(user.id).map(n => ({ id: n.id, from: n.from_id, appt: n.appt_id, field: n.field, text: n.text, customer: n.customer, date: n.date, created: n.created, read: !!n.read })) });
    }

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 4000\ndata: ${store.getRev()}\n\n`);
      streams.add(res); req.on('close', () => streams.delete(res));
      return;
    }

    let m = p.match(/^\/api\/docs\/([a-z]+)\/([^/]+)$/);
    if (m) {
      const [, coll, id] = m;
      const op = { PUT: 'set', PATCH: 'update', DELETE: 'delete' }[req.method];
      if (op) {
        const b = op === 'delete' ? null : await readJson(req);
        if (b !== null && (!b || typeof b !== 'object' || Array.isArray(b))) return fail(res, 400, 'Invalid record.');
        writeDoc(user, owners, op, coll, id, b, url.searchParams.get('owner'));
        store.bump(); return send(res, 200, { ok: true });
      }
    }
    if (p === '/api/batch' && req.method === 'POST') {
      const b = await readJson(req);
      const writes = Array.isArray(b.writes) ? b.writes.slice(0, 2000) : [];
      store.transaction(() => {
        for (const w of writes) {
          if (!['set', 'update', 'delete'].includes(w.op) || (w.op !== 'delete' && (!w.data || typeof w.data !== 'object'))) continue;
          writeDoc(user, owners, w.op, w.coll, w.id, w.data, w.owner);
        }
      });
      store.bump();
      return send(res, 200, { ok: true, count: writes.length });
    }

    /* ---- files ---- */
    if (p === '/api/files' && req.method === 'GET') {
      const appt = url.searchParams.get('appt');
      if (!idOk(appt)) return fail(res, 400, 'Missing appointment.');
      if (!apptVisible(owners, appt)) throw forbidden();
      return send(res, 200, { files: store.q.filesFor.all(appt) });
    }
    if (p === '/api/files' && req.method === 'POST') {
      const appt = url.searchParams.get('appt');
      if (!idOk(appt) || !store.getDoc('appointments', appt)) return fail(res, 404, 'Save the appointment before adding files.');
      if (!apptVisible(owners, appt)) throw forbidden();
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
      if (!f || !apptVisible(owners, f.appt_id)) return fail(res, 404, 'File not found.');
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
      if (!auth.isAdmin(user)) return send(res, 200, { limited: true, version: pkg.version, sessions: auth.q.sCount.get(user.id, Date.now()).n, totp: user.totp, username: user.username, role: user.role });
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
      adminOnly();
      const b = await readJson(req);
      const cfg = { ...store.kvGet('acme', {}), domain: String(b.domain || '').trim().toLowerCase(), email: String(b.email || '').trim(), autoRenew: b.autoRenew !== false, redirect: b.redirect !== false };
      store.kvSet('acme', cfg);
      return send(res, 200, { ok: true, acme: cfg });
    }
    if (p === '/api/admin/acme/test' && req.method === 'POST') {
      adminOnly();
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
      adminOnly();
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
      adminOnly();
      const s = store.state(users.map(u => u.id), user.id);
      const config = store.q.allDocs.all().filter(r => r.coll === 'config').map(r => ({ id: r.id, data: JSON.parse(r.data) }));
      const body = JSON.stringify({ app: 'cadence-book', version: pkg.version, exported: new Date().toISOString(), customers: s.customers, appointments: s.appointments, config, settings: s.settings, files: store.q.allFiles.all() }, null, 1);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="cadence-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (p === '/api/admin/restore' && req.method === 'POST') {
      adminOnly();
      const b = await readJson(req, 64 * 1024 * 1024);
      if (b.app !== 'cadence-book' || !Array.isArray(b.customers) || !Array.isArray(b.appointments)) return fail(res, 400, 'That file isn\'t a Sales Cadence Tool backup.');
      store.transaction(() => {
        store.q.clearDocs.run();
        // records from an older single-user backup, or owned by someone who no longer exists, become yours
        const known = new Set(users.map(u => u.id)), own = o => (o && known.has(o) ? o : user.id);
        for (const c of b.customers) { const { id, owner, ...d } = c; if (idOk(id)) store.putDoc('customers', id, d, own(owner)); }
        for (const a of b.appointments) { const { id, owner, ...d } = a; if (idOk(id)) store.putDoc('appointments', id, d, own(owner)); }
        if (Array.isArray(b.config)) { for (const c of b.config) if (idOk(c.id) && c.data && typeof c.data === 'object') store.putDoc('config', c.id, c.data); }
        else if (b.settings && typeof b.settings === 'object') store.saveSettings(user.id, b.settings, true);
      });
      store.bump();
      return send(res, 200, { ok: true, customers: b.customers.length, appointments: b.appointments.length });
    }

    // Being @mentioned shares that one appointment with you, read-only, even outside your chain
    m = p.match(/^\/api\/mention\/([^/]+)$/);
    if (m && req.method === 'GET') {
      if (!idOk(m[1]) || !nq.wasTagged.get(user.id, m[1])) throw forbidden();
      const a = store.getDoc('appointments', m[1]); if (!a) return fail(res, 404, 'That appointment was deleted.');
      const c = a.customerId ? store.getDoc('customers', a.customerId) : null, o = users.find(u => u.id === store.docOwner('appointments', m[1]));
      return send(res, 200, {
        appt: { date: a.date, time: a.time, kind: a.kind, status: a.status, notes: a.notes || '', recap: a.recap || '', actions: a.actions || '', actionsDone: a.actionsDone || [] },
        customer: c ? { name: c.name || '', contact: c.contact || '', address: c.address || '' } : { name: a.name || '' },
        owner: o ? (o.name || o.username) : '' });
    }
    if (p === '/api/notifications/read' && req.method === 'POST') {
      const b = await readJson(req);
      if (b.all) nq.readAll.run(user.id); else for (const id of (Array.isArray(b.ids) ? b.ids : []).slice(0, 200)) nq.read.run(user.id, String(id));
      store.bump(); return send(res, 200, { ok: true });
    }

    /* ---- people: accounts, roles and who reports to whom ---- */
    if (p === '/api/users' && req.method === 'GET') {
      return send(res, 200, { roles: auth.ROLES, me: user.id,
        users: users.filter(u => u.id === user.id || auth.canManage(user, u, users)).map(u => ({ ...auth.publicUser(u), canManage: auth.canManage(user, u, users) })),
        managers: users.filter(u => u.active && (auth.isAdmin(user) || u.id === user.id || auth.descendants(user.id, users).has(u.id))).map(auth.publicUser) });
    }
    if (p === '/api/users' && req.method === 'POST') {
      const b = await readJson(req);
      const username = String(b.username || '').trim();
      if (!/^[A-Za-z0-9_.@-]{2,60}$/.test(username)) return fail(res, 400, 'Use 2–60 letters, numbers, or . _ @ - for the username.');
      if (auth.q.byName.get(username)) return fail(res, 409, 'That username is taken.');
      const prob = auth.passwordProblem(b.password); if (prob) return fail(res, 400, prob);
      const why = roleProblem(user, users, null, b.role, b.manager || null); if (why) return fail(res, 400, why);
      if (b.admin && !auth.isAdmin(user)) throw forbidden();
      const id = auth.createUser(username, b.password, b.role, String(b.name || '').trim().slice(0, 80), b.manager || null, !!b.admin);
      store.bump();
      return send(res, 200, { ok: true, id });
    }
    // Profile photos: anyone signed in can see them; you can set your own, and managers can set photos for the people they manage.
    // The browser crops and shrinks them first, so they're small JPEG/PNG/WebP files kept in uploads/.
    m = p.match(/^\/api\/users\/([0-9a-f-]{36})\/photo$/);
    if (m) {
      const target = users.find(u => u.id === m[1]);
      if (!target) return fail(res, 404, 'Not found');
      const file = path.join(store.UPLOAD_DIR, 'avatar-' + target.id);
      if (req.method === 'GET') {
        if (!target.photo || !fs.existsSync(file)) return fail(res, 404, 'No photo.');
        const mime = fs.existsSync(file + '.type') ? fs.readFileSync(file + '.type', 'utf8') : 'image/jpeg';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=31536000', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        return fs.createReadStream(file).pipe(res);
      }
      if (target.id !== user.id && !auth.canManage(user, target, users)) throw forbidden();
      if (req.method === 'DELETE') {
        for (const f of [file, file + '.type']) try { fs.unlinkSync(f); } catch {}
        auth.q.setPhoto.run(null, target.id); store.bump(); return send(res, 200, { ok: true });
      }
      if (req.method === 'POST') {
        const mime = String(req.headers['content-type'] || '');
        if (!/^image\/(jpeg|png|webp)$/.test(mime)) return fail(res, 400, 'Use a JPEG, PNG or WebP image.');
        const buf = await new Promise((resolve, reject) => {
          const chunks = []; let size = 0;
          req.on('data', c => { size += c.length; if (size > 2 * 1048576) { reject(Object.assign(new Error('That photo is too large.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
          req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
        });
        if (!buf.length) return fail(res, 400, 'No photo received.');
        fs.writeFileSync(file, buf, { mode: 0o600 }); fs.writeFileSync(file + '.type', mime, { mode: 0o600 });
        const v = Date.now(); auth.q.setPhoto.run(v, target.id); store.bump();
        return send(res, 200, { ok: true, photo: v });
      }
    }
    m = p.match(/^\/api\/users\/([0-9a-f-]{36})(\/password)?$/);
    if (m) {
      const target = users.find(u => u.id === m[1]);
      const b = await readJson(req);
      // anyone can change their own display name; an admin can also set who they report to
      if (target && target.id === user.id && !m[2] && req.method === 'PATCH' && Object.keys(b).every(k => k === 'name' || (k === 'manager' && auth.isAdmin(user)))) {
        const manager = b.manager !== undefined ? (b.manager || null) : target.manager_id;
        if (b.manager !== undefined) { const why = roleProblem(user, users, target, target.role, manager); if (why) return fail(res, 400, why); }
        auth.q.update.run(b.name !== undefined ? String(b.name || '').trim().slice(0, 80) || null : target.name, target.role, manager, target.active, target.is_admin, target.id);
        store.bump(); return send(res, 200, { ok: true });
      }
      if (!auth.canManage(user, target, users)) throw forbidden();
      if (m[2] && req.method === 'POST') {
        const prob = auth.passwordProblem(b.password); if (prob) return fail(res, 400, prob);
        auth.q.setPass.run(auth.hashPassword(b.password), target.id); auth.q.sDelAll.run(target.id);
        return send(res, 200, { ok: true });
      }
      if (!m[2] && req.method === 'PATCH') {
        const role = b.role ?? target.role, manager = b.manager !== undefined ? (b.manager || null) : target.manager_id;
        const active = b.active !== undefined ? !!b.active : !!target.active;
        if (b.admin !== undefined && !auth.isAdmin(user)) throw forbidden();
        const admin = role === 'admin' || (b.admin !== undefined ? !!b.admin : !!target.is_admin);
        const why = roleProblem(user, users, target, role, manager); if (why) return fail(res, 400, why);
        if (auth.isAdmin(target) && (!admin || !active) && auth.q.activeAdmins.get().n <= 1) return fail(res, 400, 'Keep at least one active admin.');
        if (users.some(u => u.manager_id === target.id && u.active && auth.rank(u.role) >= auth.rank(role))) return fail(res, 400, 'Someone who reports to them would then outrank them. Move their reports first.');
        auth.q.update.run(b.name !== undefined ? String(b.name).trim().slice(0, 80) || null : target.name, role, manager, active ? 1 : 0, admin ? 1 : 0, target.id);
        if (!active) auth.q.sDelAll.run(target.id);
        store.bump();
        return send(res, 200, { ok: true });
      }
    }

    return fail(res, 404, 'Not found');
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Something went wrong on the server.');
  }
}
// Whether `actor` may give `target` (null when creating) this role and manager
function roleProblem(actor, users, target, role, manager) {
  if (!auth.ROLES[role]) return 'Pick a role.';
  if (!auth.isAdmin(actor) && auth.rank(role) >= auth.rank(actor.role)) return 'You can only give roles below your own.';
  // non-admins must place new people on their team; admins may leave the manager blank
  if (!manager) return auth.isAdmin(actor) ? null : 'Pick who they report to.';
  const mgr = users.find(u => u.id === manager);
  if (!mgr || !mgr.active) return 'Pick who they report to.';
  if (auth.rank(mgr.role) <= auth.rank(role)) return 'They need to report to someone with a higher role.';
  if (!auth.isAdmin(actor) && mgr.id !== actor.id && !auth.descendants(actor.id, users).has(mgr.id)) return 'Pick a manager on your team.';
  if (target && (mgr.id === target.id || auth.descendants(target.id, users).has(mgr.id))) return 'Someone can\'t report to themselves or to one of their own reports.';
  return null;
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
// once, when roles arrive: the existing account becomes TSM + Admin and keeps every record and setting
if (!store.kvGet('rolesV2')) { auth.q.dualRole.run(); store.kvSet('rolesV2', true); }
store.migrate(auth.q.firstAdmin.get()?.id);

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { store.db.close(); } catch {} process.exit(0); });
