// Service worker version: roulette-wheel-refresh-2026-11-18
// Service worker: Web Push + agar aplikasi bisa di-install (PWA)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'Arisan', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      // Jika aplikasi sedang terbuka & fokus, notifikasi chat tidak perlu muncul
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (d.tag === 'chat' && list.some((c) => c.visibilityState === 'visible' && c.focused)) return;

      await self.registration.showNotification(d.title || 'Arisan', {
        body: d.body || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: d.tag,
        renotify: !!d.tag,
        data: { url: d.url || './' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
