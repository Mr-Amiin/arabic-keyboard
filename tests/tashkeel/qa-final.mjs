// Final release QA: English localization + Tashkeel integration, in a REAL browser (headless Chromium).
// Real Tashkeel runs use the shipped model (no mocks). Failure injection only aborts/delays network requests.
// Run:  cd tests/tashkeel && npm install && node qa-final.mjs   (needs git history; unpacks OLD_REF for the SW-upgrade test)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";

const NEW = path.resolve(new URL("../..", import.meta.url).pathname);
const OLD = "/tmp/qa-old-site";
// The "previously deployed" site for the service-worker upgrade test (section 3). Pinned to the last commit BEFORE the i18n release
// (cache shell-v5, no language switcher) so the test's premise stays true as HEAD moves on; the NEW side is always this working tree.
const OLD_REF = "10d2864";
const NEW_SHELL = /shell-v(\d+)/.exec(fs.readFileSync(path.join(NEW, "sw.js"), "utf8"))[1];   // shell cache version actually shipped in sw.js
fs.rmSync(OLD, { recursive: true, force: true }); fs.mkdirSync(OLD, { recursive: true });
execSync(`git -C ${NEW} archive ${OLD_REF} | tar -x -C ${OLD}`);   // the previously deployed version (see OLD_REF)
let curRoot = NEW, cc = "max-age=600";   // cc: Cache-Control sent by the test server (GitHub Pages sends max-age=600)
const PORT = 8141, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".woff2": "font/woff2", ".onnx": "application/octet-stream" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, O).pathname), f = path.join(curRoot, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end("nf"); }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": cc }); fs.createReadStream(f).pipe(r);
}).listen(PORT);

const results = [], bad = [];
const ck = (n, ok, d = "") => { results.push(!!ok); if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (d && !ok ? "  — " + d : (d && ok ? "  [" + d + "]" : ""))); };
const info = (s) => console.log("INFO " + s);
const browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const M = x => x.replace(/([\u064E\u064F\u0650])\u0651/g, "\u0651$1");
const strip = s => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
const MARKS = /[\u064B-\u0652]/g;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isAr = t => /[\u0621-\u064A]{2}/.test(t) && !/[A-Za-z]{3,}/.test(t);

async function fresh({ w = 1280, h = 900, intercept = true, setup } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(O, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: h });
  pg.errs = []; pg.bad = []; pg.hooks = [];
  pg.on("pageerror", e => pg.errs.push(e.message));
  pg.on("response", r => { if (r.url().startsWith(O) && r.status() >= 400) pg.bad.push(r.status() + " " + r.url().replace(O, "")); });
  if (setup) await setup(pg);
  if (intercept) {
    await pg.setBypassServiceWorker(true); await pg.setRequestInterception(true);
    pg.on("request", r => {
      if (r.isInterceptResolutionHandled()) return;
      if (!r.url().startsWith(O) && !r.url().startsWith("data:")) return r.abort("blockedbyclient");
      for (const h of pg.hooks) if (h(r) === true) return;
      r.continue();
    });
  }
  pg.ctx = ctx; return pg;
}
const go = (pg, u) => pg.goto(O + u, { waitUntil: "load" });
const ready = (pg, l) => pg.waitForFunction(x => document.documentElement.lang === x && !document.documentElement.classList.contains("i18n-pending"), { timeout: 15000 }, l);
const st = pg => pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, stored: (() => { try { return localStorage.getItem("ak-lang"); } catch (e) { return "n/a"; } })(), pressed: [...new Set([...document.querySelectorAll(".lang-switch .lang-opt[aria-pressed=true]")].map(b => b.dataset.lang))].join(","), h1: (document.querySelector("h1") || {}).innerText || "", hidden: getComputedStyle(document.body).visibility === "hidden", len: document.body.innerText.length }));
const pick = async (pg, lang) => { await pg.click(`header.site .head-actions .lang-opt[data-lang="${lang}"]`); await ready(pg, lang); };
const consistent = s => s.lang === s.pressed && s.dir === (s.lang === "en" ? "ltr" : "rtl") && (s.stored === null || s.stored === "n/a" || s.stored === s.lang);
const statusText = pg => pg.evaluate(() => (document.querySelector("#tashkeelStatus").hidden ? "" : document.querySelector("#tashkeelStatus").textContent) + " " + (document.querySelector("#tashkeelError").hidden ? "" : document.querySelector("#tashkeelErrorMsg").textContent));
const outText = pg => pg.$eval("#tashkeelOut", e => e.textContent);
const runDone = (pg, t = 120000) => pg.waitForFunction(() => !document.getElementById("tashkeelRun").disabled && document.getElementById("tashkeelRun").getAttribute("aria-busy") !== "true", { timeout: t });
const setIn = (pg, v) => pg.$eval("#tashkeelIn", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);

