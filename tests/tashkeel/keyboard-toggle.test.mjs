// Regression tests: on-screen Arabic keyboard + ON/OFF switch on /tashkeel/, and the shared keyboard-tool.js
// behaviour that the integration relies on (selection replace, backspace, input events, no side effects on /arabic-keyboard/).
// Real page HTML + real keyboard-tool.js / tashkeel-tool.js / tashkeel-init.js in jsdom, with a STUB model engine.
// (Real-browser coverage of the same feature, incl. the real model, is in keyboard-toggle.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const tashkeelHtml = read("tashkeel/index.html");
const keyboardHtml = read("arabic-keyboard/index.html");
const kbJs = read("assets/js/keyboard-tool.js");
const tkJs = read("assets/js/tashkeel-tool.js");
const initJs = read("assets/js/tashkeel-init.js");
const i18nEn = read("assets/js/i18n-en.js");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function loaded(html, url) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  while (dom.window.document.readyState !== "complete") await tick(5);   // let jsdom's own DOMContentLoaded pass first
  return dom;
}

/* The real /tashkeel/ page, scripts evaluated in the page's own order, then DOMContentLoaded fired once. */
async function tashkeelPage({ withKeyboardScript = true, engine } = {}) {
  const dom = await loaded(tashkeelHtml, "https://www.arabic-keyboard.live/tashkeel/");
  const w = dom.window;
  const calls = { diacritize: [] };
  w.showToast = () => {};
  w.IchkilTashkeel = {
    load: async () => engine || { diacritize: async (t, o) => { calls.diacritize.push(t); o && o.onProgress && o.onProgress(1, 1); return { text: t + "ُ", chunks: 1, marksAdded: 1 }; } },
  };
  w.eval(tkJs);
  if (withKeyboardScript) w.eval(kbJs);
  w.eval(initJs);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const $ = (id) => w.document.getElementById(id);
  const inputEvents = { n: 0 };
  $("tashkeelIn").addEventListener("input", () => inputEvents.n++);
  // virtual key lookup: letters/numerals/punctuation carry their glyph as aria-label; diacritic/control keys carry their Arabic name
  const key = (label) => { const k = [...w.document.querySelectorAll("#virtualKeyboard .key")].find((b) => b.getAttribute("aria-label") === label); assert.ok(k, "no key labelled " + label); return k; };
  const setText = (v, s = v.length, e = s) => { const t = $("tashkeelIn"); t.value = v; t.setSelectionRange(s, e); };
  return { dom, w, $, key, calls, inputEvents, setText, ta: $("tashkeelIn"), sw: $("tashkeelKbSwitch"), panel: $("tashkeelKbPanel"), state: $("tashkeelKbState") };
}

test("1. page loads with the keyboard visible and the switch ON (labelled, accessible, visible state)", async () => {
  const { sw, panel, state, w, $ } = await tashkeelPage();
  assert.equal(sw.getAttribute("role"), "switch");
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(sw.tagName, "BUTTON", "a real <button>: focusable and Space/Enter activate it natively");
  assert.equal(sw.getAttribute("aria-controls"), "tashkeelKbPanel");
  const label = w.document.getElementById(sw.getAttribute("aria-labelledby"));
  assert.equal(label.textContent.trim(), "لوحة المفاتيح العربية");
  assert.equal(state.textContent.trim(), "تشغيل");
  assert.equal(panel.hidden, false);
  assert.ok(panel.contains($("virtualKeyboard")));
  const letters = [...w.document.querySelectorAll("#virtualKeyboard .key-main.arabic-glyph")].filter((k) => /^[\u0621-\u064A]/.test(k.textContent));
  assert.ok(letters.length >= 28, "Arabic letter keys rendered: " + letters.length);
  // keyboard sits between the editor and the action buttons, switch directly above it
  const order = [...w.document.querySelectorAll("#tashkeelIn, #tashkeelKbRow, #tashkeelKbPanel, #tashkeelRun")].map((e) => e.id);
  assert.deepEqual(order, ["tashkeelIn", "tashkeelKbRow", "tashkeelKbPanel", "tashkeelRun"]);
});

