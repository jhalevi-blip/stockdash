/* StockDashes service worker — v1.
 * Notification plumbing only. NO fetch/caching logic, so it cannot intercept
 * or break app requests. Caching may be added in a later stage.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Parse defensively — a malformed or empty payload must not throw.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const title = payload.title || 'StockDashes';
  const body  = payload.body  || '';
  const url   = payload.url   || '/dashboard';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if the app is already open.
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      // Otherwise open a new window to the target.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
