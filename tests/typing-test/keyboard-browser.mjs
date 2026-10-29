// Real-browser regression test: on-screen Arabic keyboard on /typing-test/ (real Chromium + a local static server; no site code mocked).
// Run:  cd tests/typing-test && npm install && npm run browser
// Browser: Linux uses the bundled @sparticuz/chromium; elsewhere set CHROME_PATH (or PUPPETEER_EXECUTABLE_PATH) to Chrome/Chromium.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { KnownDevices } from "puppeteer-core";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url))), PORT = 8173, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };

async function launch() {
  const explicit = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) return puppeteer.launch({ executablePath: explicit, headless: true, args: ["--no-sandbox"] });
  if (process.platform !== "linux") throw new Error("Set CHROME_PATH to an installed Chrome/Chromium (the bundled build is Linux-only).");
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: [...chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
}
const browser = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(url, { w = 1280, h = 900, scheme = "light", device = null, ctx = null } = {}) {
  ctx = ctx || await browser.createBrowserContext(); const pg = await ctx.newPage();
  await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  if (device) await pg.emulate(KnownDevices[device]); else await pg.setViewport({ width: w, height: h });
  pg.errs = [];
  pg.on("pageerror", (e) => pg.errs.push("pageerror: " + e.message));
  pg.on("console", (m) => { if (m.type() === "error" && (m.location().url || "").startsWith(O)) pg.errs.push("console.error: " + m.text()); });
  await pg.setRequestInterception(true); pg.on("request", (r) => r.url().startsWith(O) ? r.continue() : r.abort());   // no Google Fonts / AdSense / GA
  pg.ctx = ctx; await pg.goto(O + url, { waitUntil: "load" });
  await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { });
  await pg.addStyleTag({ content: "html{scroll-behavior:auto !important}" });   // test-only: smooth scrolling makes Puppeteer click where an element WAS
  await wait(300); return pg;
}
const $v = (pg, s) => pg.$eval(s, (e) => e.value);
const text = (pg, s) => pg.$eval(s, (e) => e.textContent.trim());
const stats = (pg) => pg.evaluate(() => ({ wpm: statWpm.textContent, acc: statAcc.textContent, err: statErr.textContent, time: statTime.textContent }));
const prompt = (pg) => pg.$eval("#promptText", (e) => e.textContent);
const cnt = (pg, cls) => pg.$$eval("#promptText span." + cls, (a) => a.length);
const DIAC = { "\u064E": "فتحة", "\u064B": "تنوين فتح", "\u064F": "ضمة", "\u064C": "تنوين ضم", "\u0650": "كسرة", "\u064D": "تنوين كسر", "\u0652": "سكون", "\u0651": "شدة", "\u0670": "ألف خنجرية" };
async function press(pg, label, touch = false, scope = "#virtualKeyboard") {
  const h = await pg.evaluateHandle((l, sc) => [...document.querySelectorAll(sc + " .key")].find((b) => b.getAttribute("aria-label") === l), label, scope);
  const el = h.asElement(); if (!el) throw new Error("no key " + label);
  await el.scrollIntoView(); if (touch) await el.tap(); else await el.click();
}
const pressCh = (pg, ch, touch) => press(pg, ch === " " ? "مسافة" : DIAC[ch] || ch, touch);
const pressText = async (pg, s, touch) => { for (const ch of s) await pressCh(pg, ch, touch); };
const BACK = "حذف الحرف الأخير";
// WCAG contrast of the key glyph over the key face
const contrast = (pg) => pg.evaluate(() => {
  const rgb = (c) => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const k = document.querySelector("#virtualKeyboard .key"), g = k.querySelector(".key-main");
  const sp = [...document.querySelectorAll("#virtualKeyboard .key")].find((b) => b.getAttribute("aria-label") === "مسافة");
  const panelBg = getComputedStyle(document.getElementById("typingKbPanel")).backgroundColor;
  return { glyph: ratio(getComputedStyle(g).color, getComputedStyle(k).backgroundColor), label: ratio(getComputedStyle(sp).color, getComputedStyle(sp).backgroundColor), keyVsPanel: ratio(getComputedStyle(k).backgroundColor, panelBg), panelBg };
});

