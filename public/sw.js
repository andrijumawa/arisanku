// Service worker version: image-precache-2026-11-21
// Service worker: Web Push + agar aplikasi bisa di-install (PWA)
const IMAGE_CACHE = 'arisanku-image-cache-v2';
const IMAGE_PATHS = [
  'images/app-background.jpg',
  'images/initial-loading.jpeg',
  'images/menu-home.png',
  'images/menu-arisan.png',
  'images/menu-kocokan.png',
  'images/menu-chat.png',
  'images/menu-admin.png',
  'images/menu-akun.png',
  'images/admin-registration.png',
  'images/admin-payment.png',
  'images/admin-group.png',
  'images/admin-people.png',
  'icons/arisanku-mark.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'arisanku-wordmark.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(IMAGE_CACHE);
      await Promise.all(IMAGE_PATHS.map(async (path) => {
        const url = new URL(path, self.registration.scope);
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await cache.put(url, response);
        } catch (error) {
          console.error(`Gagal menyimpan gambar ${path} ke cache:`, error);
        }
      }));
    } catch (error) {
      console.error('Gagal menyiapkan cache gambar:', error);
    } finally {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('arisanku-image-cache-') && name !== IMAGE_CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || (!url.pathname.includes('/images/') && !url.pathname.includes('/icons/'))
  ) return;

  event.respondWith((async () => {
    const cache = await caches.open(IMAGE_CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});

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
