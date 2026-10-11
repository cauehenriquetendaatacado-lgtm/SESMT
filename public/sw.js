/* Service worker: deixa o app instalável e abrir sem internet (usando a última versão carregada). */
const V = 'sesmt-v2';
const ASSETS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/logo-tenda.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname === '/login' || u.pathname === '/logout' || u.pathname === '/migrar') return;
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then((res) => {
          if (res.ok && !res.redirected && u.pathname === '/') { const c = res.clone(); caches.open(V).then((x) => x.put('/', c)); }
          return res;
        })
        .catch(() => caches.match('/').then((m) => m || new Response('Sem conexão e sem cópia salva ainda.', { status: 503 })))
    );
    return;
  }
  e.respondWith(
    caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); }
      return res;
    }))
  );
});
