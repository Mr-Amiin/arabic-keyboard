// Real-browser regression test: the dark/light theme choice persists across pages, refreshes, direct loads, tabs and
// layouts, and is applied BEFORE first paint. Real Chromium + a local static HTTP server (no site code is mocked).
// Run:  cd tests/theme && npm install && npm test        Optional: SITE_ROOT=/other/checkout npm test
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url"; import { KnownDevices } from "puppeteer-core"; import { launchBrowser } from "./launch-browser.mjs";
const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 8171, O = `http://localhost:${PORT}`, KEY = "ak-theme";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; lastCheck = n; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
let lastOp = "(none yet)", lastCheck = "(none yet)";   // reported if the run aborts, so a hang names the exact operation
process.on("uncaughtException", async e => { console.error(`\nABORTED: ${e.message}\n  last operation: ${lastOp}\n  last check recorded: ${lastCheck}\n  checks recorded before the abort: ${total}`); try { await browser.close(); } catch { } try { srv.close(); } catch { } process.exit(2); });
const browser = await launchBrowser();
const wait = ms => new Promise(r => setTimeout(r, ms));

// Every page that has the shared header + #themeToggle.
const PAGES = ["/", "/arabic-keyboard/", "/tashkeel/", "/editor/", "/translation/", "/learn-arabic/", "/tools/", "/typing-test/", "/arabic-typing-test/", "/arabic-alphabet/", "/transliteration/", "/faq/", "/about/", "/contact/", "/privacy/", "/terms/"];
const SAMPLE = ["/", "/arabic-keyboard/", "/tashkeel/", "/translation/", "/learn-arabic/", "/editor/"];   // the pages named in the task

// A fresh browser context = empty localStorage; `scheme` is the emulated OS preference.
async function newCtx() { return browser.createBrowserContext(); }
// Opens a page in `ctx`. Records every write of <html data-theme> (value + whether <body> existed yet) so the test can prove
// the theme was set before anything could paint. `breakStorage` makes localStorage throw (private-mode style).
async function open(ctx, url, { scheme = "light", device = null, breakStorage = false, w = 1280, h = 900 } = {}) {
  const pg = await ctx.newPage();
  await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  if (device) await pg.emulate(KnownDevices[device]); else await pg.setViewport({ width: w, height: h });
  pg.errs = []; lastOp = `open ${url}`;
  pg.on("pageerror", e => pg.errs.push("pageerror: " + e.message));
  pg.on("console", m => { if (m.type() === "error" && (m.location().url || "").startsWith(O)) pg.errs.push("console.error: " + m.text()); });
  await pg.evaluateOnNewDocument((breakStorage) => {
    window.__themeWrites = [];
    const orig = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (this === document.documentElement && n === "data-theme") window.__themeWrites.push({ v, bodyExisted: !!document.body, state: document.readyState });
      return orig.call(this, n, v);
    };
    if (breakStorage) { const boom = () => { throw new DOMException("blocked", "SecurityError"); }; Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; }
  }, breakStorage);
  await pg.setRequestInterception(true); pg.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());   // no Google Fonts / AdSense / GA
  await pg.goto(O + url, { waitUntil: "load" });
  await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { });
  await wait(150); return pg;
}
const state = pg => pg.evaluate((KEY) => ({
  attr: document.documentElement.getAttribute("data-theme"),
  stored: (() => { try { return localStorage.getItem(KEY); } catch (e) { return "ERR"; } })(),
  pressed: document.getElementById("themeToggle")?.getAttribute("aria-pressed"),
  icon: document.getElementById("themeToggle")?.textContent.trim(),
  bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toLowerCase(),
  writes: window.__themeWrites || []
}), KEY);
// What --bg resolves to for each theme (read from the real stylesheet, so the test does not hard-code colours).
async function refColors(ctx) {
  const pg = await open(ctx, "/"); const r = await pg.evaluate(() => { const o = {}; for (const t of ["light", "dark"]) { document.documentElement.setAttribute("data-theme", t); o[t] = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toLowerCase(); } return o; });
  await pg.close(); return r;
}
// A real mouse click needs the tab to be the visible one: Puppeteer's click first waits for an IntersectionObserver callback, which
// only fires in a tab that is being rendered. A newer tab hides the older ones in real Chrome (the cross-tab test below), so a click
// on a background tab would otherwise hang until "Runtime.callFunctionOn timed out". Bring the tab to the front first.
const click = async pg => { lastOp = `click #themeToggle on ${pg.url()}`; await pg.bringToFront(); await pg.click("#themeToggle"); await wait(80); };
// Full assertion for one loaded page: right theme, button in sync, real stylesheet colours, and set before <body> existed with no wrong value ever applied.
async function expectTheme(pg, want, ref, label) {
  const s = await state(pg);
  ck(`${label}: data-theme=${want}`, s.attr === want, `got ${s.attr}`);
  ck(`${label}: stylesheet resolves ${want} colours`, s.bg === ref[want] && ref.light !== ref.dark, `bg ${s.bg}`);
  ck(`${label}: toggle button in sync`, s.pressed === String(want === "dark") && s.icon === (want === "dark" ? "☀️" : "🌙"), `${s.pressed}/${s.icon}`);
  ck(`${label}: applied before first paint (first write before <body>, never a wrong value)`, s.writes.length > 0 && s.writes[0].v === want && s.writes[0].bodyExisted === false && s.writes.every(w => w.v === want), JSON.stringify(s.writes));
  ck(`${label}: no page errors`, pg.errs.length === 0, pg.errs.join(" | "));
}

