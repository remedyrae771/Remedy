/* Remedy service worker: показывает push-уведомления и открывает приложение по нажатию. */
const APP_URL = '/Remedy/couples/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Файлы с хешем в имени (код, картинки, листы анимаций котика) не меняются —
// храним их в телефоне и отдаём мгновенно, даже при плохой связи.
const STATIC_CACHE = 'remedy-static-v1';
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !/\/Remedy\/couples\/(assets|_expo\/static)\//.test(url.pathname)) return;
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Remedy', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Remedy 💞';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: APP_URL + 'icon-192.png',
      badge: APP_URL + 'icon-192.png',
      tag: data.tag || 'remedy',
      renotify: true,
      data: { url: data.url || APP_URL },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || APP_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(APP_URL) && 'focus' in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
