const CACHE_NAME = "airline-operations-center-shell-v10";
const APP_SHELL = [
  "/",
  "/login",
  "/dashboard",
  "/config.js",
  "/app.js?v=20260830-data-detail-interactions-1",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

function isBusinessRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      return cache.match("/dashboard") || cache.match("/");
    }
    throw error;
  }
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (!isSameOrigin(url) || isBusinessRequest(url)) return;
  if (!["GET", "HEAD"].includes(event.request.method)) return;
  event.respondWith(networkFirst(event.request));
});
