// Real-browser regression test: on-screen Arabic keyboard + ON/OFF switch on /tashkeel/ (real Chromium, local HTTP server,
// the REAL Ichkil model through ONNX Runtime Web). Run:  cd tests/tashkeel && npm install && npm run toggle
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import chromium from "@sparticuz/chromium"; import puppeteer, { KnownDevices } from "puppeteer-core";
const ROOT = path.resolve(new URL("../..", import.meta.url).pathname), PORT = 8162, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
const browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(url, { w = 1280, h = 900, scheme = "light", mobile = false, device = null } = {}) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  if (device) await pg.emulate(KnownDevices[device]);        // real phone profile: viewport, DPR, touch, user agent
  else await pg.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  pg.errs = []; pg.failed = [];
  pg.on("pageerror", e => pg.errs.push("pageerror: " + e.message));
  pg.on("console", m => { if (m.type() === "error" && (m.location().url || "").startsWith(O)) pg.errs.push("console.error: " + m.text()); });
  pg.on("requestfailed", r => { if (r.url().startsWith(O)) pg.failed.push(r.url()); });
  await pg.setRequestInterception(true); pg.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());   // no Google Fonts / AdSense in tests
  pg.ctx = ctx; await pg.goto(url, { waitUntil: "load" });
  await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { });
  await pg.addStyleTag({ content: "html{scroll-behavior:auto !important}" });   // test-only: the site's smooth scrolling makes Puppeteer click where an element WAS
  await wait(300); return pg;
}
const sel = { ta: "#tashkeelIn", sw: "#tashkeelKbSwitch", panel: "#tashkeelKbPanel", run: "#tashkeelRun", out: "#tashkeelOut", counts: "#tashkeelCounts" };
const val = pg => pg.$eval(sel.ta, e => e.value);
const selection = pg => pg.$eval(sel.ta, e => [e.selectionStart, e.selectionEnd]);
const setText = (pg, v, s = v.length, e = s) => pg.$eval(sel.ta, (t, v, s, e) => { t.value = v; t.setSelectionRange(s, e); t.dispatchEvent(new Event("input", { bubbles: true })); }, v, s, e);
// real mouse / touch click on a virtual key, found by its aria-label
async function press(pg, label, touch = false) {
  const h = await pg.evaluateHandle(l => [...document.querySelectorAll("#virtualKeyboard .key")].find(b => b.getAttribute("aria-label") === l), label);
  const el = h.asElement(); if (!el) throw new Error("no key " + label);
  if (touch) await el.tap(); else await el.click();
}
const isShown = (pg, s) => pg.$eval(s, e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; });
const switchState = pg => pg.$eval(sel.sw, e => ({ checked: e.getAttribute("aria-checked"), text: e.querySelector(".tk-switch-state").textContent.trim() }));

const audit = pg => pg.evaluate(() => {
  const vk = document.querySelector("#virtualKeyboard"), panel = document.querySelector("#tashkeelKbPanel");
  panel.scrollIntoView({ block: "start" });
  const pr = panel.getBoundingClientRect(), keys = [...vk.querySelectorAll(".key")];
  const letters = keys.filter(k => /^[\u0621-\u064A]$/.test(((k.querySelector(".key-main") || {}).textContent || "").trim()));
  let tiny = 0, clipped = 0, covered = 0;
  for (const k of letters) {
    const r = k.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) tiny++;
    if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) clipped++;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy >= 0 && cy < innerHeight && cx >= 0 && cx < innerWidth) { const el = document.elementFromPoint(cx, cy); if (el && !k.contains(el) && !el.contains(k)) covered++; }
  }
  const sw = document.querySelector("#tashkeelKbSwitch").getBoundingClientRect();
  return { keys: keys.length, letters: letters.length, tiny, clipped, covered, hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    innerScroll: panel.scrollHeight - panel.clientHeight, switchH: Math.round(sw.height), switchAbove: sw.bottom <= pr.top + 1, lang: document.documentElement.lang };
});