test("2/3. OFF hides the keyboard completely without touching text, selection or the other controls; ON restores it in place", async () => {
  const t = await tashkeelPage();
  t.setText("العلم نور", 2, 5);
  const parentBefore = t.panel.parentElement, nextBefore = t.panel.nextElementSibling;
  t.sw.click();
  assert.equal(t.sw.getAttribute("aria-checked"), "false");
  assert.equal(t.panel.hidden, true);
  assert.equal(t.state.textContent.trim(), "إيقاف");
  assert.equal(t.sw.getAttribute("aria-labelledby"), "tashkeelKbLabel", "name stays the label; state is conveyed by aria-checked");
  assert.equal(t.ta.value, "العلم نور");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [2, 5]);
  assert.equal(t.inputEvents.n, 0, "toggling must not fire input / modify the text");
  for (const id of ["tashkeelRun", "tashkeelExample", "tashkeelClear"]) assert.equal(t.$(id).disabled, false, id);
  assert.equal(t.$("tashkeelIn").hidden, false);
  assert.equal(t.$("tashkeelOut").hidden, false);
  assert.equal(t.$("tashkeelRun").hidden, false);

  t.sw.click();                                                           // ON again
  assert.equal(t.sw.getAttribute("aria-checked"), "true");
  assert.equal(t.panel.hidden, false);
  assert.equal(t.state.textContent.trim(), "تشغيل");
  assert.equal(t.panel.parentElement, parentBefore);
  assert.equal(t.panel.nextElementSibling, nextBefore, "same position");
  assert.equal(t.ta.value, "العلم نور");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [2, 5]);
  t.key("ب").click();                                                     // keeps working after OFF -> ON (listeners survive); the kept selection "علم" is replaced
  assert.equal(t.ta.value, "الب نور");
});

test("toggling many times never rebuilds the keyboard or duplicates key handlers (one click = one character)", async () => {
  const t = await tashkeelPage();
  const keysBefore = t.w.document.querySelectorAll("#virtualKeyboard .key").length;
  for (let i = 0; i < 6; i++) t.sw.click();
  assert.equal(t.w.document.querySelectorAll("#virtualKeyboard .key").length, keysBefore);
  t.setText("");
  t.key("ع").click();
  assert.equal(t.ta.value, "ع");
});

test("4. clicking Arabic keys inserts the matching characters, in order, and fires one input event per key", async () => {
  const t = await tashkeelPage();
  t.setText("");
  for (const ch of ["ك", "ت", "ا", "ب"]) t.key(ch).click();
  assert.equal(t.ta.value, "كتاب");
  assert.equal(t.inputEvents.n, 4);
  t.key("لا").click();                                                    // the lam-alef key inserts both letters
  assert.equal(t.ta.value, "كتاب" + "لا");
  t.key("أ").click(); t.key("١").click(); t.key("؟").click();
  assert.equal(t.ta.value, "كتابلاأ١؟");
});

test("5a. insertion happens at the caret, not at the end", async () => {
  const t = await tashkeelPage();
  t.setText("كتب", 1);                                                    // ك|تب
  t.key("ا").click();
  assert.equal(t.ta.value, "كاتب");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [2, 2], "caret ends right after the inserted character");
  t.key("م").click();
  assert.equal(t.ta.value, "كامتب", "the next key continues from the new caret position");
  t.setText("كتب", 0);
  t.key("و").click();
  assert.equal(t.ta.value, "وكتب");
});

