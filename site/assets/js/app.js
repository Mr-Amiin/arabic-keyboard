/* ============================================================
   لوحة عربي — Global shared behavior (every route loads this)
   Theme toggle, mobile nav, toast, FAQ accordion.
   Note: theme intentionally kept in-memory (defaults to system
   preference) rather than using localStorage/cookies, so it is
   safe to preview inside sandboxed artifact viewers. If you self
   host this site, add a localStorage-backed persistence layer
   here — it's the one line intentionally left out.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- THEME ---------- */
  const root = document.documentElement;
  const themeBtn = document.getElementById("themeToggle");
  let theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
    });
  }

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
