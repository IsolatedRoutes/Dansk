// Caches the app shell (page, manifest, icons) so Study and Library work
// offline. AI features always use the network and are never cached.
const CACHE_NAME = "dansk-shell-v140";
const SHELL_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  // Cache each file independently so one missing file can't fail the install.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL_FILES.map((file) =>
          cache.add(file).catch((err) => {
            console.warn("[sw] couldn't cache shell file:", file, err);
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
  // Only same-origin GET requests are handled; everything else (including AI
  // API calls) passes through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first so the latest version loads whenever there is a
  // connection; "no-cache" bypasses the browser's HTTP cache. The service
  // worker cache is the offline fallback.
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
