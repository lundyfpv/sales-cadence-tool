// Times /api/state for a TSM, an RSM, the director and the admin against a running server, with and without gzip.
//   DATA_DIR=/tmp/cadence-load HTTP_PORT=8090 HTTPS_PORT=8453 node server/index.js   (in another terminal)
//   node scripts/load-test/measure.mjs http://localhost:8090
// Rough targets: a TSM under 100 ms and a director under 1 s on the server; gzip should cut the payload 6x or more.
import http from 'node:http';
const base = new URL(process.argv[2] || 'http://localhost:8080');
const get = (path, cookie, gzip) => new Promise((resolve, reject) => {
  const t = performance.now();
  http.get({ host: base.hostname, port: base.port, path, headers: { Cookie: cookie, ...(gzip ? { 'Accept-Encoding': 'gzip' } : {}) } }, r => {
    let bytes = 0; r.on('data', c => { bytes += c.length; }); r.on('end', () => resolve({ ms: Math.round(performance.now() - t), bytes, status: r.statusCode }));
  }).on('error', reject);
});
const login = async user => {
  const r = await fetch(new URL('/api/login', base), { method: 'POST', headers: { 'X-CB': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'password12345' }) });
  if (!r.ok) throw new Error(`Couldn't sign in as ${user}: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
};
const mb = b => b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
console.log('who    | sent (plain)  | sent (gzip)  | server time, 3 runs');
for (const [who, label] of [['tsm0', 'TSM'], ['rsm0', 'RSM'], ['dana', 'Director'], ['alec', 'Admin']]) {
  const cookie = await login(who);
  const plain = await get('/api/state', cookie, false);
  const runs = [await get('/api/state', cookie, true), await get('/api/state', cookie, true), await get('/api/state', cookie, true)];
  console.log(`${label.padEnd(8)}| ${mb(plain.bytes).padEnd(13)} | ${mb(runs[0].bytes).padEnd(12)} | ${runs.map(r => r.ms + ' ms').join(', ')}`);
}
