const CACHE = 'price-finder-v13';
const SHELL = ['./', './index.html', './styles.css', './app.js', './supabase-config.js', './supabase-client.js', './manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(found => found || fetch(event.request))); });
