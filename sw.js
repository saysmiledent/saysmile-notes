// Offline shell: cache-first for app files, always network for Supabase.
const V = 'saysmile-v5';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'ink.js', 'splash.js', 'store.js', 'templates.js', 'ui.js', 'i18n.js', 'config.js', 'manifest.webmanifest',
  'vendor/supabase.js', 'vendor/html2canvas.min.js', 'vendor/jspdf.umd.min.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // stale-while-revalidate for our own files, so updates arrive on the next open
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