try {
/* ================= 1. REAL successful Tashkeel run in English ================= */
let pg = await fresh(); await go(pg, "/tashkeel/");
await pick(pg, "en");
await pg.$eval("#tashkeelStatus", e => { window.__seen = []; new MutationObserver(() => window.__seen.push(e.textContent)).observe(e, { childList: true, characterData: true, subtree: true }); });
const SENT = "محمد قرأ الكتاب";
await pg.type("#tashkeelIn", SENT);
let c = await pg.$eval("#tashkeelCounts", e => e.textContent);
ck("1a. English counter while typing", c === `${SENT.length} characters · 3 words`, c);
const t0 = Date.now(); await pg.click("#tashkeelRun");
await pg.waitForFunction(() => document.getElementById("tashkeelRun").getAttribute("aria-busy") === "true");
const busy = await pg.evaluate(() => ({ prog: !document.getElementById("tashkeelProgress").hidden, label: document.getElementById("tashkeelProgress").getAttribute("aria-label") }));
await runDone(pg);
info(`real model download + inference: ${Date.now() - t0} ms`);
let out = await outText(pg), stx = await statusText(pg);
const nMarks = (out.match(MARKS) || []).length;
ck("1b. REAL result is the correct vocalization (مُحَمَّدٌ قَرَأَ الْكِتَابِ)", out === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ"), out);
ck("1c. output is Arabic, diacritics added, original letters untouched, shown RTL / lang=ar", strip(out) === SENT && nMarks > 5 && await pg.$eval("#tashkeelOut", e => e.dir === "rtl" && e.lang === "ar"), `${nMarks} marks`);
const nEn = +((/^\s*Done ✓ — (\d+) marks added\. Review the result before using it\./.exec(stx) || [])[1]);
ck("1d. English success status ('Done ✓ — N marks added…') with a plausible count", nEn >= 5 && nEn <= nMarks, stx);
const seen = await pg.evaluate(() => window.__seen);
ck("1e. every status shown during the run was English (loading/verifying/adding…)", seen.length >= 2 && seen.every(s => !isAr(s)) && seen.some(s => /^(Loading|Preparing|Adding|Verifying|Initializing)/.test(s)), JSON.stringify(seen));
ck("1f. progress bar label and controls English", busy.prog && busy.label === "Processing progress" && (await pg.$eval("#tashkeelRun", e => e.textContent)) === "Add diacritics ✨" && (await pg.$eval("#tashkeelCopy", e => e.textContent)) === "Copy diacritized text");
await pg.click("#tashkeelCopy");
await pg.waitForFunction(() => /copied/i.test(document.querySelector("#toast").textContent), { timeout: 3000 }).then(() => ck("1g. copy toast English", true), () => ck("1g. copy toast English", false, "no toast"));
const clip = await pg.evaluate(() => navigator.clipboard.readText()).catch(e => "ERR " + e.message);
ck("1h. clipboard holds the Arabic diacritized output (not translated)", clip === out, clip);
ck("1i. no JS errors / failed requests in the English run", pg.errs.length === 0 && pg.bad.length === 0, JSON.stringify([pg.errs, pg.bad]));

/* English errors */
await setIn(pg, ""); await pg.click("#tashkeelRun"); await sleep(400);
ck("1j. empty input error is English", /Type or paste some Arabic text first\./.test(await statusText(pg)), await statusText(pg));
await setIn(pg, "hello world"); await pg.click("#tashkeelRun"); await sleep(400);
ck("1k. no-Arabic error is English", /couldn't find any Arabic letters/.test(await statusText(pg)), await statusText(pg));
await pg.$eval("#tashkeelIn", el => { el.value = "ا".repeat(50001); el.dispatchEvent(new Event("input", { bubbles: true })); });
c = await pg.$eval("#tashkeelCounts", e => e.textContent); await pg.click("#tashkeelRun"); await sleep(400);
ck("1l. over-limit counter + error English with Western digits/commas", c === "50,001 characters · 1 word" && /longer than the allowed limit \(50,000 characters\)\. Split it into smaller parts/.test(await statusText(pg)), c + " | " + await statusText(pg));

/* back to Arabic: state restored, feature still works */
await setIn(pg, SENT); await pg.click("#tashkeelRun"); await runDone(pg); out = await outText(pg);
await pick(pg, "ar");
const ar1 = { out: await outText(pg), stx: await statusText(pg), counts: await pg.$eval("#tashkeelCounts", e => e.textContent), run: await pg.$eval("#tashkeelRun", e => e.textContent), input: await pg.$eval("#tashkeelIn", e => e.value) };
const nAr = +(((/أُضيفت (\S+) علامة/.exec(ar1.stx) || [])[1] || "").replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660));
ck("1m. switching to Arabic keeps output + input, restores Arabic status/counter/buttons (same mark count as the English status)", nAr === nEn && ar1.out === out && ar1.input === SENT && /^\s*تم التشكيل ✓ — أُضيفت \S+ علامة\./.test(ar1.stx) && /حرف · .* كلمة/.test(ar1.counts) && ar1.run === "تشكيل النص ✨", JSON.stringify(ar1));
const second = "العلم نور والجهل ظلمة";
await setIn(pg, second); await pg.click("#tashkeelRun"); await runDone(pg);
const o2 = await outText(pg), s2 = await statusText(pg);
ck("1n. Arabic mode: a NEW real run succeeds with correct output + Arabic status", o2 === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ") && /تم التشكيل ✓/.test(s2), o2 + " | " + s2);
await pick(pg, "en");
ck("1o. back to English after an Arabic-mode run: status translated, output unchanged", /^\s*Done ✓ — \d+ marks added/.test(await statusText(pg)) && await outText(pg) === o2);
ck("1p. no JS errors across the whole 1-section", pg.errs.length === 0, pg.errs.join("|"));
await pg.ctx.close();

/* English + injected model-download failure, then real recovery */
let block = true;
pg = await fresh(); pg.hooks.push(r => { if (block && r.url().endsWith("/model.onnx")) { r.abort("failed"); return true; } });
await go(pg, "/tashkeel/?lang=en"); await ready(pg, "en"); await setIn(pg, SENT); await pg.click("#tashkeelRun");
await pg.waitForFunction(() => !document.getElementById("tashkeelError").hidden, { timeout: 60000 });
const em = await pg.$eval("#tashkeelErrorMsg", e => e.textContent), rb = await pg.$eval("#tashkeelRetry", e => e.textContent);
ck("1q. blocked model download -> English error + 'Try again', no output", em === "Couldn't load the Tashkeel model. Check your internet connection and try again." && rb === "Try again" && await outText(pg) === "—", em);
block = false; await pg.click("#tashkeelRetry"); await pg.waitForFunction(() => !document.getElementById("tashkeelRun").disabled && document.getElementById("tashkeelOut").textContent !== "—", { timeout: 90000 });
ck("1r. Retry succeeds with the real correct result (English UI)", await outText(pg) === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ") && await pg.$eval("#tashkeelError", e => e.hidden));
await pg.ctx.close();

/* ================= 2. Persistence, ?lang=, failure handling ================= */
pg = await fresh(); await go(pg, "/?lang=en"); await ready(pg, "en");
let allOk = true, seenStates = [];
for (const u of ["/arabic-keyboard/", "/faq/", "/about/", "/tashkeel/", "/calligraphy-editor/", "/"]) { await go(pg, u); await ready(pg, "en"); const s = await st(pg); seenStates.push(u + ":" + s.lang); if (!consistent(s)) allOk = false; }
ck("2a. English persists through refresh/navigation across pages + editor, state always consistent", allOk, seenStates.join(" "));
await go(pg, "/"); await ready(pg, "en"); await pg.click('nav.primary > .nav-item > a[href$="tashkeel/"]'); await pg.waitForNavigation({ waitUntil: "load" }).catch(() => { }); await ready(pg, "en");
ck("2b. clicking the Tashkeel nav link keeps English", new URL(pg.url()).pathname === "/tashkeel/" && (await st(pg)).h1 === "Tashkeel Tool");
await pg.ctx.close();

pg = await fresh(); const seq = [];
const step = async (u, want, label) => { await go(pg, u); await ready(pg, want); const s = await st(pg); seq.push(consistent(s) && s.lang === want); if (!seq.at(-1)) console.log("   inconsistent:", label, JSON.stringify(s)); };
await step("/faq/?lang=en", "en", "param en"); await step("/faq/?lang=ar", "ar", "param ar overrides"); await step("/faq/?lang=fr", "ar", "invalid ignored");
await step("/faq/?x=1&lang=en#top", "en", "param among others + hash"); await step("/faq/", "en", "no param keeps stored en");
await pick(pg, "ar"); await step("/faq/?lang=en", "en", "link beats stored ar"); await step("/faq/?lang=EN", "en", "uppercase value ignored => stays en");
ck("2c. ?lang= handling: explicit param wins, invalid ignored, stored/UI/dir/switcher always agree", seq.every(Boolean), JSON.stringify(seq));
const enH1 = (await st(pg)).h1; await pick(pg, "ar"); const arH1 = (await st(pg)).h1;
ck("2d. English and Arabic headings differ and each matches its language (no mixed state)", /^[\x00-\x7F]+$/.test(enH1) && /[\u0600-\u06FF]/.test(arH1), enH1 + " | " + arH1);
await pg.ctx.close();

/* dictionary failures (preference = English, dictionary unavailable) */
for (const [label, hook] of [
  ["network error", r => { if (/i18n-en\.js/.test(r.url())) { r.abort("failed"); return true; } }],
  ["HTTP 404", r => { if (/i18n-en\.js/.test(r.url())) { r.respond({ status: 404, body: "nf" }); return true; } }],
  ["corrupt file (200, invalid JS)", r => { if (/i18n-en\.js/.test(r.url())) { r.respond({ status: 200, contentType: "text/javascript", body: "window.AK_I18N_DICT_EN = {text: ;;(" }); return true; } }],
]) {
  pg = await fresh(); pg.hooks.push(hook);
  await go(pg, "/tashkeel/?lang=en"); await sleep(600);
  let s = await st(pg);
  const cls = await pg.evaluate(() => document.documentElement.className);
  ck(`2e. dictionary ${label}: page visible (not hidden/blank), Arabic, RTL, switcher agrees`, !s.hidden && !/i18n-pending/.test(cls) && s.len > 300 && s.lang === "ar" && s.dir === "rtl" && s.pressed === "ar" && /[\u0600-\u06FF]/.test(s.h1), JSON.stringify({ ...s, cls }));
  await pg.type("#tashkeelIn", "العلم نور"); await pg.click(`header.site .head-actions .lang-opt[data-lang="en"]`); await sleep(500);
  s = await st(pg);
  ck(`2f. dictionary ${label}: clicking English fails gracefully (stays Arabic, typed text kept, no crash)`, s.lang === "ar" && s.pressed === "ar" && await pg.$eval("#tashkeelIn", e => e.value) === "العلم نور" && pg.errs.filter(e => !/Unexpected token|Invalid or unexpected/.test(e)).length === 0, JSON.stringify([s.lang, pg.errs]));
  pg.hooks.length = 0;                                   // network recovers
  await pg.click(`header.site .head-actions .lang-opt[data-lang="en"]`); await ready(pg, "en").catch(() => { });
  s = await st(pg);
  ck(`2g. dictionary ${label}: once it is reachable again, English works and the typed text is still there`, s.lang === "en" && await pg.$eval("#tashkeelIn", e => e.value) === "العلم نور", JSON.stringify(s));
  if (label === "network error") info("after a failed load the saved preference stays 'en' (retried on the next page load); UI shows Arabic meanwhile");
  await pg.ctx.close();
}
/* slow dictionary (4.5 s): page must not stay blank */
pg = await fresh(); pg.hooks.push(r => { if (/i18n-en\.js/.test(r.url())) { setTimeout(() => { try { r.continue(); } catch (e) { } }, 4500); return true; } });
const tNav = Date.now(); pg.goto(O + "/faq/?lang=en", { waitUntil: "domcontentloaded" }).catch(() => { });
await sleep(3700); let s1 = await st(pg);
ck("2h. slow dictionary: after the 3 s failsafe the page is visible with full Arabic content (never blank)", !s1.hidden && s1.len > 300 && s1.lang === "ar", JSON.stringify(s1));
await ready(pg, "en"); const s2e = await st(pg);
ck("2i. slow dictionary: once it arrives the page switches to English by itself", s2e.lang === "en" && /^[\x00-\x7F]+$/.test(s2e.h1) && consistent(s2e), JSON.stringify(s2e));
await pg.ctx.close();
/* normal English load: hidden period is short */
pg = await fresh(); await go(pg, "/?lang=en"); await ready(pg, "en"); const t1 = Date.now();
await pg.goto(O + "/faq/", { waitUntil: "domcontentloaded" }); const tv = Date.now();
await pg.waitForFunction(() => getComputedStyle(document.body).visibility !== "hidden", { timeout: 5000 }); info(`English returning visitor: body visible ${Date.now() - tv} ms after DOMContentLoaded (local server)`);
await pg.ctx.close();
/* localStorage unavailable */
pg = await fresh({ setup: p => p.evaluateOnNewDocument(() => { const t = () => { throw new DOMException("denied", "SecurityError"); }; Object.defineProperty(window, "localStorage", { get: t }); }) });
await go(pg, "/arabic-keyboard/"); let sl = await st(pg);
ck("2j. storage blocked: opens in Arabic with a working switcher, no JS errors", sl.lang === "ar" && sl.stored === "n/a" && pg.errs.length === 0, JSON.stringify([sl, pg.errs]));
await pg.type("#editor", "مرحبا"); await pick(pg, "en");
ck("2k. storage blocked: English works for the session and typed text is kept", (await st(pg)).lang === "en" && await pg.$eval("#editor", e => e.value) === "مرحبا" && pg.errs.length === 0, pg.errs.join("|"));
await pg.ctx.close();

/* in-progress content preserved (keyboard, transliteration, Tashkeel after a real run, Calligraphy Editor) */
pg = await fresh(); await go(pg, "/transliteration/");
await pg.type("#translitInput", "salam ya sadiqi"); const tOut = await pg.$eval("#translitOutput", e => e.textContent);
await pick(pg, "en"); const tOut2 = await pg.$eval("#translitOutput", e => e.textContent);
ck("2l. transliteration: input + converted Arabic output survive the switch unchanged", tOut2 === tOut && /[\u0600-\u06FF]{3}/.test(tOut2) && await pg.$eval("#translitInput", e => e.value) === "salam ya sadiqi", tOut2);
await pg.ctx.close();

pg = await fresh(); await go(pg, "/tashkeel/"); await setIn(pg, SENT); await pg.click("#tashkeelRun"); await runDone(pg); const keepOut = await outText(pg);
await pick(pg, "en"); const k1 = [await outText(pg), await pg.$eval("#tashkeelIn", e => e.value)]; await pick(pg, "ar"); const k2 = [await outText(pg), await pg.$eval("#tashkeelIn", e => e.value)];
ck("2m. Tashkeel: input and real output identical after ar→en→ar", k1[0] === keepOut && k2[0] === keepOut && k1[1] === SENT && k2[1] === SENT);
await pg.ctx.close();

pg = await fresh(1280, 800); await go(pg, "/calligraphy-editor/"); await sleep(800);
await pg.click('[data-tool="text"]'); await pg.waitForSelector(".text-panel-input", { visible: true }); await pg.type(".text-panel-input", "فتحة");
const pv = async () => pg.$eval(".text-panel-preview", e => e.textContent.trim());
await pg.click('#top-bar .lang-opt[data-lang="en"]'); await ready(pg, "en"); await sleep(300);
const pvEn = await pv(), taEn = await pg.$eval(".text-panel-input", e => e.value);
ck("2n. editor: typed Arabic (even a word that is also a UI label, فتحة) is NOT translated in the preview or textarea", taEn === "فتحة" && !/Fatha/i.test(pvEn), JSON.stringify({ pvEn, taEn }));
await pg.evaluate(() => document.querySelector(".text-panel-submit").click()); await pg.waitForFunction(() => document.querySelector("#scene").querySelectorAll("path,g").length > 0, { timeout: 30000 }).catch(() => { });
const scene1 = await pg.$eval("#scene", e => e.innerHTML);
await pg.click('#top-bar .lang-opt[data-lang="ar"]'); await ready(pg, "ar"); await sleep(200);
await pg.click('#top-bar .lang-opt[data-lang="en"]'); await ready(pg, "en"); await sleep(200);
const scene2 = await pg.$eval("#scene", e => e.innerHTML);
ck("2o. editor: a real calligraphy object added on canvas is byte-identical after en→ar→en", scene1.length > 500 && scene1 === scene2, `${scene1.length} bytes`);
ck("2p. editor: no JS errors", pg.errs.length === 0, pg.errs.join("|"));
await pg.ctx.close();

/* ================= 3. Deployment readiness ================= */
/* 3a returning visitor with the OLD deployed version gets the new scripts/pages after the service worker updates */
curRoot = OLD;
pg = await fresh({ intercept: false });
await go(pg, "/"); await pg.evaluate(() => navigator.serviceWorker.ready);
await pg.waitForFunction(async () => (await caches.keys()).some(k => /shell-v5$/.test(k)), { timeout: 15000 });
await go(pg, "/faq/"); await sleep(500);
const oldHas = await pg.evaluate(() => ({ sw: !!document.querySelector('script[src*="i18n.js"]'), sw5: null }));
const oldKeys = await pg.evaluate(async () => (await caches.keys()).join());
ck("3a. (setup) old deployment installed its service worker (shell-v5) and has NO language switcher", !oldHas.sw && /shell-v5/.test(oldKeys) && (await pg.$$(".lang-switch")).length === 0, oldKeys);
curRoot = NEW;                                                         // "deploy" the new version
await go(pg, "/"); const firstAfter = await pg.evaluate(() => document.querySelectorAll(".lang-switch").length);
await pg.waitForFunction(async (nv) => { const k = await caches.keys(); return k.some(x => new RegExp("shell-v" + nv + "$").test(x)) && !k.some(x => /shell-v5$/.test(x)); }, { timeout: 25000 }, NEW_SHELL);
info(`first navigation right after deploy showed ${firstAfter ? "the NEW" : "the OLD (cached)"} page; SW then updated to shell-v${NEW_SHELL} and deleted v5`);
await go(pg, "/"); const r1 = await pg.evaluate(() => ({ sw: document.querySelectorAll(".lang-switch").length, tash: document.querySelectorAll('nav.primary > .nav-item > a[href$="tashkeel/"]').length, script: !!document.querySelector('script[src="./assets/js/i18n.js"]') }));
ck("3b. returning visitor: after the SW update, the next load of / (precached) has the new script, switcher and Tashkeel link", r1.sw >= 2 && r1.tash === 1 && r1.script, JSON.stringify(r1));
await go(pg, "/faq/"); const r2a = await pg.evaluate(() => document.querySelectorAll(".lang-switch").length);
info(`/faq/ (NOT precached) seconds after deploy, HTTP cache still fresh (max-age=600): ${r2a ? "already new" : "still the old copy (pre-existing 10-minute hosting cache TTL, not a service-worker issue)"}`);
cc = "no-cache"; { const cdp = await pg.createCDPSession(); await cdp.send("Network.clearBrowserCache"); }   // = the 10-minute HTTP-cache TTL has expired
await pg.evaluate(async (nv) => { for (const k of await caches.keys()) if (new RegExp("shell-v" + nv + "$").test(k)) await (await caches.open(k)).delete("/faq/"); }, NEW_SHELL);
await go(pg, "/faq/"); const r2 = await pg.evaluate(() => ({ sw: document.querySelectorAll(".lang-switch").length, script: !!document.querySelector('script[src="../assets/js/i18n.js"]') }));
ck("3b2. non-precached page (/faq/) picks up the new script + switcher once its HTTP-cache TTL has expired (shell-v5 copy is gone)", r2.sw >= 2 && r2.script, JSON.stringify(r2));
const swState = await pg.evaluate(async (nv) => { const r = await navigator.serviceWorker.getRegistration(); const c = await caches.open((await caches.keys()).find(k => new RegExp("shell-v" + nv + "$").test(k))); return { ctl: !!navigator.serviceWorker.controller, i18n: !!(await c.match("/assets/js/i18n.js")), keys: (await caches.keys()).join() }; }, NEW_SHELL);
ck(`3c. new service worker controls the page and i18n.js is precached in shell-v${NEW_SHELL}`, swState.ctl && swState.i18n, JSON.stringify(swState));
await pick(pg, "en");                                                   // English once online → dictionary cached
await sleep(800);
await pg.setOfflineMode(true); await go(pg, "/faq/"); await ready(pg, "en").catch(() => { }); const off = await st(pg);
ck("3d. offline: a visitor who used English once still gets the English page (dictionary served by the service worker)", off.lang === "en" && /^[\x00-\x7F]+$/.test(off.h1) && !off.hidden, JSON.stringify(off));
await pg.setOfflineMode(false); await pg.ctx.close();

/* 3e script paths on nested routes + no 4xx anywhere, both languages */
const PAGES = ["/", "/arabic-keyboard/", "/transliteration/", "/tashkeel/", "/translation/", "/editor/", "/typing-test/", "/arabic-typing-test/", "/arabic-alphabet/", "/learn-arabic/", "/tools/", "/faq/", "/about/", "/contact/", "/privacy/", "/terms/", "/calligraphy-editor/"];
pg = await fresh(); const badAll = [], tagBad = [];
for (const l of ["ar", "en"]) for (const u of PAGES) {
  pg.bad.length = 0; await go(pg, u + "?lang=" + l); await ready(pg, l); await sleep(150);
  const tag = await pg.evaluate(() => { const s = document.querySelector('script[src$="assets/js/i18n.js"]'); return s ? s.getAttribute("src") : null; });
  const want = u === "/" ? "./assets/js/i18n.js" : "../assets/js/i18n.js";
  if (tag !== want) tagBad.push(`${u}:${tag}`);
  badAll.push(...pg.bad.map(b => `${l} ${u} ${b}`));
}
ck("3e. every page (15 + editor) loads i18n.js with the right relative path; no 4xx/5xx for any asset incl. the dictionary, in both languages", tagBad.length === 0 && badAll.length === 0, JSON.stringify({ tagBad, badAll: [...new Set(badAll)].slice(0, 8) }));
await pg.ctx.close();

/* 3f coexistence of Tashkeel link + switcher + mobile menu, every page, both widths, both languages */
const probs = [];
for (const [w, h] of [[1280, 900], [390, 800]]) {
  pg = await fresh({ w, h });
  for (const l of ["ar", "en"]) for (const u of PAGES.filter(p => p !== "/calligraphy-editor/")) {
    await go(pg, u + "?lang=" + l); await ready(pg, l);
    const r = await pg.evaluate((w) => {
      const q = s => [...document.querySelectorAll(s)], vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
      const topTash = q('nav.primary > .nav-item > a[href$="tashkeel/"]'), dropTash = q('nav.primary .dropdown a[href$="tashkeel/"]'), mobTash = q('#mobileNav .mobile-panel > a[href$="tashkeel/"]');
      const sw = q(".lang-switch"), hdrSw = q("header.site .head-actions .lang-switch"), mobSw = q("#mobileNav .lang-switch");
      const hdr = document.querySelector("header.site").getBoundingClientRect();
      const topTr = q('nav.primary > .nav-item > a[href$="translation/"]'), dropTr = q('nav.primary .dropdown a[href$="translation/"]'), mobTr = q('#mobileNav .mobile-panel a[href$="translation/"]'), trCur = q('a[aria-current="page"][href$="translation/"]');
      return { topTr: topTr.length, dropTr: dropTr.length, mobTr: mobTr.length, trCur: trCur.length, topTash: topTash.length, dropTash: dropTash.length, mobTash: mobTash.length, sw: sw.length, hdrSw: hdrSw.length, mobSw: mobSw.length,
        deskVisible: w > 860 ? vis(topTash[0]) && vis(hdrSw[0]) : null, mobHidden: w <= 860 ? !vis(hdrSw[0]) && getComputedStyle(document.querySelector("nav.primary")).display === "none" : null,
        cur: q('[aria-current="page"][href$="tashkeel/"]').length, scrollX: document.documentElement.scrollWidth - innerWidth, hdrH: Math.round(hdr.height) };
    }, w);
    const isTk = u === "/tashkeel/", isTr = u === "/translation/";
    const ok = r.topTash === 1 && r.dropTash === 1 && r.mobTash === 2 && r.sw === 2 && r.hdrSw === 1 && r.mobSw === 1 && (w > 860 ? r.deskVisible : r.mobHidden) && (isTk ? r.cur >= 2 : r.cur === 0) && r.topTr === 1 && r.dropTr === 1 && r.mobTr === 2 && (isTr ? r.trCur >= 2 : r.trCur === 0) && r.scrollX <= 1 && r.hdrH <= 80;
    if (!ok) probs.push(`${w}px ${l} ${u} ${JSON.stringify(r)}`);
    if (w <= 860 && (u === "/" || isTk)) {                                  // mobile menu: open, Tashkeel link works, switcher inside works
      await pg.click("#menuToggle"); await pg.waitForSelector("#mobileNav.open");
      const inMenu = await pg.evaluate(() => { const a = document.querySelector('#mobileNav .mobile-panel > a[href$="tashkeel/"]'), s = document.querySelector("#mobileNav .lang-switch"); const ra = a.getBoundingClientRect(), rs = s.getBoundingClientRect(); return ra.width > 0 && rs.width > 0 && rs.bottom <= ra.top + 1 || rs.bottom <= innerHeight; });
      if (!inMenu) probs.push(`${w}px ${l} ${u} mobile menu layout`);
      await pg.click('#mobileNav .close-x button, #mobileNav .close-x .icon-btn').catch(() => { }); await sleep(100);
    }
  }
  await pg.ctx.close();
}
ck("3f. every page × desktop/mobile × ar/en: exactly one top-level Tashkeel AND Translation link, each also in the Tools dropdown and twice in the mobile menu (top-level + Tools group), one header + one menu switcher, correct visibility, active state only on /tashkeel/, no overflow", probs.length === 0, probs.slice(0, 4).join(" ;; "));

/* 3g mobile click-through: Tashkeel link inside the menu, both languages */
for (const l of ["ar", "en"]) {
  pg = await fresh({ w: 390, h: 800 }); await go(pg, "/faq/?lang=" + l); await ready(pg, l);
  await pg.click("#menuToggle"); await pg.waitForSelector("#mobileNav.open");
  await Promise.all([pg.waitForNavigation({ waitUntil: "load" }), pg.click('#mobileNav .mobile-panel > a[href$="tashkeel/"]')]); await ready(pg, l);
  const s = await st(pg);
  ck(`3g. mobile (${l}): menu → Tashkeel opens /tashkeel/ and keeps the language`, new URL(pg.url()).pathname === "/tashkeel/" && s.lang === l && consistent(s) && await pg.$("#tashkeelRun") !== null, JSON.stringify(s));
  await pg.ctx.close();
}
} catch (e) { ck("QA script ran to completion (unexpected exception)", false, e.stack.split("\n").slice(0, 4).join(" | ")); }

const okN = results.filter(Boolean).length;
console.log(`\nQA-FINAL: ${okN}/${results.length} passed` + (bad.length ? "\nFAILED:\n - " + bad.join("\n - ") : ""));
await browser.close(); srv.close(); process.exit(bad.length ? 1 : 0);
