// Language-switcher (Arabic default / English optional) browser test.
// Run:  cd tests/tashkeel && npm install && npm run i18n
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname), PORT = 8131, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, O).pathname), f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
}).listen(PORT);

const results = []; const bad = [];
const ck = (n, ok, d = "") => { results.push(ok); if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
const browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote/.test(a)), "--no-sandbox", "--lang=en-US"], executablePath: await chromium.executablePath(), headless: "shell" });
const PAGES = ["/", "/arabic-keyboard/", "/transliteration/", "/tashkeel/", "/translation/", "/editor/", "/typing-test/", "/arabic-typing-test/", "/arabic-alphabet/", "/learn-arabic/", "/tools/", "/faq/", "/about/", "/contact/", "/privacy/", "/terms/"];

async function fresh(w = 1280, h = 900) {            // brand-new visitor: empty storage
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: h });
  pg.reqs = []; pg.on("request", r => pg.reqs.push(r.url())); pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message));
  await pg.setRequestInterception(true); pg.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());
  pg.ctx = ctx; return pg;
}
const go = (pg, u) => pg.goto(O + u, { waitUntil: "load" });
const state = (pg) => pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, stored: localStorage.getItem("ak-lang"), pressed: [...document.querySelectorAll(".lang-switch .lang-opt[aria-pressed=true]")].map(b => b.dataset.lang).filter((v, i, a) => a.indexOf(v) === i).join(",") }));
const click = async (pg, lang, mobile = false) => {
  if (mobile) { await pg.click("#menuToggle"); await pg.waitForSelector("#mobileNav.open"); }
  const sel = (mobile ? "#mobileNav" : "header.site .head-actions") + ` .lang-opt[data-lang="${lang}"]`;
  await pg.click(sel);
  await pg.waitForFunction(l => document.documentElement.lang === l && !document.documentElement.classList.contains("i18n-pending"), {}, lang);
};
// Arabic text still visible in the interface (excluding content areas that must stay Arabic).
const leftovers = (pg) => pg.evaluate(() => {
  const isAr = t => /[\u0621-\u064A]{2}/.test(t) && !/[A-Za-z]{3,}/.test(t), out = [];   // Arabic words only; English sentences quoting an Arabic letter are fine
  
  const skip = el => el.closest("script,style,textarea,noscript,[data-i18n-skip],#virtualKeyboard,.alpha-grid,#mapTableBody,.brand .mark,#alphaDetail,.lang-switch") || (el.closest("[lang='ar']") !== document.documentElement && el.closest("[lang='ar']"));
  const w = document.createTreeWalker(document.documentElement, 4); let n;
  while ((n = w.nextNode())) { const t = n.data.trim(); if (t && isAr(t) && n.parentElement && !skip(n.parentElement)) out.push(t.slice(0, 70)); }
  document.querySelectorAll("[title],[placeholder],[aria-label],[alt]").forEach(e => { if (skip(e)) return; for (const a of ["title", "placeholder", "aria-label", "alt"]) { const v = e.getAttribute(a); if (v && isAr(v)) out.push(a + "=" + v.slice(0, 60)); } });
  return out;
});

/* 1 — first-time visitor opens in Arabic, even with an English browser */
let pg = await fresh(); await go(pg, "/");
let s = await state(pg);
ck("1. first visit is Arabic (lang=ar, dir=rtl), nothing saved, browser language ignored", s.lang === "ar" && s.dir === "rtl" && s.stored === null && s.pressed === "ar", JSON.stringify(s));
const arSnap = await pg.evaluate(() => ({ body: document.body.innerText, title: document.title, desc: document.querySelector('meta[name=description]').content, canon: document.querySelector('link[rel=canonical]').href, h1: document.querySelector("h1").innerText }));
ck("1c. Arabic visitors never download the English dictionary", !pg.reqs.some(u => /i18n-en\.js/.test(u)) && pg.reqs.some(u => /i18n\.js/.test(u)), JSON.stringify(pg.reqs.filter(u => /i18n/.test(u))));
ck("1a. (control) the leftover scanner does flag the Arabic page, so a clean English result is meaningful", (await leftovers(pg)).length > 20);
ck("1b. switcher shows العربية | English on desktop", await pg.evaluate(() => { const b = [...document.querySelectorAll("header.site .head-actions .lang-opt")]; return b.length === 2 && b[0].textContent === "العربية" && b[1].textContent === "English" && b[0].getBoundingClientRect().width > 0; }));

