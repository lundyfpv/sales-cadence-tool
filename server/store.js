'use strict';
// SQLite storage using Node's built-in driver (no native modules to compile).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CERT_DIR = path.join(DATA_DIR, 'certs');
for (const d of [DATA_DIR, UPLOAD_DIR, CERT_DIR]) fs.mkdirSync(d, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'cadence.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
    totp TEXT, role TEXT NOT NULL DEFAULT 'admin', created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created INTEGER NOT NULL, expires INTEGER NOT NULL, ua TEXT, ip TEXT
  );
  CREATE TABLE IF NOT EXISTS docs (
    coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL,
    PRIMARY KEY (coll, id)
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, appt_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT, size INTEGER, created INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS files_appt ON files(appt_id);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);
// Columns added after the first release. SQLite has no ADD COLUMN IF NOT EXISTS, so check first.
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'name', 'TEXT');
addColumn('users', 'manager_id', 'TEXT');
addColumn('users', 'active', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumn('docs', 'owner', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS docs_owner ON docs(owner)');

const COLLECTIONS = new Set(['customers', 'appointments', 'config']);
// Customers and appointments belong to a user (docs.owner). Settings are split: these keys are one
// company-wide doc (config/company); everything else is personal (config/u:<userId>).
const COMPANY_KEYS = ['productCategories', 'competitors', 'distributors', 'competitorsSeeded', 'usHolidays'];

const q = {
  getKv: db.prepare('SELECT v FROM kv WHERE k = ?'),
  setKv: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  delKv: db.prepare('DELETE FROM kv WHERE k = ?'),
  allDocs: db.prepare('SELECT coll, id, data, owner FROM docs'),
  ownedDocs: db.prepare("SELECT coll, id, data, owner FROM docs WHERE coll IN ('customers', 'appointments') AND owner IN (SELECT value FROM json_each(?))"),
  getDoc: db.prepare('SELECT data, owner FROM docs WHERE coll = ? AND id = ?'),
  putDoc: db.prepare('INSERT INTO docs (coll, id, data, updated, owner) VALUES (?, ?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated, owner = excluded.owner'),
  ownerless: db.prepare("UPDATE docs SET owner = ? WHERE coll IN ('customers', 'appointments') AND owner IS NULL"),
  delDoc: db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
  clearDocs: db.prepare('DELETE FROM docs'),
  fileCounts: db.prepare('SELECT appt_id, COUNT(*) AS n FROM files GROUP BY appt_id'),
  filesFor: db.prepare('SELECT id, appt_id, name, mime, size, created FROM files WHERE appt_id = ? ORDER BY created'),
  getFile: db.prepare('SELECT * FROM files WHERE id = ?'),
  addFile: db.prepare('INSERT INTO files (id, appt_id, name, mime, size, created) VALUES (?, ?, ?, ?, ?, ?)'),
  delFile: db.prepare('DELETE FROM files WHERE id = ?'),
  allFiles: db.prepare('SELECT id, appt_id, name, mime, size, created FROM files'),
};

function kvGet(k, fallback = null) { const r = q.getKv.get(k); if (!r) return fallback; try { return JSON.parse(r.v); } catch { return fallback; } }
function kvSet(k, v) { q.setKv.run(k, JSON.stringify(v)); }
function kvDel(k) { q.delKv.run(k); }

// A revision number lets open browsers know something changed.
let rev = kvGet('rev', 0);
const listeners = new Set();
function bump() { rev += 1; kvSet('rev', rev); for (const fn of listeners) { try { fn(rev); } catch {} } }

// What one user loads: customers and appointments owned by anyone in `owners`, plus their settings.
function state(owners, userId) {
  const out = { customers: [], appointments: [], settings: settingsFor(userId), fileCounts: {}, rev };
  for (const r of q.ownedDocs.all(JSON.stringify(owners))) {
    const d = { id: r.id, owner: r.owner, ...JSON.parse(r.data) };
    (r.coll === 'customers' ? out.customers : out.appointments).push(d);
  }
  const appts = new Set(out.appointments.map(a => a.id));
  for (const r of q.fileCounts.all()) if (appts.has(r.appt_id)) out.fileCounts[r.appt_id] = r.n;
  return out;
}
function settingsFor(userId) { return { ...(getDoc('config', 'u:' + userId) || {}), ...(getDoc('config', 'company') || {}) }; }
// Save a full settings object: company keys only when the user may edit them, the rest as theirs.
function saveSettings(userId, data, canEditCompany) {
  const personal = {}, company = {};
  for (const [k, v] of Object.entries(data)) (COMPANY_KEYS.includes(k) ? company : personal)[k] = v;
  putDoc('config', 'u:' + userId, personal);
  if (canEditCompany && Object.keys(company).length) putDoc('config', 'company', { ...(getDoc('config', 'company') || {}), ...company });
}
// One-time move from the single-user layout: existing records and settings become the first admin's.
function migrate(adminId) {
  if (!adminId) return;
  transaction(() => {
    q.ownerless.run(adminId);
    const old = getDoc('config', 'settings');
    if (old) { saveSettings(adminId, old, true); q.delDoc.run('config', 'settings'); }
  });
}

function getDoc(coll, id) { const r = q.getDoc.get(coll, id); return r ? JSON.parse(r.data) : null; }
function docOwner(coll, id) { const r = q.getDoc.get(coll, id); return r ? r.owner : undefined; } // undefined = no such record
function putDoc(coll, id, data, owner = docOwner(coll, id) ?? null) { const { id: _i, owner: _o, ...d } = data; q.putDoc.run(coll, id, JSON.stringify(d), Date.now(), owner); }
function mergeDeep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = mergeDeep(a[k], v);
    else out[k] = v;
  }
  return out;
}
function patchDoc(coll, id, data) { const cur = getDoc(coll, id); if (!cur) return false; const { id: _i, owner: _o, ...d } = data; putDoc(coll, id, mergeDeep(cur, d)); return true; }
function deleteDoc(coll, id) {
  q.delDoc.run(coll, id);
  if (coll === 'appointments') for (const f of q.filesFor.all(id)) removeFile(f.id);
}

function removeFile(id) {
  q.delFile.run(id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, id)); } catch {}
}

function transaction(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = {
  db, DATA_DIR, UPLOAD_DIR, CERT_DIR, COLLECTIONS, COMPANY_KEYS, q,
  kvGet, kvSet, kvDel, bump, listeners, getRev: () => rev,
  state, settingsFor, saveSettings, migrate, getDoc, docOwner, putDoc, patchDoc, deleteDoc, removeFile, transaction,
};
