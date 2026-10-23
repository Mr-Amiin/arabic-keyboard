// Translation page test (real Chromium). Run:  cd tests/tashkeel && npm install && npm run translation
//
// WHAT THIS PROVES: the page <-> proxy contract, UI states, errors, swap/copy/direction, localization, navigation, accessibility.
// The REAL Worker code runs behind a local HTTP server; ONLY the Workers AI binding (env.AI) is stubbed (deterministic output tagged
// "⟦target⟧"), because Cloudflare Workers AI needs a Cloudflare account. This does NOT prove translation quality or the live model:
// run tests/translation/live-translation.mjs against the deployed Worker for that.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
import { handle, LANGUAGE_CODES } from "../../workers/translate-proxy/src/core.js";   // the REAL Worker logic

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SITE_PORT = 8190, API_PORT = 8191, SITE = `http://localhost:${SITE_PORT}`, API = `http://localhost:${API_PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".wasm": "application/wasm" };

/* ---------- stub of the Workers AI binding (env.AI.run) ---------- */
let ai = { mode: "ok", delay: 0 }; const aiLog = [];
const stubAI = { run: async (model, input) => {
  aiLog.push({ model, text: input.text, from: input.source_lang, to: input.target_lang });
  if (ai.delay) await new Promise(r => setTimeout(r, ai.delay));
  if (ai.mode === "3036") throw new Error("3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.");
  if (ai.mode === "3040") throw new Error("3040: No more data centers to forward the request to");
  if (ai.mode === "500") throw new Error("5xxx: internal error");
  if (ai.mode === "garbage") return {};
  const out = input.text === "Save" && input.target_lang === "ar" ? "حفظ" : input.text === "XSS" ? "<img src=x onerror=window.__xss=1>" : `⟦${input.target_lang}⟧ ${input.text}`;
  return { translated_text: out };
} };

/* ---------- servers: the real Worker (API) + the static site ---------- */
const originsSeen = new Set();
let workerEnv = { AI: stubAI, ALLOWED_ORIGINS: SITE }, apiDown = false, apiDelayMs = 0;
const apiSrv = http.createServer(async (q, r) => {
  if (apiDown) { q.destroy(); return; }
  originsSeen.add(q.headers.origin || "(none)");
  const chunks = []; for await (const c of q) chunks.push(c); const body = Buffer.concat(chunks);
  if (apiDelayMs) await new Promise(x => setTimeout(x, apiDelayMs));
  const res = await handle(new Request(API + q.url, { method: q.method, headers: q.headers, body: ["GET", "HEAD"].includes(q.method) ? undefined : body }), workerEnv, {});
  const h = {}; res.headers.forEach((v, k) => h[k] = v); r.writeHead(res.status, h); r.end(Buffer.from(await res.arrayBuffer()));
}).listen(API_PORT);
let cfg = { api: API, timeout: 0 };
const siteSrv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, SITE).pathname);
  if (p === "/assets/js/translation-config.js") { r.writeHead(200, { "content-type": MIME[".js"] }); return r.end(`window.AK_TRANSLATE_API=${JSON.stringify(cfg.api)};` + (cfg.timeout ? `window.AK_TRANSLATE_TIMEOUT_MS=${cfg.timeout};` : "")); }
  let f = path.join(ROOT, p); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
}).listen(SITE_PORT);

const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };
// NOTE: @sparticuz/chromium ships --disable-web-security; it is removed here so REAL browser CORS rules apply to page -> Worker calls.
const browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote|disable-web-security/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const wait = ms => new Promise(r => setTimeout(r, ms));
const resetServers = () => { ai = { mode: "ok", delay: 0 }; aiLog.length = 0; workerEnv = { AI: stubAI, ALLOWED_ORIGINS: SITE }; apiDown = false; apiDelayMs = 0; cfg = { api: API, timeout: 0 }; };

async function open(u = "/translation/", { w = 1280, h = 1000, lang } = {}) {
  const ctx = await browser.createBrowserContext(); await ctx.overridePermissions(SITE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: h }); pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message)); pg.ctx = ctx;
  await pg.goto(SITE + u + (lang ? "?lang=" + lang : ""), { waitUntil: "load" });
  await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending"), { timeout: 8000 }).catch(() => { });
  if (u === "/translation/") await pg.waitForFunction(() => !document.getElementById("trRun").disabled || !document.getElementById("trError").hidden, { timeout: 8000 }).catch(() => { });
  return pg;
}
const $txt = (pg, s) => pg.$eval(s, e => e.textContent);
const status = pg => pg.evaluate(() => (document.getElementById("trStatus").hidden ? "" : document.getElementById("trStatus").querySelector(".tr-status-text").textContent));
const errMsg = pg => pg.evaluate(() => (document.getElementById("trError").hidden ? "" : document.getElementById("trErrorMsg").textContent));
const setIn = (pg, v) => pg.$eval("#trIn", (e, v) => { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const pickLang = async (pg, which, code) => { await pg.select(which === "src" ? "#trSource" : "#trTarget", code); };
const doTranslate = async (pg) => { await pg.click("#trRun"); await pg.waitForFunction(() => document.getElementById("trApp").getAttribute("aria-busy") === "false", { timeout: 8000 }); };
const outText = pg => $txt(pg, "#trOut");
const reqs = () => aiLog.length;

/* ===== 1. page, SEO, structure ===== */
resetServers(); let pg = await open();
const seo = await pg.evaluate(() => ({ title: document.title, desc: document.querySelector('meta[name=description]').content, canon: document.querySelector('link[rel=canonical]').href, h1: document.querySelector("h1").textContent, ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@type"], lang: document.documentElement.lang, dir: document.documentElement.dir }));
ck("1a. page loads with Arabic default interface, own title/description/canonical/H1/FAQ JSON-LD", seo.lang === "ar" && seo.dir === "rtl" && /المترجم/.test(seo.title) && /ترجم/.test(seo.desc) && seo.canon === "https://www.arabic-keyboard.live/translation/" && seo.h1 === "الترجمة" && seo.ld === "FAQPage", JSON.stringify(seo));
ck("1b. sitemap lists /translation/ and existing URLs are untouched", (() => { const s = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8"); return s.includes("/translation/</loc>") && s.includes("/transliteration/</loc>") && s.includes("/tashkeel/</loc>") && (s.match(/<url>/g) || []).length === 17; })());
const init = await pg.evaluate(() => ({ src: document.getElementById("trSource").value, tgt: document.getElementById("trTarget").value, srcDir: document.getElementById("trIn").dir, outDir: document.getElementById("trOut").dir, srcOpts: [...document.querySelectorAll("#trSource option")].map(o => o.value), tgtOpts: [...document.querySelectorAll("#trTarget option")].map(o => o.value), groups: [...document.querySelectorAll("#trSource optgroup")].map(g => g.label), popular: [...document.querySelectorAll("#trTarget optgroup:first-of-type option")].map(o => o.value) }));
ck("1c. initial source = Arabic, target = English, directions follow the languages", init.src === "ar" && init.tgt === "en" && init.srcDir === "rtl" && init.outDir === "ltr", JSON.stringify(init));
ck("1d. selectors list EXACTLY the model's advertised languages (100 M2M100 codes) for both source and target — none invented, none dropped", JSON.stringify([...init.tgtOpts].sort()) === JSON.stringify([...LANGUAGE_CODES].sort()) && JSON.stringify([...init.srcOpts].sort()) === JSON.stringify([...LANGUAGE_CODES].sort()) && init.tgtOpts.length === 100, init.tgtOpts.length + " options");
ck("1e. 'popular' group (Somali, Swahili, French, Spanish, German, Turkish, Urdu, Indonesian, Chinese…) comes first, in the agreed order", init.popular.join() === "ar,en,so,sw,fr,es,de,tr,ur,id,zh" && init.groups[0] === "لغات شائعة", init.popular.join());
ck("1f. language names come back in the interface language (Arabic names in the Arabic UI)", (await pg.$eval("#trTarget option[value=so]", o => o.textContent)).startsWith("الصومالية") && (await pg.$eval("#trSource option[value=ar]", o => o.textContent)).startsWith("العربية"));
ck("1g. page makes no JS errors", pg.errs.length === 0, pg.errs.join("|"));

/* ===== 2. translate Arabic -> English (loading state, duplicate prevention, success) ===== */
ai.delay = 700; await setIn(pg, "السلام عليكم، كيف حالك؟"); await pg.click("#trRun");
await pg.waitForFunction(() => document.getElementById("trApp").getAttribute("aria-busy") === "true"); const busy = await pg.evaluate(() => ({ run: document.getElementById("trRun").disabled, swap: document.getElementById("trSwap").disabled, sel: document.getElementById("trSource").disabled && document.getElementById("trTarget").disabled, cls: document.getElementById("trRun").classList.contains("is-loading"), st: document.getElementById("trStatus").querySelector(".tr-status-text").textContent }));
await pg.evaluate(() => { document.getElementById("trRun").click(); document.getElementById("trRun").click(); document.getElementById("trIn").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true })); });
await pg.waitForFunction(() => document.getElementById("trApp").getAttribute("aria-busy") === "false", { timeout: 8000 });
ck("2a. while loading: button/swap/selects disabled, spinner class, 'جارٍ الترجمة…' status", busy.run && busy.swap && busy.sel && busy.cls && busy.st === "جارٍ الترجمة…", JSON.stringify(busy));
ck("2b. duplicate submissions (double-click + Ctrl+Enter) produce exactly ONE request", reqs() === 1, String(reqs()));
const r2 = await pg.evaluate(() => ({ out: document.getElementById("trOut").textContent, has: document.getElementById("trOut").classList.contains("has-result"), copy: document.getElementById("trCopy").disabled, run: document.getElementById("trRun").disabled, dir: document.getElementById("trOut").dir, lang: document.getElementById("trOut").lang, st: document.getElementById("trStatus").querySelector(".tr-status-text").textContent }));
ck("2c. result shown (from the engine response), controls re-enabled, copy enabled, success status", r2.out === "⟦en⟧ السلام عليكم، كيف حالك؟" && r2.has && !r2.copy && !r2.run && r2.st === "تمت الترجمة ✓", JSON.stringify(r2));
ck("2d. the model call is @cf/meta/m2m100-1.2b with {text, source_lang:'ar', target_lang:'en'}", aiLog[0].model === "@cf/meta/m2m100-1.2b" && aiLog[0].from === "ar" && aiLog[0].to === "en" && aiLog[0].text === "السلام عليكم، كيف حالك؟");

ck("2e. real CORS is in force: every browser request to the proxy carried Origin = the site origin", originsSeen.size === 1 && originsSeen.has(SITE), [...originsSeen].join());

/* ===== 3. other directions and languages ===== */
ai.delay = 0; aiLog.length = 0;
const cases = [["en", "ar", "Peace be upon you", "rtl"], ["ar", "so", "مرحبا بكم", "ltr"], ["so", "ar", "Salaan", "rtl"], ["ar", "fr", "شكرا جزيلا", "ltr"], ["ar", "es", "صباح الخير", "ltr"], ["ar", "tr", "أهلا وسهلا", "ltr"], ["fr", "es", "Bonjour", "ltr"], ["ar", "ur", "مع السلامة", "rtl"], ["ar", "zh", "نهارك سعيد", "ltr"], ["ar", "sw", "شكرا", "ltr"], ["de", "ar", "Guten Tag", "rtl"]];
let c3ok = true, c3d = [];
for (const [from, to, text, dir] of cases) { await pickLang(pg, "src", from); await pickLang(pg, "tgt", to); await setIn(pg, text); await doTranslate(pg); const o = await pg.evaluate(() => ({ t: document.getElementById("trOut").textContent, d: document.getElementById("trOut").dir, l: document.getElementById("trOut").lang, id: document.getElementById("trIn").dir })); const last = aiLog.at(-1); if (!(o.t === `⟦${to}⟧ ${text}` && o.d === dir && o.l === to && last.from === from && last.to === to)) { c3ok = false; c3d.push(`${from}->${to} ${JSON.stringify(o)} ${JSON.stringify(last)}`); } }
ck("3. every direction (ar→en, en→ar, ar→so, so→ar, ar→fr/es/tr/ur/zh/sw, fr→es, de→ar): correct from/to sent, output shown, output direction/lang follow the TARGET language", c3ok, c3d.join(" | "));

/* ===== 5. swap + undo ===== */
await pickLang(pg, "src", "ar"); await pickLang(pg, "tgt", "en"); await setIn(pg, "كتاب جميل"); await doTranslate(pg);
await pg.click("#trSwap"); const sw = await pg.evaluate(() => ({ s: document.getElementById("trSource").value, t: document.getElementById("trTarget").value, i: document.getElementById("trIn").value, o: document.getElementById("trOut").textContent, has: document.getElementById("trOut").classList.contains("has-result"), undo: !document.getElementById("trUndo").hidden, st: document.getElementById("trStatus").querySelector(".tr-status-text").textContent, idir: document.getElementById("trIn").dir, odir: document.getElementById("trOut").dir }));
ck("5a. swap exchanges the languages AND moves the translation into the input; output cleared (never shows non-engine text); Undo offered", sw.s === "en" && sw.t === "ar" && sw.i === "⟦en⟧ كتاب جميل" && sw.o === "—" && !sw.has && sw.undo && /تم تبديل اللغات/.test(sw.st) && sw.idir === "ltr" && sw.odir === "rtl", JSON.stringify(sw));
await pg.click("#trUndo"); const un = await pg.evaluate(() => ({ s: document.getElementById("trSource").value, t: document.getElementById("trTarget").value, i: document.getElementById("trIn").value, o: document.getElementById("trOut").textContent, copy: document.getElementById("trCopy").disabled }));
ck("5b. Undo restores languages, original text AND the translation — nothing lost", un.s === "ar" && un.t === "en" && un.i === "كتاب جميل" && un.o === "⟦en⟧ كتاب جميل" && !un.copy, JSON.stringify(un));
await pg.click("#trUndo").catch(() => { }); await pickLang(pg, "src", "ar"); await pickLang(pg, "tgt", "en"); await pg.click("#trSwap"); await pg.click("#trSwap");
ck("5c. swapping twice returns to the original language pair", (await pg.$eval("#trSource", e => e.value)) === "ar" && (await pg.$eval("#trTarget", e => e.value)) === "en");
ck("5d. there is no 'detect language' option (the model cannot detect languages), so the source is always an explicit choice", (await pg.$("#trSource option[value=auto]")) === null);

/* ===== 6. copy / clear ===== */
await pickLang(pg, "src", "ar"); await pickLang(pg, "tgt", "en"); await setIn(pg, "شكرا"); await doTranslate(pg); await pg.click("#trCopy");
await pg.waitForFunction(() => document.getElementById("toast").classList.contains("show") && document.getElementById("toast").textContent.length > 0, { timeout: 3000 }).catch(() => { });
const clip = await pg.evaluate(() => navigator.clipboard.readText()).catch(e => "ERR " + e.message);
ck("6a. copy puts exactly the translation on the clipboard and shows a success toast", clip === "⟦en⟧ شكرا" && (await $txt(pg, "#toast")) === "تم نسخ الترجمة", clip + " | " + await $txt(pg, "#toast"));
await pg.click("#trClear"); const cl = await pg.evaluate(() => ({ i: document.getElementById("trIn").value, o: document.getElementById("trOut").textContent, copy: document.getElementById("trCopy").disabled, c: document.getElementById("trCount").textContent, active: document.activeElement.id }));
ck("6b. clear resets input, output, copy button and counter, and focuses the input", cl.i === "" && cl.o === "—" && cl.copy && cl.c === "٠ / ٥٬٠٠٠ حرف" && cl.active === "trIn", JSON.stringify(cl));

/* ===== 7. validation (no request is made) ===== */
aiLog.length = 0; await setIn(pg, "   \n "); await pg.click("#trRun"); const e1 = await errMsg(pg);
await setIn(pg, "ع".repeat(5001)); const over = await pg.evaluate(() => ({ c: document.getElementById("trCount").textContent, over: document.getElementById("trCount").classList.contains("over") })); await pg.click("#trRun"); const e2 = await errMsg(pg);
await setIn(pg, "ع".repeat(5000)); const okLen = await pg.evaluate(() => document.getElementById("trCount").classList.contains("over"));
await setIn(pg, "نص"); await pickLang(pg, "src", "en"); await pickLang(pg, "tgt", "en"); await pg.click("#trRun"); const e3 = await errMsg(pg);
ck("7a. empty input -> helpful message, no request", e1 === "اكتب نصًا لترجمته أولًا." && reqs() === 0, e1);
ck("7b. too long -> counter turns 'over', message states the limit, no request", over.over && /٥٬٠٠٠/.test(e2) && /أطول من الحد المسموح/.test(e2) && !okLen && reqs() === 0, JSON.stringify([over, e2]));
ck("7c. identical source/target -> message, no request", e3 === "اختر لغتين مختلفتين للمصدر والهدف." && reqs() === 0, e3);

/* ===== 8. failures are never shown as translations ===== */
await pickLang(pg, "src", "ar"); await pickLang(pg, "tgt", "en"); await setIn(pg, "نص تجريبي"); await doTranslate(pg); const good = await outText(pg);
const failCases = [["3036", /حصة الترجمة المجانية لهذا اليوم/, false], ["3040", /مشغول حاليًا/, true], ["500", /غير متاحة مؤقتًا/, true], ["garbage", /استجابة غير متوقعة/, true]];
let f8 = [];
for (const [mode, re, retry] of failCases) { ai.mode = mode; const before = aiLog.length; await doTranslate(pg); const m = await errMsg(pg), o = await outText(pg), rb = await pg.$eval("#trRetry", e => !e.hidden), n = aiLog.length - before; if (!(re.test(m) && o === good && rb === retry && !o.includes(m) && n === 1)) f8.push(`${mode}: ${m} | out=${o} | retry=${rb} | calls=${n}`); }
workerEnv.RATE_LIMITER_IP = { limit: async () => ({ success: false }) }; { const before = aiLog.length; await doTranslate(pg); const m = await errMsg(pg), rb = await pg.$eval("#trRetry", e => !e.hidden); if (!(/حدّ الاستخدام المؤقت/.test(m) && rb && aiLog.length === before && (await outText(pg)) === good)) f8.push("rate limiter: " + m); } delete workerEnv.RATE_LIMITER_IP;
ck("8a. daily quota (3036: NO retry offered, exactly one model call, no fallback) / busy (3040) / server error / malformed / rate limiter -> clear Arabic error; the previous good result stays; error is never put in the output", f8.length === 0, f8.join(" || "));
ai.mode = "ok"; await pg.click("#trRetry"); await pg.waitForFunction(() => document.getElementById("trApp").getAttribute("aria-busy") === "false"); 
ck("8b. Retry after recovery succeeds and clears the error", (await errMsg(pg)) === "" && (await status(pg)) === "تمت الترجمة ✓");
await pg.setRequestInterception(true); const blocker = r => (r.url().startsWith(API + "/translate") ? r.abort("failed") : r.continue()); pg.on("request", blocker); await doTranslate(pg);
ck("8c. network failure to the proxy -> network message + Retry (output not replaced)", /تعذّر الاتصال بخدمة الترجمة/.test(await errMsg(pg)) && (await outText(pg)) === good);
pg.off("request", blocker); await pg.setRequestInterception(false); await pg.ctx.close();

resetServers(); cfg.timeout = 600; apiDelayMs = 2500; pg = await open("/translation/"); apiDelayMs = 0;     // page loaded languages slowly? (languages call also delayed) -> use fresh run below
await pg.ctx.close(); resetServers(); cfg.timeout = 700; pg = await open("/translation/"); apiDelayMs = 2500; await setIn(pg, "نص"); await doTranslate(pg);
ck("8d. slow proxy -> client timeout message (not an endless spinner), UI usable again", /وقتًا أطول من المعتاد/.test(await errMsg(pg)) && !(await pg.$eval("#trRun", e => e.disabled)), await errMsg(pg)); apiDelayMs = 0; await pg.ctx.close();

resetServers(); workerEnv.ALLOWED_ORIGINS = "https://not-this-site.example"; pg = await open();
ck("8e. proxy rejects this page's origin (browser cannot read the blocked reply) -> honest 'could not load languages' message, translate disabled, no invented languages", /تعذّر تحميل قائمة اللغات/.test(await errMsg(pg)) && (await pg.$eval("#trRun", e => e.disabled)), await errMsg(pg)); await pg.ctx.close();
resetServers(); apiDown = true; pg = await open();
const down = { m: await errMsg(pg), opt: await pg.$eval("#trSource option", o => o.textContent), run: await pg.$eval("#trRun", e => e.disabled), retry: await pg.$eval("#trRetry", e => !e.hidden) };
apiDown = false; await pg.click("#trRetry"); await pg.waitForFunction(() => !document.getElementById("trRun").disabled, { timeout: 5000 }).catch(() => { });
ck("8f. language list unavailable -> explicit message (no invented languages), translate disabled; Retry recovers when the service returns", /تعذّر تحميل قائمة اللغات/.test(down.m) && down.opt === "تعذّر تحميل اللغات" && down.run && down.retry && !(await pg.$eval("#trRun", e => e.disabled)) && (await pg.$$eval("#trTarget option", o => o.length)) === 100, JSON.stringify(down)); await pg.ctx.close();
resetServers(); cfg.api = ""; pg = await open();
ck("8g. proxy URL not configured yet -> honest 'not connected' message, translate disabled (no fake output)", /لم تُربط بهذا الموقع بعد/.test(await errMsg(pg)) && (await pg.$eval("#trRun", e => e.disabled)) && (await outText(pg)) === "—"); await pg.ctx.close();

/* ===== 9. safety: output is text, never HTML ===== */
resetServers(); pg = await open(); await setIn(pg, "XSS"); await doTranslate(pg);
ck("9. HTML in a translation is displayed as text (no element injected, no script run)", (await outText(pg)).includes("<img") && (await pg.evaluate(() => !document.querySelector("#trOut img") && window.__xss === undefined)), await outText(pg));

/* ===== 10. interface language: English ===== */
await pickLang(pg, "tgt", "so"); await setIn(pg, "Save"); await pickLang(pg, "src", "en"); await pickLang(pg, "tgt", "ar"); await doTranslate(pg); const saved = await outText(pg);
await pg.click('header.site .lang-opt[data-lang="en"]'); await pg.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.classList.contains("i18n-pending"));
await pg.waitForFunction(() => document.querySelector("#trTarget option[value=so]").textContent.startsWith("Somali"), { timeout: 5000 }).catch(() => { });
const en = await pg.evaluate(() => ({ dir: document.documentElement.dir, h1: document.querySelector("h1").textContent, run: document.getElementById("trRun").textContent, copy: document.getElementById("trCopy").textContent, clear: document.getElementById("trClear").textContent, swapLabel: document.getElementById("trSwap").getAttribute("aria-label"), labels: [...document.querySelectorAll("label.tk-label")].map(l => l.textContent), ph: document.getElementById("trIn").placeholder, count: document.getElementById("trCount").textContent, groups: [...document.querySelectorAll("#trSource optgroup")].map(g => g.label), so: document.querySelector("#trTarget option[value=so]").textContent, vals: [document.getElementById("trSource").value, document.getElementById("trTarget").value], input: document.getElementById("trIn").value, out: document.getElementById("trOut").textContent, indir: document.getElementById("trIn").dir, outdir: document.getElementById("trOut").dir, st: document.getElementById("trStatus").hidden ? "" : document.getElementById("trStatus").querySelector(".tr-status-text").textContent, title: document.title, tip: document.getElementById("trHelp").textContent }));
ck("10a. English UI: LTR page, translated heading/buttons/labels/placeholder/tip/counter/status/groups/auto option; page title is English", en.dir === "ltr" && en.h1 === "Translation" && en.run === "Translate" && en.copy === "Copy translation" && en.clear === "Clear" && en.swapLabel === "Swap languages" && en.labels.join("|") === "Source language|Target language|Text to translate|Translation" && en.ph === "Type or paste your text here" && en.count === "4 / 5,000 characters" && en.groups.join() === "Popular languages,All languages" && en.st === "Translated ✓" && /^Online Arabic Translator/.test(en.title) && /^Tip: complete sentences/.test(en.tip), JSON.stringify(en));
ck("10b. provider language names are re-requested in English; selections, typed text and result survive the interface switch", en.so.startsWith("Somali") && en.vals.join() === "en,ar" && en.input === "Save" && en.indir === "ltr" && en.outdir === "rtl", JSON.stringify([en.so, en.vals, en.input]));
ck("10b2. English breadcrumb reads Home / Tools / Translation", (await pg.evaluate(() => [...document.querySelectorAll(".breadcrumbs a, .breadcrumbs .current")].map(e => e.textContent).join(" / "))) === "Home / Tools / Translation");
ck("10c. the translation itself is NEVER localized: an Arabic result that equals a UI label ('حفظ') stays 'حفظ'", saved === "حفظ" && en.out === "حفظ", `${saved} / ${en.out}`);
ai.mode = "ok"; await setIn(pg, ""); await pg.click("#trRun"); const e10a = await errMsg(pg); await setIn(pg, "ع".repeat(5001)); await pg.click("#trRun"); const e10b = await errMsg(pg); workerEnv.RATE_LIMITER_IP = { limit: async () => ({ success: false }) }; await setIn(pg, "x"); await doTranslate(pg); const e10c = await errMsg(pg); delete workerEnv.RATE_LIMITER_IP; ai.mode = "3036"; await doTranslate(pg); const e10q = await errMsg(pg); ai.mode = "3040"; await doTranslate(pg); const e10busy = await errMsg(pg); ai.mode = "ok";
ck("10d. English error messages (empty, too long with 5,000 limit, rate limit, daily quota, busy)", e10a === "Type some text to translate first." && e10b === "The text is longer than the allowed limit (5,000 characters). Split it into smaller parts." && /temporary usage limit/.test(e10c) && e10q === "Today's free translation quota has been used up and renews automatically tomorrow. Please try again later." && e10busy === "The translation model is busy right now. Please try again in a moment.", JSON.stringify([e10a, e10b, e10c, e10q, e10busy]));
await pg.click('header.site .lang-opt[data-lang="ar"]'); await pg.waitForFunction(() => document.documentElement.lang === "ar");
await pg.waitForFunction(() => document.querySelector("#trTarget option[value=so]").textContent.startsWith("الصومالية"), { timeout: 5000 }).catch(() => { });
ck("10e. back to Arabic: RTL, Arabic labels and Arabic language names return, text kept", (await pg.$eval("h1", e => e.textContent)) === "الترجمة" && (await pg.$eval("#trRun", e => e.textContent)) === "ترجمة" && (await pg.$eval("#trTarget option[value=so]", o => o.textContent)).startsWith("الصومالية") && (await pg.$eval("#trIn", e => e.value)).length === 1);
ck("10f. no JS errors across language switches", pg.errs.length === 0, pg.errs.join("|")); await pg.ctx.close();

/* 10g. a visitor who OPENS the page already in English (saved preference / ?lang=en) must get English language names too */
resetServers(); pg = await open("/translation/", { lang: "en" });
await pg.waitForFunction(() => { const o = document.querySelector("#trTarget option[value=so]"); return o && o.textContent.startsWith("Somali"); }, { timeout: 6000 }).catch(() => { });
const firstEn = await pg.evaluate(() => ({ so: document.querySelector("#trTarget option[value=so]").textContent, ar: document.querySelector("#trSource option[value=ar]").textContent, run: document.getElementById("trRun").textContent, lang: document.documentElement.lang, groups: [...document.querySelectorAll("#trTarget optgroup")].map(g => g.label).join() }));
ck("10g. opening directly in English: language names, groups and labels are English from the start", firstEn.so.startsWith("Somali") && firstEn.ar.startsWith("Arabic") && firstEn.run === "Translate" && firstEn.groups === "Popular languages,All languages", JSON.stringify(firstEn)); await pg.ctx.close();

/* ===== 11. navigation: desktop + mobile, every covered route, active state ===== */
resetServers();
for (const lang of ["ar", "en"]) {
  const label = lang === "ar" ? "الترجمة" : "Translation"; pg = await open("/", { lang });
  const d = await pg.evaluate(() => { const q = s => [...document.querySelectorAll(s)]; const t = q('nav.primary > .nav-item > a[href$="translation/"]'); const ks = q("nav.primary > .nav-item > a, nav.primary > .nav-item > button").map(e => e.textContent.trim().replace(/\s+/g, " ")); const tk = q('nav.primary > .nav-item > a[href$="tashkeel/"]')[0], tr = t[0]; return { n: t.length, txt: t[0] && t[0].textContent.trim(), vis: t[0] && t[0].getBoundingClientRect().width > 0, drop: q('nav.primary .dropdown a[href$="translation/"]').length, order: tk && tr && (tk.compareDocumentPosition(tr) & Node.DOCUMENT_POSITION_FOLLOWING) > 0, items: ks, h: Math.round(document.querySelector("header.site").getBoundingClientRect().height), ov: document.documentElement.scrollWidth - innerWidth }; });
  ck(`11a. desktop (${lang}): top-level "${label}" next to Tashkeel + in Tools dropdown, header single row, no overflow`, d.n === 1 && d.txt === label && d.vis && d.drop === 1 && d.order && d.h <= 80 && d.ov <= 1, JSON.stringify(d));
  await Promise.all([pg.waitForNavigation({ waitUntil: "load" }), pg.click('nav.primary > .nav-item > a[href$="translation/"]')]); await pg.waitForFunction(() => document.getElementById("trApp"));
  const act = await pg.evaluate(() => ({ path: location.pathname, cur: [...document.querySelectorAll('a[aria-current="page"]')].map(a => a.getAttribute("href")), tkCur: document.querySelectorAll('[aria-current="page"][href$="tashkeel/"]').length }));
  ck(`11b. (${lang}) clicking it from the homepage opens /translation/ with the active state on Translation only`, act.path === "/translation/" && act.cur.length >= 2 && act.cur.every(h => /translation\/$/.test(h)) && act.tkCur === 0, JSON.stringify(act));
  await pg.ctx.close();
}
let nested = []; for (const u of ["/faq/", "/arabic-keyboard/", "/tashkeel/", "/calligraphy-editor/"]) { const p = await open(u); if (u === "/calligraphy-editor/") { ck("11c. (calligraphy editor has its own toolbar, no site nav — unchanged)", (await p.$('nav.primary')) === null); await p.ctx.close(); continue; } const ok = await p.evaluate(() => { const a = document.querySelector('nav.primary > .nav-item > a[href="../translation/"]'); return !!a && a.getBoundingClientRect().width > 0 && !a.hasAttribute("aria-current"); }); if (!ok) nested.push(u); await p.ctx.close(); }
ck("11c. link present, visible and NOT marked active on nested routes (/faq/, /arabic-keyboard/, /tashkeel/)", nested.length === 0, nested.join());
pg = await open("/faq/", { w: 390, h: 800 }); await pg.click("#menuToggle"); await pg.waitForSelector("#mobileNav.open");
const mob = await pg.evaluate(() => ({ links: [...document.querySelectorAll('#mobileNav .mobile-panel a[href$="translation/"]')].map(a => a.textContent.trim()), vis: [...document.querySelectorAll('#mobileNav .mobile-panel a[href$="translation/"]')].every(a => a.getBoundingClientRect().width > 0) }));
await Promise.all([pg.waitForNavigation({ waitUntil: "load" }), pg.click('#mobileNav .mobile-panel > a[href$="translation/"]')]);
ck("11d. mobile menu: Translation appears (top level + Tools group) and works from a nested route", mob.links.length === 2 && mob.vis && new URL(pg.url()).pathname === "/translation/", JSON.stringify(mob)); await pg.ctx.close();
for (const u of ["/tashkeel/", "/transliteration/", "/arabic-keyboard/"]) { const p = await open("/translation/"); const href = u === "/transliteration/" ? 'article a[href="../transliteration/"]' : `.grid-cards a[href="..${u}"]`; await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(href)]); ck(`11e. links from /translation/ to ${u} work`, new URL(p.url()).pathname === u); await p.ctx.close(); }
pg = await open("/tools/"); ck("11f. All Tools page lists Translation; footer link works", (await pg.$('.grid-cards a[href="../translation/"]')) !== null && (await pg.$('footer a[href="../translation/"]')) !== null); await pg.ctx.close();

/* ===== 12. accessibility, keyboard, responsive ===== */
pg = await open(); await pg.focus("#trSource"); const order = []; for (let i = 0; i < 6; i++) { order.push(await pg.evaluate(() => document.activeElement.id)); await pg.keyboard.press("Tab"); }
ck("12a. keyboard Tab order: source → swap → target → text → Translate → Clear", order.join() === "trSource,trSwap,trTarget,trIn,trRun,trClear", order.join());
const a11y = await pg.evaluate(() => ({ labels: ["trSource", "trTarget", "trIn", "trOut"].every(id => document.querySelector(`label[for=${id}]`)), swap: !!document.getElementById("trSwap").getAttribute("aria-label"), status: document.getElementById("trStatus").getAttribute("role") === "status", err: document.getElementById("trError").getAttribute("role") === "alert", out: document.getElementById("trOut").tabIndex === 0 }));
ck("12b. labelled controls, aria-label on swap, live status region, alert role for errors, focusable result", Object.values(a11y).every(Boolean), JSON.stringify(a11y));
await setIn(pg, "اختبار لوحة المفاتيح"); await pg.focus("#trIn"); await pg.keyboard.down("Control"); await pg.keyboard.press("Enter"); await pg.keyboard.up("Control"); await pg.waitForFunction(() => document.getElementById("trOut").classList.contains("has-result"), { timeout: 5000 }).catch(() => { });
ck("12c. Ctrl+Enter translates", (await outText(pg)) === "⟦en⟧ اختبار لوحة المفاتيح"); await pg.ctx.close();
pg = await open("/translation/", { w: 390, h: 844 }); const mm = await pg.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { ov: document.documentElement.scrollWidth - innerWidth, stacked: r("trSource").top < r("trSwap").top && r("trSwap").top < r("trTarget").top, fullW: r("trSource").width > 300, btn: r("trRun").height >= 44 }; });
ck("12d. mobile 390px: no sideways scroll, source / swap / target stacked, tap targets ≥ 44px", mm.ov <= 1 && mm.stacked && mm.fullW && mm.btn, JSON.stringify(mm)); await pg.ctx.close();
for (const theme of ["dark"]) { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]); await p.setViewport({ width: 1280, height: 900 }); await p.goto(SITE + "/translation/", { waitUntil: "load" }); await wait(600); const rd = await p.evaluate(() => { const c = e => getComputedStyle(e); const sel = document.getElementById("trSource"); return { selBg: c(sel).backgroundColor, selFg: c(sel).color }; }); ck("12e. dark theme: selects have contrasting colors", rd.selBg !== rd.selFg, JSON.stringify(rd)); await ctx.close(); }

/* ===== visual snapshots (set TR_SHOTS=/some/dir to write PNGs for manual review) ===== */
if (process.env.TR_SHOTS) {
  fs.mkdirSync(process.env.TR_SHOTS, { recursive: true }); resetServers();
  for (const [name, opts, lang, to] of [["ar-desktop", { w: 1280, h: 1150 }, "ar", "en"], ["en-desktop", { w: 1280, h: 1150 }, "en", "so"], ["ar-mobile", { w: 390, h: 1500 }, "ar", "en"]]) {
    const p = await open("/translation/", { ...opts, lang }); await pickLang(p, "tgt", to);
    await setIn(p, lang === "ar" ? "السلام عليكم، كيف حالك؟" : "مرحبا بكم في موقعنا"); await doTranslate(p); await wait(300);
    await p.screenshot({ path: path.join(process.env.TR_SHOTS, name + ".png") }); await p.ctx.close();
  }
}

/* ===== 13. secrets / privacy hygiene ===== */
const clientFiles = ["assets/js/translation-tool.js", "assets/js/translation-config.js", "translation/index.html", "assets/js/i18n-en.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
ck("13a. no API key, no provider key header, no Azure/Microsoft reference, no key-like secret in any client file", !/Ocp-Apim|subscription[-_ ]?key|azure|microsoft|api[-_ ]?key|[A-Fa-f0-9]{32}\b/i.test(clientFiles));
const wfiles = fs.readdirSync(path.join(ROOT, "workers/translate-proxy"), { recursive: true }).filter(f => !f.includes("node_modules") && !f.endsWith("README.md") && fs.statSync(path.join(ROOT, "workers/translate-proxy", f)).isFile()).map(f => fs.readFileSync(path.join(ROOT, "workers/translate-proxy", f), "utf8")).join("\n");
ck("13b. the Worker folder contains no secret value and no Azure remnants (the AI binding needs no key)", !/[A-Fa-f0-9]{32}\b/.test(wfiles) && !/azure|ocp-apim/i.test(wfiles));

console.log(`\nTRANSLATION-UI: ${total - bad.length}/${total} passed` + (bad.length ? "\nFAILED:\n - " + bad.join("\n - ") : ""));
await browser.close(); apiSrv.close(); siteSrv.close(); process.exit(bad.length ? 1 : 0);
