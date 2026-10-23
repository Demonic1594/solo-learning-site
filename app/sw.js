/* Solo Learning (app) service worker: installable, and works offline after the first visit.
   - The page itself: network first, so updates arrive; the cached copy is used offline.
   - Same-site files (scripts, styles, dictionary data): cached as they're used, served from the cache
     first. Their names change whenever their content does, so a cached copy is never stale. After each
     page load, files the current build no longer has (asset-list.json, written by the build) are deleted,
     so the cache doesn't grow with every deploy.
   - Everything cross-site (YouTube players, Supabase, fonts) is left alone. */
var CACHE = 'solo-app-v1';
var SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

function dropOldBuilds() {
  var assets = self.registration.scope + 'assets/';
  return fetch('./asset-list.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
    if (!Array.isArray(list) || !list.length) return;
    var keep = {};
    list.forEach(function (f) { keep[new URL(f, self.registration.scope).href] = true; });
    return caches.open(CACHE).then(function (c) {
      return c.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { var u = k.url.split('?')[0]; return u.indexOf(assets) === 0 && !keep[u] ? c.delete(k) : null; }));
      });
    });
  }).catch(function () {});
}

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
  // Dev-server endpoints (/__something) are never cached; their answers change without their URL changing.
  if (/\/__[a-z]/.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); });
      if (r.ok) e.waitUntil(dropOldBuilds());
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