/* 2 — switch to English */
await click(pg, "en"); s = await state(pg);
ck("2. English: lang=en, dir=ltr, preference saved, English option marked selected", s.lang === "en" && s.dir === "ltr" && s.stored === "en" && s.pressed === "en", JSON.stringify(s));
const en = await pg.evaluate(() => ({ nav: [...document.querySelectorAll("nav.primary > .nav-item > a, nav.primary > .nav-item > button")].map(e => e.textContent.trim().replace(/\s+/g, " ")), h1: document.querySelector("h1").innerText, title: document.title, desc: document.querySelector("meta[name=description]").content, canon: document.querySelector("link[rel=canonical]").href }));
ck("2b. nav + heading + title + meta description are English", en.nav.join("|").startsWith("Tools") && en.nav.includes("Tashkeel") && /^[\x00-\x7F\s—–·|’'“”-]+$/.test(en.title) && !/[\u0600-\u06FF]/.test(en.desc), JSON.stringify(en));
ck("2c. canonical URL untouched (SEO)", en.canon === arSnap.canon, en.canon);
ck("2d. no Arabic interface text left on the home page", (await leftovers(pg)).length === 0, JSON.stringify(await leftovers(pg)));
ck("2e. Arabic CONTENT stays marked as Arabic (lang=ar) inside the English page", await pg.evaluate(() => document.querySelector("#editor").lang === "ar" && document.querySelector("#editor").dir === "rtl"));

/* 3 — persistence: reload, other pages, new tab in same profile */
await pg.reload({ waitUntil: "load" }); await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"));
s = await state(pg); ck("3. English persists after refresh", s.lang === "en" && s.dir === "ltr" && s.pressed === "en", JSON.stringify(s));
await go(pg, "/tashkeel/"); await pg.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.classList.contains("i18n-pending"));
ck("3b. English persists when navigating to /tashkeel/ (route unchanged)", new URL(pg.url()).pathname === "/tashkeel/" && (await pg.evaluate(() => document.querySelector("h1").innerText)) === "Tashkeel Tool");
const pg2 = await pg.ctx.newPage(); await pg2.setRequestInterception(true); pg2.on("request", r => r.url().startsWith(O) ? r.continue() : r.abort());
await pg2.goto(O + "/about/", { waitUntil: "load" }); await pg2.waitForFunction(() => document.documentElement.lang === "en");
ck("3c. a revisit (new tab, same browser profile) opens in English", true); await pg2.close();

/* 4 — back to Arabic restores the page exactly */
await go(pg, "/"); await pg.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.classList.contains("i18n-pending"));
await click(pg, "ar"); s = await state(pg);
const arBack = await pg.evaluate(() => ({ body: document.body.innerText, title: document.title, desc: document.querySelector("meta[name=description]").content, h1: document.querySelector("h1").innerText }));
ck("4. العربية restores lang=ar dir=rtl and saves the choice", s.lang === "ar" && s.dir === "rtl" && s.stored === "ar" && s.pressed === "ar", JSON.stringify(s));
ck("4b. restored page text, title and meta description are identical to the original Arabic", arBack.body === arSnap.body && arBack.title === arSnap.title && arBack.desc === arSnap.desc, "differs");
await pg.reload({ waitUntil: "load" }); ck("4c. Arabic persists after refresh", (await state(pg)).lang === "ar");
await pg.ctx.close();

/* 5 — explicit ?lang=en link (not automatic detection) */
pg = await fresh(); await go(pg, "/faq/?lang=en"); await pg.waitForFunction(() => document.documentElement.lang === "en");
ck("5. ?lang=en selects English and saves it; canonical stays on the Arabic URL", (await state(pg)).stored === "en" && (await pg.evaluate(() => document.querySelector("link[rel=canonical]").href.endsWith("/faq/"))));
await pg.ctx.close();

