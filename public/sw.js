// Network-first service worker: always loads the live app, and shows an offline page
// when the server can't be reached. Customer data is never cached on the device.
const CACHE = 'cadence-shell-v3';
const SHELL = ['/offline.html', '/app.css', '/theme.js', '/icons/icon-192.png?v=2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
  else if (SHELL.includes(new URL(r.url).pathname + new URL(r.url).search)) e.respondWith(fetch(r).catch(() => caches.match(r)));
});