test("5b. a key replaces the selected text, like a native text field", async () => {
  const t = await tashkeelPage();
  t.setText("العلم نور", 6, 9);                                           // select "نور"
  t.key("ن").click();
  assert.equal(t.ta.value, "العلم ن");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [7, 7]);
  t.setText("abc def", 0, 3);
  t.key("س").click();
  assert.equal(t.ta.value, "س def", "non-Arabic text outside the selection is untouched");
  t.setText("كلمة", 0, 4);                                                // select everything
  t.key("مسافة").click();
  assert.equal(t.ta.value, " ");
});

test("6. space, new line, backspace (caret and selection), diacritic keys", async () => {
  const t = await tashkeelPage();
  t.setText("ab", 1);
  t.key("مسافة").click();
  assert.equal(t.ta.value, "a b");
  t.key("سطر جديد").click();
  assert.equal(t.ta.value, "a \nb");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [3, 3]);

  t.setText("كتاب", 2);                                                   // كت|اب
  t.key("حذف الحرف الأخير").click();
  assert.equal(t.ta.value, "كاب");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [1, 1]);
  t.setText("كتاب", 1, 3);                                                // select "تا"
  t.key("حذف الحرف الأخير").click();
  assert.equal(t.ta.value, "كب", "backspace deletes the selection, not one extra character");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [1, 1]);

  const n = t.inputEvents.n;
  t.setText("كتاب", 0);
  t.key("حذف الحرف الأخير").click();                                      // caret at the very start: nothing to delete
  assert.equal(t.ta.value, "كتاب");
  assert.equal(t.inputEvents.n, n, "no-op backspace fires no input event");

  t.setText("😀ب", 2);                                                    // emoji (surrogate pair) before the caret
  t.key("حذف الحرف الأخير").click();
  assert.equal(t.ta.value, "ب", "never leaves half a surrogate pair behind");

  t.setText("كتب", 3);                                                    // diacritics are inserted verbatim as combining marks
  t.key("فتحة").click(); t.key("شدة").click(); t.key("تنوين ضم").click();
  assert.equal(t.ta.value, "كتب\u064E\u0651\u064C");
});

test("the Tashkeel counter and 'edited' state react to on-screen typing exactly like physical typing", async () => {
  const t = await tashkeelPage();
  t.setText("");
  for (const ch of ["ك", "ت", "ا", "ب"]) t.key(ch).click();
  assert.match(t.$("tashkeelCounts").textContent, /٤ حرف · ١ كلمة/);
  t.key("مسافة").click(); t.key("ج").click();
  assert.match(t.$("tashkeelCounts").textContent, /٦ حرف · ٢ كلمة/);
  // the "write Arabic first" warning clears as soon as the visitor types with the on-screen keys
  t.setText("");
  t.$("tashkeelRun").click(); await tick();
  assert.equal(t.$("tashkeelStatus").dataset.kind, "warn");
  t.key("ك").click();
  assert.equal(t.$("tashkeelStatus").hidden, true);
});

test("7. text typed with the on-screen keyboard is exactly what the Tashkeel engine receives; toggling changes nothing", async () => {
  const t = await tashkeelPage();
  t.setText("");
  for (const ch of ["ع", "ل", "م"]) t.key(ch).click();
  t.key("مسافة").click();
  for (const ch of ["ن", "و", "ر"]) t.key(ch).click();
  t.sw.click(); t.sw.click(); t.sw.click();                               // ON -> OFF -> ON -> OFF
  t.$("tashkeelRun").click();
  for (let i = 0; i < 20 && !t.$("tashkeelOut").classList.contains("has-result"); i++) await tick(5);
  assert.deepEqual(t.calls.diacritize, ["علم نور"], "exact, un-normalised text, even with the keyboard hidden");
  assert.equal(t.$("tashkeelOut").textContent, "علم نورُ");
  assert.equal(t.ta.value, "علم نور", "input is never rewritten by the tool or the toggle");
  assert.equal(t.$("tashkeelCopy").disabled, false);
});