/* 6 — in-progress text survives switching (keyboard page, Tashkeel, no reload) */
pg = await fresh(); await go(pg, "/arabic-keyboard/");
await pg.type("#editor", "مرحبا بالعالم"); await pg.click("#modeTranslit");
const mark = await pg.evaluate(() => { window.__kept = document.body; return document.querySelector("#editor").value; });
await click(pg, "en");
const kept = await pg.evaluate(() => ({ v: document.querySelector("#editor").value, same: window.__kept === document.body, counts: document.querySelector("#charCount").textContent + " / " + document.querySelector("#wordCount").textContent, mode: document.querySelector("#modeTranslit").getAttribute("aria-selected"), hint: document.querySelector("#modeHint").textContent, ph: document.querySelector("#editor").placeholder }));
ck("6. typed Arabic text, page (no reload) and chosen input mode survive the switch", kept.v === mark && kept.same && kept.mode === "true", JSON.stringify(kept));
ck("6b. live counters / hints / placeholder are English", /^13 characters \/ 2 words$/.test(kept.counts) && /Latin letters/.test(kept.hint) && kept.ph === "Type your text here", JSON.stringify(kept));
await pg.type("#editor", " abc"); const cnt = await pg.evaluate(() => document.querySelector("#charCount").textContent);
ck("6c. typing after the switch keeps updating the English counter", /^\d+ characters$/.test(cnt), cnt);
await pg.click("#btnDir"); await pg.waitForFunction(() => /^Direction:/.test(document.querySelector("#toast").textContent)).then(() => ck("6d. dynamic toast is English ('Direction: …')", true), () => ck("6d. dynamic toast is English", false, "no toast"));
const keys = await pg.evaluate(() => ({ space: [...document.querySelectorAll("#virtualKeyboard .key.space")].map(k => k.textContent), hints: [...document.querySelectorAll(".key-diacritic .hint")].map(h => h.textContent).slice(0, 3), first: [...document.querySelectorAll("#virtualKeyboard .kb-row")].slice(0, 1).map(r => [...r.children].slice(0, 2).map(k => ({ t: k.querySelector(".key-main")?.textContent, x: Math.round(k.getBoundingClientRect().x) })))[0] }));
{ const cp = await pg.evaluate(() => document.querySelector("#btnCopy").innerText.trim()); ck("6e0. toolbar \"نسخ\" is Copy (not the Naskh script name)", cp.endsWith("Copy"), JSON.stringify(cp)); }
ck("6e. keyboard utility keys/diacritic hints are English", keys.space[0] === "Space" && keys.hints[0] === "Fatha", JSON.stringify(keys));
ck("6f. Arabic keys keep right-to-left order in the LTR page (ض is right of ص)", keys.first && keys.first[0].x > keys.first[1].x, JSON.stringify(keys.first));
await click(pg, "ar");
ck("6g. switching back keeps the typed text", (await pg.evaluate(() => document.querySelector("#editor").value)).startsWith("مرحبا بالعالم"));
await pg.ctx.close();

pg = await fresh(); await go(pg, "/tashkeel/");
await pg.type("#tashkeelIn", "العلم نور"); await click(pg, "en");
let tk = await pg.evaluate(() => ({ v: document.querySelector("#tashkeelIn").value, c: document.querySelector("#tashkeelCounts").textContent, run: document.querySelector("#tashkeelRun").textContent, out: document.querySelector("#tashkeelOut").lang }));
ck("6h. Tashkeel: input kept, counter + button English", tk.v === "العلم نور" && tk.c === "9 characters · 2 words" && tk.run === "Add diacritics ✨", JSON.stringify(tk));
await pg.evaluate(() => { document.querySelector("#tashkeelIn").value = ""; }); await pg.click("#tashkeelRun");
await pg.waitForFunction(() => /Type or paste some Arabic text first/.test(document.querySelector("#tashkeelStatus").textContent + document.querySelector("#tashkeelErrorMsg").textContent), { timeout: 4000 }).then(() => ck("6i. Tashkeel status/error messages are English", true), () => ck("6i. Tashkeel status/error messages are English", false, "not translated"));
ck("6j. Tashkeel page: nothing left untranslated", (await leftovers(pg)).length === 0, JSON.stringify(await leftovers(pg)));
await pg.ctx.close();

