// End-to-end test in a REAL browser (headless Chromium) against the repo root served as a static site
// (same shape as GitHub Pages). Run: npm install && npm run e2e
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const PORT = 8124, ORIGIN = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain", ".onnx": "application/octet-stream", ".webmanifest": "application/manifest+json" };
let throttleBps = 0;   // bytes/second for /assets/vendor/ files when > 0 (slow-network test)
const hits = [];            // every path requested from the server (proves what was / was not downloaded)
const overrides = {};       // path -> absolute file, to simulate deploying a different file (e.g. a new sw.js)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname); hits.push(p);
  let f = overrides[p] || path.join(ROOT, p); if (!overrides[p] && !f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end("not found"); }
  const hdr = { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "max-age=600" };
  if (throttleBps && f.includes("/assets/vendor/")) {
    const buf = fs.readFileSync(f); hdr["content-length"] = buf.length; res.writeHead(200, hdr);
    const step = Math.max(1024, Math.floor(throttleBps / 20)); let o = 0;
    const t = setInterval(() => { if (o >= buf.length || res.destroyed) { clearInterval(t); return res.end(); } res.write(buf.subarray(o, o + step)); o += step; }, 50);
    return;
  }
  res.writeHead(200, hdr);
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

const results = []; let shots = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  — " + detail : "")); };
const browser = await puppeteer.launch({ args: [...chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const M = (x) => x.replace(/([\u064E\u064F\u0650])\u0651/g, "\u0651$1");   // normalise literal typing order
const strip = (s) => s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");

async function fresh({ width = 1280, height = 900, dark = false, intercept = true } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  page.errors = []; page.failed = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_(INTERNET|NAME|CONNECTION|FAILED)|fonts\.g|googleads|pagead|adsbygoogle|Failed to load resource/i.test(m.text())) page.errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (r.url().startsWith(ORIGIN)) page.failed.push(r.url().replace(ORIGIN, "") + " " + (r.failure()?.errorText || "")); });
  // Third-party fonts/ads are blocked (deterministic test). Per-test hook: page.route(req) -> true if handled.
  page.route = null;
  if (intercept) {
    await page.setBypassServiceWorker(true);   // so request hooks see every request (12e uses intercept:false => real SW)
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      if (r.isInterceptResolutionHandled()) return;
      if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:")) return r.abort("blockedbyclient");
      if (page.route && page.route(r) === true) return;
      r.continue();
    });
  }
  page.dark = dark;   // the site toggles theme via the data-theme attribute (not persisted)
  return { ctx, page };
}
const open = async (page) => { await page.goto(ORIGIN + "/tashkeel/", { waitUntil: "load" }); if (page.dark) await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark")); };
const setText = (page, v) => page.$eval("#tashkeelIn", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const status = (page) => page.$eval("#tashkeelStatus", (e) => ({ hidden: e.hidden, kind: e.dataset.kind, text: e.textContent }));
const out = (page) => page.$eval("#tashkeelOut", (e) => e.textContent);
async function run(page, v, timeout = 90000) {
  if (v !== undefined) await setText(page, v);
  await page.click("#tashkeelRun");
  await page.waitForFunction(() => { const b = document.getElementById("tashkeelRun"); return !b.disabled; }, { timeout });
  return out(page);
}
const png = async (page, name) => { shots++; await page.screenshot({ path: `/tmp/e2e-${name}.png`, fullPage: true }); };

try {
  /* ---- scenario 1,8,10: first load, real model, loading state observed ---- */
  let { ctx, page } = await fresh();
  await open(page);
  const pre = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname).filter((p) => p.includes("/assets/vendor/")));
  check("page view alone downloads NO model/runtime (loaded only on first click)", pre.length === 0, JSON.stringify(pre));
  await setText(page, "محمد قرأ الكتاب");
  const t0 = Date.now();
  await page.click("#tashkeelRun");
  await page.waitForFunction(() => document.getElementById("tashkeelRun").getAttribute("aria-busy") === "true");
  const loading = await page.evaluate(() => ({ dis: document.getElementById("tashkeelRun").disabled, prog: !document.getElementById("tashkeelProgress").hidden, st: document.getElementById("tashkeelStatus").textContent }));
  check("loading state visible while model loads", loading.dis && loading.prog && /جارٍ/.test(loading.st), loading.st);
  await page.waitForFunction(() => !document.getElementById("tashkeelRun").disabled, { timeout: 90000 });
  const first = await out(page);
  console.log("  first run incl. model download+init: " + (Date.now() - t0) + " ms (local server)");
  check("1. short sentence is vocalized by the real model", first === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ"), first);
  check("success state shown", (await status(page)).kind === "ok", (await status(page)).text);
  check("no page errors on first run", page.errors.length === 0, page.errors.join(" | "));
  check("no failed same-origin requests", page.failed.length === 0, page.failed.join(" | "));

  const ts = Date.now();
  const second = await run(page, "العلم نور والجهل ظلمة");
  console.log("  second run (model warm): " + (Date.now() - ts) + " ms");
  check("1b. different sentence gives different, correct-shaped output", second === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ") && second !== first, second);

  /* ---- 2,3,4,5,7,8: content scenarios (same page, warm model) ---- */
  const para = "اللغة العربية من أقدم اللغات الحية في العالم، ويتحدث بها مئات الملايين من الناس. وهي لغة القرآن الكريم.";
  let o = await run(page, para);
  check("2. paragraph of several sentences: text preserved, marks added", strip(o) === para && /[\u064B-\u0652]/.test(o));
  const multi = "الفقرة الأولى هنا.\n\nالفقرة الثانية: ما هذا؟\n\n\nالسطر الثالث!";   // (browsers normalise CRLF to LF inside <textarea>)
  o = await run(page, multi);
  check("3. paragraphs / blank lines / multiple line breaks preserved exactly", strip(o) === multi && o.includes("\n\n\n"));
  const poem = "إذا الشعب يوما أراد الحياة\nفلا بد أن يستجيب القدر";
  o = await run(page, poem);
  check("4. poetry keeps its two lines", strip(o) === poem && o.split("\n").length === 2);
  o = await run(page, "مُحَمَّدٌ قرأ الكِتَابَ");
  check("5. existing tashkeel kept verbatim (user's own mark order), bare letters filled", o === "مُحَمَّدٌ قَرَأَ الْكِتَابَ", o);
  const mixed = "أستخدم Google Chrome منذ 2026، ثم قرأت: \"الكتاب\" (جيد) — 100%";
  o = await run(page, mixed);
  check("7/8. Arabic+English, digits, quotes, brackets, symbols preserved", strip(o) === mixed && o.includes("Google Chrome") && o.includes("2026") && o.includes("100%"), o);

  /* ---- 6: empty / whitespace ---- */
  for (const v of ["", "  \n\t "]) {
    await setText(page, v); await page.click("#tashkeelRun");
    const s = await status(page);
    check("6. validation for " + JSON.stringify(v), !s.hidden && s.kind === "warn" && /اكتب أو الصق/.test(s.text));
  }

  /* ---- 9: long text beyond 1,024 chars ---- */
  const longT = ("ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة. عاد إلى البيت مساء ولعب مع أصدقائه.\n").repeat(40);
  const tl = Date.now();
  o = await run(page, longT);
  console.log(`  ${longT.length} chars processed in ${Date.now() - tl} ms`);
  check("9. text >1,024 chars fully processed, none dropped, newlines kept", strip(o) === longT && longT.length > 3000 && (o.match(/\n/g) || []).length === 40, "len " + longT.length);
  const last = o.trimEnd().split("\n").pop();
  check("9b. the LAST line (past any truncation point) is vocalized", /[\u064B-\u0652]/.test(last), last);
  const lenSt = await status(page);
  check("9c. progress/success message shown", lenSt.kind === "ok");

  /* ---- 10: copy / clear / example ---- */
  await run(page, "محمد قرأ الكتاب");
  await page.click("#tashkeelCopy");
  await new Promise((r) => setTimeout(r, 300));
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("10. copy puts the exact vocalized text on the clipboard", clip === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ"), clip);
  await page.click("#tashkeelClear");
  check("10. clear resets input/output/copy", (await page.$eval("#tashkeelIn", (e) => e.value)) === "" && (await out(page)) === "—" && await page.$eval("#tashkeelCopy", (e) => e.disabled));
  await page.click("#tashkeelExample");
  const ex = await page.$eval("#tashkeelIn", (e) => e.value);
  o = await run(page);
  check("10. example button fills Arabic text and it vocalizes", /[\u0621-\u064A]/.test(ex) && strip(o) === ex && /[\u064B-\u0652]/.test(o), ex.slice(0, 30));

  /* ---- 11: layouts (screenshots + overflow) ---- */
  await png(page, "desktop-light");
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("11. desktop: no horizontal overflow", ov <= 0, "overflow " + ov);
  const font = await page.$eval("#tashkeelOut", (e) => ({ dir: getComputedStyle(e).direction, lh: getComputedStyle(e).lineHeight, fs: getComputedStyle(e).fontSize, ws: getComputedStyle(e).whiteSpace }));
  check("11. output is RTL, pre-wrap, tall enough line-height for marks", font.dir === "rtl" && font.ws === "pre-wrap" && parseFloat(font.lh) / parseFloat(font.fs) >= 2, JSON.stringify(font));
  await ctx.close();

  /* mobile + dark */
  ({ ctx, page } = await fresh({ width: 390, height: 844 }));
  await open(page); await run(page, "ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة بعد انتهاء الدروس");
  await png(page, "mobile-light");
  const ovm = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const btnH = await page.$eval("#tashkeelRun", (e) => e.getBoundingClientRect().height);
  check("11. mobile 390px: no horizontal overflow; tap targets >= 44px", ovm <= 0 && btnH >= 44, `overflow ${ovm}, button ${btnH}px`);
  await ctx.close();
  ({ ctx, page } = await fresh({ width: 390, height: 844, dark: true }));
  await open(page); await run(page, "العلم نور والجهل ظلمة");
  check("11. dark mode actually applied", await page.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await png(page, "mobile-dark");
  await ctx.close();

  /* ---- 12a: slow network (server-side throttle ~1.5 MB/s ≈ 12 Mbit/s on model+runtime) ---- */
  ({ ctx, page } = await fresh());
  await open(page);
  throttleBps = 1.5 * 1024 * 1024;
  const tslow = Date.now();
  await setText(page, "محمد قرأ الكتاب"); await page.click("#tashkeelRun");
  await new Promise((r) => setTimeout(r, 2500));
  const mid = await page.evaluate(() => ({ st: document.getElementById("tashkeelStatus").textContent, w: document.getElementById("tashkeelBar").style.width, busy: document.getElementById("tashkeelRun").disabled }));
  check("12a. slow network: still loading, with live MB counter and growing progress bar", mid.busy && /م\.ب/.test(mid.st) && parseInt(mid.w) > 0 && parseInt(mid.w) < 100, JSON.stringify(mid).slice(0, 170));
  await page.waitForFunction(() => !document.getElementById("tashkeelRun").disabled, { timeout: 120000 });
  console.log("  slow-network first result after " + (Date.now() - tslow) + " ms");
  check("12a. slow network completes with the correct result", (await out(page)) === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ"));
  throttleBps = 0;
  await ctx.close();

  /* ---- 12b: model download blocked -> error + retry works ---- */
  ({ ctx, page } = await fresh());
  await open(page);
  let block = true;
  page.route = (r) => { if (block && r.url().endsWith("/model.onnx")) { r.abort("failed"); return true; } };
  await setText(page, "محمد قرأ الكتاب"); await page.click("#tashkeelRun");
  await page.waitForFunction(() => !document.getElementById("tashkeelError").hidden, { timeout: 60000 });
  const e1 = await page.$eval("#tashkeelErrorMsg", (e) => e.textContent);
  check("12b. blocked model download -> clear error, NO success state, no output", /تعذّر تحميل نموذج/.test(e1) && (await out(page)) === "—" && (await status(page)).kind !== "ok", e1);
  check("12b. run button re-enabled after failure", !(await page.$eval("#tashkeelRun", (e) => e.disabled)));
  block = false;
  await page.click("#tashkeelRetry");
  await page.waitForFunction(() => !document.getElementById("tashkeelRun").disabled && document.getElementById("tashkeelOut").textContent !== "—", { timeout: 90000 });
  check("12b. Retry after the network recovers produces the real result", (await out(page)) === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ") && await page.$eval("#tashkeelError", (e) => e.hidden));
  await ctx.close();

  /* ---- 12c: corrupted model (right size, one flipped byte) -> checksum error ---- */
  ({ ctx, page } = await fresh());
  await open(page);
  page.route = (r) => {
    if (r.url().endsWith("/model.onnx")) { const b = Buffer.from(fs.readFileSync(path.join(ROOT, "assets/vendor/ichkil/model.onnx"))); b[100000] ^= 0xff; r.respond({ status: 200, contentType: "application/octet-stream", body: b }); return true; }
  };
  await setText(page, "محمد قرأ الكتاب"); await page.click("#tashkeelRun");
  await page.waitForFunction(() => !document.getElementById("tashkeelError").hidden, { timeout: 60000 });
  const e2 = await page.$eval("#tashkeelErrorMsg", (e) => e.textContent);
  check("12c. tampered/corrupted model is rejected by the SHA-256 check", /تالف أو غير مطابق/.test(e2) && (await out(page)) === "—", e2);
  await ctx.close();

  /* ---- 12d: HTML returned instead of the WASM runtime (what a stale SW fallback used to do) ---- */
  ({ ctx, page } = await fresh());
  await open(page);
  page.route = (r) => { if (r.url().endsWith(".wasm")) { r.respond({ status: 200, contentType: "text/html", body: "<html>home</html>" }); return true; } };
  await setText(page, "محمد قرأ الكتاب"); await page.click("#tashkeelRun");
  await page.waitForFunction(() => !document.getElementById("tashkeelError").hidden, { timeout: 60000 });
  check("12d. non-WASM payload for the runtime -> error, never a fake success", (await out(page)) === "—" && (await status(page)).kind !== "ok", await page.$eval("#tashkeelErrorMsg", (e) => e.textContent));
  await ctx.close();

  /* ---- 12e: service worker caching -> works offline after first use ---- */
  ({ ctx, page } = await fresh({ intercept: false }));   // real service worker, no request hooks
  await page.goto(ORIGIN + "/tashkeel/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });                    // now controlled by the SW
  const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
  await run(page, "محمد قرأ الكتاب");
  const cached = await page.evaluate(async () => {
    const out = { ks: await caches.keys(), vendorHas: [], shellHasVendor: false };
    for (const k of out.ks) for (const r of await (await caches.open(k)).keys()) {
      const n = new URL(r.url).pathname;
      if (/\/assets\/vendor\//.test(n)) { if (k.includes("vendor")) out.vendorHas.push(n.split("/").pop()); else out.shellHasVendor = true; }
    }
    return out;
  });
  check("12e. service worker controls the page; model + runtime are in the separate vendor cache (not the versioned shell cache)", ctl && cached.ks.some((k) => /shell-v\d+$/.test(k)) && cached.vendorHas.includes("model.onnx") && cached.vendorHas.includes("ort-wasm-simd-threaded.wasm") && !cached.shellHasVendor, JSON.stringify(cached));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  o = await run(page, "العلم نور والجهل ظلمة");
  check("12e. fully OFFLINE reload: tool still vocalizes using cached files", o === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ"), o);
  await ctx.close();

  /* ---- 13: Ichkil fixes in a real browser ---- */
  const SHELL_NOW = Number(/shell-v(\d+)/.exec(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"))[1]);   // the shell version actually shipped in sw.js
  const SHELL_RE = (n) => new RegExp("shell-v" + n + "$");
  const SW_NEXT = "/tmp/e2e-sw-next.js";                 // the production sw.js with a bumped shell version = "next deploy"
  fs.writeFileSync(SW_NEXT, fs.readFileSync(path.join(ROOT, "sw.js"), "utf8").replace(/shell-v(\d+)/, (m, n) => "shell-v" + (Number(n) + 1)));
  const SW_V4 = path.join(ROOT, "tests/tashkeel/fixtures/sw-v4-original.js");   // the previously deployed worker, verbatim
  const vendorHits = (from) => hits.slice(from).filter((h) => h.includes("/assets/vendor/"));
  const watchStatus = async (page, name) => {
    const seen = []; await page.exposeFunction(name, (t) => seen.push(t));
    await page.evaluate((name) => { const el = document.getElementById("tashkeelStatus"); new MutationObserver(() => window[name](el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); }, name);
    return seen;
  };
  const cacheReport = (page) => page.evaluate(async () => {
    const r = {}; for (const k of await caches.keys()) r[k] = (await (await caches.open(k)).keys()).map((q) => new URL(q.url).pathname.split("/").pop()).filter((n) => /model\.onnx|\.wasm|config\.json/.test(n));
    return r;
  });
  const modelsIn = (rep) => Object.entries(rep).filter(([k, v]) => v.includes("model.onnx") && v.includes("ort-wasm-simd-threaded.wasm")).map(([k]) => k);
  const waitForCache = (page, re) => page.waitForFunction(async (src) => (await caches.keys()).some((k) => new RegExp(src).test(k)), { timeout: 15000 }, re.source);

  // 13a/b: loading message is truthful; progress paints; then a SW upgrade keeps the model
  ({ ctx, page } = await fresh({ intercept: false }));
  await page.goto(ORIGIN + "/tashkeel/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  let seen = await watchStatus(page, "__s1");
  await run(page, "العلم نور");
  check("13a. first visit (nothing cached): says it is downloading for the first time", seen.some((t) => /لأول مرة/.test(t)), JSON.stringify([...new Set(seen)].slice(0, 2)));
  await page.reload({ waitUntil: "domcontentloaded" });
  seen = await watchStatus(page, "__s2");
  let h0 = hits.length;
  await run(page, "العلم نور");
  check("13a. cached visit: does NOT claim a first-time download; says it loads the saved model", !seen.some((t) => /لأول مرة/.test(t)) && seen.some((t) => /المحفوظ في متصفحك/.test(t)), JSON.stringify([...new Set(seen)].slice(0, 2)));
  check("13a. cached visit: model + runtime come from the cache, 0 requests to the server", vendorHits(h0).length === 0, JSON.stringify(vendorHits(h0)));

  const long = "ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة. عاد إلى البيت مساء ولعب مع أصدقائه.\n".repeat(150);
  await setText(page, long);
  await page.evaluate(() => { window.__frames = 0; window.__w = new Set(); const t = () => { window.__frames++; window.__w.add(document.getElementById("tashkeelBar").style.width); window.__raf = requestAnimationFrame(t); }; t(); });
  const tLong = Date.now(); await page.click("#tashkeelRun");
  await page.waitForFunction(() => !document.getElementById("tashkeelRun").disabled, { timeout: 120000 });
  const paint = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return { frames: window.__frames, widths: window.__w.size }; });
  check("13b. long text (13k chars): UI stays alive and the progress bar visibly advances", paint.frames >= 10 && paint.widths >= 4, `${long.length} chars in ${Date.now() - tLong} ms, frames=${paint.frames}, distinct bar widths=${paint.widths} (was 6 frames / 1 width before the fix)`);
  check("13b. long text result is complete", (await out(page)).replace(/[\u064B-\u0652]/g, "") === long.trim() || (await out(page)).replace(/[\u064B-\u0652]/g, "").trim() === long.trim());

  overrides["/sw.js"] = SW_NEXT;                                           // "deploy" a new shell version
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await waitForCache(page, SHELL_RE(SHELL_NOW + 1));
  await page.waitForFunction(async (src) => !(await caches.keys()).some((k) => new RegExp(src).test(k)), { timeout: 15000 }, SHELL_RE(SHELL_NOW).source);   // new worker finished activating
  let rep = await cacheReport(page);
  check("13c. next deploy (shell bumped): the 19 MB model + runtime survive in the vendor cache; old shell cache removed", modelsIn(rep).join() === "arabic-keyboard-vendor-v1" && !Object.keys(rep).some((k) => SHELL_RE(SHELL_NOW).test(k)), JSON.stringify(rep));
  await page.setOfflineMode(true); await page.reload({ waitUntil: "domcontentloaded" });
  h0 = hits.length;
  o = await run(page, "العلم نور والجهل ظلمة");
  check("13c. after the bump, fully OFFLINE: the tool still vocalizes", o === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ"), o);
  delete overrides["/sw.js"]; await ctx.close();

  // 13d: upgrade from the ORIGINAL deployed worker (v4, model inside the shell cache) -> migrated, no re-download
  ({ ctx, page } = await fresh({ intercept: false }));
  overrides["/sw.js"] = SW_V4;
  await page.goto(ORIGIN + "/tashkeel/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  await run(page, "محمد قرأ الكتاب");
  rep = await cacheReport(page);
  check("13d. (setup) original v4 worker stored the model inside its shell cache", modelsIn(rep).join() === "arabic-keyboard-shell-v4", JSON.stringify(rep));
  delete overrides["/sw.js"];                                              // deploy THIS repo's sw.js
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await waitForCache(page, /vendor-v1$/);
  await page.waitForFunction(async () => !(await caches.keys()).some((k) => /shell-v4$/.test(k)), { timeout: 15000 });
  rep = await cacheReport(page);
  check("13d. upgrade from v4: model + runtime migrated to the vendor cache, v4 cache deleted", modelsIn(rep).join() === "arabic-keyboard-vendor-v1" && !rep["arabic-keyboard-shell-v4"], JSON.stringify(rep));
  await page.setOfflineMode(true); await page.reload({ waitUntil: "domcontentloaded" });
  o = await run(page, "العلم نور والجهل ظلمة");
  check("13d. upgraded visitor works OFFLINE without ever re-downloading the model", o === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ"), o);
  await ctx.close();

  // 13e: a bad cached model must not trap the user: error -> cache purged -> Retry fetches a good copy
  ({ ctx, page } = await fresh({ intercept: false }));
  await page.goto(ORIGIN + "/tashkeel/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "domcontentloaded" });
  await run(page, "محمد قرأ الكتاب");
  await page.evaluate(async () => {                                        // corrupt the cached copy (one flipped byte)
    const c = await caches.open("arabic-keyboard-vendor-v1"); const key = (await c.keys()).find((r) => /model\.onnx$/.test(r.url));
    const b = new Uint8Array(await (await c.match(key)).arrayBuffer()); b[100000] ^= 0xff; await c.put(key, new Response(b));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await setText(page, "محمد قرأ الكتاب"); await page.click("#tashkeelRun");
  await page.waitForFunction(() => !document.getElementById("tashkeelError").hidden, { timeout: 60000 });
  const e3 = await page.$eval("#tashkeelErrorMsg", (e) => e.textContent);
  rep = await cacheReport(page);
  check("13e. corrupt cached model is rejected, and the bad copy is removed from the cache", /تالف أو غير مطابق/.test(e3) && !JSON.stringify(rep).includes("model.onnx"), e3 + " " + JSON.stringify(rep));
  h0 = hits.length;
  await page.click("#tashkeelRetry");
  await page.waitForFunction(() => !document.getElementById("tashkeelRun").disabled && document.getElementById("tashkeelOut").textContent !== "—", { timeout: 90000 });
  check("13e. Retry (no page reload) downloads a fresh copy from the server and succeeds", (await out(page)) === M("مُحَمَّدٌ قَرَأَ الْكِتَابِ") && vendorHits(h0).some((x) => x.endsWith("model.onnx")), JSON.stringify(vendorHits(h0).map((x) => x.split("/").pop())));
  rep = await cacheReport(page);
  check("13e. the good copy is cached again", modelsIn(rep).length === 1, JSON.stringify(rep));
  await ctx.close();

  // 13f/g: input integrity features through the real page
  ({ ctx, page } = await fresh());
  await open(page);
  const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/tashkeel/pres-fixtures.json"), "utf8")).pairs;
  const [plainT, presT] = pairs[0];
  const pres = await run(page, presT);
  check("13f. PDF-style presentation-form text is vocalized (not rejected as 'no Arabic'), original characters kept", strip(pres) === presT && /[\u064B-\u0652]/.test(pres) && (await status(page)).kind === "ok", pres);
  const plainOut = await run(page, plainT);
  check("13f. ...with the same marks as the equivalent plain text", pres.normalize("NFKC") === plainOut.normalize("NFKC"), pres.normalize("NFKC") + " | " + plainOut.normalize("NFKC"));
  const quran = await run(page, "يجۡعل مِنۡ بِسۡمِ");
  check("13g. Quranic sukun (U+06E1) kept exactly; no extra vowel stacked on it", /ج\u06E1/.test(quran) && !/\u06E1[\u064B-\u0652]/.test(quran) && quran.includes("مِنۡ") && quran.includes("بِسۡمِ"), quran);
  const rlm = await run(page, "ذهب\u200F الولد إلى المدرسة");
  const noRlm = await run(page, "ذهب الولد إلى المدرسة");
  check("13h. an invisible RLM inside the text does not change the vocalization", rlm.replace("\u200F", "") === noRlm, rlm + " | " + noRlm);
  await ctx.close();

  /* ---- regression: unrelated pages still load ---- */
  ({ ctx, page } = await fresh());
  for (const p of ["/", "/arabic-keyboard/", "/editor/", "/transliteration/", "/faq/", "/privacy/", "/about/", "/tools/", "/calligraphy-editor/"]) {
    const res = await page.goto(ORIGIN + p, { waitUntil: "load" });
    const t = await page.title();
    check("regression: " + p + " loads (200, has title, no JS errors)", res.status() === 200 && t.length > 0 && page.errors.length === 0, `${res.status()} "${t.slice(0, 40)}" ${page.errors.join("|")}`);
    page.errors.length = 0;
  }
  await ctx.close();
} catch (e) {
  check("e2e run completed without crashing", false, e.stack);
} finally {
  await browser.close(); server.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\nE2E: ${results.length - bad.length}/${results.length} passed; screenshots: ${shots}`);
  process.exitCode = bad.length ? 1 : 0;
}
