/* HM Panel service worker. The registration URL carries ?v=<app>-<premium>, so every
 * panel or premium update installs a fresh worker and drops the old caches. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const STATIC_CACHE = `hm-static-${VERSION}`;
const PAGE_CACHE = `hm-pages-${VERSION}`;
const RUNTIME_CACHE = `hm-runtime-${VERSION}`;
const OWN_CACHES = [STATIC_CACHE, PAGE_CACHE, RUNTIME_CACHE];
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/pwa/icon-192.png',
  '/fonts/vazirmatn/vazirmatn.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('hm-') && !OWN_CACHES.includes(n)).map((n) => caches.delete(n)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => undefined);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith('hm-')).map((n) => caches.delete(n)))),
    );
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/pwa/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.ico'
  );
}

function isRuntimeAsset(url) {
  return (
    url.pathname.startsWith('/api/platform/premium-assets/') ||
    url.pathname === '/api/public/app-brand'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (/^\/(api|s|sub|socket\.io)\//.test(url.pathname)) return;
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (isRuntimeAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  return hit || network;
}

// Pages always come from the network while it answers: a slow connection
// used to get the cached HTML after 3s, i.e. the previous build's UI (and its
// old JS chunks) right after an update. The cache is only an offline fallback.
async function networkFirstPage(event) {
  const { request } = event;
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new URL(request.url);
  cacheKey.search = '';
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(request));
    if (response.ok && response.type === 'basic') cache.put(cacheKey.href, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey.href);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}
