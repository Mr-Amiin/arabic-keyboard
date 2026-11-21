/* ============================================================
   لوحة عربي — Global shared behavior (every route loads this)
   Theme toggle, mobile nav, toast, FAQ accordion.
   Theme: the visitor's explicit choice is saved in localStorage
   ("ak-theme": "light" | "dark") so it survives navigation, refresh
   and direct loads. With nothing saved the system preference is used.
   assets/js/theme-init.js applies the saved value before first paint
   (keep the key name in sync); this file owns the toggle + saving.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- THEME ---------- */
  const THEME_KEY = "ak-theme";
  const root = document.documentElement;
  const themeBtn = document.getElementById("themeToggle");
  function savedTheme() {
    try {
      const v = window.localStorage.getItem(THEME_KEY);
      return v === "dark" || v === "light" ? v : null;
    } catch (e) { return null; }
  }
  function systemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  let theme = savedTheme() || systemTheme();
  function applyTheme() {
    root.setAttribute("data-theme", theme);
    if (themeBtn) {
      themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
      themeBtn.setAttribute("aria-pressed", theme === "dark");
    }
  }
  applyTheme();
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      applyTheme();
      try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage blocked: applies to this page only */ }
    });
  }
  // Keep other open tabs, and pages restored from the back/forward cache, in step with the saved choice.
  function syncTheme() {
    const next = savedTheme() || systemTheme();
    if (next !== theme) { theme = next; applyTheme(); }
  }
  window.addEventListener("storage", (e) => { if (e.key === THEME_KEY || e.key === null) syncTheme(); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) syncTheme(); });

  /* ---------- MOBILE NAV ---------- */
  const menuToggle = document.getElementById("menuToggle");
  const mobileNav = document.getElementById("mobileNav");
  const mobileClose = document.getElementById("mobileNavClose");
  function openMobile() {
    if (!mobileNav) return;
    mobileNav.classList.add("open");
    mobileNav.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeMobile() {
    if (!mobileNav) return;
    mobileNav.classList.remove("open");
    mobileNav.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  if (menuToggle) menuToggle.addEventListener("click", openMobile);
  if (mobileClose) mobileClose.addEventListener("click", closeMobile);
  if (mobileNav) {
    mobileNav.addEventListener("click", (e) => {
      if (e.target === mobileNav) closeMobile();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobile();
  });

  /* ---------- TOAST ---------- */
  const toastEl = document.getElementById("toast");
  let toastTimer;
  window.showToast = function (msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  };

  /* ---------- FAQ ACCORDION (data-driven, works on any page) ---------- */
  document.querySelectorAll("[data-faq-list]").forEach((container) => {
    container.querySelectorAll(".faq-item").forEach((item) => {
      const q = item.querySelector(".faq-q");
      if (!q) return;
      q.addEventListener("click", () => {
        const isOpen = item.classList.toggle("open");
        q.setAttribute("aria-expanded", String(isOpen));
      });
    });
  });

  /* ---------- SERVICE WORKER (PWA offline shell) ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* fails silently if not served over https/localhost, e.g. static preview */
      });
    });
  }

  /* ---------- GENERIC MODAL HELPERS ---------- */
  document.querySelectorAll("[data-modal-open]").forEach((btn) => {
    const id = btn.getAttribute("data-modal-open");
    btn.addEventListener("click", () => {
      const modal = document.getElementById(id);
      if (modal) modal.classList.add("open");
    });
  });
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal-overlay")?.classList.remove("open");
    });
  });
})();

/* ============================================================
   SITE ADS — the ONE central advertising configuration and the ONE shared ad component.

   ADS ARE OFF (ADS_ENABLED: false). While off this block does nothing at all: it creates no element, injects no CSS,
   loads no script, makes no network request and reserves no layout space, so every page behaves exactly as if
   advertising did not exist. (It lives in app.js, which every page already loads, so "off" costs not even one extra file.)

   TO TURN ADS ON (a deliberate, single-place change, only after Google approves the site):
     1. In AdSense, create a responsive Display ad unit and copy its numeric "data-ad-slot" ID into AD_SLOT_ID below.
        No ad-unit ID exists in this repository yet, and none may be invented.
     2. Set ADS_ENABLED to true.
     3. Bump CACHE_NAME in /sw.js (app.js is served cache-first, so returning visitors only get the change after a bump).
   If ADS_ENABLED is true but PUBLISHER_ID / AD_SLOT_ID are not both valid, nothing is rendered (a console warning is logged).

   Rules baked in: ONE primary placement per page load; positions come from PLACEMENTS below (never inside a lesson, tool
   canvas or control row, never fixed/sticky); no automatic refresh and no repeat request when a view re-renders; the slot
   is removed if AdSense reports it unfilled, so no empty box is ever left behind.

   The existing AdSense site-verification tags (<meta name="google-adsense-account"> and the adsbygoogle.js <script> in each
   page <head>), ads.txt and Google Analytics are NOT touched by this block.
   ============================================================ */