/* 1. loads ON, keyboard visible, switch labelled; no console errors; no failed local requests */
let pg = await open(O + "/tashkeel/");
let a = await audit(pg), st = await switchState(pg);
ck("1a. /tashkeel/ loads with the switch ON and the keyboard visible", st.checked === "true" && st.text === "تشغيل" && await isShown(pg, sel.panel) && a.letters >= 28 && a.keys >= 70, JSON.stringify({ st, a }));
ck("1b. switch is above the keyboard, has a >=40px tap target, and is a labelled role=switch",
  a.switchAbove && a.switchH >= 40 && await pg.$eval(sel.sw, e => e.getAttribute("role") === "switch" && document.getElementById(e.getAttribute("aria-labelledby")).textContent.trim() === "لوحة المفاتيح العربية"), JSON.stringify(a));
ck("1c. no page/console errors and no failed local requests on load", pg.errs.length === 0 && pg.failed.length === 0, pg.errs.concat(pg.failed).join(" | "));
ck("1d. textarea unchanged in look: no highlight overlay, glyphs not transparent", await pg.evaluate(() => !document.querySelector(".editor-highlight") && getComputedStyle(document.getElementById("tashkeelIn")).color !== "rgba(0, 0, 0, 0)" && !document.getElementById("tashkeelIn").classList.contains("editor--highlighted")));
await pg.screenshot({ path: process.env.TK_SHOT_ON || "/tmp/tashkeel-keyboard-on.png" });

/* 4/5/6. real mouse clicks type into the Tashkeel editor: at the caret, over a selection, space/backspace/newline */
await setText(pg, "");
for (const ch of ["ك", "ت", "ا", "ب"]) await press(pg, ch);
ck("4. real clicks on Arabic keys insert the right characters", await val(pg) === "كتاب", await val(pg));
ck("4b. the Tashkeel character counter follows on-screen typing", /٤ حرف · ١ كلمة/.test(await pg.$eval(sel.counts, e => e.textContent)), await pg.$eval(sel.counts, e => e.textContent));
await setText(pg, "كتب", 1);
await press(pg, "ا");
ck("5a. inserted at the caret (ك|تب -> كاتب), caret lands after it", await val(pg) === "كاتب" && (await selection(pg)).join() === "2,2", await val(pg) + " " + await selection(pg));
await setText(pg, "العلم نور", 6, 9);
await press(pg, "ن");
ck("5b. a click replaces the selected text", await val(pg) === "العلم ن", await val(pg));
await setText(pg, "ab", 1);
await press(pg, "مسافة"); await press(pg, "سطر جديد");
ck("6a. space and new line insert at the caret", await val(pg) === "a \nb", JSON.stringify(await val(pg)));
await setText(pg, "كتاب", 1, 3);
await press(pg, "حذف الحرف الأخير");
ck("6b. backspace deletes the selection; with a caret it deletes one character", await val(pg) === "كب", await val(pg));
await press(pg, "حذف الحرف الأخير");
ck("6c. second backspace (caret at 1) deletes the character before it", await val(pg) === "ب" && (await selection(pg)).join() === "0,0", await val(pg));

/* 8. physical keyboard keeps working, mixed with on-screen keys */
await setText(pg, "");
await pg.focus(sel.ta); await pg.keyboard.type("علم");
await press(pg, "مسافة");
await pg.focus(sel.ta); await pg.keyboard.press("End"); await pg.keyboard.type("نور");
ck("8a. physical typing works and interleaves with on-screen keys", await val(pg) === "علم نور", await val(pg));
await pg.keyboard.press("Backspace");
ck("8b. physical Backspace still works", await val(pg) === "علم نو", await val(pg));
ck("8c. RTL preserved", await pg.$eval(sel.ta, e => e.dir === "rtl" && getComputedStyle(e).direction === "rtl"));

