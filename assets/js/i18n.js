/* ============================================================
   لوحة عربي — Runtime localization (Arabic default, English optional)

   HOW IT WORKS
   - Arabic is the source language and the default. The pages and
     scripts keep their Arabic text exactly as before; nothing here
     changes the Arabic experience, URLs, metadata or indexing.
   - When English is selected, this file translates the interface IN
     PLACE: every visible Arabic string (text nodes, title/placeholder/
     aria-label/alt attributes, page title and meta description) is
     looked up in ONE dictionary, assets/js/i18n-en.js, keyed by the
     original Arabic string. Strings that are not in the dictionary
     (Arabic letters, typed text, tool output, sample sentences, font
     names ...) are never touched, so product content stays Arabic.
   - Because nothing is re-rendered or reloaded, text the visitor has
     already typed (keyboard, editor, Tashkeel, Calligraphy Editor)
     and the current page / tool state survive a language switch.
   - Original Arabic is remembered per node, so switching back to
     العربية restores the page exactly.
   - Dynamic UI text (toasts, status lines, panels created by scripts)
     is caught by a MutationObserver that only runs while English is on.

   PREFERENCE
   - Saved in localStorage under "ak-lang" ("ar" | "en"). Arabic is
     used when nothing is saved. Language is never inferred from the
     browser, location or IP. "?lang=en" / "?lang=ar" in a link sets
     the preference explicitly (the canonical URL stays unchanged).

   MARKUP HOOKS
   - data-i18n-skip       : never translate this element's contents
                            (tool output, typed text, ...).
   - data-i18n-html="key" : the element mixes text with inline markup;
                            swap its whole innerHTML for dictionary.html[key]
                            ({r} = relative path to the site root).
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "ak-lang";
  var LANGS = { ar: { dir: "rtl" }, en: { dir: "ltr" } };
  var AR_RE = /[\u0600-\u06FF]/;
  var ATTRS = ["title", "placeholder", "aria-label", "alt"];
  var SVG_NS = "http://www.w3.org/2000/svg";
  var root = document.documentElement;
  var scriptEl = document.currentScript;
  var DICT_URL = scriptEl && scriptEl.src
    ? scriptEl.src.replace(/i18n\.js(\?.*)?$/, "i18n-en.js$1")
    : "/assets/js/i18n-en.js";
  // Arabic-content areas that must stay marked as Arabic when the page is English.
  var AR_CONTENT = "#editor, #typing-input, #promptText, #translitOutput, #tashkeelIn, #tashkeelOut, .alpha-grid, #virtualKeyboard";

  /* ---------- preference ---------- */
  function readStored() {
    try { var v = window.localStorage.getItem(STORAGE_KEY); return LANGS[v] ? v : null; } catch (e) { return null; }
  }
  function writeStored(v) { try { window.localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* private mode: lives for this page only */ } }
  function fromQuery() {
    try { var m = /[?&]lang=(ar|en)(?:&|#|$)/.exec(window.location.search); return m ? m[1] : null; } catch (e) { return null; }
  }

  var queryLang = fromQuery();
  if (queryLang) writeStored(queryLang);
  var lang = queryLang || readStored() || "ar";   // Arabic unless the visitor chose otherwise
  var applied = "ar";                              // what the DOM currently shows
  var dict = null;
  var dictCallbacks = null;
  var observer = null;
  var ctxEl = null;               // element whose text/attribute is being translated (for dict.scoped)

  // WeakMaps: originals of everything we translated, so Arabic can be restored exactly.
  var origText = new WeakMap();   // Text node  -> original data
  var origAttr = new WeakMap();   // Element    -> { attrName: original value }
  var origHtml = new WeakMap();   // Element    -> original innerHTML (data-i18n-html blocks)
  var addedLang = new WeakSet();  // elements we gave lang="ar" to

  /* ---------- avoid a flash of Arabic for returning English visitors ---------- */
  if (lang === "en") {
    root.className += " i18n-pending";
    var st = document.createElement("style");
    st.id = "i18n-pending-style";
    st.textContent = "html.i18n-pending body{visibility:hidden}";
    (document.head || root).appendChild(st);
    // Failsafe: never leave the page hidden if the dictionary cannot load.
    window.setTimeout(function () { root.className = root.className.replace(/\bi18n-pending\b/, "").trim(); }, 3000);
  }

  /* ---------- translation ---------- */
  function latin(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/\u066C/g, ",").replace(/\u066B/g, ".");
  }

  // Returns the English string, or null when the dictionary has nothing for it.
  function tr(src) {
    if (!dict || typeof src !== "string") return null;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src);
    var core = m[2];
    if (!core || !AR_RE.test(core)) return null;
    var key = core.replace(/\s+/g, " ");
    var out;
    if (ctxEl && dict.scoped) {                  // same Arabic word, different meaning in another part of the site
      for (var k = 0; k < dict.scoped.length && out === undefined; k++) {
        if (ctxEl.closest && ctxEl.closest(dict.scoped[k][0])) out = dict.scoped[k][1][key];
      }
    }
    if (out === undefined) out = dict.text[key];
    if (out === undefined) {
      var pats = dict.patterns || [];
      for (var i = 0; i < pats.length; i++) {
        var pm = pats[i][0].exec(key);
        if (pm) { out = pats[i][1](pm, translateOrSelf, latin); if (out != null) break; }
      }
    }
    if (out === undefined || out === null) {
      if (core.indexOf("\n") !== -1) {            // multi-line titles / tooltips: translate line by line
        var changed = false;
        var parts = core.split("\n").map(function (line) {
          var t = tr(line);
          if (t === null) return line;
          changed = true; return t;
        });
        if (changed) out = parts.join("\n");
      }
    }
    if (out === undefined || out === null) {      // bilingual labels: "العربية • English" -> "English"
      var b = /^[^\u2022]*[\u0600-\u06FF][^\u2022]*\s\u2022\s([^\u0600-\u06FF]+)$/.exec(key);
      if (b) out = b[1].trim();
    }
    return out === undefined || out === null ? null : m[1] + out + m[3];
  }
  function translateOrSelf(s) { var t = tr(s); return t === null ? s : t; }

  /* ---------- DOM walking ---------- */
  function skipped(el) {
    return !!(el && el.closest && el.closest("script,style,textarea,noscript,[data-i18n-skip],[contenteditable='true'],[contenteditable='']"));
  }
  function attrSkipped(el) { return !!(el && el.closest && el.closest("script,style,[data-i18n-skip]")); }
  function inSwappedBlock(el) {
    var b = el && el.closest && el.closest("[data-i18n-html]");
    return !!(b && origHtml.has(b));
  }

  function rootPrefix() {
    var b = document.querySelector("a.brand");
    return (b && b.getAttribute("href")) || "./";
  }

  function applyBlock(el) {
    var key = el.getAttribute("data-i18n-html");
    var html = dict && dict.html && dict.html[key];
    if (html === undefined || origHtml.has(el)) return;
    origHtml.set(el, el.innerHTML);
    el.innerHTML = html.replace(/\{r\}/g, rootPrefix());
  }

  function applyText(node) {
    var d = node.data;
    if (!d || !AR_RE.test(d)) return;
    var p = node.parentElement;
    if (!p || skipped(p) || inSwappedBlock(p)) return;
    ctxEl = p; var out = tr(d); ctxEl = null;
    if (out === null || out === d) return;
    origText.set(node, d);
    node.data = out;
  }

  function isTranslatableAttr(el, name) {
    if (el.localName !== "meta") return ATTRS.indexOf(name) !== -1;
    if (name !== "content") return false;
    var n = el.getAttribute("name") || el.getAttribute("property") || "";
    return n === "description" || n.indexOf("og:") === 0 || n.indexOf("twitter:") === 0;
  }

  function applyAttr(el, name) {
    if (!isTranslatableAttr(el, name) || attrSkipped(el) || inSwappedBlock(el)) return;
    var v = el.getAttribute(name);
    if (!v || !AR_RE.test(v)) return;
    ctxEl = el; var out = tr(v); ctxEl = null;
    if (out === null || out === v) return;
    var o = origAttr.get(el);
    if (!o) { o = {}; origAttr.set(el, o); }
    o[name] = v;
    el.setAttribute(name, out);
  }

  function applyElementAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) applyAttr(el, ATTRS[i]);
    if (el.localName === "meta" && el.hasAttribute("content")) applyAttr(el, "content");
  }

  function applyTree(node) {
    if (node.nodeType === 3) { applyText(node); return; }
    if (node.nodeType !== 1 || node.namespaceURI === SVG_NS) return;
    if (skipped(node)) return;
    var blocks = node.querySelectorAll("[data-i18n-html]");
    if (node.hasAttribute("data-i18n-html")) applyBlock(node);
    for (var b = 0; b < blocks.length; b++) if (!skipped(blocks[b])) applyBlock(blocks[b]);
    applyElementAttrs(node);
    var withAttrs = node.querySelectorAll("[title],[placeholder],[aria-label],[alt],meta[content]");
    for (var a = 0; a < withAttrs.length; a++) applyElementAttrs(withAttrs[a]);
    var walker = document.createTreeWalker(node, 4 /* SHOW_TEXT */, null);
    var t;
    while ((t = walker.nextNode())) applyText(t);
  }

  function restoreTree(node) {
    var blocks = node.querySelectorAll("[data-i18n-html]");
    for (var b = 0; b < blocks.length; b++) {
      if (origHtml.has(blocks[b])) { blocks[b].innerHTML = origHtml.get(blocks[b]); origHtml.delete(blocks[b]); }
    }
    var walker = document.createTreeWalker(node, 4, null);
    var t;
    while ((t = walker.nextNode())) {
      if (origText.has(t)) { t.data = origText.get(t); origText.delete(t); }
    }
    var els = node.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var o = origAttr.get(els[i]);
      if (!o) continue;
      for (var name in o) if (Object.prototype.hasOwnProperty.call(o, name)) els[i].setAttribute(name, o[name]);
      origAttr.delete(els[i]);
    }
  }

  /* ---------- live updates (only while English is on) ---------- */
  function onMutations(records) {
    if (applied !== "en" || !dict) return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "childList") {
        for (var j = 0; j < r.addedNodes.length; j++) applyTree(r.addedNodes[j]);
      } else if (r.type === "characterData") {
        applyText(r.target);
      } else if (r.type === "attributes" && r.target.namespaceURI !== SVG_NS) {
        applyAttr(r.target, r.attributeName);
      }
    }
    if (observer) observer.takeRecords();   // drop the records caused by our own writes
  }
  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(onMutations);
    observer.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["title", "placeholder", "aria-label", "alt", "content"]
    });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  /* ---------- dictionary loading ---------- */
  function loadDict(cb) {
    if (dict) { cb(true); return; }
    if (window.AK_I18N_DICT_EN) { dict = window.AK_I18N_DICT_EN; cb(true); return; }
    if (dictCallbacks) { dictCallbacks.push(cb); return; }
    dictCallbacks = [cb];
    var s = document.createElement("script");
    s.src = DICT_URL;
    s.async = true;
    s.onload = function () {
      dict = window.AK_I18N_DICT_EN || null;
      var cbs = dictCallbacks; dictCallbacks = null;
      cbs.forEach(function (f) { f(!!dict); });
    };
    s.onerror = function () {
      var cbs = dictCallbacks; dictCallbacks = null;
      cbs.forEach(function (f) { f(false); });
    };
    (document.head || root).appendChild(s);
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  /* ---------- applying a language ---------- */
  function setDocAttrs(l) {
    root.setAttribute("lang", l);
    root.setAttribute("dir", LANGS[l].dir);
  }

  function markArabicContent(on) {
    var els = document.querySelectorAll(AR_CONTENT);
    for (var i = 0; i < els.length; i++) {
      if (on && !els[i].hasAttribute("lang")) { els[i].setAttribute("lang", "ar"); addedLang.add(els[i]); }
      else if (!on && addedLang.has(els[i])) { els[i].removeAttribute("lang"); addedLang.delete(els[i]); }
    }
  }

  function finish() {
    root.className = root.className.replace(/\bi18n-pending\b/, "").trim();
    syncSwitchers();
    try { document.dispatchEvent(new CustomEvent("ak:languagechange", { detail: { lang: applied } })); } catch (e) { /* old browsers */ }
  }

  function applyLang() {
    onReady(function () {
      stopObserver();
      if (lang === "en") {
        if (!dict) { lang = "ar"; applied = "ar"; finish(); return; }   // dictionary unavailable: stay Arabic
        setDocAttrs("en");
        applyTree(root);
        markArabicContent(true);
        applied = "en";
        startObserver();
      } else {
        restoreTree(root);
        markArabicContent(false);
        setDocAttrs("ar");
        applied = "ar";
      }
      finish();
    });
  }

  function setLang(next, opts) {
    if (!LANGS[next]) return;
    if (opts && opts.persist) writeStored(next);
    lang = next;
    if (next === "en" && !dict) {
      loadDict(function (ok) {
        if (!ok) { try { console.warn("[i18n] English dictionary could not be loaded; staying in Arabic."); } catch (e) { } }
        if (lang === "en") applyLang();
      });
    } else if (applied !== next || next === "en") {
      applyLang();
    } else {
      syncSwitchers();
    }
  }

  /* ---------- language switcher UI ---------- */
  function syncSwitchers() {
    var opts = document.querySelectorAll(".lang-switch .lang-opt");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-pressed", opts[i].getAttribute("data-lang") === applied ? "true" : "false");
    }
  }

  function buildSwitcher(extraClass) {
    var wrap = document.createElement("div");
    wrap.className = "lang-switch" + (extraClass ? " " + extraClass : "");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language / اللغة");
    wrap.setAttribute("data-i18n-skip", "");
    [["ar", "العربية"], ["en", "English"]].forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "lang-opt";
      b.setAttribute("data-lang", p[0]);
      b.setAttribute("lang", p[0]);
      b.setAttribute("aria-pressed", p[0] === applied ? "true" : "false");
      b.textContent = p[1];
      b.addEventListener("click", function () { setLang(p[0], { persist: true }); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function mountSwitchers() {
    var headActions = document.querySelector("header.site .head-actions");
    if (headActions && !headActions.querySelector(".lang-switch")) headActions.insertBefore(buildSwitcher(), headActions.firstChild);
    var closeRow = document.querySelector("#mobileNav .mobile-panel .close-x");
    if (closeRow && !document.querySelector("#mobileNav .lang-switch")) closeRow.parentNode.insertBefore(buildSwitcher("lang-switch-mobile"), closeRow.nextSibling);
    var editorBar = document.querySelector("#top-bar .bar-right");
    if (editorBar && !editorBar.querySelector(".lang-switch")) editorBar.insertBefore(buildSwitcher("lang-switch-editor"), editorBar.firstChild);
  }

  /* ---------- boot ---------- */
  onReady(mountSwitchers);

  if (lang === "en") {
    loadDict(function (ok) {
      if (!ok) { try { console.warn("[i18n] English dictionary could not be loaded; staying in Arabic."); } catch (e) { } lang = "ar"; }
      applyLang();
    });
  } else {
    onReady(syncSwitchers);
  }

  // Keep several open tabs in step.
  window.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY && LANGS[e.newValue] && e.newValue !== applied) setLang(e.newValue, { persist: false });
  });

  window.AK_I18N = {
    getLang: function () { return applied; },
    setLang: function (l) { setLang(l, { persist: true }); },
    translate: function (s) { return applied === "en" ? translateOrSelf(s) : s; }
  };
})();
