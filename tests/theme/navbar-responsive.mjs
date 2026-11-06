// Real-browser regression test: the shared navbar is responsive in the SAME way on every page, including /calligraphy-editor/.
// Site convention (assets/css/styles.css): <=860px -> hamburger shown, desktop links hidden; >=861px -> desktop links shown,
// hamburger hidden; the #mobileNav drawer is only ever visible while open. Regression guard for editor.css leaking `.icon-btn`
// rules (display:inline-flex, 34px, borderless) onto the header's hamburger/theme/close buttons.
// Run:  cd tests/theme && npm install && npm run test:navbar        Optional: SITE_ROOT=/other/checkout
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url"; import { launchBrowser } from "./launch-browser.mjs";
const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 8173, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
const browser = await launchBrowser(); const wait = ms => new Promise(r => setTimeout(r, ms));
const BREAKPOINT = 860;   // styles.css: @media (max-width:860px) { nav.primary{display:none} .hamburger{display:flex} }
const PAGES = ["/", "/tashkeel/", "/translation/", "/learn-arabic/", "/calligraphy-editor/"];
const WIDTHS = [320, 390, 768, 860, 861, 900, 1024, 1440];

async function open(url, { w, theme = "light", lang = "ar", mobile = false }) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  await pg.setViewport({ width: w, height: 800, isMobile: mobile, hasTouch: mobile });
  pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message)); pg.on("dialog", d => d.accept().catch(() => { }));
  await pg.evaluateOnNewDocument((t, l) => { try { localStorage.setItem("ak-theme", t); localStorage.setItem("ak-lang", l); } catch (e) { } }, theme, lang);
  await pg.setRequestInterception(true); pg.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());
  await pg.goto(O + url, { waitUntil: "load" }); await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { }); await wait(300);
  return { ctx, pg };
}
const vis = pg => pg.evaluate(() => { const d = s => { const e = document.querySelector(s); if (!e) return "missing"; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display === "none" || c.visibility === "hidden" || r.width === 0 ? "hidden" : "visible"; };
  return { hamburger: d("#menuToggle"), links: d("header.site nav.primary"), drawer: d("#mobileNav"), theme: d("#themeToggle"), hscroll: document.documentElement.scrollWidth > innerWidth }; });

// 1. visibility matrix: every page, every width, both themes and languages (sampled together to keep the run short)
for (const url of PAGES) for (const w of WIDTHS) for (const [theme, lang] of [["light", "ar"], ["dark", "en"]]) {
  const { ctx, pg } = await open(url, { w, theme, lang }); const v = await vis(pg); const mobile = w <= BREAKPOINT;
  ck(`${url} ${w}px ${theme}/${lang}: ${mobile ? "hamburger shown, desktop links + drawer hidden" : "desktop links shown, hamburger + drawer hidden"}`,
    v.hamburger === (mobile ? "visible" : "hidden") && v.links === (mobile ? "hidden" : "visible") && v.drawer === "hidden" && v.theme === "visible" && !v.hscroll && pg.errs.length === 0, JSON.stringify({ v, errs: pg.errs }));
  await ctx.close();
}

// 2. header buttons look identical on the editor page and on a normal site page (no editor.css leakage)
{
  const style = pg => pg.evaluate(() => ["#themeToggle", "#menuToggle", "#mobileNavClose"].map(s => { const c = getComputedStyle(document.querySelector(s)); return [c.width, c.height, c.borderTopWidth, c.borderTopStyle, c.borderTopColor, c.backgroundColor, c.borderRadius].join("|"); }));
  for (const theme of ["light", "dark"]) {
    const a = await open("/tashkeel/", { w: 1280, theme }), b = await open("/calligraphy-editor/", { w: 1280, theme });
    const sa = await style(a.pg), sb = await style(b.pg);
    ck(`${theme}: theme toggle / hamburger / drawer-close have the site's own styling on the editor page`, JSON.stringify(sa) === JSON.stringify(sb), JSON.stringify([sa, sb]));
    await a.ctx.close(); await b.ctx.close();
  }
}

// 3. the editor's OWN icon buttons are untouched (still 34px, borderless, inside #app)
{
  const { ctx, pg } = await open("/calligraphy-editor/", { w: 1280 });
  const s = await pg.evaluate(() => { const c = getComputedStyle(document.querySelector("#app #btn-menu")); return [c.width, c.height, c.borderTopWidth, c.display].join("|"); });
  ck("editor toolbar icon buttons keep their own 34px borderless style", s === "34px|34px|0px|flex" || s === "34px|34px|0px|inline-flex", s); await ctx.close();
}

