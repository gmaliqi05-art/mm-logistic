const CACHE_NAME = 'mm-logistic-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, icon, badge, tag, data: actionData } = data;

    const options = {
      body: body || '',
      icon: icon || '/mm-logistic-logo.png',
      badge: badge || '/mm-logistic-logo.png',
      tag: tag || 'default',
      data: actionData || {},
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: []
    };

    if (data.type === 'chat') {
      options.actions = [
        { action: 'open', title: 'Hap Mesazhin' },
        { action: 'close', title: 'Mbyll' }
      ];
    } else if (data.type === 'document') {
      options.actions = [
        { action: 'open', title: 'Shiko Dokumentin' },
        { action: 'close', title: 'Mbyll' }
      ];
    } else if (data.type === 'delivery') {
      options.actions = [
        { action: 'open', title: 'Shiko Fletedergesen' },
        { action: 'close', title: 'Mbyll' }
      ];
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.registration.pushManager.applicationServerKey
    })
  );
});
