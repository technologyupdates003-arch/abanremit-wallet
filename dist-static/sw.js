// AbanRemit minimal service worker — network-first, no aggressive caching.
// Keeps the app installable as a PWA without serving stale auth/api data.
const VERSION = "v1";
const SHELL = "abanremit-shell-" + VERSION;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/index.html", "/manifest.json"])).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API / supabase / auth traffic.
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.hostname.includes("paystack.co") ||
    url.hostname.includes("safaricom.co.ke")
  ) return;

  // Navigation requests → network-first, fallback to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets → cache-first.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && url.origin === self.location.origin) {
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
    )
  );
});
