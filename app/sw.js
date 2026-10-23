/* Solo Learning (app) service worker: installable, and works offline after the first visit.
   - The page itself: network first, so updates arrive; the cached copy is used offline.
   - Same-site files (scripts, styles, dictionary data): cached as they're used, served from the cache
     first. Their names change whenever their content does, so a cached copy is never stale.
   - Everything cross-site (YouTube players, Supabase, fonts) is left alone. */
var CACHE = 'solo-app-v1';
var SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('solo-app-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// The first visit loads the page before this worker exists, so the page lists what it loaded and we keep it.
self.addEventListener('message', function (e) {
  var d = e.data;
  if (!d || d.type !== 'cache' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(d.urls.filter(function (u) { return new URL(u, location.href).origin === location.origin; }).map(function (u) {
      return c.match(u).then(function (hit) { return hit || c.add(u).catch(function () {}); });
    }));
  }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); });
      return r;
    }).catch(function () { return caches.match('./'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});
