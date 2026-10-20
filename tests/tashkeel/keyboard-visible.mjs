// Virtual keyboard visibility / input regression test (real Chromium, local HTTP server + file://).
// Run:  cd tests/tashkeel && npm install && npm run keyboard
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const ROOT = path.resolve(new URL("../..", import.meta.url).pathname), PORT = 8161, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
const browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open(url, w, h, scheme = "light") { const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); await pg.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]); await pg.setViewport({ width: w, height: h }); pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message)); pg.ctx = ctx; await pg.goto(url, { waitUntil: "load" }); await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { }); await wait(350); return pg; }
// Every Arabic letter key has size, is not covered, and lies fully inside the keyboard panel's visible box (no hidden inner scrolling).
const audit = pg => pg.evaluate(() => {
  const vk = document.querySelector("#virtualKeyboard"), panel = vk.closest(".kb-panel"), pr = panel.getBoundingClientRect();
  const keys = [...vk.querySelectorAll(".key")], letters = keys.filter(k => /^[\u0621-\u064A]$/.test(((k.querySelector(".key-main") || {}).textContent || "").trim()));
  let tiny = 0, clipped = 0, covered = 0;
  for (const k of letters) { const r = k.getBoundingClientRect(); if (r.width < 8 || r.height < 8) tiny++; if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) clipped++;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cy >= 0 && cy < innerHeight && cx >= 0 && cx < innerWidth) { const el = document.elementFromPoint(cx, cy); if (el && !k.contains(el) && !el.contains(k)) covered++; } }
  return { keys: keys.length, letters: letters.length, tiny, clipped, covered, innerScroll: panel.scrollHeight - panel.clientHeight, bodyVisible: getComputedStyle(document.body).visibility === "visible", lang: document.documentElement.lang };
});
const typeCheck = async pg => { await pg.evaluate(() => { const e = document.querySelector("#editor"); e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector("#modeKeyboard").click(); });
  const want = await pg.evaluate(() => { const ks = [...document.querySelectorAll("#virtualKeyboard .key")].filter(k => /^[\u0621-\u064A]$/.test(((k.querySelector(".key-main") || {}).textContent || "").trim())).slice(0, 3); window.__ks = ks; return ks.map(k => k.querySelector(".key-main").textContent).join(""); });
  if (!want) return ["(no Arabic keys were rendered)", ""];
  for (let i = 0; i < 3; i++) await pg.evaluate(i => window.__ks[i].click(), i); return [want, await pg.$eval("#editor", e => e.value)]; };

/* 0. package completeness: every local script / stylesheet / icon / manifest referenced by any page exists on disk,
      and the homepage opened from file:// (like double-clicking index.html) makes no failed local requests.
      (A ZIP that omits unchanged files leaves the keyboard unbuilt: keyboard-tool.js / home-init.js missing.) */
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === "node_modules" || e.name === ".git" || e.name === "site" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".html") ? [path.join(d, e.name)] : []);
const missingRefs = [];
for (const f of walk(ROOT)) { const html = fs.readFileSync(f, "utf8");
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"#?]+)"/g)) { const u = m[1]; if (/^(https?:|data:|mailto:|\/\/)/.test(u) || u.endsWith("/")) continue; if (!fs.existsSync(path.resolve(path.dirname(f), u))) missingRefs.push(path.relative(ROOT, f) + " -> " + u); } }
ck("0a. every local asset referenced by every page exists in this folder (complete package)", missingRefs.length === 0, [...new Set(missingRefs)].slice(0, 6).join(" ; "));
{ const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 1024 }); const failed = []; p.on("requestfailed", r => { if (r.url().startsWith("file:")) failed.push(r.url().split("/").slice(-2).join("/")); });
  await p.goto("file://" + ROOT + "/index.html", { waitUntil: "load" }); await wait(600);
  ck("0b. homepage from file://: no failed local requests (all scripts loaded)", failed.length === 0, failed.join(", "));
  const a2 = await audit(p); const [w2, g2] = await typeCheck(p);
  ck("0c. homepage 1280x1024 from file://: >=28 Arabic keys rendered, nonzero size, not clipped, typing works", a2.letters >= 28 && a2.tiny === 0 && a2.clipped === 0 && a2.covered === 0 && g2 === w2, JSON.stringify(a2) + g2);
  await p.evaluate(() => document.querySelector(".tool-card").scrollIntoView({ block: "start" })); await wait(200);
  await p.screenshot({ path: process.env.KB_SHOT || "/tmp/keyboard-1280x1024.png" }); await ctx.close(); }

/* 1. every viewport x language x theme: all letter keys rendered, sized, uncovered, fully inside the panel (no inner scrolling) */
const VIEWPORTS = [[320, 568], [390, 844], [768, 1024], [844, 390], [900, 500], [1024, 768], [1280, 300], [1280, 420], [1366, 600], [1440, 900], [1920, 1080]];
const probs = [];
for (const scheme of ["light", "dark"]) for (const lang of ["ar", "en"]) for (const [w, h] of VIEWPORTS) {
  const pg = await open(O + "/?lang=" + lang, w, h, scheme); const a = await audit(pg); const [want, got] = await typeCheck(pg);
  if (!(a.keys >= 70 && a.letters >= 28 && a.tiny === 0 && a.clipped === 0 && a.covered === 0 && a.innerScroll <= 0 && a.bodyVisible && a.lang === lang && want.length === 3 && got === want && pg.errs.length === 0)) probs.push(`${scheme} ${lang} ${w}x${h} ${JSON.stringify(a)} typed=${got}/${want} ${pg.errs}`);
  await pg.ctx.close();
}
ck(`1. ${VIEWPORTS.length * 4} combinations (viewport x ar/en x light/dark): keys visible, uncovered, not clipped, and clicking 3 keys types the right Arabic letters`, probs.length === 0, probs.slice(0, 3).join(" ;; "));

