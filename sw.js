/* Service Worker for English Resources PWA
   Strategy:
   - Static assets (CSS, JS, fonts): Cache-first (fast loads)
   - HTML pages: Network-first with cache fallback (always fresh content)
   - Firebase/API requests: Network-only (real-time data) */

var CACHE_NAME = 'eng-res-v3';

var BASE = self.location.pathname.replace(/sw\.js$/, '');
// GitHub Pages: '/English-Resources/'
// Firebase:     '/'

var STATIC_ASSETS = [
  BASE + 'interactive-quiz.css',
  BASE + 'interactive-quiz.js',
  BASE + 'teacher-reveal.css',
  BASE + 'teacher-reveal.js',
  BASE + 'student-responses.js',
  BASE + 'answer-fetch.js',
  BASE + 'firebase-config.js',
  BASE + 'ui-sounds.js',
  BASE + 'spaced-review.js',
  BASE + 'leaderboard.js',
  BASE + 'favicon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png'
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
    }).then(function() {
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      });
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
