/* لوحة عربي — service worker
   Strategy: cache-first for the app shell + core JS/CSS so the
   Arabic keyboard, transliteration, and editor keep working
   offline once the site has been visited once. Everything else
   (fonts, new pages) falls back to the network and is cached
   opportunistically. The Tashkeel model + WASM runtime (~19 MB, under
   /assets/vendor/) are deliberately NOT precached: they are fetched and
   cached on first use of /tashkeel/ only. They live in their own cache
   (VENDOR_CACHE) so that bumping CACHE_NAME for a normal site update does
   not throw away a visitor's 19 MB download. Bump VENDOR_CACHE only when
   the files under /assets/vendor/ themselves change.
*/
const CACHE_NAME = "arabic-keyboard-shell-v10";
const VENDOR_CACHE = "arabic-keyboard-vendor-v1";
const isVendor = (url) => new URL(url).pathname.startsWith("/assets/vendor/");
const CORE_ASSETS = [
  "/",
  "/arabic-keyboard/",
  "/transliteration/",
  "/tashkeel/",
  "/translation/",
  "/editor/",
  "/typing-test/",
  "/manifest.json",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/js/i18n.js",
  "/assets/js/keyboard-tool.js",
  "/assets/js/typing-test.js",
  "/assets/js/tashkeel-engine.js",
  "/assets/js/tashkeel-tool.js",
  "/assets/js/translation-config.js",
  "/assets/js/translation-tool.js",
  "/assets/js/alphabet.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/assets/brand/arabic-keyboard-logo.svg",
  "/assets/brand/arabic-keyboard-logo-dark.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: "reload" })))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // One-time migration: shell caches up to v4 also held the Tashkeel model + runtime.
    // Move them to VENDOR_CACHE so returning visitors do not download ~19 MB again.
    try {
      const vendor = await caches.open(VENDOR_CACHE);
      for (const k of keys) {
        if (k === CACHE_NAME || k === VENDOR_CACHE) continue;
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          if (!isVendor(req.url) || (await vendor.match(req))) continue;
          const res = await old.match(req);
          if (res) await vendor.put(req, res);
        }
      }
    } catch (e) { /* migration is best-effort; the files are simply fetched again if it fails */ }
    await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== VENDOR_CACHE).map((k) => caches.delete(k)));
  })());
  self.clients.claim();
});

// The translation proxy address lives in this one tiny file. Serve it network-first so changing it
// takes effect immediately for returning visitors (no CACHE_NAME bump needed); fall back to the cache offline.
const isLiveConfig = (url) => new URL(url).pathname === "/assets/js/translation-config.js";

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (isLiveConfig(event.request.url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(isVendor(event.request.url) ? VENDOR_CACHE : CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback only for page navigations. Other requests (the Tashkeel
          // model / WASM runtime) must fail honestly instead of receiving the home page.
          if (event.request.mode === "navigate") return caches.match("/");
          return Response.error();
        });
    })
  );
});
