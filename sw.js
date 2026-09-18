// Caches just the app shell (this page, the manifest, the icons) so Study
// and Library — which don't need the network at all — keep working with
// no connection. AI features (Translate, Chat, Photo) still need a real
// network call every time and are deliberately never cached here; if
// there's no connection, those fail with the app's own error message
// rather than silently returning something stale.
const CACHE_NAME = "dansk-shell-v4";
const SHELL_FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  // addAll() is all-or-nothing — if even one shell file 404s (a missing
  // manifest.json, say), the whole install silently fails and the
  // service worker never activates at all, which means every fix here
  // would just keep failing to install forever with no visible error.
  // Cache each file independently instead, so one missing file can't
  // take the rest down with it.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL_FILES.map((file) =>
          cache.add(file).catch((err) => {
            console.warn("[sw] couldn't cache shell file, continuing anyway:", file, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only ever serve the app shell itself from cache — same-origin GET
  // requests for these known files. Everything else (in particular any
  // cross-origin AI API call) passes straight through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first: while this app is still being actively updated,
  // showing the latest version whenever there's a connection matters
  // more than shaving a few ms off load time. cache: "no-cache" forces
  // this to actually revalidate with the server every time rather than
  // silently trusting the browser's own HTTP cache — without it, a
  // "network-first" fetch could still resolve from disk cache and never
  // reach the network at all, which defeats the whole point. The
  // service worker's own cache below is a separate layer and is what
  // makes Study/Library work with no connection — it's just no longer
  // served ahead of a real network check when one is possible.
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
