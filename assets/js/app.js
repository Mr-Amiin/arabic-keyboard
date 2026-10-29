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