// ---------------------------------------------------------------- A. both directions, desktop and mobile
const ctx0 = await newCtx(); const ref = await refColors(ctx0); await ctx0.close();
for (const layout of [{ name: "desktop", opts: {} }, { name: "mobile (iPhone 13)", opts: { device: "iPhone 13" } }]) {
  for (const want of ["dark", "light"]) {
    const other = want === "dark" ? "light" : "dark";
    const L = `${layout.name} / choose ${want}`;
    console.log(`\n== ${L}  (OS preference = ${other}, so only the saved choice can produce ${want})`);
    const ctx = await newCtx();
    let pg = await open(ctx, "/", { scheme: other, ...layout.opts });
    await expectTheme(pg, other, ref, `${L} / default home (no choice yet)`);
    ck(`${L}: nothing stored before an explicit choice`, (await state(pg)).stored === null);
    await click(pg);
    { const s = await state(pg); ck(`${L}: click switches page to ${want} immediately`, s.attr === want && s.bg === ref[want] && s.pressed === String(want === "dark"), JSON.stringify([s.attr, s.pressed])); }
    ck(`${L}: choice stored`, (await state(pg)).stored === want);
    // navigate through several pages (full page loads) in the SAME tab
    for (const url of PAGES) {
      await pg.goto(O + url, { waitUntil: "load" }); await wait(120);
      const s = await state(pg);
      ck(`${L} / navigate ${url}: ${want}`, s.attr === want && s.bg === ref[want] && s.pressed === String(want === "dark") && s.stored === want, JSON.stringify({ a: s.attr, st: s.stored }));
    }
    // real link-click navigation (desktop header nav; on mobile the nav lives in the hamburger menu)
    if (layout.name === "desktop") {
      await pg.goto(O + "/", { waitUntil: "load" }); await wait(120);
      const link = (await pg.evaluateHandle(() => [...document.querySelectorAll("header a[href]")].find(a => /tashkeel/.test(a.getAttribute("href")) && a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility !== "hidden"))).asElement();
      if (link) { await Promise.all([pg.waitForNavigation({ waitUntil: "load" }), link.click()]); await wait(120); ck(`${L} / click nav link to Tashkeel keeps ${want}`, (await state(pg)).attr === want && pg.url().includes("/tashkeel/")); }
      else ck(`${L} / header link to Tashkeel found`, false);
    }
    // refresh + back/forward
    await pg.goto(O + "/tashkeel/", { waitUntil: "load" }); await pg.reload({ waitUntil: "load" }); await wait(120);
    await expectTheme(pg, want, ref, `${L} / after refresh`);
    await pg.goBack({ waitUntil: "load" }); await wait(150);
    ck(`${L} / after Back: ${want}`, (await state(pg)).attr === want);
    await pg.goForward({ waitUntil: "load" }); await wait(150);
    ck(`${L} / after Forward: ${want}`, (await state(pg)).attr === want);
    await pg.close();
    // open pages directly in a brand-new tab of the same browser profile, with the OS preference still the OTHER theme
    for (const url of SAMPLE) {
      const direct = await open(ctx, url, { scheme: other, ...layout.opts });
      await expectTheme(direct, want, ref, `${L} / direct open ${url}`); await direct.close();
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------- B. repeated toggling (desktop + mobile)
for (const layout of [{ name: "desktop", opts: {} }, { name: "mobile (Pixel 5)", opts: { device: "Pixel 5" } }]) {
  console.log(`\n== repeated toggling, ${layout.name}`);
  const ctx = await newCtx(); let pg = await open(ctx, "/tashkeel/", { scheme: "light", ...layout.opts }); let cur = "light", okAll = true, why = "";
  for (let i = 1; i <= 9; i++) {
    await click(pg); cur = cur === "dark" ? "light" : "dark"; const s = await state(pg);
    if (!(s.attr === cur && s.stored === cur && s.pressed === String(cur === "dark"))) { okAll = false; why += ` #${i}:${s.attr}/${s.stored}`; }
    if (i % 3 === 0) { await pg.goto(O + PAGES[i % PAGES.length], { waitUntil: "load" }); await wait(100); const t = await state(pg); if (t.attr !== cur) { okAll = false; why += ` nav#${i}:${t.attr}`; } }
  }
  ck(`${layout.name}: 9 toggles keep DOM, storage and button in sync (and survive navigation in between)`, okAll, why);
  ck(`${layout.name}: toggle ends on ${cur}`, cur === "dark");
  await pg.close(); const fresh = await open(ctx, "/learn-arabic/", { scheme: "light", ...layout.opts }); await expectTheme(fresh, cur, ref, `${layout.name}: last choice (${cur}) on a new tab`); await ctx.close();
}

// ---------------------------------------------------------------- C. defaults / safety
console.log("\n== defaults and safety");
for (const scheme of ["dark", "light"]) {
  const ctx = await newCtx(); let allOk = true, why = "";
  for (const url of PAGES) { const pg = await open(ctx, url, { scheme }); const s = await state(pg); if (!(s.attr === scheme && s.stored === null && s.writes.length && s.writes[0].v === scheme && !s.writes[0].bodyExisted && s.writes.every(w => w.v === scheme))) { allOk = false; why += ` ${url}:${s.attr}/${s.stored}`; } await pg.close(); }
  ck(`no saved choice + OS ${scheme}: every page follows the OS (pre-paint), and nothing is written to storage`, allOk, why); await ctx.close();
}
{ // explicit choice beats the OS preference, even if the OS preference later changes
  const ctx = await newCtx(); let pg = await open(ctx, "/", { scheme: "dark" }); await click(pg); // dark -> light
  await pg.close(); pg = await open(ctx, "/faq/", { scheme: "dark" }); ck("explicit Light choice wins over OS=dark", (await state(pg)).attr === "light"); await pg.close(); await ctx.close();
}
{ // invalid stored value is ignored (falls back to OS), not crash
  const ctx = await newCtx(); let pg = await open(ctx, "/", { scheme: "dark" }); await pg.evaluate(k => localStorage.setItem(k, "purple"), KEY); await pg.close();
  pg = await open(ctx, "/about/", { scheme: "dark" }); const s = await state(pg); ck("invalid stored value ignored -> OS preference, no errors", s.attr === "dark" && pg.errs.length === 0, JSON.stringify(s.attr));
  await click(pg); ck("…and the toggle then overwrites it with a valid value", (await state(pg)).stored === "light"); await pg.close(); await ctx.close();
}
{ // storage blocked: page still renders, toggle still works for this page, no uncaught errors
  const ctx = await newCtx(); const pg = await open(ctx, "/", { scheme: "light", breakStorage: true });
  ck("storage blocked: page loads without errors, OS theme applied", (await state(pg).catch(() => ({ attr: null }))).attr === "light" && pg.errs.length === 0, pg.errs.join(" | "));
  await click(pg); ck("storage blocked: toggle still switches this page", (await pg.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark" && pg.errs.length === 0, pg.errs.join(" | ")); await pg.close(); await ctx.close();
}
{ // two tabs of one profile stay in step (storage event)
  const ctx = await newCtx(); const a = await open(ctx, "/", { scheme: "light" }); const b = await open(ctx, "/faq/", { scheme: "light" });
  await click(a); await wait(250); ck("other open tab follows the toggle live", (await state(b)).attr === "dark" && (await state(b)).pressed === "true");
  await click(b); await wait(250); ck("…and back", (await state(a)).attr === "light"); await a.close(); await b.close(); await ctx.close();
}
{ // out of scope but must not break: the calligraphy editor has no theme system / toggle of its own
  const ctx = await newCtx(); const pg = await open(ctx, "/", { scheme: "light" }); await click(pg); await pg.goto(O + "/calligraphy-editor/", { waitUntil: "load" }); await wait(500);
  ck("calligraphy editor loads with no page errors while Dark is saved", pg.errs.length === 0, pg.errs.join(" | ")); await pg.close(); await ctx.close();
}

// ---------------------------------------------------------------- D. regressions: language switch + service worker
console.log("\n== language switching and service worker");
{
  const ctx = await newCtx(); const pg = await open(ctx, "/tashkeel/", { scheme: "light" }); await click(pg);   // Dark
  await pg.click('.lang-switch .lang-opt[data-lang="en"]'); await wait(600);
  let s = await state(pg); ck("switching language to English keeps Dark", s.attr === "dark" && (await pg.evaluate(() => localStorage.getItem("ak-lang"))) === "en");
  await pg.goto(O + "/translation/", { waitUntil: "load" }); await wait(600); s = await state(pg); ck("English + Dark persist on the next page", s.attr === "dark" && (await pg.evaluate(() => document.documentElement.lang)) === "en", JSON.stringify([s.attr]));
  await click(pg); await pg.click('.lang-switch .lang-opt[data-lang="ar"]'); await wait(600); s = await state(pg); ck("Light + switching back to Arabic coexist", s.attr === "light" && s.stored === "light" && pg.errs.length === 0, pg.errs.join(" | ")); await pg.close(); await ctx.close();
}
{
  const ctx = await newCtx(); let pg = await open(ctx, "/", { scheme: "light" });
  const sw = await pg.evaluate(async () => { try { const r = await navigator.serviceWorker.ready; return !!r.active; } catch (e) { return false; } });
  ck("service worker registers and activates", sw); await click(pg);   // Dark
  await pg.reload({ waitUntil: "load" }); await wait(300);   // now controlled by the SW -> pages/scripts come from its cache
  const controlled = await pg.evaluate(() => !!navigator.serviceWorker.controller); ck("page is controlled by the service worker", controlled);
  for (const url of ["/tashkeel/", "/arabic-keyboard/", "/faq/"]) { await pg.goto(O + url, { waitUntil: "load" }); await wait(150); const s = await state(pg); ck(`SW-served ${url}: Dark persists, no errors`, s.attr === "dark" && s.bg === ref.dark && pg.errs.length === 0, pg.errs.join(" | ")); }
  const cached = await pg.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys.find(k => /shell/.test(k))); return !!(await c.match("/assets/js/theme-init.js")); }); ck("theme-init.js is in the offline shell cache", cached);
  await pg.close(); await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${total - bad.length}/${total} checks passed` + (bad.length ? `\nFAILED:\n - ${[...new Set(bad)].join("\n - ")}` : ""));
process.exit(bad.length ? 1 : 0);
