/* ============================================================
   لوحة عربي — Theme bootstrap (runs synchronously in <head>)

   Applies the visitor's saved colour theme to <html data-theme>
   BEFORE the page is first painted, so a dark-mode visitor never
   sees a flash of the light page while the next page loads.

   - Storage: localStorage key "ak-theme" ("light" | "dark"), written
     by the theme toggle in assets/js/app.js (same pattern as "ak-lang"
     in i18n.js). Only an explicit choice is ever stored.
   - Nothing stored (or storage blocked / invalid value): fall back to
     the system preference, exactly as the site did before.
   - app.js owns the toggle button and the saving; this file only
     applies. Keep the key name in sync with app.js.
   ============================================================ */
(function () {
  "use strict";
  var theme = null;
  try {
    var v = window.localStorage.getItem("ak-theme");
    if (v === "dark" || v === "light") theme = v;
  } catch (e) { /* storage blocked: use the system preference below */ }
  if (!theme) {
    try { theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    catch (e) { theme = "light"; }
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
