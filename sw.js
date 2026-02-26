/* Service Worker for English Resources PWA
   Strategy:
   - Static assets (CSS, JS, fonts): Cache-first (fast loads)
   - HTML pages: Network-first with cache fallback (always fresh content)
   - Firebase/API requests: Network-only (real-time data) */

var CACHE_NAME = 'eng-res-v1';

var STATIC_ASSETS = [
  '/English-Resources/interactive-quiz.css',
  '/English-Resources/interactive-quiz.js',
  '/English-Resources/teacher-reveal.css',
  '/English-Resources/teacher-reveal.js',
  '/English-Resources/student-responses.js',
  '/English-Resources/answer-fetch.js',
  '/English-Resources/firebase-config.js',
  '/English-Resources/ui-sounds.js',
  '/English-Resources/favicon.svg',
  '/English-Resources/icon-192.png',
  '/English-Resources/icon-512.png'
];

// Install: pre-cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: route by request type
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase / external API requests (network-only)
  if (url.hostname.indexOf('firebaseio.com') !== -1 ||
      url.hostname.indexOf('googleapis.com') !== -1 ||
      url.hostname.indexOf('firebase') !== -1) {
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: network-first with cache fallback
  if (event.request.headers.get('accept') &&
      event.request.headers.get('accept').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

function isStaticAsset(pathname) {
  return /\.(css|js|svg|png|jpg|jpeg|gif|woff2?|ttf|eot|ico)$/.test(pathname);
}