/* ---------- desktop ---------- */
{
  const pg = await open("/typing-test/");
  const shown = await pg.$eval("#typingKbPanel", (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return c.display !== "none" && r.width > 300 && r.height > 150 && r.top < innerHeight; });
  ck("D1. keyboard visible on load, no interaction needed (in the first screen)", shown);
  ck("D2. no ON/OFF switch anywhere on the page", await pg.evaluate(() => !document.querySelector('[role="switch"], .tk-switch, .tk-kb-toggle, [aria-checked]')));
  ck("D3. keyboard sits right under the typing input", await pg.evaluate(() => { const i = document.getElementById("typing-input").getBoundingClientRect(), k = document.getElementById("typingKbPanel").getBoundingClientRect(); return k.top >= i.bottom && k.top - i.bottom < 40; }));
  await pg.click('[data-duration="30"]'); await wait(100);
  ck("D4. before typing: timer idle", (await stats(pg)).time === "30");

  // Backspace / panel clicks on an untouched test must not start it
  await press(pg, BACK);
  await pg.click("#typingKbPanel", { offset: { x: 4, y: 4 } });
  await wait(1300);
  ck("D5. Backspace on empty field + clicking the panel do NOT start or reset the test", (await stats(pg)).time === "30" && (await $v(pg, "#typing-input")) === "");

  const target = await prompt(pg);
  let n = 0; await pg.$eval("#typing-input", (e) => { window.__ev = 0; e.addEventListener("input", () => window.__ev++); });
  await pressText(pg, target.slice(0, 8));
  ck("D6. real mouse clicks type the correct characters into the real test input", (await $v(pg, "#typing-input")) === target.slice(0, 8));
  ck("D7. exactly one input event per key (no duplicates)", (await pg.evaluate(() => window.__ev)) === 8);
  ck("D8. focus stays on the typing input after pressing keys", await pg.evaluate(() => document.activeElement.id === "typing-input"));
  await wait(1200);
  const s = await stats(pg);
  ck("D9. timer started by on-screen typing and counts down", Number(s.time) <= 29, JSON.stringify(s));
  ck("D10. WPM > 0, accuracy 100%, errors 0", Number(s.wpm) > 0 && s.acc === "100%" && s.err === "0", JSON.stringify(s));
  ck("D11. progress: 8 correct, rest pending", (await cnt(pg, "correct")) === 8 && (await cnt(pg, "pending")) === target.length - 8 && (await cnt(pg, "wrong")) === 0);

  // wrong key then Backspace
  await pressCh(pg, target[8] === "ب" ? "ت" : "ب");
  let s2 = await stats(pg);
  ck("D12. a wrong on-screen key is counted (1 error, wrong span)", s2.err === "1" && (await cnt(pg, "wrong")) === 1, JSON.stringify(s2));
  await press(pg, BACK);
  ck("D13. on-screen Backspace removes it; errors back to 0", (await stats(pg)).err === "0" && (await $v(pg, "#typing-input")) === target.slice(0, 8));

  // selection replacement + caret placement with the real keyboard
  await pg.$eval("#typing-input", (e) => { e.focus(); e.setSelectionRange(2, 5); });
  await pressCh(pg, "ي");
  const exp = target.slice(0, 2) + "ي" + target.slice(5, 8);
  ck("D14. selected text is replaced by the key", (await $v(pg, "#typing-input")) === exp);
  await pg.$eval("#typing-input", (e) => e.setSelectionRange(1, 1));
  await pressCh(pg, "ء");
  ck("D15. insertion happens at the caret, caret moves after it", (await $v(pg, "#typing-input")) === exp.slice(0, 1) + "ء" + exp.slice(1) && (await pg.$eval("#typing-input", (e) => e.selectionStart)) === 2);

  // physical keyboard still works, mixed in
  await pg.$eval("#typing-input", (e) => e.setSelectionRange(e.value.length, e.value.length));
  const before = await $v(pg, "#typing-input");
  await pg.focus("#typing-input"); await pg.keyboard.type("اب");
  ck("D16. physical keyboard typing still works", (await $v(pg, "#typing-input")) === before + "اب");
  await pg.keyboard.press("Backspace");
  ck("D17. physical Backspace still works", (await $v(pg, "#typing-input")) === before + "ا");

  // restart, complete the test only with keys
  await pg.click("#restartTest"); await wait(100);
  ck("D18. Restart resets input and stats; keyboard still visible", (await $v(pg, "#typing-input")) === "" && (await stats(pg)).time === "30" && await pg.$eval("#typingKbPanel", (e) => e.getBoundingClientRect().height > 100));
  const t2 = await prompt(pg);
  await pressText(pg, t2);
  ck("D19. completing the text with the keyboard ends the test (input disabled, result shown, 0 errors)", await pg.evaluate(() => document.getElementById("typing-input").disabled && document.getElementById("resultPanel").classList.contains("show") && statErr.textContent === "0" && statAcc.textContent === "100%"));
  const fin = await $v(pg, "#typing-input"); await press(pg, "ب"); await press(pg, BACK);
  ck("D20. finished test cannot be edited through the keyboard", (await $v(pg, "#typing-input")) === fin);
  await pg.click("#restartTest"); await pressCh(pg, "ب");
  ck("D21. after Restart the keyboard works again", (await $v(pg, "#typing-input")) === "ب");
  ck("D22. no console / page errors", pg.errs.length === 0, pg.errs.join(" | ")); await pg.ctx.close();
}

