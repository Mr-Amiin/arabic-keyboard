// Real-browser regression test: /calligraphy-editor/ follows the SITE theme (html[data-theme], toggled by the navbar #themeToggle).
// No editor-specific switch or storage key may exist; drawings/project data must survive a theme change; the artboard (the user's
// paper) stays white; light mode keeps its original look. Real Chromium + a local static server (no site code is mocked).
// Run:  cd tests/theme && npm install && npm run test:editor        Optional: SITE_ROOT=/other/checkout
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url"; import { launchBrowser } from "./launch-browser.mjs";
const ROOT = process.env.SITE_ROOT ? path.resolve(process.env.SITE_ROOT) : path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = 8172, O = `http://localhost:${PORT}`, KEY = "ak-theme", URL_ = "/calligraphy-editor/";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
const browser = await launchBrowser(); const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(scheme, { stored = null, w = 1280, h = 900, lang = null } = {}) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]); await pg.setViewport({ width: w, height: h });
  pg.on("dialog", d => d.accept().catch(() => { }));   // the editor asks "leave site?" (beforeunload) once there are unsaved edits
  pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message));
  pg.on("console", m => { if (m.type() === "error" && (m.location().url || "").startsWith(O)) pg.errs.push(m.text()); });
  await pg.evaluateOnNewDocument((stored, lang) => { if (sessionStorage.getItem("__seed")) return; sessionStorage.setItem("__seed", "1"); try { if (stored) localStorage.setItem("ak-theme", stored); if (lang) localStorage.setItem("ak-lang", lang); } catch (e) { } }, stored, lang);
  await pg.setRequestInterception(true); pg.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());
  await pg.goto(O + URL_, { waitUntil: "load" }); await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { }); await wait(500);
  return { ctx, pg };
}
const look = pg => pg.evaluate(() => { const c = (s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
  return { theme: document.documentElement.getAttribute("data-theme"), canvas: c("#app", "backgroundColor"), topbar: c("#top-bar", "backgroundColor"), export: c("#btn-export", "backgroundColor"), ink: c("#app", "color"), artboard: c("#artboard", "backgroundColor"), hscroll: document.documentElement.scrollWidth > innerWidth, toggles: document.querySelectorAll("#themeToggle, #app [aria-label*='theme' i], #app [class*='theme-toggle']").length }; });
const lum = c => { const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const storage = pg => pg.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

// 1. toggle light -> dark -> light through the real navbar button, with a drawing on the canvas
{
  const { ctx, pg } = await open("light"); const L = await look(pg);
  ck("light: editor surfaces are light, artboard white", L.theme === "light" && lum(L.canvas) > .75 && lum(L.topbar) > .9 && L.artboard === "rgb(255, 255, 255)", JSON.stringify(L));
  ck("exactly one theme control on the page (the navbar's), none inside the editor", L.toggles === 1, String(L.toggles));
  await pg.click('[data-tool="rectangle"]'); const bx = await (await pg.$("#artboard")).boundingBox(); const x = Math.max(bx.x, 0) + 60, y = Math.max(bx.y, 130) + 60;
  await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 90, y + 70, { steps: 5 }); await pg.mouse.up(); await wait(300);
  const scene0 = await pg.$eval("#scene", e => e.innerHTML), n0 = await pg.$eval("#scene", e => e.children.length), keys0 = await storage(pg);
  await pg.click("#themeToggle"); await pg.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark", { timeout: 2000 }); const D = await look(pg);
  ck("navbar toggle → whole editor turns dark immediately (canvas, top bar, solid buttons, text)", D.theme === "dark" && lum(D.canvas) < .15 && lum(D.topbar) < .2 && D.export !== L.export && lum(D.ink) > .75, JSON.stringify(D));
  ck("dark: artboard (user's paper) stays white", D.artboard === "rgb(255, 255, 255)");
  ck("drawing intact after the switch", n0 === 1 && (await pg.$eval("#scene", e => e.innerHTML)) === scene0);
  const keys1 = await storage(pg); const { [KEY]: t1, ...rest1 } = keys1, { [KEY]: t0, ...rest0 } = keys0;
  ck("only the site's own ak-theme key is written; project/settings keys unchanged; no editor theme key", t1 === "dark" && JSON.stringify(rest1) === JSON.stringify(rest0) && Object.keys(keys1).filter(k => /theme/i.test(k)).join() === KEY);
  await pg.goto(O + URL_, { waitUntil: "load" }); await wait(600);
  ck("reload: dark persists", (await look(pg)).theme === "dark" && lum((await look(pg)).canvas) < .15);
  await pg.click("#themeToggle"); await pg.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light"); const L2 = await look(pg);
  ck("back to light: every editor colour identical to the first light render", ["canvas", "topbar", "export", "ink", "artboard"].every(k => L2[k] === L[k]), JSON.stringify([L, L2]));
  ck("no JS errors", pg.errs.length === 0, pg.errs.join(" | ")); await ctx.close();
}
// 2. OS preference: used only when nothing is saved; a saved choice wins
for (const [scheme, stored, want] of [["dark", null, "dark"], ["light", null, "light"], ["dark", "light", "light"], ["light", "dark", "dark"]]) {
  const { ctx, pg } = await open(scheme, { stored }); const s = await look(pg);
  ck(`OS ${scheme}, saved ${stored ?? "none"} → ${want}`, s.theme === want && (lum(s.canvas) < .15) === (want === "dark"), JSON.stringify(s)); await ctx.close();
}
// 3. Arabic RTL + English LTR in both themes, and no horizontal scroll from 320px up
for (const theme of ["light", "dark"]) for (const lang of ["ar", "en"]) for (const w of [320, 390, 768, 1024, 1440]) {
  const { ctx, pg } = await open("light", { stored: theme, lang, w }); const s = await look(pg);
  const dir = await pg.evaluate(() => document.documentElement.dir), vis = await pg.evaluate(() => { const bar = document.querySelector("#top-bar .bar-right").getBoundingClientRect(); return ["#btn-export", "#btn-project"].every(i => { const r = document.querySelector(i).getBoundingClientRect(); return r.left >= bar.left - .5 && r.right <= bar.right + .5; }); });
  ck(`${theme}/${lang}/${w}px: theme applied, ${lang === "ar" ? "rtl" : "ltr"}, no horizontal scroll, Export + Project fully visible`, s.theme === theme && (lum(s.canvas) < .15) === (theme === "dark") && dir === (lang === "ar" ? "rtl" : "ltr") && !s.hscroll && vis && pg.errs.length === 0, JSON.stringify({ s, dir, vis, errs: pg.errs })); await ctx.close();
}
// 4. Dark panels are dark (no unexpected white backgrounds) and readable
{
  const { ctx, pg } = await open("light", { stored: "dark" });
  const res = []; for (const t of ["#btn-export", "#btn-project", '[data-tool="decoration"]', '[data-tool="color"]']) {
    await pg.click(t); await wait(450);
    res.push(await pg.evaluate(() => { const p = [...document.querySelectorAll("#app .floating-panel, #app .ctx-popover")].find(e => !e.hidden && e.getBoundingClientRect().width > 50); if (!p) return null; const cs = getComputedStyle(p); return { bg: cs.backgroundColor, fg: cs.color }; }));
    await pg.keyboard.press("Escape"); await wait(200);
  }
  ck("dark: export / project / library / colour panels have dark backgrounds and light text", res.every(r => r && lum(r.bg) < .2 && lum(r.fg) > .7), JSON.stringify(res)); await ctx.close();
}
await browser.close(); srv.close();
console.log(`\n${total - bad.length}/${total} checks passed` + (bad.length ? `\nFAILED:\n - ${[...new Set(bad)].join("\n - ")}` : ""));
process.exit(bad.length ? 1 : 0);
