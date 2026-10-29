// Regression tests: the on-screen Arabic keyboard on /typing-test/ and the shared keyboard-tool.js behaviour it relies on.
// REAL page HTML + REAL typing-test.js / keyboard-tool.js / typing-test-init.js evaluated in jsdom (nothing is stubbed except showToast).
// Real-browser coverage of the same feature (layout, mobile, dark/light, page scroll, other pages) is in keyboard-browser.mjs.
// Run:  cd tests/typing-test && npm install && npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const typingHtml = read("typing-test/index.html");
const altTypingHtml = read("arabic-typing-test/index.html");
const tashkeelHtml = read("tashkeel/index.html");
const keyboardHtml = read("arabic-keyboard/index.html");
const ttJs = read("assets/js/typing-test.js");
const kbJs = read("assets/js/keyboard-tool.js");
const initJs = read("assets/js/typing-test-init.js");
const swJs = read("sw.js");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function loaded(html, url) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url });
  while (dom.window.document.readyState !== "complete") await tick(5);   // let jsdom's own DOMContentLoaded pass first
  return dom;
}

/* The real /typing-test/ page, scripts evaluated in the page's own order, then DOMContentLoaded fired once.
   `pick` (0..1) makes the test's random prompt choice deterministic. */
async function page({ pick = 0, html = typingHtml, url = "https://www.arabic-keyboard.live/typing-test/", withKeyboardScript = true } = {}) {
  const dom = await loaded(html, url);
  const w = dom.window;
  w.showToast = () => {};
  w.Math.random = () => pick;
  w.eval(ttJs);
  if (withKeyboardScript) w.eval(kbJs);
  w.eval(initJs);
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const $ = (id) => w.document.getElementById(id);
  const input = $("typing-input");
  const events = { n: 0 };
  input.addEventListener("input", () => events.n++);
  const keys = () => [...w.document.querySelectorAll("#virtualKeyboard .key")];
  // letters / numerals / punctuation carry their glyph as aria-label; diacritic / control keys carry their Arabic name
  const key = (label) => { const k = keys().find((b) => b.getAttribute("aria-label") === label); assert.ok(k, "no key labelled " + label); return k; };
  const DIACRITIC_NAME = { "\u064E": "فتحة", "\u064B": "تنوين فتح", "\u064F": "ضمة", "\u064C": "تنوين ضم", "\u0650": "كسرة", "\u064D": "تنوين كسر", "\u0652": "سكون", "\u0651": "شدة", "\u0670": "ألف خنجرية" };
  const keyFor = (ch) => key(ch === " " ? "مسافة" : DIACRITIC_NAME[ch] || ch);
  const press = (ch) => keyFor(ch).click();
  const pressText = (s) => { for (const ch of s) press(ch); };
  const prompt = () => $("promptText").textContent;
  const spans = (cls) => $("promptText").querySelectorAll("span." + cls).length;
  const setText = (v, s = v.length, e = s) => { input.value = v; input.setSelectionRange(s, e); };
  const stats = () => ({ wpm: $("statWpm").textContent, acc: $("statAcc").textContent, err: $("statErr").textContent, time: $("statTime").textContent });
  const close = () => { $("restartTest").click(); w.close(); };   // restart clears the 250 ms interval so the process can exit
  return { dom, w, $, input, events, keys, key, press, pressText, prompt, spans, setText, stats, close };
}

/* physical typing, as a browser delivers it: the value changes and ONE input event fires */
const physicalType = (t, s) => { for (const ch of s) { const v = t.input.value, a = t.input.selectionStart, b = t.input.selectionEnd; t.input.value = v.slice(0, a) + ch + v.slice(b); t.input.selectionStart = t.input.selectionEnd = a + 1; t.input.dispatchEvent(new t.w.Event("input", { bubbles: true })); } };

test("1. keyboard is visible by default, rendered from the shared component, with the full key set", async () => {
  const t = await page();
  const panel = t.$("typingKbPanel");
  assert.equal(panel.hidden, false);
  assert.ok(panel.contains(t.$("virtualKeyboard")));
  const letters = [...t.w.document.querySelectorAll("#virtualKeyboard .key-main.arabic-glyph")].filter((k) => /^[\u0621-\u064A]/.test(k.textContent));
  assert.ok(letters.length >= 28, "Arabic letter keys rendered: " + letters.length);
  for (const label of ["مسافة", "حذف الحرف الأخير", "فتحة", "١", "،"]) t.key(label);
  // sits between the typing input and the restart button
  const order = [...t.w.document.querySelectorAll("#typing-input, #typingKbPanel, #restartTest")].map((e) => e.id);
  assert.deepEqual(order, ["typing-input", "typingKbPanel", "restartTest"]);
  assert.ok(/^\s*<script src="\.\.\/assets\/js\/keyboard-tool\.js" defer><\/script>/m.test(typingHtml), "page loads the shared keyboard script");
  t.close();
});

