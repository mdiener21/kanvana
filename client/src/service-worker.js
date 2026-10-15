const CACHE_PREFIX = `kanvana-shell:${self.registration.scope}:`;
const CACHE_NAME = CACHE_PREFIX + __CACHE_VERSION__;
const PRECACHE_URLS = __PRECACHE_URLS__.map(path => new URL(path, self.registration.scope).href);
const SHELL_URLS = new Set(PRECACHE_URLS);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    url.search = '';
    if (url.href === self.registration.scope) url.pathname += 'index.html';
  }
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(url.href)) || fetch(event.request);
  })());
});