/* 2/3. switch OFF hides everything keyboard-related, keeps text + selection + controls; ON restores in place */
await setText(pg, "العلم نور", 2, 5);
const before = await pg.evaluate(() => { const p = document.getElementById("tashkeelKbPanel"); return { top: Math.round(p.getBoundingClientRect().top + scrollY), next: p.nextElementSibling.id }; });
await pg.click(sel.sw); await wait(100);
st = await switchState(pg);
ck("2a. switching OFF: state OFF, keyboard hidden completely", st.checked === "false" && st.text === "إيقاف" && !(await isShown(pg, sel.panel)) && await pg.$eval("#virtualKeyboard", e => e.offsetParent === null), JSON.stringify(st));
ck("2b. OFF: text and selection untouched; editor + Run/Example/Clear/Copy/Output all still visible", await val(pg) === "العلم نور" && (await selection(pg)).join() === "2,5" &&
  (await Promise.all(["#tashkeelIn", "#tashkeelRun", "#tashkeelExample", "#tashkeelClear", "#tashkeelCopy", "#tashkeelOut"].map(s => isShown(pg, s)))).every(Boolean));
ck("2c. OFF: Tab from the switch skips the hidden keys (next stop is the Run area, not a key)", await (async () => { await pg.focus(sel.sw); await pg.keyboard.press("Tab"); return pg.evaluate(() => !document.activeElement.closest("#tashkeelKbPanel") && document.activeElement.id !== "tashkeelKbPanel"); })());
await pg.click(sel.sw); await wait(100);
st = await switchState(pg);
const after = await pg.evaluate(() => { const p = document.getElementById("tashkeelKbPanel"); return { top: Math.round(p.getBoundingClientRect().top + scrollY), next: p.nextElementSibling.id }; });
ck("3a. switching ON again: keyboard back in the same position, state ON", st.checked === "true" && st.text === "تشغيل" && await isShown(pg, sel.panel) && before.top === after.top && before.next === after.next, JSON.stringify({ st, before, after }));
ck("3b. ON again: text + selection preserved, typing continues (the selection is replaced)", await val(pg) === "العلم نور" && (await selection(pg)).join() === "2,5", await val(pg));
await press(pg, "ب");
ck("3c. keyboard still types after OFF -> ON", await val(pg) === "الب نور", await val(pg));

/* switch is keyboard-accessible: Space and Enter */
await pg.focus(sel.sw); await pg.keyboard.press("Space"); st = await switchState(pg);
const offBySpace = st.checked === "false" && !(await isShown(pg, sel.panel));
await pg.keyboard.press("Enter"); st = await switchState(pg);
ck("2d. the switch works from the keyboard (Space turns it OFF, Enter turns it ON)", offBySpace && st.checked === "true" && await isShown(pg, sel.panel));
ck("2e. ON: Tab from the switch reaches the first key", await (async () => { await pg.focus(sel.sw); await pg.keyboard.press("Tab"); return pg.evaluate(() => !!document.activeElement.closest("#tashkeelKbPanel")); })());
ck("10a. no page/console errors after all interactions", pg.errs.length === 0, pg.errs.join(" | "));

/* 7. the REAL Ichkil model processes text typed with the on-screen keyboard, with the keyboard ON and OFF */
async function runReal(p) {
  await p.click(sel.run);
  await p.waitForFunction(() => document.getElementById("tashkeelOut").classList.contains("has-result") || !document.getElementById("tashkeelError").hidden, { timeout: 120000 });
  return { out: await p.$eval(sel.out, e => e.textContent), err: await p.$eval("#tashkeelError", e => !e.hidden) };
}
const MARKS = /[\u064B-\u0652\u0670]/g;
await setText(pg, "");
for (const ch of ["ا", "ل", "ع", "ل", "م"]) await press(pg, ch);
await press(pg, "مسافة");
for (const ch of ["ن", "و", "ر"]) await press(pg, ch);
const typed = await val(pg);
let r = await runReal(pg);
ck("7a. real model: text typed with the on-screen keys is diacritized (marks added, letters identical)", !r.err && r.out.replace(MARKS, "") === typed && (r.out.match(MARKS) || []).length >= 3, JSON.stringify(r));
ck("7b. the input text was not modified by processing", await val(pg) === typed && typed === "العلم نور");
await pg.click(sel.sw);
r = await runReal(pg);
ck("7c. real model also works with the keyboard switched OFF, same result", !r.err && r.out.replace(MARKS, "") === typed && await val(pg) === typed, JSON.stringify(r));
ck("10b. no errors during real processing", pg.errs.length === 0, pg.errs.join(" | "));
await pg.screenshot({ path: process.env.TK_SHOT_OFF || "/tmp/tashkeel-keyboard-off.png" }); await pg.ctx.close();

