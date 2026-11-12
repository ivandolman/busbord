// Bestemmingsbord service worker: keeps the app and the last answers available offline.
// Network first for pages and data (fresh when online), the cache when the network fails;
// built assets (hashed names, never change) straight from the cache.
const VERSION = "v2";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const DATA = `data-${VERSION}`;

/** API answers worth keeping for offline use. Writes (POST/PUT/DELETE) are never cached. */
const OFFLINE_API = /^\/api\/(board|network|place|stops|departures|next-departures|reachable|walk-area|walk-route|settings|routes)(\?|$)/;

self.addEventListener("install", (event) => {
  // Not cache.add: when the session has ended "/" redirects to the login page, which must not
  // be kept as the start page.
  event.waitUntil(
    fetch("/")
      .then((response) => (cacheable(response) ? caches.open(PAGES).then((cache) => cache.put("/", response)) : undefined))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.endsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Only real answers: a redirect (to the login page) or a 401 is never kept. */
function cacheable(response) {
  return response.ok && !response.redirected;
}

/** The cached answer, marked so the page can say it is showing older data. */
async function fromCache(cacheName, request, matchOptions) {
  const cached = await caches.match(request, { cacheName, ...matchOptions });
  if (!cached) return null;
  const headers = new Headers(cached.headers);
  headers.set("X-Offline", "1");
  return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
}

async function networkFirst(cacheName, request, matchOptions) {
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await fromCache(cacheName, request, matchOptions);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/login") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request, { cacheName: ASSETS }).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) caches.open(ASSETS).then((cache) => cache.put(request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }
  if (request.mode === "navigate") {
    // Any page falls back to the start page: it reads the route from the URL itself.
    event.respondWith(
      networkFirst(PAGES, request, { ignoreSearch: true }).catch(async () => (await fromCache(PAGES, "/")) ?? Response.error()),
    );
    return;
  }
  if (OFFLINE_API.test(url.pathname + url.search)) {
    event.respondWith(networkFirst(DATA, request));
  }
});

// "Vertrek nu" notifications are shown by the page through the registration; a tap opens the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname === "/");
      if (open) return open.focus().then((client) => client.navigate?.(target));
      return self.clients.openWindow(target);
    }),
  );
});
