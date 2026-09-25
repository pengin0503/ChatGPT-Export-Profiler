/// <reference lib="webworker" />

interface PrecacheEntry {
  url: string;
  revision?: string | null;
}

type ProfilerServiceWorker = ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[];
};

const sw = self as unknown as ProfilerServiceWorker;
const precacheManifest = (self as unknown as ProfilerServiceWorker).__WB_MANIFEST;
const CACHE_PREFIX = 'chatgpt-export-profiler-app-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const precacheUrls = precacheManifest.map((entry) => new URL(entry.url, sw.registration.scope).href);
const precacheUrlSet = new Set(precacheUrls);
const appShellUrl = new URL('index.html', sw.registration.scope).href;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(precacheUrls))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== sw.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match(appShellUrl).then((cached) => cached ?? fetch(request)));
    return;
  }

  if (!precacheUrlSet.has(requestUrl.href)) return;
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
