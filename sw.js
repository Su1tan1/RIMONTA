/* RIMONTA offline application shell. The database snapshot itself is kept in localStorage by the app. */
const CACHE_NAME = "rimonta-shell-v2";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("rimonta-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type !== "CACHE_SHELL" || !data.url) return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(data.url, { cache: "reload", credentials: "same-origin" });
      if (!response.ok) return;
      const cache = await caches.open(CACHE_NAME);
      const clean = new URL(data.url);
      clean.search = "";
      clean.hash = "";
      await cache.put(clean.href, response.clone());
      if (data.root) await cache.put(data.root, response.clone());
    } catch (_) {
      // Keep any earlier successful shell copy intact.
    }
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const clean = new URL(request.url);
        clean.search = "";
        clean.hash = "";
        await cache.put(clean.href, response.clone());
        const scope = new URL(self.registration.scope);
        if (url.pathname === scope.pathname || /\/index\.html?$/i.test(url.pathname)) {
          await cache.put(self.registration.scope, response.clone());
        }
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request, { ignoreSearch: true })
        || await cache.match(self.registration.scope);
      return cached || new Response(
        "Нет интернета и сохранённой копии страницы. Откройте RIMONTA онлайн хотя бы один раз.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
  })());
});