pg = await fresh(); await go(pg, "/contact/"); await click(pg, "en"); await pg.click("form button, form .btn, #contactForm button").catch(() => { });
const ct = await pg.waitForFunction(() => document.querySelector("#toast").classList.contains("show") && document.querySelector("#toast").textContent, { timeout: 3000 }).then(h => h.jsonValue()).catch(() => "");
ck("6k. contact form validation toast is English", ct === "Please fill in all fields", ct); await pg.ctx.close();

/* 7 — mobile: drawer switcher, header switcher hidden, no sideways scroll */
pg = await fresh(390, 800); await go(pg, "/");
ck("7. mobile: header switcher hidden (it lives in the menu)", await pg.evaluate(() => getComputedStyle(document.querySelector("header.site .head-actions .lang-switch")).display === "none"));
await click(pg, "en", true); s = await state(pg);
ck("7b. mobile menu switcher switches to English / LTR", s.lang === "en" && s.dir === "ltr" && s.pressed === "en", JSON.stringify(s));
const mm = await pg.evaluate(() => ({ items: [...document.querySelectorAll("#mobileNav .mobile-panel > a")].map(a => a.textContent.trim()), pressed: document.querySelector('#mobileNav .lang-opt[data-lang=en]').getAttribute("aria-pressed") }));
ck("7c. mobile menu is English and keeps Tashkeel + Calligraphy links", mm.items.includes("Tashkeel") && mm.items.includes("Calligraphy Editor") && mm.items.includes("Home"), JSON.stringify(mm));
await pg.focus('#mobileNav .lang-opt[data-lang=ar]'); await pg.keyboard.press("Enter");
await pg.waitForFunction(() => document.documentElement.lang === "ar");
ck("7d. keyboard operable: Enter on the focused العربية button switches back", (await state(pg)).lang === "ar"); await pg.ctx.close();

/* 8 — every page, both widths, English: no untranslated UI text, no sideways overflow, no JS errors */
for (const [w, h] of [[1280, 900], [390, 800]]) {
  pg = await fresh(w, h); await go(pg, "/?lang=en"); await pg.waitForFunction(() => document.documentElement.lang === "en");
  for (const u of PAGES) {
    await go(pg, u); await pg.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.classList.contains("i18n-pending"));
    const left = await leftovers(pg), ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ck(`8. ${w}px English ${u}: fully translated, no overflow, no JS errors`, left.length === 0 && ov <= 1 && pg.errs.length === 0, JSON.stringify({ left, ov, errs: pg.errs }));
  }
  await pg.ctx.close();
}

/* visual snapshots (for manual review) */
for (const [name, u, w, h] of [["home-en-desktop", "/arabic-keyboard/", 1280, 1100], ["home-en-mobile", "/arabic-keyboard/", 390, 1400], ["tashkeel-en", "/tashkeel/", 1280, 1000]]) {
  const sp = await fresh(w, h); await go(sp, u + "?lang=en"); await sp.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.classList.contains("i18n-pending"));
  await sp.screenshot({ path: `/tmp/snap-${name}.png` }); await sp.ctx.close();
}

/* 8b — header never wraps / overflows at in-between desktop widths, either language */
for (const w of [861, 880, 920, 1024]) for (const l of ["ar", "en"]) {
  pg = await fresh(w, 800); await go(pg, "/tashkeel/?lang=" + l); await pg.waitForFunction(x => document.documentElement.lang === x && !document.documentElement.classList.contains("i18n-pending"), {}, l);
  const hd = await pg.evaluate(() => { const h = document.querySelector("header.site"), r = h.getBoundingClientRect(); const nav = document.querySelector("nav.primary").getBoundingClientRect(), act = document.querySelector(".head-actions").getBoundingClientRect(); return { h: Math.round(r.height), ov: document.documentElement.scrollWidth - innerWidth, clash: nav.right > act.left + 1 && nav.left < act.right - 1 && Math.abs(nav.top - act.top) < 30 }; });
  ck(`8b. header at ${w}px (${l}): single row, no overflow, nav not overlapping actions`, hd.h <= 80 && hd.ov <= 1 && !hd.clash, JSON.stringify(hd));
  await pg.ctx.close();
}