test("2. there is no ON/OFF switch of any kind on the page", async () => {
  const t = await page();
  const d = t.w.document;
  assert.equal(d.querySelectorAll('[role="switch"]').length, 0);
  assert.equal(d.querySelectorAll(".tk-switch, .tk-kb-toggle, [aria-checked], [id$='KbSwitch'], [id$='KbRow']").length, 0);
  assert.ok(!/تشغيل|إيقاف/.test(t.$("typingKbPanel").parentElement.textContent), "no on/off wording near the keyboard");
  t.close();
});

test("3. on-screen keys insert the right characters into the REAL typing input (letters, numerals, punctuation, diacritics, space)", async () => {
  const t = await page();
  t.pressText("اب");
  assert.equal(t.input.value, "اب");
  t.press(" "); t.press("ج"); t.press("١"); t.press("،"); t.press("\u064E");
  assert.equal(t.input.value, "اب ج١،\u064E");
  t.setText(""); t.press("أ"); t.press("لا");   // the "lam-alef" key inserts both letters
  assert.equal(t.input.value, "أ\u0644\u0627");
  assert.equal(t.w.document.querySelectorAll("textarea").length, 0, "typing goes to the test's <input>, no other field exists");
  t.close();
});

test("4. each key press = exactly one input event and exactly one character (no duplicates)", async () => {
  const t = await page();
  t.events.n = 0;
  t.press("ك");
  assert.equal(t.events.n, 1);
  assert.equal(t.input.value, "ك");
  t.press("ت"); t.press("ا"); t.press("ب");
  assert.equal(t.events.n, 4);
  assert.equal(t.input.value, "كتاب");
  t.close();
});

test("5. caret placement and selection replacement work like a native field", async () => {
  const t = await page();
  t.setText("العلم نور", 2, 2);          // caret after «ال»
  t.press("ش");
  assert.equal(t.input.value, "الشعلم نور");
  assert.deepEqual([t.input.selectionStart, t.input.selectionEnd], [3, 3], "caret moved after the inserted key");
  t.setText("العلم نور", 2, 5);          // «علم» selected
  t.press("ي");
  assert.equal(t.input.value, "الي نور");
  assert.deepEqual([t.input.selectionStart, t.input.selectionEnd], [3, 3]);
  t.close();
});

test("6. Backspace: removes the char before the caret, deletes a selection, no-op (and no input event) at the start", async () => {
  const t = await page();
  const back = t.key("حذف الحرف الأخير");
  t.setText("كتاب"); back.click();
  assert.equal(t.input.value, "كتا");
  t.setText("كتاب", 1, 1); back.click();                // caret after «ك»
  assert.equal(t.input.value, "تاب");
  assert.equal(t.input.selectionStart, 0);
  t.setText("كتاب", 1, 3); back.click();                // «تا» selected
  assert.equal(t.input.value, "كب");
  assert.deepEqual([t.input.selectionStart, t.input.selectionEnd], [1, 1]);
  t.setText("كتاب", 0, 0); t.events.n = 0; back.click();
  assert.equal(t.input.value, "كتاب");
  assert.equal(t.events.n, 0, "Backspace with nothing to delete fires no input event");
  t.setText("😀", 2, 2); back.click();                   // never half of a surrogate pair
  assert.equal(t.input.value, "");
  t.close();
});

test("7. the single-line input has no «new line» key and can never receive a line break", async () => {
  const t = await page();
  assert.ok(!t.keys().some((k) => k.getAttribute("aria-label") === "سطر جديد"), "no Enter key");
  assert.ok(!t.keys().some((k) => /↵/.test(k.textContent)));
  const api = t.w.ArabicKeyboardTool.init({ editorId: "typing-input", highlight: false, emitInput: true });   // a second init only to reach insertAtCursor
  t.events.n = 0;
  api.insertAtCursor("\n");
  assert.equal(t.input.value, "");
  assert.equal(t.events.n, 0, "a no-op insert must not start the test");
  t.close();
});

