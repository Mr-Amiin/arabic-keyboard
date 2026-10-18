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
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
  let f = path.join(ROOT, p); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
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
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const names = []; for (const k of ks) for (const r of await (await caches.open(k)).keys()) names.push(new URL(r.url).pathname); return { ks, hasModel: names.some((n) => n.endsWith("model.onnx")), hasWasm: names.some((n) => n.endsWith(".wasm")) }; });
  check("12e. service worker (v4) controls the page and cached the model + runtime", ctl && cached.ks.some((k) => k.endsWith("v4")) && cached.hasModel && cached.hasWasm, JSON.stringify(cached));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  o = await run(page, "العلم نور والجهل ظلمة");
  check("12e. fully OFFLINE reload: tool still vocalizes using cached files", o === M("الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ"), o);
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