// 4. mobile drawer works: open, close via button / Escape / backdrop, on a normal page and on the editor, both languages
for (const url of ["/tashkeel/", "/calligraphy-editor/"]) for (const lang of ["ar", "en"]) {
  const { ctx, pg } = await open(url, { w: 390, lang, mobile: true }); const open_ = () => pg.evaluate(() => document.getElementById("mobileNav").classList.contains("open"));
  const state = () => pg.evaluate(() => ({ open: document.getElementById("mobileNav").classList.contains("open"), aria: document.getElementById("mobileNav").getAttribute("aria-hidden"), overflow: document.body.style.overflow, shown: getComputedStyle(document.getElementById("mobileNav")).display !== "none" }));
  await pg.click("#menuToggle"); await wait(200); let s = await state();
  ck(`${url} ${lang}: hamburger opens the drawer (visible, aria-hidden=false, body scroll locked)`, s.open && s.aria === "false" && s.shown && s.overflow === "hidden", JSON.stringify(s));
  const links = await pg.evaluate(() => [...document.querySelectorAll("#mobileNav a")].filter(a => a.getBoundingClientRect().width > 0).length);
  ck(`${url} ${lang}: drawer lists the navigation links`, links >= 10, String(links));
  await pg.click("#mobileNavClose"); await wait(200); s = await state();
  ck(`${url} ${lang}: close button closes it (hidden, aria-hidden=true, scroll restored)`, !s.open && s.aria === "true" && !s.shown && s.overflow === "", JSON.stringify(s));
  await pg.click("#menuToggle"); await wait(150); await pg.keyboard.press("Escape"); await wait(200);
  ck(`${url} ${lang}: Escape closes it`, !(await open_()));
  await pg.click("#menuToggle"); await wait(150); await pg.mouse.click(lang === "ar" ? 370 : 10, 700); await wait(200);   // the drawer panel is 320px wide, on the left in Arabic and the right in English
  ck(`${url} ${lang}: tapping the backdrop closes it`, !(await open_()));
  await pg.click("#menuToggle"); await wait(150);
  const sw = await pg.evaluate(() => [...document.querySelectorAll("#mobileNav .lang-switch")].filter(e => e.getBoundingClientRect().width > 0).length);
  ck(`${url} ${lang}: exactly one language switcher is reachable on mobile (inside the drawer)`, sw === 1, String(sw));
  await pg.click(`#mobileNav .lang-opt[data-lang="${lang === "ar" ? "en" : "ar"}"]`); await wait(500);
  ck(`${url} ${lang}: switching language from the drawer works`, (await pg.evaluate(() => document.documentElement.lang)) === (lang === "ar" ? "en" : "ar") && pg.errs.length === 0, pg.errs.join("|"));
  await ctx.close();
}

// 5. keyboard: the hamburger is focusable with a visible ring on mobile; on desktop it is not reachable at all
{
  const { ctx, pg } = await open("/calligraphy-editor/", { w: 390 });
  await pg.focus("#menuToggle"); await pg.keyboard.press("Enter"); await wait(200);
  ck("mobile: Enter on the focused hamburger opens the drawer", await pg.evaluate(() => document.getElementById("mobileNav").classList.contains("open"))); await ctx.close();
}
for (const url of ["/tashkeel/", "/calligraphy-editor/"]) {
  const { ctx, pg } = await open(url, { w: 1440 }); const seen = [];
  for (let i = 0; i < 40; i++) { await pg.keyboard.press("Tab"); seen.push(await pg.evaluate(() => document.activeElement?.id || "")); }
  ck(`${url} desktop: Tab never lands on the hidden hamburger`, !seen.includes("menuToggle") && seen.includes("themeToggle"), seen.join(",")); await ctx.close();
}
{
  const { ctx, pg } = await open("/calligraphy-editor/", { w: 390 });
  await pg.keyboard.press("Tab"); let hit = false; for (let i = 0; i < 20 && !hit; i++) { hit = await pg.evaluate(() => document.activeElement?.id === "menuToggle"); if (!hit) await pg.keyboard.press("Tab"); }
  const ring = await pg.evaluate(() => { const c = getComputedStyle(document.getElementById("menuToggle")); return { w: parseFloat(c.outlineWidth), style: c.outlineStyle, shadow: c.boxShadow }; });
  ck("mobile: Tab reaches the hamburger and it shows a focus indicator", hit && ((ring.style !== "none" && ring.w > 0) || ring.shadow !== "none"), JSON.stringify(ring)); await ctx.close();
}

// 6. focus rings: header controls on the editor page use the site's gold ring; the editor's own buttons keep their blue ring
for (const theme of ["light", "dark"]) {
  const { ctx, pg } = await open("/calligraphy-editor/", { w: 1440, theme });
  const ring = async sel => { await pg.focus("body"); await pg.evaluate(() => document.activeElement?.blur()); await pg.keyboard.press("Tab"); await pg.evaluate(s => document.querySelector(s).focus({ focusVisible: true }), sel); return pg.evaluate(s => { const e = document.querySelector(s), c = getComputedStyle(e); return { fv: e.matches(":focus-visible"), style: c.outlineStyle, w: c.outlineWidth, color: c.outlineColor }; }, sel); };
  const h = await ring("#themeToggle"), l = await ring("header.site nav.primary > .nav-item > a"), e = await ring("#app #btn-export");
  ck(`${theme}: site header controls on the editor page show the site's 3px focus ring`, h.fv && h.style === "solid" && h.w === "3px" && l.style === "solid" && l.w === "3px", JSON.stringify([h, l]));
  ck(`${theme}: the editor's own buttons keep their 2px ring`, e.fv && e.style === "solid" && e.w === "2px", JSON.stringify(e)); await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n${total - bad.length}/${total} checks passed` + (bad.length ? `\nFAILED:\n - ${[...new Set(bad)].join("\n - ")}` : ""));
process.exit(bad.length ? 1 : 0);
