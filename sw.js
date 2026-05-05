const CACHE_NAME = 'news-tracker-v8';

// Install — cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache individually so one failure doesn't block everything
      return Promise.allSettled([
        cache.add('/news-tracker/'),
        cache.add('/news-tracker/index.html'),
        cache.add('/news-tracker/manifest.json'),
        cache.add('/news-tracker/images/favicon-192.png')
      ]);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache (same-origin only)
self.addEventListener('fetch', event => {
  // Don't intercept cross-origin requests (Google Sheets, GoatCounter, etc.)
  // Letting the browser handle them avoids "Failed to fetch" when the SW
  // can't return a cached fallback.
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