/* 9. layout: viewports x light/dark x ar/en; keys visible, not clipped, no sideways scroll, typing works */
const VIEWPORTS = [[320, 568], [360, 740], [390, 844], [768, 1024], [900, 700], [1280, 800], [1920, 1080]];
const probs = [];
for (const scheme of ["light", "dark"]) for (const lang of ["ar", "en"]) for (const [w, h] of VIEWPORTS) {
  const p = await open(O + "/tashkeel/?lang=" + lang, { w, h, scheme, mobile: w < 800 });
  const x = await audit(p); await setText(p, ""); await press(p, "ع", w < 800); await press(p, "ي", w < 800);
  const typedOk = await val(p) === "عي";
  const s0 = await switchState(p); await p.click(sel.sw); const s1 = await switchState(p);
  const enOk = lang === "en" ? (s0.text === "ON" && s1.text === "OFF" && await p.$eval("#tashkeelKbLabel", e => e.textContent.trim()) === "Arabic Keyboard") : (s0.text === "تشغيل" && s1.text === "إيقاف");
  const offOk = !(await isShown(p, sel.panel)) && await val(p) === "عي";
  await p.click(sel.sw);
  if (!(x.keys >= 70 && x.letters >= 28 && x.tiny === 0 && x.clipped === 0 && x.covered === 0 && x.hOverflow <= 0 && x.innerScroll <= 0 && x.switchH >= 40 && x.switchAbove && x.lang === lang && typedOk && enOk && offOk && p.errs.length === 0))
    probs.push(`${scheme} ${lang} ${w}x${h} ${JSON.stringify(x)} typed=${typedOk} labels=${enOk} off=${offOk} ${p.errs}`);
  if (scheme === "light" && lang === "ar" && w === 390) await p.screenshot({ path: process.env.TK_SHOT_MOBILE || "/tmp/tashkeel-keyboard-390.png", fullPage: true });
  await p.ctx.close();
}
ck(`9. ${VIEWPORTS.length * 4} combinations (viewport x ar/en x light/dark; phones use touch taps): keyboard fully visible and unclipped, no sideways scroll, typing + switch work, English labels ON/OFF`, probs.length === 0, probs.slice(0, 3).join(" ;; "));

/* 9b. English mode: the visitor's typed text survives a language switch and the switch label/state are translated live */
pg = await open(O + "/tashkeel/");
await setText(pg, "العلم نور");
await pg.evaluate(() => document.querySelector('.lang-switch .lang-opt[data-lang="en"]').click()); await wait(500);
let en = await pg.evaluate(() => ({ label: document.getElementById("tashkeelKbLabel").textContent.trim(), state: document.getElementById("tashkeelKbState").textContent.trim(), key: [...document.querySelectorAll("#virtualKeyboard .key")].some(k => k.textContent.includes("Space")) }));
ck("9b. switching the site to English keeps the text and translates the switch (Arabic Keyboard / ON) and key names", await val(pg) === "العلم نور" && en.label === "Arabic Keyboard" && en.state === "ON" && en.key, JSON.stringify(en));
await pg.click(sel.sw); await wait(200);
en = await switchState(pg);
ck("9c. in English, toggling OFF shows OFF live and switching back to Arabic restores Arabic labels", en.text === "OFF" && (await pg.evaluate(() => document.querySelector('.lang-switch .lang-opt[data-lang="ar"]').click()), await wait(500), (await switchState(pg)).text === "إيقاف") && await val(pg) === "العلم نور");
await pg.ctx.close();


/* 12. phones and short screens (emulation: real touch taps, phone viewports/UA — NOT a physical device, and Chromium has no OS keyboard).
   Covers: no page jump on key taps, exact caret/selection, long-text caret visibility, OS-keyboard suppression, every key reachable
   on short screens and in a viewport shrunk to what is left above an open OS keyboard. */