/* 9 — Calligraphy Editor */
pg = await fresh(1280, 800); await go(pg, "/calligraphy-editor/");
ck("9. editor opens in Arabic mode for a first-time visitor and has the switcher", (await state(pg)).lang === "ar" && (await pg.$("#top-bar .lang-switch")) !== null);
const arEd = await pg.evaluate(() => document.querySelector("#btn-export").innerText.trim().replace(/\s+/g, " "));
await pg.click('#top-bar .lang-opt[data-lang="en"]'); await pg.waitForFunction(() => document.documentElement.lang === "en");
const ed = await pg.evaluate(() => ({ exp: document.querySelector("#btn-export").innerText.trim().replace(/\s+/g, " "), prj: document.querySelector("#btn-project").innerText.trim(), name: document.querySelector("#project-name").textContent, hint: document.querySelector("#empty-state-hint").textContent, dock: [...document.querySelectorAll(".dock-btn")].map(b => b.title) }));
ck("9b. editor chrome is English", ed.exp === "Export ▾" && ed.prj === "Project" && ed.name === "Untitled composition" && ["Decorations","Tashkeel","Elements","Designs","Trace Image"].every(t => ed.dock.includes(t)), JSON.stringify(ed));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edLeft = () => pg.evaluate(() => { const isAr = t => /[\u0621-\u064A]{2}/.test(t) && !/[A-Za-z]{3,}/.test(t), o = new Set(); const w = document.createTreeWalker(document.body, 4); let n;
  while ((n = w.nextNode())) { const t = n.data.trim(); if (t && isAr(t) && !n.parentElement.closest("script,style,textarea,#scene,#draw-preview,.lang-switch")) o.add(t.slice(0, 60)); }
  document.querySelectorAll("[title],[aria-label]").forEach(e => { for (const a of ["title", "aria-label"]) { const v = e.getAttribute(a); if (v && isAr(v)) o.add(a + "=" + v.slice(0, 70)); } }); return [...o]; });
for (const [name, sel, marker] of [["export", "#btn-export", "Export format"], ["project", "#btn-project", "Save as copy"], ["Add Text", '[data-tool="text"]', "Add Arabic text"], ["Tashkeel", '.dock-btn[data-tool="tashkeel"]', "Font marks"], ["menu", "#btn-menu", "Editor Menu"]]) {
  await pg.click(sel); await sleep(1100);
  const opened = await pg.evaluate(m => document.body.innerText.includes(m) || [...document.querySelectorAll("[aria-label],[title]")].some(e => (e.getAttribute("aria-label") || e.title || "").includes(m)), marker);
  const left = await edLeft();
  ck(`9c. editor ${name} panel opens and is fully English (no Arabic words left)`, opened && left.length === 0, JSON.stringify({ opened, left }));
  await pg.keyboard.press("Escape"); await sleep(150);
}
await pg.click('#top-bar .lang-opt[data-lang="ar"]'); await pg.waitForFunction(() => document.documentElement.lang === "ar");
ck("9d. switching back restores the original Arabic editor labels", (await pg.evaluate(() => document.querySelector("#btn-export").innerText.trim().replace(/\s+/g, " "))) === arEd);
await pg.click('#top-bar .lang-opt[data-lang="en"]'); await pg.waitForFunction(() => document.documentElement.lang === "en"); await pg.screenshot({ path: "/tmp/snap-editor-en.png" });
ck("9e. no JS errors in the editor", pg.errs.length === 0, pg.errs.join("|")); await pg.ctx.close();

const ok = results.filter(Boolean).length;
console.log(`\nI18N: ${ok}/${results.length} passed` + (bad.length ? "\nFAILED: " + bad.join("; ") : ""));
await browser.close(); srv.close(); process.exit(bad.length ? 1 : 0);
