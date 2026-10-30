// Keyboard-integration regression suite for the Learn typing dock (real Chromium, real keyboard-tool.js).
import os from "node:os";
import { harness, sleep, txt } from "./lib.mjs";
const H = await harness("keyboard"); const { base, ok } = H;
let N = 0; const url = h => `${base}/learn-arabic/?n=${++N}${h || ""}`;
const hex = s => [...s].map(c => c.codePointAt(0).toString(16).padStart(4, "0")).join(" ");
const val = p => p.$eval("#lxEditor", e => e.value);
// Mark keys are matched by Arabic OR English name: the site persists the chosen UI language in localStorage, so a test must not depend on what an earlier test left behind.
const MARK_EN = { "فتحة": "Fatha", "ضمة": "Damma", "كسرة": "Kasra", "شدة": "Shadda", "سكون": "Sukun" };
const clickKey = (p, t, mark = false) => p.evaluate((t, m, en) => { const k = [...document.querySelectorAll("#lxKb .key")].find(x => m ? (x.textContent.includes(t) || x.textContent.includes(en)) : x.textContent.trim().startsWith(t)); if (!k) throw new Error("no key " + t + "/" + en); k.click(); }, t, mark, MARK_EN[t] || "");
const ready = p => p.waitForFunction(() => window.LearnTypingDock && ["ready", "failed"].includes(LearnTypingDock.state().keyboard), { timeout: 15000 });
const dupIds = p => p.evaluate(() => { const m = {}; document.querySelectorAll("[id]").forEach(e => { m[e.id] = (m[e.id] || 0) + 1; }); return Object.keys(m).filter(k => m[k] > 1); });
// Counts init() calls, ResizeObserver.observe() calls and keyboard-tool script requests from the first byte of the page.
const instrument = p => p.evaluateOnNewDocument(() => {
  window.__kbInit = 0; window.__ro = 0; window.__throwInit = false; let v;
  Object.defineProperty(window, "ArabicKeyboardTool", { configurable: true, get() { return v; }, set(t) { v = t && t.init ? Object.assign({}, t, { init: (...a) => { window.__kbInit++; if (window.__throwInit) throw new Error("boom"); return t.init(...a); } }) : t; } });
  const RO = window.ResizeObserver; if (RO) window.ResizeObserver = class extends RO { observe(...a) { window.__ro++; return super.observe(...a); } };
});
const newTracked = async (opts = {}) => { const p = await H.page(opts); p.kbReqs = 0; p.on("request", r => { if (/keyboard-tool\.js/.test(r.url())) p.kbReqs++; }); await instrument(p); return p; };
async function openStage(p, id) {
  await p.goto(url("#/read")); await p.waitForSelector(`[data-action="stage"][data-id="${id}"]`);
  await p.click(`[data-action="stage"][data-id="${id}"]`); await p.waitForSelector("#lxEditor", { visible: true });
}
// Re-enter a route inside the same page (no reload): hop via the dashboard so a real hashchange fires.
const viaHash = async (p, h) => { await p.evaluate(() => { location.hash = "#/"; }); await sleep(80); await p.evaluate(x => { location.hash = x; }, h); };
const check = async p => { await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn"); return txt(p, "#lxTFb"); };

/* 1. lazy loading ------------------------------------------------------------------------------------------------ */
let p = await newTracked();
await p.goto(url()); await p.waitForSelector(".lx-grid");
await p.click('a[href="#/letter/ba"]'); await p.waitForSelector(".lx-hero-ar");
await p.goto(url("#/practice")); await p.waitForSelector('[data-action="practice"]'); await p.click('[data-action="practice"][data-type="name"]'); await p.waitForSelector(".lx-opt");
await p.goto(url("#/read")); await p.waitForSelector('[data-action="stage"]');
ok(p.kbReqs === 0 && (await p.evaluate(() => typeof ArabicKeyboardTool)) === "undefined", "keyboard script is NOT requested/loaded on dashboard, lessons, choice quizzes or the reading menu");
ok((await p.$$("#lxKb .key")).length === 0 && (await p.$$('script[src*="keyboard-tool"]')).length === 0 && await p.$eval("#lxTypePanel", e => e.hidden) && await p.$eval("#lxKbWrap", e => e.hidden), "no keyboard DOM, no script element, dock and keyboard host hidden until needed");
await p.click('[data-action="stage"][data-id="marked"]'); await p.waitForSelector(".lx-opt"); await sleep(300);
ok(p.kbReqs === 0, "choice-only reading stage (harakat reading) does not load the keyboard either");
await p.goto(url("#/read")); await p.waitForSelector('[data-action="stage"]');
const ro0 = await p.evaluate(() => window.__ro);
await p.click('[data-action="stage"][data-id="words"]'); await p.waitForSelector("#lxEditor", { visible: true }); await ready(p);
ok(p.kbReqs === 1 && (await p.$$('script[src*="keyboard-tool"]')).length === 1, "opening the first typing exercise loads keyboard-tool.js exactly once");
ok((await p.evaluate(() => LearnTypingDock.state())).keyboard === "ready" && (await p.$$("#lxKb .key")).length === 74, "keyboard ready with 74 keys");
/* 2. single initialisation --------------------------------------------------------------------------------------- */
await p.evaluate(() => { window.__ed = document.getElementById("lxEditor"); window.__kbNode = document.getElementById("lxKb"); });
for (let i = 0; i < 5; i++) { await p.type("#lxEditor", "x"); await p.keyboard.press("Enter"); await p.waitForSelector("#lxTNextBtn"); await p.keyboard.press("Enter"); await sleep(120); }
await p.waitForSelector(".lx-score");
ok(await p.$eval("#lxTypePanel", e => e.hidden) && await p.$eval("#lxKbWrap", e => e.hidden), "dock AND keyboard host hide when the exercise ends (results screen)");
await viaHash(p, "#/read"); await p.waitForSelector('[data-action="stage"][data-id="phrases"]'); await p.click('[data-action="stage"][data-id="phrases"]'); await p.waitForSelector("#lxEditor", { visible: true });
await viaHash(p, "#/read"); await p.waitForSelector('[data-action="stage"][data-id="sentences"]'); await p.click('[data-action="stage"][data-id="sentences"]'); await p.waitForSelector("#lxEditor", { visible: true });
const init = await p.evaluate(() => ({ init: window.__kbInit, ro: window.__ro, overlays: document.querySelectorAll(".editor-highlight").length, keys: document.querySelectorAll("#lxKb .key").length, sameEd: window.__ed === document.getElementById("lxEditor"), sameKb: window.__kbNode === document.getElementById("lxKb"), scripts: document.querySelectorAll('script[src*="keyboard-tool"]').length }));
ok(init.init === 1, "ArabicKeyboardTool.init() ran once across 3 stages, 10+ items and repeated entries (calls=" + init.init + ")");
ok(init.ro - ro0 === 1, "exactly one ResizeObserver.observe() added by the keyboard (delta=" + (init.ro - ro0) + ")");
ok(init.overlays === 1 && init.keys === 74 && init.scripts === 1 && p.kbReqs === 1, "one overlay, one keyboard (74 keys), one script, one request");
ok(init.sameEd && init.sameKb, "textarea and keyboard container are the very same DOM nodes after many questions (persistent dock)");
ok((await dupIds(p)).length === 0, "no duplicate IDs with the typing view open: " + JSON.stringify(await dupIds(p)));
/* 3. Unicode sequences + sync ------------------------------------------------------------------------------------ */
await openStage(p, "words"); await ready(p);
await p.evaluate(() => { window.__inputs = 0; document.getElementById("lxEditor").addEventListener("input", () => window.__inputs++); });
await clickKey(p, "ب"); await clickKey(p, "فتحة", true);
ok(hex(await val(p)) === "0628 064e", "key ب then fatha => U+0628 U+064E (got " + hex(await val(p)) + ")");
ok((await p.evaluate(() => window.__inputs)) >= 2, "virtual key presses fire 'input' events on the textarea (the tool itself does not)");
ok((await p.evaluate(() => LearnTypingDock.value() === document.getElementById("lxEditor").value)) && (await p.$eval(".editor-highlight", e => e.textContent)) === await val(p), "dock value, textarea and the tool's highlight overlay stay synchronised");
await clickKey(p, "شدة", true); await clickKey(p, "ضمة", true);
ok(hex(await val(p)) === "0628 064e 0651 064f", "marks append in typed order: fatha, shadda, damma (got " + hex(await val(p)) + ")");
await p.evaluate(() => LearnTypingDock.clear());
ok((await val(p)) === "" && (await p.$$("#lxKb .key")).length === 74, "clear() empties the textarea and keeps the keyboard");
/* 4. grading: virtual keyboard answer is checked by the existing logic ------------------------------------------- */
for (const [t, m] of [["ك"], ["كسرة", 1], ["ت"], ["فتحة", 1], ["ا"], ["ب"]]) await clickKey(p, t, !!m);
ok(hex(await val(p)) === hex("كِتَاب"), "typing كِتَاب with on-screen letter + mark keys produces the exact vowelled string");
let fb = await check(p); ok(fb.includes("Correct"), "exact-harakat stage: correctly vowelled answer typed on the virtual keyboard is accepted");
/* 5. locked after answer, next clears -------------------------------------------------------------------------- */
const keysLocked = await p.evaluate(() => ({ ro: document.getElementById("lxEditor").readOnly, inert: document.getElementById("lxKbWrap").inert }));
await clickKey(p, "م"); await sleep(50);
ok(keysLocked.ro && keysLocked.inert && (await val(p)) === hex("كِتَاب") === false && (await val(p)) === "كِتَاب", "after answering: textarea read-only, keyboard inert, key presses cannot change the checked answer");
await p.keyboard.press("Enter"); await sleep(150);   // focus is on Next: Enter activates it
ok((await val(p)) === "" && await p.evaluate(() => !document.getElementById("lxEditor").readOnly && !document.getElementById("lxKbWrap").inert && document.activeElement.id === "lxEditor"), "Next clears the input, unlocks it, re-enables keys and focuses the textarea");
ok(await p.evaluate(() => window.__ed === undefined || true) && (await txt(p, "#lxTFb")) === "", "feedback is cleared for the new item");
// strict: right letters, no marks => fail with an explanatory message; wrong letters => fail
await p.type("#lxEditor", "قمر"); fb = await check(p);
ok(fb.includes("Not quite") && fb.includes("harakat do not match") && fb.includes("Expected"), "exact stage: letters without harakat are NOT accepted, with an explanation");
await p.keyboard.press("Enter"); await sleep(120); await p.type("#lxEditor", "بنت"); fb = await check(p);
ok(fb.includes("Not quite") && !fb.includes("harakat do not match"), "exact stage: wrong letters fail (no 'harakat' message)");
await openStage(p, "words"); await ready(p); await p.type("#lxEditor", "كَتَاب"); fb = await check(p);
ok(fb.includes("Not quite"), "exact stage: one wrong mark (fatha instead of kasra) fails");
await openStage(p, "joined"); await ready(p); await p.type("#lxEditor", "بنت"); fb = await check(p);
ok(fb.includes("Correct"), "letters-mode stage still ignores harakat (existing behaviour preserved)");
await p.keyboard.press("Enter"); await sleep(120); await p.type("#lxEditor", "زر"); fb = await check(p);
ok(fb.includes("Not quite"), "letters-mode stage: a wrong answer still fails");
/* 6. show/hide, focus order, accessibility --------------------------------------------------------------------- */
await openStage(p, "words"); await ready(p);
ok(await p.evaluate(() => document.activeElement.id === "lxEditor"), "focus starts in the answer box");
await p.keyboard.press("Tab"); ok(await p.evaluate(() => document.activeElement.id === "lxTCheck"), "Tab from the answer box reaches Check immediately (before the 74 keys)");
await p.keyboard.press("Tab"); ok(await p.evaluate(() => document.activeElement.id === "lxKbToggle"), "next Tab stop is the show/hide control");
await p.keyboard.press("Tab"); ok(await p.evaluate(() => !!document.activeElement.closest("#lxKb")), "then the keyboard keys");
await p.focus("#lxKbToggle"); await p.keyboard.press("Enter"); await sleep(80);
let t = await p.evaluate(() => ({ exp: document.getElementById("lxKbToggle").getAttribute("aria-expanded"), hidden: getComputedStyle(document.getElementById("lxKbWrap")).display === "none", focus: document.activeElement.id, text: document.getElementById("lxKbToggle").textContent, vis: LearnTypingDock.state().visible }));
ok(t.exp === "false" && t.hidden && t.focus === "lxKbToggle" && !t.vis && /Show/.test(t.text), "toggle (keyboard-activated): aria-expanded=false, keys hidden from view and tab order, focus stays on the toggle");
await p.type("#lxEditor", "ك"); ok((await val(p)).includes("ك"), "native typing keeps working with the on-screen keyboard hidden");
await p.focus("#lxKbToggle"); await p.keyboard.press("Space"); await sleep(80);
ok(await p.evaluate(() => document.getElementById("lxKbToggle").getAttribute("aria-expanded") === "true" && getComputedStyle(document.getElementById("lxKbWrap")).display !== "none"), "toggle again shows the keyboard (aria-expanded=true)");
ok(await p.evaluate(() => { const d = document.getElementById("lxEditor").getAttribute("aria-describedby"); const e = document.getElementById(d); return !!e && /Item 1 of 5/.test(e.textContent) && /[\u0600-\u06FF]/.test(e.textContent); }) && await p.$("label[for=lxEditor]") !== null, "textarea has a label and aria-describedby pointing at the prompt (item number + Arabic text)");
await p.focus("#lxEditor"); await p.type("#lxEditor", "x"); await p.keyboard.press("Enter"); await p.waitForSelector("#lxTNextBtn");
ok(await p.evaluate(() => document.activeElement.id === "lxTNextBtn"), "Enter in the textarea checks; focus moves to Next");
ok((await dupIds(p)).length === 0 && p.errs.length === 0, "no duplicate IDs, no console/page errors across the keyboard run: " + JSON.stringify(p.errs));
/* 6b. focus, scroll and announcements after pressing an ON-SCREEN key ------------------------------------------------ */
{
  // motion:true keeps the site's html{scroll-behavior:smooth}: the scroll-restoration assertions below only mean something with real smooth scrolling
  const fk = await newTracked({ w: 1000, h: 420, motion: true });
  // English UI so the mark/Delete keys have English accessible names (the site default is Arabic); let the translator finish after init.
  await fk.goto(`${base}/learn-arabic/?lang=en&n=${++N}#/read`); await fk.waitForSelector('[data-action="stage"][data-id="words"]'); await fk.click('[data-action="stage"][data-id="words"]'); await fk.waitForSelector("#lxEditor", { visible: true }); await ready(fk); await sleep(700);
  const keyHandle = label => fk.evaluateHandle(l => [...document.querySelectorAll("#lxKb .key")].find(k => (k.getAttribute("aria-label") || k.textContent.trim()) === l), label);
  const state = () => fk.evaluate(() => ({ active: window.__active && document.activeElement === window.__active, activeId: document.activeElement.id, activeLabel: document.activeElement.getAttribute && document.activeElement.getAttribute("aria-label"), y: Math.round(window.scrollY), value: document.getElementById("lxEditor").value, say: document.getElementById("lxKbAnnounce").textContent }));
  // the site sets html{scroll-behavior:smooth}: scroll instantly so measurements are not taken mid-animation
  await fk.evaluate(() => document.getElementById("lxKb").scrollIntoView({ block: "end", behavior: "instant" })); await sleep(400);
  const edOff = await fk.evaluate(() => { const r = document.getElementById("lxEditor").getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight; });
  ok(edOff, "set-up: the answer box is scrolled out of view while the keys are in view (so a focus-jump would also scroll the page)");
  // Enter on a focused key (scroll is measured AFTER the test's own focus() call, which can itself scroll the key into view)
  let h = await keyHandle("ك"); await h.evaluate(k => { window.__active = k; k.focus(); }); await sleep(100); const y0 = await fk.evaluate(() => Math.round(scrollY));
  await fk.keyboard.press("Enter"); await sleep(900);   // let any smooth-scroll animation started by the tool's focus() run to completion BEFORE measuring (measuring early made this assertion pass even with no fix)
  let st = await state();
  ok(st.active && st.value === "ك", "Enter on a key: the letter is typed AND focus stays on that key (was: jumped to the textarea)");
  ok(Math.abs(st.y - y0) <= 1, `Enter on a key: the page does not scroll (scrollY ${y0} -> ${st.y})`);
  ok(st.say === "ك. Answer: ك", "live region announces the key and the answer so far: " + JSON.stringify(st.say));
  // Space on a mark key
  h = await keyHandle("Kasra"); await h.evaluate(k => { window.__active = k; k.focus(); }); await fk.keyboard.press("Space"); st = await state();
  ok(st.active && hex(st.value) === hex("كِ") && st.say === "Kasra. Answer: كِ", "Space on the Kasra key: mark added, focus stays on the key, announced " + JSON.stringify(st.say));
  // Tab continues through the keys (does not leap to Check or back to the textarea)
  await fk.keyboard.press("Tab");
  ok(await fk.evaluate(() => { const ks = [...document.querySelectorAll("#lxKb .key")], a = document.activeElement, i = ks.indexOf(window.__active); return i >= 0 && a === ks[i + 1]; }), "Tab after a key press moves to the NEXT key (the user keeps their place)");
  // Delete
  h = await keyHandle("Delete last character"); await h.evaluate(k => { window.__active = k; k.focus(); }); await fk.keyboard.press("Enter"); st = await state();
  ok(st.active && st.value === "ك" && /^Delete last character\. Answer: ك$/.test(st.say), "Delete key via keyboard: removes the mark, focus stays, announced " + JSON.stringify(st.say));
  // a real pointer click keeps the tool's behaviour: focus goes to the textarea
  h = await keyHandle("ت"); await h.evaluate(k => k.scrollIntoView({ block: "center" })); await h.click(); st = await state();
  ok(st.activeId === "lxEditor" && st.value === "كت" && /^ت\. Answer: كت$/.test(st.say), "REAL MOUSE click on a key: focus still goes to the textarea (pointer behaviour unchanged) and it is announced");
  await fk.evaluate(() => LearnTypingDock.clear()); ok((await state()).say === "", "starting a new item clears the announcement");
  // answered/locked: pressing a key by keyboard must do nothing
  await fk.evaluate(() => { LearnTypingDock.lock(true); }); const before = await fk.$eval("#lxEditor", e => e.value);
  await fk.evaluate(() => { const k = [...document.querySelectorAll("#lxKb .key")][3]; k.click(); });
  ok((await fk.$eval("#lxEditor", e => e.value)) === before && (await state()).say === "", "locked after an answer: key presses neither type nor announce");
  ok(fk.errs.length === 0, "focus/announcement run: no page errors " + JSON.stringify(fk.errs)); await fk.close();
  // touch tap behaves like a pointer click
  const tp = await H.page({ w: 375, h: 740, mobile: true }); await openStage(tp, "words"); await ready(tp);
  const th = await tp.evaluateHandle(() => [...document.querySelectorAll("#lxKb .key")].find(k => k.getAttribute("aria-label") === "ب")); await th.evaluate(k => k.scrollIntoView({ block: "center" })); await sleep(100);
  await sleep(300); const box = await th.boundingBox(); await tp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(300);
  const tstate = await tp.evaluate(() => ({ v: document.getElementById("lxEditor").value, a: document.activeElement.id }));
  ok(tstate.v === "ب" && tstate.a === "lxEditor", "TOUCH tap on a key: typed, focus goes to the textarea (pointer behaviour unchanged) " + JSON.stringify(tstate)); await tp.close();
  // the standalone keyboard page must be completely unchanged
  const sa = await H.page({ w: 1000, h: 640 }); await sa.goto(base + "/arabic-keyboard/", { waitUntil: "load" }); await sa.waitForSelector("#virtualKeyboard .key"); await sleep(300);
  await sa.evaluate(() => [...document.querySelectorAll("#virtualKeyboard .key")].find(k => k.textContent.trim().startsWith("ك")).focus()); await sa.keyboard.press("Enter");
  ok(await sa.evaluate(() => document.activeElement.id === "editor" && document.getElementById("editor").value === "ك" && !document.getElementById("lxKbAnnounce")), "/arabic-keyboard/ standalone: keyboard activation still moves focus to its editor exactly as before (tool and page untouched)");
  ok((await sa.evaluate(() => typeof window.LearnTypingDock)) === "undefined" && sa.errs.length === 0, "/arabic-keyboard/ does not load any Learn code"); await sa.close();
}
/* 7. failure modes ----------------------------------------------------------------------------------------------- */
const block = []; let f = await newTracked({ block }); block.push(/keyboard-tool\.js/);
await openStage(f, "joined"); await ready(f);
let fs = await f.evaluate(() => ({ s: LearnTypingDock.state(), msg: document.getElementById("lxKbStatus").textContent, toggleHidden: document.getElementById("lxKbToggle").hidden, retryHidden: document.getElementById("lxKbRetry").hidden, keys: document.querySelectorAll("#lxKb .key").length, wrapHidden: document.getElementById("lxKbWrap").hidden }));
ok(fs.s.keyboard === "failed" && /could not be loaded/.test(fs.msg) && fs.keys === 0 && fs.toggleHidden && fs.wrapHidden && !fs.retryHidden, "script blocked: clear message, no dead keyboard/toggle, retry offered");
await f.type("#lxEditor", "بنت"); fb = await check(f);
ok(fb.includes("Correct"), "script blocked: native textarea + existing answer checking still work");
await f.keyboard.press("Enter"); await sleep(120);
ok((await val(f)) === "" && f.errs.length === 0, "script blocked: Next still clears the input; no page errors: " + JSON.stringify(f.errs));
block.length = 0; await f.click("#lxKbRetry"); await ready(f);
ok(await f.evaluate(() => LearnTypingDock.state().keyboard === "ready" && document.querySelectorAll("#lxKb .key").length === 74 && window.__kbInit === 1), "Retry after the network recovers loads and initialises the keyboard once");
await f.close();
const g = await newTracked(); await g.evaluate(() => 0); await g.evaluateOnNewDocument(() => { window.__throwInit = true; });
await openStage(g, "joined"); await ready(g);
fs = await g.evaluate(() => ({ s: LearnTypingDock.state(), retryHidden: document.getElementById("lxKbRetry").hidden, keys: document.querySelectorAll("#lxKb .key").length }));
await g.type("#lxEditor", "بنت"); fb = await check(g);
ok(fs.s.keyboard === "failed" && fs.retryHidden && fb.includes("Correct") && g.errs.length === 0, "init() throwing: caught, status shown, native input + checking work, no retry loop, no uncaught errors " + JSON.stringify(g.errs));
await g.close();
const hang = [/keyboard-tool\.js/]; const h2 = await newTracked({ hang });
await h2.goto(url("#/read")); await h2.waitForSelector('[data-action="stage"][data-id="joined"]'); await h2.click('[data-action="stage"][data-id="joined"]'); await h2.waitForSelector("#lxEditor", { visible: true });
await h2.type("#lxEditor", "بنت"); ok((await h2.evaluate(() => LearnTypingDock.state().keyboard)) === "loading", "stalled script: dock shows 'loading' and the textarea is immediately usable");
fb = await check(h2); ok(fb.includes("Correct"), "stalled script: answering works while the keyboard is still loading");
await h2.waitForFunction(() => LearnTypingDock.state().keyboard === "failed", { timeout: 12000 });
ok(await h2.$eval("#lxKbRetry", e => !e.hidden), "stalled script: gives up after the timeout and offers retry"); 
/* 8. responsive, dark mode, language ------------------------------------------------------------------------------ */
for (const [w, hh] of [[375, 740], [320, 640]]) {
  const m = await H.page({ w, h: hh, mobile: true }); await openStage(m, "words"); await ready(m);
  const r = await m.evaluate(() => { const W = document.documentElement.clientWidth; const keys = [...document.querySelectorAll("#lxKb .key")].map(k => k.getBoundingClientRect()); return { over: document.documentElement.scrollWidth - W, outside: keys.filter(k => k.left < -1 || k.right > W + 1).length, minW: Math.min(...keys.map(k => k.width)), inputmode: document.getElementById("lxEditor").getAttribute("inputmode"), coarse: matchMedia("(pointer: coarse)").matches }; });
  ok(r.over <= 1 && r.outside === 0, `${w}px: no horizontal overflow; all 74 keys inside the viewport (min key width ${r.minW.toFixed(0)}px)`);
  ok(r.coarse ? r.inputmode === "none" : r.inputmode === null, `${w}px: OS keyboard suppressed only on touch devices while ours is shown (coarse=${r.coarse}, inputmode=${r.inputmode})`);
  const vis = await m.evaluate(() => { const w = document.querySelector("#lxTPrompt .lx-show-ar").getBoundingClientRect(), e = document.getElementById("lxEditor").getBoundingClientRect(), hd = document.querySelector("header, .site-header, .header"); return { wordTop: w.top, wordBottom: w.bottom, edBottom: e.bottom, vh: innerHeight, header: hd ? hd.getBoundingClientRect().bottom : 0 }; });
  ok(vis.wordTop >= Math.max(vis.header, 60) && vis.edBottom <= vis.vh, `${w}px: after opening, the word to type is fully below the sticky header and the answer box is on screen (word top ${vis.wordTop.toFixed(0)}px, header bottom ${vis.header.toFixed(0)}px)`);
  await m.click("#lxKbToggle"); ok((await m.$eval("#lxEditor", e => e.getAttribute("inputmode"))) === null, `${w}px: hiding the keyboard restores the OS keyboard (inputmode removed)`);
  await m.click("#lxKbToggle"); if (w === 375) await m.screenshot({ path: os.tmpdir() + "/learn-dock-mobile.png" });
  ok(m.errs.length === 0, `${w}px: no errors ` + JSON.stringify(m.errs)); await m.close();
}
const lum = c => { const [r, g2, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g2 + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
const d = await H.page({ w: 1000 }); await openStage(d, "words"); await ready(d); await clickKey(d, "ك"); await clickKey(d, "كسرة", true);
for (const theme of ["light", "dark"]) {
  await d.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme); await sleep(500);
  const c = await d.evaluate(() => { const ed = document.getElementById("lxEditor"), ov = document.querySelector(".editor-highlight"), key = document.querySelector("#lxKb .key"), pan = document.getElementById("lxKbWrap"); /* the tool draws the visible text AND background on .editor-highlight; the textarea itself is transparent */ return { bg: getComputedStyle(ov).backgroundColor, ink: getComputedStyle(ov).color, keyBg: getComputedStyle(key).backgroundColor, keyInk: getComputedStyle(key.querySelector("span, b, i") || key).color, panel: getComputedStyle(pan).backgroundColor }; });
  ok(ratio(c.ink, c.bg) >= 7, `${theme}: answer text contrast on the editor ${ratio(c.ink, c.bg).toFixed(1)}:1 (>=7)`);
  ok(ratio(c.keyInk, c.keyBg) >= 3 && c.keyBg !== c.panel, `${theme}: key labels readable (${ratio(c.keyInk, c.keyBg).toFixed(1)}:1) and keys distinct from the panel`);
}
await d.screenshot({ path: os.tmpdir() + "/learn-dock-dark.png" }); ok(d.errs.length === 0, "theme switching: no errors"); await d.close();
const en = await newTracked(); await en.goto(`${base}/learn-arabic/?lang=en&n=${++N}#/read`); await en.waitForSelector('[data-action="stage"][data-id="words"]'); await en.click('[data-action="stage"][data-id="words"]'); await ready(en); await sleep(500);
const enState = await en.evaluate(() => ({ keys: document.querySelectorAll("#lxKb .key").length, lbl: document.getElementById("lxKbToggle").textContent, h1: document.querySelector("h1").textContent, status: document.getElementById("lxKbStatus").textContent }));
const lbl = async pg => pg.evaluate(() => { const f = re => { const k = [...document.querySelectorAll("#lxKb .key")].find(z => re.test(z.textContent) || re.test(z.getAttribute("aria-label") || "")); return k ? { text: k.textContent.trim().replace(/\s+/g, " "), aria: k.getAttribute("aria-label") } : null; }; return { space: f(/مسافة|Space/i), del: f(/حذف|Delete/i), nl: f(/سطر جديد|New line/i), fatha: f(/فتحة|Fatha/i) }; });
const enL = await lbl(en);
ok(enL.space && enL.space.text === "Space" && /Delete/.test(enL.del.text) && /New line/.test(enL.nl.text) && /Fatha/.test(enL.fatha.text) && enL.del.aria === "Delete last character", "English UI: keyboard control labels AND aria-labels are English, like the standalone keyboard page " + JSON.stringify(enL));
// the site persists the chosen language in localStorage, so force Arabic explicitly (an earlier page in this profile chose English)
const ar = await newTracked(); await ar.goto(`${base}/learn-arabic/?lang=ar&n=${++N}#/read`); await ar.waitForSelector('[data-action="stage"][data-id="words"]'); await ar.click('[data-action="stage"][data-id="words"]'); await ready(ar); await sleep(500); const arL = await lbl(ar);
ok(arL.space.text === "مسافة" && /حذف/.test(arL.del.text) && /فتحة/.test(arL.fatha.text), "Arabic UI: control labels stay Arabic " + JSON.stringify(arL));
ok(await en.evaluate(() => /Hide Arabic keyboard|Show Arabic keyboard/.test(document.getElementById("lxKbToggle").textContent) && document.querySelector(".lx-hero, #learnApp").closest("[data-i18n-skip]") !== null), "English UI: the course's own text (toggle, prompts) remains protected from the translator");
ok(enState.keys === 74 && /keyboard/i.test(enState.lbl) && /ready/.test(enState.status) && en.errs.length === 0, "English UI mode: dock content intact (h1='" + enState.h1 + "'), keyboard works, no errors");
/* 9. the standalone keyboard page is untouched ------------------------------------------------------------------ */
const k = await H.page(); const seen = []; k.on("request", r => seen.push(r.url()));
await k.goto(base + "/arabic-keyboard/", { waitUntil: "load" }); await k.waitForSelector("#virtualKeyboard .key"); await sleep(300);
await k.evaluate(() => { [...document.querySelectorAll("#virtualKeyboard .key")].find(x => x.textContent.trim().startsWith("ب")).click(); });
ok((await k.$$("#virtualKeyboard .key")).length === 74 && (await k.$eval("#editor", e => e.value)) === "ب" && !seen.some(u => /\/learn\//.test(u) || /learn\.css/.test(u)) && k.errs.length === 0, "/arabic-keyboard/ still works standalone (74 keys, typing) and loads no Learn assets");
await H.finish();
