'use strict';
const crypto = require('crypto');
const store = require('./store');

const SESSION_DAYS = +(process.env.SESSION_DAYS || 30);
const COOKIE = 'cb_session';

/* ---------- passwords (scrypt) ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const N = 32768, r = 8, p = 1;
  const hash = crypto.scryptSync(pw, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, hash] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const expect = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expect.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(expect, got);
  } catch { return false; }
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

/* ---------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(s) {
  s = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (const c of s) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totpAt(secret, counter) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0');
  return code;
}
const usedCodes = new Map(); // prevent replay of a code inside its window
function verifyTotp(secret, code, userId) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 30000);
  for (const w of [0, -1, 1]) {
    const c = now + w;
    if (crypto.timingSafeEqual(Buffer.from(totpAt(secret, c)), Buffer.from(code))) {
      const key = userId + ':' + c + ':' + code;
      if (usedCodes.has(key)) return false;
      usedCodes.set(key, Date.now() + 120000);
      for (const [k, exp] of usedCodes) if (exp < Date.now()) usedCodes.delete(k);
      return true;
    }
  }
  return false;
}
function newTotpSecret() { return b32encode(crypto.randomBytes(20)); }

/* ---------- login throttling ---------- */
const fails = new Map(); // ip -> {n, until}
function throttled(ip) { const f = fails.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) f.until = Date.now() + Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (f.n - 5)); // 1, 2, 4 … min, capped at 1 h
  fails.set(ip, f);
}
function noteSuccess(ip) { fails.delete(ip); }

/* ---------- users & sessions ---------- */
const q = {
  count: store.db.prepare('SELECT COUNT(*) AS n FROM users'),
  byName: store.db.prepare('SELECT * FROM users WHERE username = ?'),
  byId: store.db.prepare('SELECT * FROM users WHERE id = ?'),
  add: store.db.prepare('INSERT INTO users (id, username, pass, role, created, name, manager_id, active, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'),
  all: store.db.prepare('SELECT id, username, name, role, manager_id, active, is_admin, photo, created, totp IS NOT NULL AS totp FROM users ORDER BY created'),
  setPhoto: store.db.prepare('UPDATE users SET photo = ? WHERE id = ?'),
  update: store.db.prepare('UPDATE users SET name = ?, role = ?, manager_id = ?, active = ?, is_admin = ? WHERE id = ?'),
  firstAdmin: store.db.prepare("SELECT id FROM users WHERE is_admin = 1 OR role = 'admin' ORDER BY created LIMIT 1"),
  activeAdmins: store.db.prepare("SELECT COUNT(*) AS n FROM users WHERE (is_admin = 1 OR role = 'admin') AND active = 1"),
  // accounts from before roles existed were 'admin'; they become TSM + Admin (the owner works a territory too)
  dualRole: store.db.prepare("UPDATE users SET role = 'tsm', is_admin = 1 WHERE role = 'admin'"),
  sDelAll: store.db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  setPass: store.db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
  setTotp: store.db.prepare('UPDATE users SET totp = ? WHERE id = ?'),
  sAdd: store.db.prepare('INSERT INTO sessions (token, user_id, created, expires, ua, ip) VALUES (?, ?, ?, ?, ?, ?)'),
  sGet: store.db.prepare('SELECT s.token, s.expires, u.id, u.username, u.name, u.role, u.manager_id, u.active, u.is_admin, u.photo, u.totp FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
  sTouch: store.db.prepare('UPDATE sessions SET expires = ? WHERE token = ?'),
  sDel: store.db.prepare('DELETE FROM sessions WHERE token = ?'),
  sDelUser: store.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?'),
  sCount: store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires > ?'),
  sPurge: store.db.prepare('DELETE FROM sessions WHERE expires < ?'),
};
const sha = t => crypto.createHash('sha256').update(t).digest('hex'); // only hashes are stored

function userCount() { return q.count.get().n; }
function createUser(username, password, role = 'tsm', name = '', managerId = null, admin = false) {
  const id = crypto.randomUUID();
  q.add.run(id, username, hashPassword(password), role, Date.now(), name || null, managerId, admin ? 1 : 0);
  return id;
}

/* ---------- roles and the reporting chain ---------- */
// Global admin > sales director > regional sales manager > territory sales manager. Admin is also a permission
// that can sit on any role (is_admin): a TSM + Admin works their own territory and manages everything.
const ROLES = { admin: 'Global admin', director: 'Sales director', rsm: 'Regional sales manager', tsm: 'Territory sales manager' };
const RANK = { tsm: 1, rsm: 2, director: 3, admin: 4 };
const rank = role => RANK[role] || 0;
const isAdmin = u => !!u && (u.role === 'admin' || !!u.is_admin || u.admin === true);
const publicUser = u => ({ id: u.id, username: u.username, name: u.name || '', role: u.role, admin: isAdmin(u), manager: u.manager_id || null, active: !!u.active, totp: !!u.totp, photo: u.photo || null });
function allUsers() { return q.all.all(); }
// Everyone below a user in the chain (reports, their reports, and so on)
function descendants(id, users = allUsers()) {
  const out = new Set(), walk = m => { for (const u of users) if (u.manager_id === m && !out.has(u.id)) { out.add(u.id); walk(u.id); } };
  walk(id); return out;
}
// Whose customers and calendars a user can see and edit: their own and their team's; a global admin sees everyone
function visibleOwners(user, users = allUsers()) {
  if (isAdmin(user)) return users.map(u => u.id);
  return [user.id, ...descendants(user.id, users)];
}
// A user can manage someone below them in their chain (but not an admin); an admin can manage anyone but themselves
function canManage(actor, target, users = allUsers()) {
  if (!target || actor.id === target.id) return false;
  return isAdmin(actor) || (!isAdmin(target) && descendants(actor.id, users).has(target.id) && rank(actor.role) > rank(target.role));
}
function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  q.sAdd.run(sha(token), userId, Date.now(), Date.now() + SESSION_DAYS * 864e5, String(req.headers['user-agent'] || '').slice(0, 200), req.ip || '');
  return token;
}
function sessionFrom(req) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const row = q.sGet.get(sha(m[1]));
  if (!row || row.expires < Date.now() || !row.active) return null;
  // slide the expiry at most once a day
  const fresh = Date.now() + SESSION_DAYS * 864e5;
  if (fresh - row.expires > 864e5) q.sTouch.run(fresh, row.token);
  return { tokenHash: row.token, user: { id: row.id, username: row.username, name: row.name || '', role: row.role, admin: isAdmin(row), manager: row.manager_id || null, totp: !!row.totp, photo: row.photo || null } };
}
function cookieHeader(token, secure, clear) {
  const parts = [`${COOKIE}=${clear ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
setInterval(() => q.sPurge.run(Date.now()), 6 * 3600 * 1000).unref();

module.exports = {
  hashPassword, verifyPassword, passwordProblem, newTotpSecret, verifyTotp, totpAt,
  throttled, noteFail, noteSuccess, userCount, createUser, createSession, sessionFrom, cookieHeader, sha, q,
  ROLES, rank, isAdmin, publicUser, allUsers, descendants, visibleOwners, canManage,
};