test("8. physical keyboard keeps working: the textarea is a plain native field and no handler swallows key events", async () => {
  const t = await tashkeelPage();
  for (const type of ["keydown", "keypress", "keyup"]) {
    const ev = new t.w.KeyboardEvent(type, { key: "ب", bubbles: true, cancelable: true });
    t.ta.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, false, type + " must not be prevented");
  }
  assert.equal(t.ta.readOnly, false);
  assert.equal(t.ta.getAttribute("inputmode"), "none", "ON: phones are told not to open their own keyboard over the on-screen one (hardware keyboards unaffected)");
  assert.equal(t.ta.getAttribute("dir"), "rtl");
  assert.equal(t.ta.disabled, false);
  // typing natively (value change + input event) updates the same counter
  t.ta.value = "كتاب"; t.ta.dispatchEvent(new t.w.Event("input", { bubbles: true }));
  assert.match(t.$("tashkeelCounts").textContent, /٤ حرف/);
  // ... and the keyboard then continues from where native typing left the caret
  t.ta.setSelectionRange(4, 4);
  t.key("ة").click();
  assert.equal(t.ta.value, "كتابة");
});

test("RTL is preserved and the Tashkeel page's own look is untouched (no highlight overlay)", async () => {
  const t = await tashkeelPage();
  assert.equal(t.ta.getAttribute("dir"), "rtl");
  assert.equal(t.$("tashkeelOut").getAttribute("dir"), "rtl");
  t.key("ب").click();
  assert.equal(t.ta.getAttribute("dir"), "rtl");
  assert.equal(t.w.document.querySelector(".editor-highlight"), null);
  assert.equal(t.ta.classList.contains("editor--highlighted"), false, "text must stay visible in the textarea itself");
});

test("if keyboard-tool.js is missing the page degrades to the plain editor (no dead switch, no errors)", async () => {
  const t = await tashkeelPage({ withKeyboardScript: false });
  assert.equal(t.$("tashkeelKbRow").hidden, true);
  assert.equal(t.panel.hidden, true);
  t.setText("كتاب");
  t.$("tashkeelRun").click(); await tick();
  assert.deepEqual(t.calls.diacritize, ["كتاب"], "the tool itself is unaffected");
});

test("English mode strings exist for the new switch state (label already existed)", () => {
  assert.match(i18nEn, /"تشغيل": "ON"/);
  assert.match(i18nEn, /"إيقاف": "OFF"/);
  assert.match(i18nEn, /"لوحة المفاتيح العربية": "Arabic Keyboard"/);
});

test("phones: the OS keyboard is suppressed only while the on-screen keyboard is ON, and returns on OFF (text untouched)", async () => {
  const t = await tashkeelPage();
  t.setText("العلم نور", 2, 5);
  assert.equal(t.ta.getAttribute("inputmode"), "none");
  t.sw.click();                                                           // OFF -> normal OS keyboard again
  assert.equal(t.ta.hasAttribute("inputmode"), false);
  assert.equal(t.ta.value, "العلم نور");
  assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [2, 5]);
  t.sw.click();                                                           // ON again
  assert.equal(t.ta.getAttribute("inputmode"), "none");
  const off = await tashkeelPage({ withKeyboardScript: false });
  assert.equal(off.ta.hasAttribute("inputmode"), false, "no keyboard script => the plain editor keeps the normal OS keyboard");
});

test("key taps focus the editor WITHOUT scrolling the page (preventScroll), for insert, replace and backspace", async () => {
  const t = await tashkeelPage();
  const seen = [];
  t.ta.focus = (o) => { seen.push(o); };                                  // spy: jsdom has no scrolling, so assert the contract
  t.setText("كتب", 1);
  t.key("ا").click();
  t.setText("كتب", 0, 2); t.key("م").click();
  t.setText("كتب", 2); t.key("حذف الحرف الأخير").click();
  t.setText("كتب", 0); t.key("حذف الحرف الأخير").click();                // no-op backspace still must not scroll
  assert.equal(seen.length, 4);
  for (const o of seen) assert.equal(o && o.preventScroll, true);
});

