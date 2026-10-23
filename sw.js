/* Solo Learning service worker — installable PWA + offline shell.
   The whole app is one self-contained HTML file, so caching the document
   caches everything (dictionary, clips, captions, engine). */
var CACHE = 'solo-v1';
var SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin) {
    // network-first for the app shell (updates flow), cache fallback offline
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/')) {
      e.respondWith(fetch(req).then(function (r) {
        var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); });
        return r;
      }).catch(function () { return caches.match('./'); }));
      return;
    }
    // same-origin assets: cache-first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return r; });
    }));
    return;
  }
  // cross-origin fonts: cache-first, tolerate opaque responses
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.youtube\.com|i\.ytimg\.com)$/.test(url.hostname)) {
    if (url.hostname.indexOf('font') === 0 || url.hostname === 'fonts.googleapis.com') {
      e.respondWith(caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return r; }).catch(function () { return new Response('', { status: 504 }); });
      }));
    }
    // player/iframe traffic: never intercept
  }
});