/* ---------- phone ---------- */
for (const device of ["iPhone 12", "Pixel 5"]) {
  const pg = await open("/typing-test/", { device, scheme: "dark" });
  ck(`M1 [${device}]. keyboard present, full width, no horizontal page overflow`, await pg.evaluate(() => { const r = document.getElementById("typingKbPanel").getBoundingClientRect(); return r.width > innerWidth - 24 && r.width <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }));
  ck(`M2 [${device}]. input is a single line tall (keys not pushed off-screen) and the OS keyboard is suppressed`, await pg.evaluate(() => { const i = document.getElementById("typing-input"); return i.getBoundingClientRect().height < 90 && i.getAttribute("inputmode") === "none"; }));
  const target = await prompt(pg);
  await pg.$eval("#typingKbPanel", (e) => e.scrollIntoView({ block: "center" })); await wait(150);
  const y0 = await pg.evaluate(() => scrollY);
  await pressText(pg, target.slice(0, 6), true);
  ck(`M3 [${device}]. tapping keys types correctly`, (await $v(pg, "#typing-input")) === target.slice(0, 6));
  ck(`M4 [${device}]. tapping keys does not jump the page`, (await pg.evaluate(() => scrollY)) === y0, `${y0} -> ${await pg.evaluate(() => scrollY)}`);
  await press(pg, BACK, true);
  ck(`M5 [${device}]. tap Backspace`, (await $v(pg, "#typing-input")) === target.slice(0, 5));
  ck(`M6 [${device}]. every key is reachable (inside the page width)`, await pg.evaluate(() => [...document.querySelectorAll("#virtualKeyboard .key")].every((k) => { const r = k.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.width >= 20 && r.height >= 36; })));
  ck(`M7 [${device}]. no console / page errors`, pg.errs.length === 0, pg.errs.join(" | ")); await pg.ctx.close();
}

/* ---------- short screen ---------- */
{
  const pg = await open("/typing-test/", { w: 900, h: 480 });
  const t = await prompt(pg);
  await pg.$eval("#typingKbPanel", (e) => e.scrollIntoView({ block: "center" })); await wait(150);
  const y0 = await pg.evaluate(() => scrollY);
  await pressText(pg, t.slice(0, 5));
  ck("S1. short window: all keys reachable by scrolling the PAGE, key presses do not move it", (await $v(pg, "#typing-input")) === t.slice(0, 5) && (await pg.evaluate(() => scrollY)) === y0);
  ck("S2. keyboard is not trapped in an inner scroll box", await pg.$eval("#typingKbPanel", (e) => e.scrollHeight <= e.clientHeight + 1 && getComputedStyle(e).overflowY !== "auto"));
  await pg.ctx.close();
}

