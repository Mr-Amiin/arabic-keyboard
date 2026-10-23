/* ============================================================
   Translation tool (/translation/)

   Real machine translation: text is sent to the site's translation proxy
   (a Cloudflare Worker that runs Meta's M2M100 model on Cloudflare Workers AI
   — see workers/translate-proxy/). Nothing here translates by itself: there is
   no dictionary and no word substitution. The language lists come from the
   proxy (/languages), never from a hard-coded list. The model cannot detect a
   source language, so the visitor always chooses one.

   This is TRANSLATION (meaning -> another language). For writing Arabic
   sounds in Latin letters see /transliteration/.

   All UI strings are Arabic (the site's source language) and are translated
   to English by assets/js/i18n.js + i18n-en.js, like the rest of the site.
   Provider language names are requested in the current interface language.
   ============================================================ */
(function () {
  "use strict";

  var API = String(window.AK_TRANSLATE_API || "").replace(/\/+$/, "");
  var POPULAR = ["ar", "en", "so", "sw", "fr", "es", "de", "tr", "ur", "id", "zh"];
  var REQUEST_TIMEOUT_MS = Number(window.AK_TRANSLATE_TIMEOUT_MS) || 20000;   // override is for tests only
  var DEFAULT_MAX = 5000;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    src: $("trSource"), tgt: $("trTarget"), swap: $("trSwap"), input: $("trIn"), count: $("trCount"), run: $("trRun"),
    clear: $("trClear"), status: $("trStatus"), error: $("trError"), errorMsg: $("trErrorMsg"), retry: $("trRetry"),
    out: $("trOut"), copy: $("trCopy"), app: $("trApp"), undo: $("trUndo")
  };
  if (!el.src || !el.tgt || !el.input || !el.run) return;

  var T = function (s) { return window.AK_I18N ? window.AK_I18N.translate(s) : s; };   // for strings built in JS (option group labels)
  var nf = function (n) { try { return Number(n).toLocaleString("ar-EG"); } catch (e) { return String(n); } };

  var MSG = {
    loading: "جارٍ الترجمة…",
    loadingLangs: "جارٍ تحميل اللغات…",
    ok: "تمت الترجمة ✓",
    swapped: "تم تبديل اللغات. اضغط «ترجمة» لترجمة النص الجديد.",
    copied: "تم نسخ الترجمة",
    copyFail: "تعذّر النسخ تلقائيًا. حدّد الترجمة وانسخها يدويًا.",
    groupPopular: "لغات شائعة",
    groupAll: "كل اللغات",
    langsFailedOpt: "تعذّر تحميل اللغات",
    errors: {
      empty: "اكتب نصًا لترجمته أولًا.",
      sameLanguage: "اختر لغتين مختلفتين للمصدر والهدف.",
      network: "تعذّر الاتصال بخدمة الترجمة. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.",
      timeout: "استغرقت الترجمة وقتًا أطول من المعتاد. أعد المحاولة بعد قليل.",
      rateLimited: "وصلتَ إلى حدّ الاستخدام المؤقت. انتظر قليلًا ثم أعد المحاولة.",
      unsupported: "هذه اللغة أو هذا الزوج من اللغات غير مدعوم حاليًا.",
      unavailable: "خدمة الترجمة غير متاحة مؤقتًا. أعد المحاولة لاحقًا.",
      quota: "استُنفدت حصة الترجمة المجانية لهذا اليوم، وتتجدد تلقائيًا غدًا. أعد المحاولة لاحقًا.",
      busy: "نموذج الترجمة مشغول حاليًا. أعد المحاولة بعد لحظات.",
      unconfigured: "خدمة الترجمة لم تُربط بهذا الموقع بعد.",
      badResponse: "وصلت استجابة غير متوقعة من خدمة الترجمة. أعد المحاولة.",
      langsFailed: "تعذّر تحميل قائمة اللغات. تحقّق من اتصالك ثم أعد المحاولة.",
      tooLong: function (max) { return "النص أطول من الحد المسموح (" + nf(max) + " حرف). قسّمه إلى أجزاء أصغر."; }
    }
  };
  // proxy error code -> message key
  var CODE_TO_MSG = { empty: "empty", too_long: "tooLong", same_language: "sameLanguage", unsupported_language: "unsupported", rate_limited: "rateLimited", quota_exceeded: "quota", busy: "busy", unavailable: "unavailable", timeout: "timeout", unconfigured: "unconfigured", bad_response: "badResponse", bad_request: "badResponse" };

  var state = {
    languages: [], byCode: {}, max: DEFAULT_MAX,
    src: "ar", tgt: "en",                     // Arabic -> English by default
    inFlight: false, token: 0, controller: null,
    hasOutput: false, snapshot: null, langsLoaded: false, lastFailed: "translate"
  };

  /* ---------- helpers ---------- */
  function uiLang() { return document.documentElement.lang === "en" ? "en" : "ar"; }
  function dirOf(code) { var l = state.byCode[code]; return l ? l.dir : (code === "ar" || code === "ur" || code === "fa" || code === "he" ? "rtl" : "ltr"); }
  function chars(s) { return Array.from(s).length; }

  function setStatus(text, kind, withUndo) {
    el.status.hidden = !text;
    el.status.setAttribute("data-kind", kind || "");
    // text goes in a span so the optional Undo button can sit beside it
    var span = el.status.querySelector(".tr-status-text");
    if (span) span.textContent = text || "";
    if (el.undo) el.undo.hidden = !withUndo;
  }
  function hideError() { el.error.hidden = true; el.errorMsg.textContent = ""; }
  function showError(key, arg) {
    var m = MSG.errors[key] || MSG.errors.unavailable;
    el.errorMsg.textContent = typeof m === "function" ? m(arg) : m;
    el.error.hidden = false;
    el.retry.hidden = !(key === "network" || key === "timeout" || key === "unavailable" || key === "rateLimited" || key === "badResponse" || key === "busy" || key === "langsFailed");
    setStatus("", "");
  }

  function updateCount() {
    var n = chars(el.input.value);
    el.count.textContent = nf(n) + " / " + nf(state.max) + " حرف";
    el.count.classList.toggle("over", n > state.max);
  }

  function applyDirs() {
    el.input.setAttribute("dir", dirOf(state.src));
    el.input.setAttribute("lang", state.src);
    el.out.setAttribute("dir", dirOf(state.tgt));
    el.out.setAttribute("lang", state.tgt);
  }

  function setBusy(on) {
    state.inFlight = on;
    el.app.setAttribute("aria-busy", on ? "true" : "false");
    [el.run, el.swap, el.src, el.tgt].forEach(function (c) { c.disabled = on || !state.langsLoaded; });
    el.run.classList.toggle("is-loading", on);
    el.copy.disabled = on || !state.hasOutput;
  }

  function setOutput(text, hasResult) {
    el.out.textContent = text || "—";
    el.out.classList.toggle("has-result", !!hasResult);
    state.hasOutput = !!hasResult;
    el.copy.disabled = !hasResult;
  }

  /* ---------- language selectors (built from the provider's real list) ---------- */
  function optionFor(l) {
    var o = document.createElement("option");
    o.value = l.code;
    o.textContent = l.nativeName && l.nativeName !== l.name ? l.name + " (" + l.nativeName + ")" : l.name;
    return o;
  }
  function buildSelect(select, current) {
    select.textContent = "";
    var collator; try { collator = new Intl.Collator(uiLang()); } catch (e) { collator = null; }
    var byName = function (x, y) { return collator ? collator.compare(x.name, y.name) : (x.name < y.name ? -1 : 1); };
    var pop = POPULAR.map(function (c) { return state.byCode[c]; }).filter(Boolean);
    var rest = state.languages.filter(function (l) { return POPULAR.indexOf(l.code) === -1; }).sort(byName);
    var g1 = document.createElement("optgroup"); g1.label = T(MSG.groupPopular); pop.forEach(function (l) { g1.appendChild(optionFor(l)); });
    var g2 = document.createElement("optgroup"); g2.label = T(MSG.groupAll); rest.forEach(function (l) { g2.appendChild(optionFor(l)); });
    if (pop.length) select.appendChild(g1);
    select.appendChild(g2);
    select.value = current;
    if (select.value !== current) select.selectedIndex = 0;
  }
  function renderSelects() {
    if (!state.byCode[state.src]) state.src = state.byCode.ar ? "ar" : (state.languages[0] || {}).code;
    if (!state.byCode[state.tgt]) state.tgt = state.byCode.en ? "en" : (state.languages[0] || {}).code;
    buildSelect(el.src, state.src);
    buildSelect(el.tgt, state.tgt);
    applyDirs();
  }

  function fail(code) { var e = new Error(code); e.code = code; return e; }

  function request(path, init, trackAbort) {
    var controller = new AbortController();
    if (trackAbort) state.controller = controller;
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(API + path, Object.assign({ signal: controller.signal, credentials: "omit" }, init || {}))
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) { return { status: res.status, body: body }; });
      }, function (err) { throw fail(err && err.name === "AbortError" ? "timeout" : "network"); })
      .then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }

  // silent = refresh of the language NAMES after an interface-language switch: must not disturb status, errors or a request in flight.
  function loadLanguages(silent) {
    if (!API) { showError("unconfigured"); renderUnavailable(); return Promise.resolve(); }
    if (!silent) setStatus(MSG.loadingLangs, "info");
    var requestedUi = uiLang();
    return request("/languages?ui=" + requestedUi).then(function (r) {
      if (r.status !== 200 || !r.body || !r.body.ok || !Array.isArray(r.body.languages) || !r.body.languages.length) {
        var code = r.body && r.body.error && r.body.error.code;
        throw fail(code || "bad_response");
      }
      state.languages = r.body.languages; state.byCode = {};
      r.body.languages.forEach(function (l) { state.byCode[l.code] = l; });
      if (r.body.maxChars) state.max = r.body.maxChars;
      state.langsLoaded = true;
      if (!silent) { state.lastFailed = "translate"; hideError(); setStatus("", ""); }
      renderSelects(); updateCount(); setBusy(state.inFlight);
      // The interface language can change while the list is loading (e.g. a returning English visitor): fetch the names again.
      if (requestedUi !== uiLang()) loadLanguages(true);
    }).catch(function (e) {
      if (silent) return;                                                // keep the names we already have
      state.lastFailed = "languages";
      showError(e.code === "network" || e.code === "timeout" ? "langsFailed" : (CODE_TO_MSG[e.code] || "langsFailed"));
      el.retry.hidden = false;
      renderUnavailable();
    });
  }
  function renderUnavailable() {
    if (state.langsLoaded) return;
    [el.src, el.tgt].forEach(function (s) { s.textContent = ""; var o = document.createElement("option"); o.textContent = MSG.langsFailedOpt; s.appendChild(o); });
    setBusy(false);
  }

  /* ---------- translate ---------- */
  function run() {
    if (state.inFlight) return;                                          // no duplicate submissions
    hideError();
    var text = el.input.value;
    if (!state.langsLoaded) { showError(API ? "langsFailed" : "unconfigured"); return; }
    if (!text.trim()) { showError("empty"); el.input.focus(); return; }
    var n = chars(text);
    if (n > state.max) { showError("tooLong", state.max); return; }
    if (state.src === state.tgt) { showError("sameLanguage"); return; }

    var token = ++state.token;
    state.snapshot = null;
    setBusy(true);
    setStatus(MSG.loading, "info");
    request("/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text, from: state.src, to: state.tgt }) }, true)
      .then(function (r) {
        if (token !== state.token) return;                               // cleared / superseded meanwhile
        var b = r.body;
        if (r.status === 200 && b && b.ok && typeof b.translation === "string") {
          setOutput(b.translation, true);
          el.out.setAttribute("dir", dirOf(state.tgt)); el.out.setAttribute("lang", state.tgt);
          setStatus(MSG.ok, "ok");
          setBusy(false);
          return;
        }
        var code = b && b.error && b.error.code;
        throw fail(code || (r.status === 429 ? "rate_limited" : "bad_response"));
      })
      .catch(function (e) {
        if (token !== state.token) return;
        state.lastFailed = "translate";
        setBusy(false);
        // a previous good result stays untouched; an error is shown separately and never as a translation
        var key = e.code === "network" ? "network" : e.code === "timeout" ? "timeout" : (CODE_TO_MSG[e.code] || "unavailable");
        showError(key, state.max);
      });
  }

  /* ---------- swap / undo / clear / copy ---------- */
  function swap() {
    if (state.inFlight || !state.langsLoaded) return;
    hideError();
    state.snapshot = { src: state.src, tgt: state.tgt, input: el.input.value, output: state.hasOutput ? el.out.textContent : "", hasOutput: state.hasOutput };
    var outText = state.hasOutput ? el.out.textContent : null;
    var oldSrc = state.src;
    state.src = state.tgt; state.tgt = oldSrc;
    if (outText !== null) el.input.value = outText;                      // the translation becomes the new source text
    setOutput("", false);
    el.src.value = state.src; el.tgt.value = state.tgt;
    applyDirs(); updateCount();
    setStatus(MSG.swapped, "info", true);
    el.input.focus();
  }
  function undoSwap() {
    var s = state.snapshot; if (!s) return;
    state.src = s.src; state.tgt = s.tgt; el.input.value = s.input;
    el.src.value = state.src; el.tgt.value = state.tgt;
    setOutput(s.output, s.hasOutput); state.snapshot = null;
    applyDirs(); updateCount(); setStatus("", ""); el.input.focus();
  }
  function clearAll() {
    state.token++;                                                       // discard any in-flight response
    if (state.controller) { try { state.controller.abort(); } catch (e) { } }
    state.inFlight = false; state.snapshot = null;
    el.input.value = ""; setOutput("", false); hideError(); setStatus("", "");
    updateCount(); setBusy(false); el.input.focus();
  }
  function copyOut() {
    if (!state.hasOutput) return;
    var text = el.out.textContent;
    var done = function () { if (window.showToast) window.showToast(MSG.copied); setStatus(MSG.copied + " ✓", "ok"); };
    var legacy = function () {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) { }
      document.body.removeChild(ta); ok ? done() : fail2();
    };
    var fail2 = function () { if (window.showToast) window.showToast(MSG.copyFail); setStatus(MSG.copyFail, "warn"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy); else legacy();
  }

  /* ---------- wiring ---------- */
  el.src.addEventListener("change", function () { state.src = el.src.value; state.snapshot = null; applyDirs(); hideError(); });
  el.tgt.addEventListener("change", function () { state.tgt = el.tgt.value; state.snapshot = null; applyDirs(); hideError(); });
  el.input.addEventListener("input", function () { updateCount(); if (!el.error.hidden && el.errorMsg.textContent) hideError(); });
  el.input.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } });
  el.run.addEventListener("click", run);
  el.swap.addEventListener("click", swap);
  if (el.undo) el.undo.addEventListener("click", undoSwap);
  el.clear.addEventListener("click", clearAll);
  el.copy.addEventListener("click", copyOut);
  el.retry.addEventListener("click", function () { if (state.lastFailed === "languages" || !state.langsLoaded) { hideError(); loadLanguages(); } else run(); });

  // Interface language changed: ask the provider for language names in that language (keeps the selections).
  document.addEventListener("ak:languagechange", function () { if (state.langsLoaded) loadLanguages(true); });

  updateCount(); setOutput("", false); setBusy(false);
  loadLanguages();
})();