test("8. on-screen typing starts the timer; stats, progress and WPM update", async () => {
  const t = await page();
  const target = t.prompt();
  assert.deepEqual(t.stats(), { wpm: "0", acc: "100%", err: "0", time: "60" });
  assert.equal(t.spans("pending"), target.length);
  t.pressText(target.slice(0, 12));
  assert.equal(t.spans("correct"), 12, "progress: 12 chars typed correctly");
  assert.equal(t.spans("wrong"), 0);
  assert.equal(t.spans("pending"), target.length - 12);
  const s = t.stats();
  assert.equal(s.acc, "100%"); assert.equal(s.err, "0");
  assert.ok(Number(s.wpm) > 0, "WPM computed: " + s.wpm);
  await tick(1300);                                        // the 250 ms interval is running
  assert.ok(Number(t.stats().time) <= 59, "timer counts down: " + t.stats().time);
  t.close();
});

test("9. a wrong on-screen key is counted exactly like a wrong physical key", async () => {
  const onscreen = await page(), physical = await page();
  const target = onscreen.prompt();
  const wrong = target[0] === "ب" ? "ت" : "ب";
  const seq = wrong + target.slice(1, 6);
  onscreen.pressText(seq); physicalType(physical, seq);
  for (const t of [onscreen, physical]) { assert.equal(t.stats().err, "1"); assert.equal(t.stats().acc, "83%"); assert.equal(t.spans("wrong"), 1); assert.equal(t.spans("correct"), 5); }
  assert.equal(onscreen.$("promptText").innerHTML, physical.$("promptText").innerHTML, "identical progress rendering");
  assert.equal(onscreen.input.value, physical.input.value);
  onscreen.close(); physical.close();
});

test("10. Backspace on screen corrects an error and the stats follow", async () => {
  const t = await page();
  const target = t.prompt();
  const wrong = target[0] === "ب" ? "ت" : "ب";
  t.press(wrong);
  assert.equal(t.stats().err, "1");
  t.key("حذف الحرف الأخير").click();
  t.press(target[0]);
  assert.equal(t.stats().err, "0"); assert.equal(t.stats().acc, "100%"); assert.equal(t.spans("correct"), 1);
  t.close();
});

test("11. keys that change nothing never start, reset or disturb the test", async () => {
  const t = await page();
  const before = t.$("promptText").innerHTML;
  t.key("حذف الحرف الأخير").click();                        // Backspace on an empty field
  t.events.n = 0;
  await tick(600);
  assert.equal(t.stats().time, "60", "timer did not start");
  assert.equal(t.$("promptText").innerHTML, before, "prompt untouched");
  assert.equal(t.events.n, 0);
  // a running test is not reset by touching keys / the keyboard panel itself
  const target = t.prompt();
  t.pressText(target.slice(0, 3));
  t.$("typingKbPanel").click(); t.$("virtualKeyboard").click();
  assert.equal(t.prompt(), target);
  assert.equal(t.input.value, target.slice(0, 3));
  assert.ok(t.$("typingKbPanel").querySelector("button.key").type === "button", "keys are type=button: they can never submit/reset anything");
  t.close();
});

test("12. physical keyboard input keeps working, alone and mixed with on-screen keys", async () => {
  const t = await page();
  const target = t.prompt();
  physicalType(t, target.slice(0, 4));
  assert.equal(t.spans("correct"), 4);
  t.pressText(target.slice(4, 8));
  physicalType(t, target.slice(8, 10));
  assert.equal(t.input.value, target.slice(0, 10));
  assert.equal(t.spans("correct"), 10); assert.equal(t.stats().err, "0");
  t.close();
});

test("13. EVERY sample text can be typed to completion with the on-screen keys: 0 errors, 100%, test ends", async () => {
  const seen = new Set();
  for (const pick of [0, 0.21, 0.41, 0.61, 0.81]) {
    const t = await page({ pick });
    const target = t.prompt(); seen.add(target);
    t.pressText(target);
    assert.equal(t.input.value, target);
    assert.equal(t.stats().err, "0"); assert.equal(t.stats().acc, "100%");
    assert.equal(t.input.disabled, true, "completion logic: input disabled when the text is complete");
    assert.ok(t.$("resultPanel").classList.contains("show"), "result panel shown");
    t.close();
  }
  assert.equal(seen.size, 5, "all five sample texts were exercised");
});

