// Service worker for Research OS PWA installability + offline app-shell cache.
// Strategy: network-first for app files (so you always get the latest code
// when online), falling back to cache only when offline. This never caches
// data — data lives in IndexedDB / Supabase, not here.

var CACHE_NAME = 'research-os-shell-v1';
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        return res;
      })
      .catch(function(){ return caches.match(event.request); })
  );
});
