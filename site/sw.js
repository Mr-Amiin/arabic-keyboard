/* لوحة عربي — service worker
   Strategy: cache-first for the app shell + core JS/CSS so the
   Arabic keyboard, transliteration, and editor keep working
   offline once the site has been visited once. Everything else
   (fonts, new pages) falls back to the network and is cached
   opportunistically.
*/
const CACHE_NAME = "arabic-keyboard-shell-v2";
const CORE_ASSETS = [
  "/",
  "/arabic-keyboard/",
  "/transliteration/",
  "/tashkeel/",
  "/editor/",
  "/typing-test/",
  "/manifest.json",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/js/keyboard-tool.js",
  "/assets/js/typing-test.js",
  "/assets/js/tashkeel-tool.js",
  "/assets/js/alphabet.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