(function () {
  "use strict";

  /* ===== CENTRAL ADVERTISING CONFIGURATION ===== */
  const ADS = Object.freeze({
    ADS_ENABLED: false,                         // MASTER SWITCH. false = no DOM, no CSS, no script, no request, no layout space.
    PUBLISHER_ID: "ca-pub-2057098005458261",    // existing publisher ID (same as ads.txt and the <head> verification tag)
    AD_SLOT_ID: "",                             // responsive display ad unit ID from AdSense. Empty = never render.
    AD_FORMAT: "horizontal",                    // keeps the unit short on phones; "auto" is the taller alternative
    FULL_WIDTH_RESPONSIVE: true
  });

  /* ===== PLACEMENT RULES (one primary placement per page) =====
     anchor: CSS selector of an existing element on the page.  where: insertAdjacentElement position.  wrap: give the slot
     the site's .wrap width (needed only when it is inserted outside a .wrap container).
     The Learn Arabic dashboard is placed by learn/app.js (its markup is rendered by script); lesson pages are matched below. */
  const PLACEMENTS = {
    "/":                 { anchor: "#tool",           where: "afterend" },               // after the writing workspace
    "/arabic-keyboard/": { anchor: "#tool",           where: "afterend" },               // after keyboard + writing workspace
    "/editor/":          { anchor: "main .tool-card", where: "afterend" },               // after the main editor
    "/transliteration/": { anchor: "main .tool-card", where: "afterend" },               // after the transliteration tool
    "/tashkeel/":        { anchor: "main .tk-app",    where: "afterend" },               // after input and generated result
    "/typing-test/":     { anchor: "#resultPanel",    where: "afterend" },               // after the typing-test interface
    "/arabic-alphabet/": { anchor: "#letterDetail",   where: "afterend" },               // after the interactive alphabet
    "/about/":           { anchor: "main",            where: "afterend", wrap: true },   // informational: after main content,
    "/faq/":             { anchor: "main",            where: "afterend", wrap: true },   //   before the footer
    "/privacy/":         { anchor: "main",            where: "afterend", wrap: true },
    "/terms/":           { anchor: "main",            where: "afterend", wrap: true }
  };
  // Individual lessons: after the lesson title + short introduction, before the lesson content and exercises.
  const LESSON_PLACEMENT = { anchor: "main .hero", where: "afterend" };
  const LESSON_PATH = /^\/learn-arabic\/[^\/]+\/[^\/]+\/$/;
  // Deliberately NOT placed (no rule in the approved table, or a layout decision is needed first): /calligraphy-editor/,
  // /translation/, /tools/, /contact/ and the redirect stub page for the old typing-test URL.

  /* ===== MODE: "off" (default) | "live" (real AdSense) | "fixture" (local development only) ===== */
  const host = location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  const live = ADS.ADS_ENABLED === true && /^ca-pub-\d+$/.test(ADS.PUBLISHER_ID) && /^\d{6,}$/.test(ADS.AD_SLOT_ID);
  // The fixture is a clearly labelled stand-in used to test the enabled layout. It needs BOTH a localhost host AND an
  // explicit ?ads-fixture=1, loads nothing from Google and makes no request, and is refused on any real domain.
  const fixture = !live && isLocalHost && /[?&]ads-fixture=1(&|$)/.test(location.search);
  const MODE = live ? "live" : fixture ? "fixture" : "off";
  if (ADS.ADS_ENABLED === true && !live && window.console) console.warn("[SiteAds] ADS_ENABLED is true but PUBLISHER_ID / AD_SLOT_ID are not both valid: no ads are rendered.");

  const state = { mode: MODE, placed: [], pushes: 0 };
  let styleAdded = false;

  function pagePath() {
    let p = location.pathname.replace(/index\.html$/, "");
    if (!/\/$/.test(p)) p += "/";
    return p;
  }
  function addStyle() {
    if (styleAdded) return; styleAdded = true;
    const st = document.createElement("style"); st.id = "site-ad-style";
    st.textContent =
      ".site-ad{display:block;box-sizing:border-box;max-width:100%;overflow:hidden;clear:both;margin:0;padding:0;border:0}" +
      ".site-ad.wrap{width:100%}" +
      ".site-ad.is-filled{margin:22px auto;padding:6px 8px 8px;text-align:center;border:1px solid var(--border,rgba(127,127,127,.3));border-radius:var(--radius-md,16px);background:var(--surface,transparent)}" +
      ".site-ad.wrap.is-filled{width:auto;max-width:1140px}" +
      ".site-ad__label{display:none;margin:0 0 4px;font:600 11px/1.2 var(--font-ui,system-ui,sans-serif);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft,inherit)}" +
      ".site-ad.is-filled .site-ad__label{display:block}" +
      ".site-ad ins.adsbygoogle{display:block;width:100%;margin:0 auto}" +
      ".site-ad__fixture{min-height:100px;padding:14px;border:2px dashed #b45309;border-radius:8px;font:600 13px/1.5 var(--font-ui,system-ui,sans-serif);color:var(--ink,inherit);" +
      "background:repeating-linear-gradient(45deg,rgba(180,83,9,.10),rgba(180,83,9,.10) 8px,transparent 8px,transparent 16px)}";
    document.head.appendChild(st);
  }
  function ensureLoader() {
    // The loader normally already sits in each page <head> (the verification tag). Add it only if it is missing, and only once.
    if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return;
    const s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADS.PUBLISHER_ID);
    document.head.appendChild(s);
  }
  function build(name, wrap) {
    const box = document.createElement("aside");
    box.className = "site-ad notranslate" + (wrap ? " wrap" : "");
    box.setAttribute("data-site-ad", name); box.setAttribute("data-i18n-skip", ""); box.setAttribute("translate", "no");
    box.setAttribute("lang", "en"); box.setAttribute("dir", "ltr"); box.setAttribute("aria-label", "Advertisement");
    const label = document.createElement("span"); label.className = "site-ad__label"; label.textContent = "Advertisement";
    box.appendChild(label);
    if (MODE === "live") {
      const ins = document.createElement("ins"); ins.className = "adsbygoogle";
      ins.setAttribute("data-ad-client", ADS.PUBLISHER_ID); ins.setAttribute("data-ad-slot", ADS.AD_SLOT_ID);
      ins.setAttribute("data-ad-format", ADS.AD_FORMAT); ins.setAttribute("data-full-width-responsive", String(ADS.FULL_WIDTH_RESPONSIVE));
      box.appendChild(ins);
    } else {
      const fx = document.createElement("div"); fx.className = "site-ad__fixture";
      fx.textContent = "DEV FIXTURE: this is not an advertisement. It only marks where the primary ad slot would render (localhost + ?ads-fixture=1 only).";
      box.appendChild(fx);
    }
    return box;
  }
  function activate(box) {
    const ins = box.querySelector("ins.adsbygoogle");
    if (!ins) { box.classList.add("is-filled"); return; }          // fixture: show immediately, nothing is requested
    ensureLoader();
    // Show the frame (border, label, spacing) only once AdSense reports the unit filled; drop the whole box if unfilled.
    new MutationObserver(function (_m, obs) {
      const st = ins.getAttribute("data-ad-status");
      if (st === "filled") { box.classList.add("is-filled"); obs.disconnect(); }
      else if (st === "unfilled") { box.remove(); obs.disconnect(); }
    }).observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); state.pushes++; } catch (e) { box.remove(); }
  }

  // Place the one primary slot. Returns the element, or null (ads off, no anchor, or this page already has its slot).
  function place(name, anchor, where, opts) {
    if (MODE === "off" || !anchor || state.placed.length) return null;      // off = return BEFORE touching the DOM
    state.placed.push(name);
    addStyle();
    const box = build(name, !!(opts && opts.wrap));
    anchor.insertAdjacentElement(where || "afterend", box);
    activate(box);
    return box;
  }

  window.SiteAds = Object.freeze({
    mode: MODE,
    place: place,
    state: function () { return { mode: state.mode, placed: state.placed.slice(), pushes: state.pushes }; }
  });

  if (MODE !== "off") {
    const path = pagePath();
    const rule = PLACEMENTS[path] || (LESSON_PATH.test(path) ? LESSON_PLACEMENT : null);
    if (rule) place(path, document.querySelector(rule.anchor), rule.where, rule);
  }
})();
