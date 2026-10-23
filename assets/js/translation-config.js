/* Translation proxy URL (the deployed Cloudflare Worker, see workers/translate-proxy/README.md).
   Leave empty until the Worker is deployed: the Translation page then shows a clear "not connected yet" message.
   Example:  window.AK_TRANSLATE_API = "https://translate.arabic-keyboard.live";
   This is a public URL, NOT a secret. There is no key anywhere: the Worker reaches Cloudflare Workers AI through its AI binding.
   NOTE: the service worker caches this file; bump CACHE_NAME in sw.js after changing it. */
window.AK_TRANSLATE_API = "";