const PHONES = [{ name: "Pixel 5", device: "Pixel 5" }, { name: "iPhone 13", device: "iPhone 13" }, { name: "short 390x420", w: 390, h: 420 }, { name: "OS-keyboard-open 390x300", w: 390, h: 300 }];
let jump = 0;   // largest page scroll caused by a key TOUCH itself. Bringing the key into view first is test setup and is not counted (Puppeteer's own tap() would scroll the page and hide the product's behaviour).
const tap = async (pg, label) => {
  const pt = await pg.evaluate(l => {
    const k = [...document.querySelectorAll("#virtualKeyboard .key")].find(b => b.getAttribute("aria-label") === l);
    const at = () => { const r = k.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: !!el && (k === el || k.contains(el)) }; };
    k.scrollIntoView({ block: "nearest", inline: "nearest" }); let r = at(); if (!r.hit) { k.scrollIntoView({ block: "center", inline: "center" }); r = at(); } return r;
  }, label);
  if (!pt.hit) throw new Error("key not hittable: " + label);
  await wait(40);
  const before = await pg.evaluate(() => scrollY); await pg.touchscreen.tap(pt.x, pt.y); await wait(90);
  jump = Math.max(jump, Math.abs((await pg.evaluate(() => scrollY)) - before));
};
const geo = (pg, ed) => pg.evaluate((ed) => { const t = document.querySelector(ed), k = [...document.querySelectorAll("#virtualKeyboard .key")].find(b => b.getAttribute("aria-label") === "ع"); const r = t.getBoundingClientRect(); return { y: Math.round(scrollY), keyTop: Math.round(k.getBoundingClientRect().top), taBottom: Math.round(r.bottom), focused: document.activeElement === t, sel: [t.selectionStart, t.selectionEnd], v: t.value, st: t.scrollTop, ch: t.clientHeight, sh: t.scrollHeight, lh: parseFloat(getComputedStyle(t).lineHeight) || 24 }; }, ed);
const kbToTop = (pg, panel) => pg.evaluate((panel) => { const p = document.querySelector(panel); window.scrollTo(0, Math.max(0, p.getBoundingClientRect().top + scrollY - 10)); }, panel);
const LONG = Array.from({ length: 60 }, (_, i) => "سطر رقم " + (i + 1) + " من النص الطويل لاختبار الالتفاف في مربع النص عند الكتابة بلوحة المفاتيح").join("\n");
for (const PAGE of [{ url: "/tashkeel/", ed: "#tashkeelIn", panel: "#tashkeelKbPanel", name: "Tashkeel" }, { url: "/arabic-keyboard/", ed: "#editor", panel: ".kb-panel", name: "/arabic-keyboard/" }]) {
  for (const P of PHONES) {
    const tag = `${PAGE.name} on ${P.name}`;
    const p = await open(O + PAGE.url, P.device ? { device: P.device } : { w: P.w, h: P.h, mobile: true });
    jump = 0;
    const set = (v, a, b = a) => p.$eval(PAGE.ed, (t, v, a, b) => { t.value = v; t.setSelectionRange(a, b); t.scrollTop = 0; t.dispatchEvent(new Event("input", { bubbles: true })); }, v, a, b);
    // a) taps never move the page or the keys; caret + selection exact
    await set("كتب", 1, 1); await kbToTop(p, PAGE.panel); await wait(150);
    const g0 = await geo(p, PAGE.ed);
    for (let i = 0; i < 3; i++) await tap(p, "ا");
    const g1 = await geo(p, PAGE.ed);
    ck(`12a. ${tag}: key taps insert at the caret, caret follows, the page does not scroll and the keys do not move (editor was off-screen above)`,
      g0.taBottom < 0 && g1.v === "كاااتب" && g1.sel.join() === "4,4" && g1.focused && jump <= 1 && Math.abs(g1.y - g0.y) <= 1 && Math.abs(g1.keyTop - g0.keyTop) <= 3, JSON.stringify({ jump, g0, g1 }));
    // b) selection replace + backspace (selection, then caret) by tap
    await set("كاااتب", 1, 4); await tap(p, "م");
    let g = await geo(p, PAGE.ed);
    const rep1 = g.v === "كمتب" && g.sel.join() === "2,2";
    await tap(p, "حذف الحرف الأخير"); let g2 = await geo(p, PAGE.ed);
    await set("كتب", 0, 2); await tap(p, "حذف الحرف الأخير"); let g3 = await geo(p, PAGE.ed);
    ck(`12b. ${tag}: tap replaces the selection, backspace deletes a caret char / a selection, caret exact, page still`, rep1 && g2.v === "كتب" && g2.sel.join() === "1,1" && g3.v === "ب" && g3.sel.join() === "0,0" && jump <= 1, JSON.stringify({ jump, rep1, g, g2, g3 }));
    // c) long text: the caret stays visible INSIDE the editor (end and start), still without moving the page
    await set(LONG, LONG.length); const gl0 = await geo(p, PAGE.ed); await tap(p, "ع"); const gl1 = await geo(p, PAGE.ed);
    await set(LONG, 0); await p.$eval(PAGE.ed, t => { t.scrollTop = t.scrollHeight; }); await tap(p, "ع"); const gl2 = await geo(p, PAGE.ed);
    const endVisible = gl1.st + gl1.ch >= gl1.sh - gl1.lh * 1.5, startVisible = gl2.st <= gl2.lh * 1.5;
    ck(`12c. ${tag}: in a long text the caret is scrolled into view inside the editor (end and start), the page is not`, gl1.sh > gl1.ch && endVisible && startVisible && jump <= 1, JSON.stringify({ jump, ys: [gl0.y, gl1.y, gl2.y], gl0: [gl0.st, gl0.sh, gl0.ch], gl1: [gl1.st, gl1.sh], gl2: [gl2.st, gl2.sh] }));
    // d) every key can be reached and hit (not clipped, not under the sticky header) after scrolling it into view
    await set("", 0);
    const reach = await p.evaluate(async (panel) => {
      const keys = [...document.querySelectorAll("#virtualKeyboard .key")]; let bad = [];
      for (const k of keys) { k.scrollIntoView({ block: "center", inline: "center" }); await new Promise(r => requestAnimationFrame(r)); const r = k.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!el || !(k === el || k.contains(el))) bad.push(k.getAttribute("aria-label")); }
      return { n: keys.length, bad: bad.slice(0, 5), nb: bad.length, hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, PAGE.panel);
    ck(`12d. ${tag}: all ${reach.n} keys reachable and hittable by scrolling, no sideways scroll`, reach.n >= 70 && reach.nb === 0 && reach.hOverflow <= 0, JSON.stringify(reach));
    if (PAGE.name === "Tashkeel") {
      // e) OS keyboard policy follows the switch; text/selection untouched by it
      await set("العلم نور", 2, 5);
      const im0 = await p.$eval(PAGE.ed, t => t.inputMode);
      await p.$eval("#tashkeelKbSwitch", b => b.click()); const im1 = await p.$eval(PAGE.ed, t => ({ m: t.inputMode, v: t.value, s: [t.selectionStart, t.selectionEnd] }));
      await p.$eval("#tashkeelKbSwitch", b => b.click()); const im2 = await p.$eval(PAGE.ed, t => ({ m: t.inputMode, v: t.value, s: [t.selectionStart, t.selectionEnd] }));
      ck(`12e. ${tag}: inputmode=none while ON (no OS keyboard over the on-screen one), normal OS keyboard when OFF, ON again restores; text + selection untouched`,
        im0 === "none" && im1.m === "" && im1.v === "العلم نور" && im1.s.join() === "2,5" && im2.m === "none" && im2.v === "العلم نور" && im2.s.join() === "2,5", JSON.stringify({ im0, im1, im2 }));
    } else {
      ck(`12e. ${tag}: the main page's editor still gets the normal OS keyboard (inputmode untouched)`, await p.$eval(PAGE.ed, t => !t.hasAttribute("inputmode")));
    }
    ck(`12f. ${tag}: no page/console errors`, p.errs.length === 0, p.errs.join(" | "));
    await p.ctx.close();
  }
}

/* 12g. OFF -> typing with the normal (OS/physical) keyboard path is plain native editing on a phone profile; ON -> hardware keyboard still types */
{
  const p = await open(O + "/tashkeel/", { device: "Pixel 5" });
  await p.focus(sel.ta); await p.keyboard.type("علم");
  await p.$eval("#tashkeelKbSwitch", b => b.click());
  await p.focus(sel.ta); await p.keyboard.type(" نور");
  const v1 = await val(p);
  await p.$eval("#tashkeelKbSwitch", b => b.click());
  await tap(p, "ا");
  ck("12g. phone profile: hardware/OS-style typing works with the on-screen keyboard ON and OFF, and both can be mixed", v1 === "علم نور" && (await val(p)).includes("ا") && (await val(p)).startsWith("علم نو"), v1 + " | " + await val(p));
  await p.ctx.close();
}

/* 12h. desktop: real-mouse selection replace + backspace-selection on BOTH pages (shared keyboard-tool.js) */
for (const [url, ed, name] of [["/tashkeel/", "#tashkeelIn", "Tashkeel"], ["/arabic-keyboard/", "#editor", "/arabic-keyboard/"]]) {
  const p = await open(O + url);
  await p.$eval(ed, t => { t.value = "العلم نور"; t.setSelectionRange(6, 9); t.dispatchEvent(new Event("input", { bubbles: true })); });
  await press(p, "ن");
  const a1 = await p.$eval(ed, t => ({ v: t.value, s: [t.selectionStart, t.selectionEnd] }));
  await p.$eval(ed, t => t.setSelectionRange(0, 2)); await press(p, "حذف الحرف الأخير");
  const a2 = await p.$eval(ed, t => ({ v: t.value, s: [t.selectionStart, t.selectionEnd] }));
  await p.$eval(ed, t => { t.value = "كلمة"; t.setSelectionRange(0, 4); }); await press(p, "مسافة");
  const a3 = await p.$eval(ed, t => t.value);
  ck(`12h. ${name} (desktop, real mouse): a key replaces the selected text, backspace deletes a selection, select-all + key replaces everything`,
    a1.v === "العلم ن" && a1.s.join() === "7,7" && a2.v === "علم ن" && a2.s.join() === "0,0" && a3 === " ", JSON.stringify({ a1, a2, a3 }));
  await p.ctx.close();
}

/* 11. other pages that share keyboard-tool.js are unaffected */
for (const u of ["/arabic-keyboard/", "/transliteration/", "/editor/"]) {
  const p = await open(O + u, { w: 1280, h: 900 });
  const translit = u === "/transliteration/";   // this page has no virtual keyboard: it only uses the shared transliterate() + map table
  const ok = await p.evaluate(t => !!document.getElementById(t ? "translitInput" : "editor"), translit);
  let typedOk = true;
  if (!translit) { await p.$eval("#editor", t => { t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); }); await press(p, "ك"); await press(p, "ت"); typedOk = await p.$eval("#editor", t => t.value) === "كت"; }
  else { await p.$eval("#translitInput", t => { t.value = "ktb"; t.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(100); typedOk = (await p.$eval("#translitOutput", t => t.value || t.textContent)).trim() === "كتب" && (await p.$$("#mapTableBody tr")).length > 0; }
  const overlay = translit ? true : await p.evaluate(() => !!document.querySelector(".editor-highlight"));
  ck(`11. ${u} still works (keyboard types, highlight overlay intact, no errors)`, ok && typedOk && overlay && p.errs.length === 0, p.errs.join(" | ")); await p.ctx.close();
}

await browser.close(); srv.close();
console.log(`\nTASHKEEL-KEYBOARD: ${total - bad.length}/${total} passed` + (bad.length ? "  FAILED: " + bad.join("; ") : ""));
process.exit(bad.length ? 1 : 0);
