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

const COLLECTIONS = new Set(['customers', 'appointments', 'config']);

const q = {
  getKv: db.prepare('SELECT v FROM kv WHERE k = ?'),
  setKv: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
  delKv: db.prepare('DELETE FROM kv WHERE k = ?'),
  allDocs: db.prepare('SELECT coll, id, data FROM docs'),
  getDoc: db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?'),
  putDoc: db.prepare('INSERT INTO docs (coll, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated = excluded.updated'),
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

function state() {
  const out = { customers: [], appointments: [], settings: {}, fileCounts: {}, rev };
  for (const r of q.allDocs.all()) {
    const d = JSON.parse(r.data);
    if (r.coll === 'customers') out.customers.push({ id: r.id, ...d });
    else if (r.coll === 'appointments') out.appointments.push({ id: r.id, ...d });
    else if (r.coll === 'config' && r.id === 'settings') out.settings = d;
  }
  for (const r of q.fileCounts.all()) out.fileCounts[r.appt_id] = r.n;
  return out;
}

function getDoc(coll, id) { const r = q.getDoc.get(coll, id); return r ? JSON.parse(r.data) : null; }
function putDoc(coll, id, data) { q.putDoc.run(coll, id, JSON.stringify(data), Date.now()); }
function mergeDeep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = mergeDeep(a[k], v);
    else out[k] = v;
  }
  return out;
}
function patchDoc(coll, id, data) { const cur = getDoc(coll, id); if (!cur) return false; putDoc(coll, id, mergeDeep(cur, data)); return true; }
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
  db, DATA_DIR, UPLOAD_DIR, CERT_DIR, COLLECTIONS, q,
  kvGet, kvSet, kvDel, bump, listeners, getRev: () => rev,
  state, getDoc, putDoc, patchDoc, deleteDoc, removeFile, transaction,
};