/* ---------- dark / light ---------- */
{
  const ctx = await browser.createBrowserContext();
  let pg = await open("/typing-test/", { scheme: "light", ctx });
  const L = await contrast(pg);
  ck("T1. Light Mode: keys readable (glyph ≥ 4.5:1, label ≥ 4.5:1)", L.glyph >= 4.5 && L.label >= 4.5, JSON.stringify(L));
  await pg.click("#themeToggle"); await wait(150);
  const D = await contrast(pg);
  ck("T2. Dark Mode: keys readable (glyph ≥ 4.5:1, label ≥ 4.5:1) and panel really is dark", D.glyph >= 4.5 && D.label >= 4.5 && D.panelBg !== L.panelBg, JSON.stringify({ L, D }));
  ck("T3. theme choice stored", (await pg.evaluate(() => localStorage.getItem("ak-theme"))) === "dark");
  await pg.reload({ waitUntil: "load" }); await wait(300);
  ck("T4. Dark Mode persists across reload and keyboard still visible", await pg.evaluate(() => document.documentElement.dataset.theme === "dark" && document.getElementById("typingKbPanel").getBoundingClientRect().height > 100));
  const pg2 = await open("/tashkeel/", { scheme: "light", ctx });
  ck("T5. Dark Mode persists to /tashkeel/ (and back to /typing-test/)", await pg2.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await pg2.goto(O + "/typing-test/", { waitUntil: "load" }); await wait(300);
  ck("T6. …back on /typing-test/ still dark", await pg2.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await pg2.click("#themeToggle"); await wait(150);
  ck("T7. switching back to Light persists", (await pg2.evaluate(() => localStorage.getItem("ak-theme"))) === "light" && (await pg2.evaluate(() => document.documentElement.dataset.theme)) === "light");
  await ctx.close();
}

/* ---------- other pages unchanged ---------- */
{
  const pg = await open("/tashkeel/");
  const hasSwitch = await pg.$("#tashkeelKbSwitch");
  ck("R1. /tashkeel/: keyboard visible with its ON/OFF switch (ON)", !!hasSwitch && (await pg.$eval("#tashkeelKbSwitch", (e) => e.getAttribute("aria-checked"))) === "true" && await pg.$eval("#tashkeelKbPanel", (e) => !e.hidden && e.getBoundingClientRect().height > 100));
  await press(pg, "ب"); await press(pg, "ا");
  ck("R2. /tashkeel/: on-screen typing still works", (await $v(pg, "#tashkeelIn")) === "با" && /٢/.test(await text(pg, "#tashkeelCounts")));
  await press(pg, "سطر جديد");
  ck("R3. /tashkeel/: «new line» key still inserts a line break (textarea)", (await $v(pg, "#tashkeelIn")) === "با\n");
  await pg.click("#tashkeelKbSwitch"); await wait(100);
  ck("R4. /tashkeel/: switch still hides the keyboard", await pg.$eval("#tashkeelKbPanel", (e) => e.hidden));
  ck("R5. /tashkeel/: no errors", pg.errs.length === 0, pg.errs.join(" | ")); await pg.ctx.close();
  const ak = await open("/arabic-keyboard/");
  await press(ak, "م"); await press(ak, "سطر جديد"); await press(ak, "ن");
  ck("R6. /arabic-keyboard/: keyboard still types, incl. new line", (await $v(ak, "#editor")) === "م\nن");
  ck("R7. /arabic-keyboard/: no errors", ak.errs.length === 0, ak.errs.join(" | ")); await ak.ctx.close();
  const alt = await open("/arabic-typing-test/");
  ck("R8. /arabic-typing-test/: unchanged (no keyboard panel, test still works)", await alt.evaluate(() => !document.getElementById("typingKbPanel") && !document.getElementById("virtualKeyboard")));
  await alt.focus("#typing-input"); await alt.keyboard.type("ا"); await wait(100);
  ck("R9. /arabic-typing-test/: typing still starts the test", (await $v(alt, "#typing-input")) === "ا" && (await alt.$$eval("#promptText span.correct, #promptText span.wrong", (a) => a.length)) === 1);
  await alt.ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${total - bad.length}/${total} checks passed` + (bad.length ? `\nFAILED:\n - ${bad.join("\n - ")}` : ""));
process.exit(bad.length ? 1 : 0);