test("14. after the test finished (input disabled) on-screen keys change nothing; Restart brings everything back", async () => {
  const t = await page();
  const target = t.prompt();
  t.pressText(target);
  assert.equal(t.input.disabled, true);
  const valueBefore = t.input.value; t.events.n = 0;
  t.press("ب"); t.key("حذف الحرف الأخير").click(); t.press(" ");
  assert.equal(t.input.value, valueBefore, "a finished test cannot be edited through the keyboard");
  assert.equal(t.events.n, 0);
  t.$("restartTest").click();
  assert.equal(t.input.disabled, false);
  assert.equal(t.input.value, "");
  assert.deepEqual(t.stats(), { wpm: "0", acc: "100%", err: "0", time: "60" });
  assert.ok(!t.$("resultPanel").classList.contains("show"));
  t.press("ب");
  assert.equal(t.input.value, "ب");
  t.close();
});

test("15. duration buttons and Restart keep working; the OS keyboard is suppressed only because the on-screen one is present", async () => {
  const t = await page();
  t.w.document.querySelector('[data-duration="15"]').click();
  assert.equal(t.stats().time, "15");
  assert.equal(t.input.getAttribute("inputmode"), "none");
  t.pressText("اب");
  t.$("restartTest").click();
  assert.equal(t.input.value, "");
  const noKb = await page({ withKeyboardScript: false });
  assert.equal(noKb.$("typingKbPanel").hidden, true, "keyboard script missing: panel hidden, plain test untouched");
  assert.equal(noKb.input.hasAttribute("inputmode"), false);
  noKb.physical = physicalType(noKb, "اب");
  assert.equal(noKb.spans("correct") + noKb.spans("wrong"), 2);
  noKb.close(); t.close();
});

test("16. other pages are unaffected: /arabic-typing-test/ has no keyboard; Tashkeel and /arabic-keyboard/ keep their «new line» key and switch", async () => {
  const alt = await loaded(altTypingHtml, "https://www.arabic-keyboard.live/arabic-typing-test/");
  alt.window.showToast = () => {};
  alt.window.eval(ttJs); alt.window.eval(initJs);
  alt.window.document.dispatchEvent(new alt.window.Event("DOMContentLoaded"));
  assert.equal(alt.window.document.getElementById("typingKbPanel"), null);
  assert.equal(alt.window.document.getElementById("typing-input").hasAttribute("inputmode"), false);
  alt.window.document.getElementById("restartTest").click(); alt.window.close();

  const tk = await loaded(tashkeelHtml, "https://www.arabic-keyboard.live/tashkeel/");
  tk.window.eval(kbJs);
  tk.window.ArabicKeyboardTool.init({ editorId: "tashkeelIn", highlight: false, emitInput: true });
  assert.ok([...tk.window.document.querySelectorAll("#virtualKeyboard .key")].some((k) => k.getAttribute("aria-label") === "سطر جديد"), "textarea keeps the Enter key");
  assert.ok(tk.window.document.getElementById("tashkeelKbSwitch"), "Tashkeel switch still in markup");
  const ta = tk.window.document.getElementById("tashkeelIn");
  ta.value = "ab"; ta.setSelectionRange(2, 2);
  [...tk.window.document.querySelectorAll("#virtualKeyboard .key")].find((k) => k.getAttribute("aria-label") === "سطر جديد").click();
  assert.equal(ta.value, "ab\n", "newline still inserted into a textarea");
  tk.window.close();

  const ak = await loaded(keyboardHtml, "https://www.arabic-keyboard.live/arabic-keyboard/");
  ak.window.eval(kbJs);
  ak.window.ArabicKeyboardTool.init({});
  assert.ok([...ak.window.document.querySelectorAll("#virtualKeyboard .key")].some((k) => k.getAttribute("aria-label") === "سطر جديد"));
  ak.window.close();
});

test("17. service worker: shell cache bumped to v15 so returning visitors get the changed assets; the shared assets are precached", () => {
  assert.match(swJs, /CACHE_NAME = "arabic-keyboard-shell-v15"/);
  for (const a of ["/typing-test/", "/assets/css/styles.css", "/assets/js/keyboard-tool.js", "/assets/js/typing-test.js"]) assert.ok(swJs.includes(`"${a}"`), a);
});