test("the insertion point survives a tap: caret after an insert, after a replace, after a backspace; selection fully consumed", async () => {
  const t = await tashkeelPage();
  t.setText("كتب", 1); t.key("ا").click(); t.key("ا").click(); t.key("ا").click();
  assert.equal(t.ta.value, "كاااتب"); assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [4, 4]);
  t.ta.setSelectionRange(1, 4); t.key("م").click();
  assert.equal(t.ta.value, "كمتب"); assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [2, 2]);
  t.key("حذف الحرف الأخير").click();
  assert.equal(t.ta.value, "كتب"); assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [1, 1]);
});

/* ---------- shared keyboard-tool.js: /arabic-keyboard/ must behave as before (plus the two native-field fixes) ---------- */
async function mainPage() {
  const dom = await loaded(keyboardHtml, "https://www.arabic-keyboard.live/arabic-keyboard/");
  const w = dom.window;
  w.showToast = () => {};
  w.eval(kbJs);
  w.ArabicKeyboardTool.init({});                                         // exactly what arabic-keyboard-init.js does
  const ed = w.document.getElementById("editor");
  const key = (label) => [...w.document.querySelectorAll("#virtualKeyboard .key")].find((b) => b.getAttribute("aria-label") === label);
  const events = { n: 0 };
  ed.addEventListener("input", () => events.n++);
  return { w, ed, key, events, $: (id) => w.document.getElementById(id) };
}

test("/arabic-keyboard/ unchanged: highlight overlay still built, counters update, no extra input events by default", async () => {
  const m = await mainPage();
  assert.ok(m.w.document.querySelector(".editor-area .editor-highlight"), "overlay present");
  assert.equal(m.ed.classList.contains("editor--highlighted"), true);
  m.key("ب").click(); m.key("ا").click();
  assert.equal(m.ed.value, "با");
  assert.equal(m.$("charCount").textContent, "2 حرف");
  assert.equal(m.$("wordCount").textContent, "1 كلمة");
  assert.equal(m.events.n, 0, "default behaviour: tool refreshes itself, does not emit input");
  m.key("فتحة").click();
  assert.match(m.w.document.querySelector(".editor-highlight").innerHTML, /<span class="tashkeel-mark">\u064E<\/span>/, "diacritics still highlighted");
});

test("/arabic-keyboard/ still has its undo/redo/clear toolbar wired to the same insert path", async () => {
  const m = await mainPage();
  m.key("ك").click(); m.key("ت").click();
  assert.equal(m.ed.value, "كت");
  m.$("btnUndo").click();
  assert.equal(m.ed.value, "ك");
  m.$("btnRedo").click();
  assert.equal(m.ed.value, "كت");
  m.$("btnClear").click();
  assert.equal(m.ed.value, "");
});

test("/arabic-keyboard/ gets the native-field fixes: key replaces selection, backspace deletes selection", async () => {
  const m = await mainPage();
  m.ed.value = "العلم نور"; m.ed.setSelectionRange(6, 9);
  m.key("ن").click();
  assert.equal(m.ed.value, "العلم ن");
  m.ed.setSelectionRange(0, 2);                                          // select "ال"
  m.key("حذف الحرف الأخير").click();
  assert.equal(m.ed.value, "علم ن");
});

test("/arabic-keyboard/ gets the same no-page-jump focus, and its editor's inputmode is left alone", async () => {
  const m = await mainPage();
  const seen = []; m.ed.focus = (o) => { seen.push(o); };
  m.ed.value = "كتب"; m.ed.setSelectionRange(1, 1);
  m.key("ا").click(); m.key("حذف الحرف الأخير").click();
  assert.equal(seen.length, 2);
  for (const o of seen) assert.equal(o && o.preventScroll, true);
  assert.equal(m.ed.hasAttribute("inputmode"), false);
});
