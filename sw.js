/* Arc90 service worker — network-first app shell with offline fallback + Web Push */
const CACHE = 'arc90-mark2-v83';
const SHELL = [
  '/',
  '/app',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './assets/welcome-bg.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first: always pick up fresh app code when online; fall back to cache offline.
   Cross-origin requests (AI APIs) are never intercepted.
   - Only 200 responses are cached (206/Range audio chunks throw in the Cache API).
   - Offline fallback ignores ?v= cache-busters so the precached shell still matches.
   - The HTML shell is only ever served as a fallback for navigations, never for assets. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (e.request.mode === 'navigate') return caches.match('/app');
        return Response.error();
      }))
  );
});

/* Web Push — background reminders even when the app is closed (iOS 16.4+ home-screen PWAs) */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* generic fallback */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Arc90', {
    body: d.body || 'Your reps are waiting.',
    icon: 'icons/icon-180.png',
    badge: 'icons/icon-180.png',
    data: { url: d.url || '/app' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return clients.openWindow(url);
    })
  );
});
