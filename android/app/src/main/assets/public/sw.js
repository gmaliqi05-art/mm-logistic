const CACHE_VERSION = 'mm-logistic-v6';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept or cache Supabase API/auth/storage/realtime calls.
  // These must always hit the network live so authentication and data
  // stay correct on PWA installs.
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.supabase.in') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/storage/') ||
    url.pathname.startsWith('/functions/')
  ) {
    return;
  }

  // Only handle same-origin requests.
  if (url.origin !== location.origin) return;

  const accept = event.request.headers.get('accept') || '';
  const isNavigation =
    event.request.mode === 'navigate' ||
    (event.request.method === 'GET' && accept.includes('text/html'));

  if (isNavigation) {
    // NetworkFirst with a short timeout so slow/offline networks fall back
    // to the cached shell instead of hanging the PWA on launch.
    event.respondWith(
      withTimeout(fetch(event.request), 3000)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  // Static assets: StaleWhileRevalidate for fast launches.
  if (/\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: network-first with fallback to cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => response)
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
      icon: icon || '/pwa-icon-192.png?v=4',
      badge: badge || '/pwa-icon-192.png?v=4',
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
    } else if (data.type === 'stock') {
      options.actions = [
        { action: 'open', title: 'Shiko Stokun' },
        { action: 'close', title: 'Mbyll' }
      ];
    } else if (data.type === 'assignment') {
      options.actions = [
        { action: 'open', title: 'Shiko Detyren' },
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
