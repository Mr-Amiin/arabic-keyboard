/* Learn Arabic — persistent typing dock (answer box + the site's existing Arabic keyboard).
   - The dock lives in the page (outside #learnApp), so re-rendering lessons/questions never destroys it.
   - keyboard-tool.js is NOT loaded until a typing exercise first opens the dock, and ArabicKeyboardTool.init()
     runs at most once (it has no teardown and installs a ResizeObserver).
   - The native <textarea> always works. If the keyboard script fails, only the on-screen keys are missing. */
window.LearnTypingDock = (function () {
  "use strict";
  const LOAD_TIMEOUT_MS = 8000;
  const st = { kb: "idle", visible: true, initAttempted: false, initialised: false, locked: false, wired: false, loads: 0 };
  let el = null, onSubmit = null, onInputCb = null, scrollBefore = { x: 0, y: 0 };
  // A click with no pointer behind it (keyboard Enter/Space, screen-reader activation) reports pointerType "" (or detail 0 in older
  // engines). Mouse, touch and pen clicks report their own pointerType and keep the keyboard tool's normal behaviour.
  const isKeyboardActivation = ev => ev.pointerType === "" || (ev.pointerType === undefined && ev.detail === 0);

  function q() {
    if (!el) el = { panel: document.getElementById("lxTypePanel"), prompt: document.getElementById("lxTPrompt"), editor: document.getElementById("lxEditor"),
      toggle: document.getElementById("lxKbToggle"), wrap: document.getElementById("lxKbWrap"), kb: document.getElementById("lxKb"),
      status: document.getElementById("lxKbStatus"), retry: document.getElementById("lxKbRetry"), announce: document.getElementById("lxKbAnnounce") };
    return el;
  }
  function root() { return document.getElementById("learnApp"); }
  function say(html) { const e = q(); if (e.status) e.status.innerHTML = html; }

  function applyVisibility() {
    const e = q(); if (!e.wrap || !e.toggle) return;
    const usable = st.kb !== "failed";
    e.toggle.hidden = !usable;
    e.wrap.hidden = !(usable && st.visible);
    e.toggle.setAttribute("aria-expanded", String(usable && st.visible));
    e.toggle.textContent = st.visible ? "Hide Arabic keyboard" : "Show Arabic keyboard";
    // On touch devices the OS keyboard would cover the screen next to ours; suppress it while ours is showing.
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (e.editor) { if (usable && st.visible && coarse) e.editor.setAttribute("inputmode", "none"); else e.editor.removeAttribute("inputmode"); }
  }

  function tryInit() {
    if (st.initialised) return true;
    if (st.initAttempted) return false;           // never init twice, even after a failure
    const T = window.ArabicKeyboardTool;
    if (!T || typeof T.init !== "function") return false;
    st.initAttempted = true;
    try { const api = T.init({ editorId: "lxEditor", keyboardId: "lxKb" }); st.initialised = !!api; } catch (err) { st.initialised = false; }
    return st.initialised;
  }
  function result(ok) {
    st.kb = ok ? "ready" : "failed";
    const e = q();
    if (ok) say("Arabic keyboard ready. Use the keys or your device keyboard.");
    else say('The on-screen keyboard could not be loaded. You can still type with your device keyboard, or use the <a href="../arabic-keyboard/" target="_blank" rel="noopener">Arabic keyboard tool</a>.');
    if (e.retry) e.retry.hidden = ok || st.initAttempted;   // retrying only makes sense if the script itself failed
    applyVisibility();
  }
  function load() {
    if (st.kb === "loading" || st.kb === "ready") return;
    st.kb = "loading"; say("Loading the Arabic keyboard…"); if (q().retry) q().retry.hidden = true;
    if (window.ArabicKeyboardTool) { result(tryInit()); return; }
    const src = (root() && root().getAttribute("data-keyboard-src")) || "../assets/js/keyboard-tool.js";
    st.loads++;
    let settled = false;
    const timer = setTimeout(function () { if (!settled) { settled = true; result(false); } }, LOAD_TIMEOUT_MS);
    const s = document.createElement("script"); s.src = src; s.async = true; s.id = "lxKeyboardScript";
    s.onload = function () { settled = true; clearTimeout(timer); result(tryInit()); };   // also recovers from a late load after a timeout
    s.onerror = function () { if (!settled) { settled = true; clearTimeout(timer); } s.remove(); result(false); };
    document.head.appendChild(s);
  }

  function wire() {
    if (st.wired) return; st.wired = true;
    const e = q();
    e.toggle.addEventListener("click", function () { st.visible = !st.visible; applyVisibility(); });
    if (e.retry) e.retry.addEventListener("click", function () { if (st.kb === "failed") { st.kb = "idle"; load(); } });
    // Block key presses while an answer is locked in (capture phase runs before the keyboard's own handlers).
    e.kb.addEventListener("click", function (ev) { if (st.locked) { ev.stopPropagation(); ev.preventDefault(); return; } scrollBefore = { x: window.scrollX, y: window.scrollY }; }, true);
    // The keyboard tool changes .value without firing "input"; announce those edits ourselves (bubble phase = after its handler).
    e.kb.addEventListener("click", function (ev) {
      if (st.locked) return;
      e.editor.dispatchEvent(new Event("input", { bubbles: true }));
      const key = ev.target.closest && ev.target.closest(".key");
      // Tell assistive technology what happened (focus is staying on the key, so the textarea will not announce itself).
      if (key && e.announce) e.announce.textContent = (key.getAttribute("aria-label") || key.textContent.trim()) + ". Answer: " + (e.editor.value || "empty");
      // The tool moves focus (and may scroll) to the textarea after every key. For keyboard activation give the user their place back.
      if (key && isKeyboardActivation(ev)) { key.focus({ preventScroll: true }); /* "instant" = defensive: no dependence on the site's html{scroll-behavior:smooth} (with smooth scrolling the restore also cancels the tool's pending scroll, so the end result is the same) */ window.scrollTo({ left: scrollBefore.x, top: scrollBefore.y, behavior: "instant" }); }
    });
    e.editor.addEventListener("input", function () { if (onInputCb) onInputCb(e.editor.value); });
    e.editor.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.isComposing) { ev.preventDefault(); if (onSubmit) onSubmit(); }
    });
  }

  return {
    open: function () { wire(); const e = q(); e.panel.hidden = false; applyVisibility(); load(); },
    close: function () { const e = q(); if (e.panel) e.panel.hidden = true; if (e.wrap) e.wrap.hidden = true; },
    setPrompt: function (html) { q().prompt.innerHTML = html; },
    value: function () { return q().editor ? q().editor.value : ""; },
    clear: function () { const e = q().editor; e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); if (q().announce) q().announce.textContent = ""; },
    // Focus the answer box without letting the browser scroll it alone into view (that can hide the word being typed
    // behind the sticky header on phones); bring the prompt into view first if it is off-screen or under the header.
    focus: function () {
      const e = q(); if (!e.editor) return; e.editor.focus({ preventScroll: true });
      const r = e.prompt.getBoundingClientRect();
      if (r.top < 72 || r.top > window.innerHeight * 0.6) e.prompt.scrollIntoView({ block: "start" });
    },
    lock: function (on) { const e = q(); st.locked = !!on; e.editor.readOnly = !!on; if (e.wrap) { if ("inert" in e.wrap) e.wrap.inert = !!on; e.wrap.classList.toggle("is-locked", !!on); } },
    onSubmit: function (fn) { onSubmit = fn; },
    onInput: function (fn) { onInputCb = fn; },
    state: function () { return { keyboard: st.kb, visible: st.visible, initialised: st.initialised, locked: st.locked, scriptLoads: st.loads }; }
  };
})();