/* 2. the page the screenshot shows: homepage, first visit, Arabic default, then switching languages / modes */
let pg = await open(O + "/", 1280, 900); let a = await audit(pg);
ck("2a. homepage, first visit: Arabic default, virtual keyboard selected and fully rendered", a.lang === "ar" && a.letters >= 28 && a.clipped === 0 && await pg.$eval("#modeKeyboard", e => e.getAttribute("aria-selected")) === "true", JSON.stringify(a));
const steps = [["English", '.lang-switch .lang-opt[data-lang="en"]'], ["transliteration mode", "#modeTranslit"], ["virtual keyboard mode", "#modeKeyboard"], ["Arabic", '.lang-switch .lang-opt[data-lang="ar"]'], ["transliteration mode", "#modeTranslit"], ["English (while in transliteration)", '.lang-switch .lang-opt[data-lang="en"]'], ["virtual keyboard mode", "#modeKeyboard"]];
let seqOk = true, seqDetail = [];
for (const [name, sel] of steps) { await pg.evaluate(s => document.querySelector(s).click(), sel); await wait(450); const s = await audit(pg); const [want, got] = await typeCheck(pg); const ok = s.letters >= 28 && s.clipped === 0 && s.covered === 0 && got === want; if (!ok) { seqOk = false; seqDetail.push(name + " " + JSON.stringify(s)); } }
ck("2b. after each of: English, transliteration, keyboard, Arabic, transliteration, English, keyboard — keys stay rendered and typing works", seqOk && pg.errs.length === 0, seqDetail.join(" | ") + pg.errs);
await pg.reload({ waitUntil: "load" }); await wait(600); a = await audit(pg);
ck("2c. reload with the saved preference: keyboard still rendered", a.letters >= 28 && a.clipped === 0, JSON.stringify(a)); await pg.ctx.close();

/* 3. same page with every script delayed at random (init-timing conflicts), both languages */
const tp = []; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (const lang of ["ar", "en"]) for (let i = 0; i < 6; i++) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 900 }); p.errs = []; p.on("pageerror", e => p.errs.push(e.message));
  await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (!u.startsWith(O)) return r.abort(); if (/\.js$/.test(u) && !/tashkeel|vendor/.test(u)) setTimeout(() => { try { r.continue(); } catch (e) { } }, Math.floor(rnd() * 900)); else r.continue(); });
  await p.goto(O + "/?lang=" + lang, { waitUntil: "load" }); await p.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { }); await wait(500);
  const s = await audit(p); if (!(s.letters >= 28 && s.clipped === 0 && s.lang === lang && p.errs.length === 0)) tp.push(lang + i + JSON.stringify(s) + p.errs); await ctx.close();
}
ck("3. random script-load delays (12 runs, ar + en): keyboard always initialises", tp.length === 0, tp.join(" | "));

/* 4. file:// (local file) behaves the same as HTTP */
for (const lang of ["ar", "en"]) { const p = await open("file://" + ROOT + "/index.html?lang=" + lang, 1280, 900); const s = await audit(p); const [want, got] = await typeCheck(p);
  ck(`4. file:// homepage (${lang}): keyboard rendered and typing works`, s.letters >= 28 && s.clipped === 0 && s.lang === lang && got === want && p.errs.length === 0, JSON.stringify(s) + got + p.errs); await p.ctx.close(); }

/* 5. other routes that contain the keyboard / keep working */
for (const u of ["/arabic-keyboard/", "/transliteration/", "/tashkeel/", "/calligraphy-editor/"]) for (const lang of ["ar", "en"]) {
  const p = await open(O + u + "?lang=" + lang, 1280, 900);
  let ok = p.errs.length === 0;
  if (u === "/arabic-keyboard/") { const s = await audit(p); const [w, g] = await typeCheck(p); ok = ok && s.letters >= 28 && s.clipped === 0 && g === w; }
  if (u === "/transliteration/") { await p.type("#translitInput", "salam"); ok = ok && /[\u0600-\u06FF]{3}/.test(await p.$eval("#translitOutput", e => e.textContent)); }
  if (u === "/tashkeel/") ok = ok && !!(await p.$("#tashkeelRun"));
  if (u === "/calligraphy-editor/") ok = ok && !!(await p.$("#top-bar .lang-switch")) && !!(await p.$("#scene"));
  ck(`5. ${u} (${lang}) loads and works`, ok, p.errs.join("|")); await p.ctx.close();
}


console.log(`\nKEYBOARD: ${total - bad.length}/${total} passed` + (bad.length ? "\nFAILED: " + bad.join("; ") : ""));
await browser.close(); srv.close(); process.exit(bad.length ? 1 : 0);
