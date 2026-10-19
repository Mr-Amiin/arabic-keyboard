// UI-state tests: the real page HTML + real tashkeel-tool.js in jsdom, with a STUB engine.
// (These verify interface logic only; real inference is covered by model.test.mjs and e2e.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync(new URL("../../tashkeel/index.html", import.meta.url), "utf8");
const toolJs = fs.readFileSync(new URL("../../assets/js/tashkeel-tool.js", import.meta.url), "utf8");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setup({ load, clipboard, caches, fetch, engine } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.arabic-keyboard.live/tashkeel/" });
  const w = dom.window;
  Object.defineProperty(w, "isSecureContext", { value: true });
  const calls = { load: 0, toasts: [], clip: [] };
  w.showToast = (m) => calls.toasts.push(m);
  w.IchkilTashkeel = Object.assign({ load: async (cfg) => { calls.load++; calls.cfg = cfg; return load ? load(cfg, calls) : okEngine(); } }, engine || {});
  if (caches !== undefined) Object.defineProperty(w, "caches", { value: caches, configurable: true });
  if (fetch) w.fetch = fetch;
  Object.defineProperty(w.navigator, "clipboard", { value: clipboard || { writeText: async (t) => { calls.clip.push(t); } }, configurable: true });
  w.eval(toolJs);
  w.ArabicTashkeel.init({});
  const $ = (id) => w.document.getElementById(id);
  return { w, $, calls, type: (v) => { $("tashkeelIn").value = v; $("tashkeelIn").dispatchEvent(new w.Event("input")); } };
}
const okEngine = () => ({ diacritize: async (t, o) => { o && o.onProgress && o.onProgress(1, 1); return { text: t + "ُ", chunks: 1, marksAdded: 3 }; } });
const err = (code) => Object.assign(new Error(code), { code });

test("the page ships the controls the task requires (Arabic labels, RTL input)", () => {
  const { $ } = setup();
  assert.equal($("tashkeelRun").textContent.includes("تشكيل النص"), true);
  assert.equal($("tashkeelCopy").textContent.trim(), "نسخ النص المشكول");
  assert.equal($("tashkeelClear").textContent.trim(), "مسح");
  assert.ok($("tashkeelExample") && $("tashkeelRetry") && $("tashkeelProgress"));
  assert.equal($("tashkeelIn").getAttribute("dir"), "rtl");
  assert.equal($("tashkeelOut").getAttribute("dir"), "rtl");
  assert.equal($("tashkeelCopy").disabled, true);
});

test("empty and whitespace-only input -> validation message, engine never loaded", async () => {
  const t = setup();
  for (const v of ["", "   \n\t "]) {
    t.type(v); t.$("tashkeelRun").click(); await tick();
    assert.equal(t.$("tashkeelStatus").hidden, false);
    assert.equal(t.$("tashkeelStatus").dataset.kind, "warn");
    assert.match(t.$("tashkeelStatus").textContent, /اكتب أو الصق نصًا عربيًا/);
  }
  assert.equal(t.calls.load, 0);
});

test("text with no Arabic letters -> clear message, no model load", async () => {
  const t = setup(); t.type("Hello 123"); t.$("tashkeelRun").click(); await tick();
  assert.match(t.$("tashkeelStatus").textContent, /لم أجد حروفًا عربية/);
  assert.equal(t.calls.load, 0);
});

test("input over the limit is refused explicitly, never silently truncated", async () => {
  const t = setup(); t.type("ب".repeat(50001)); t.$("tashkeelRun").click(); await tick();
  assert.match(t.$("tashkeelStatus").textContent, /أطول من الحد/);
  assert.equal(t.calls.load, 0);
  assert.equal(t.$("tashkeelCounts").classList.contains("over"), true);
});

test("character and word counts update live", () => {
  const t = setup(); t.type("قرأ الولد الكتاب");
  assert.match(t.$("tashkeelCounts").textContent, /١٦ حرف/);
  assert.match(t.$("tashkeelCounts").textContent, /٣ كلمة/);
});

test("loading state: button disabled + aria-busy + progress shown; then success state, output, copy enabled", async () => {
  let release; const gate = new Promise((r) => (release = r));
  const t = setup({ load: async (cfg) => { await gate; return okEngine(); } });
  t.type("قرأ الولد"); t.$("tashkeelRun").click(); await tick();
  assert.equal(t.$("tashkeelRun").disabled, true);
  assert.equal(t.$("tashkeelRun").getAttribute("aria-busy"), "true");
  assert.equal(t.$("tashkeelProgress").hidden, false);
  release(); await tick(20);
  assert.equal(t.$("tashkeelRun").disabled, false);
  assert.equal(t.$("tashkeelOut").textContent, "قرأ الولدُ");
  assert.equal(t.$("tashkeelCopy").disabled, false);
  assert.equal(t.$("tashkeelStatus").dataset.kind, "ok");
  assert.match(t.$("tashkeelStatus").textContent, /تم التشكيل/);
  assert.equal(t.$("tashkeelProgress").hidden, true);
  assert.equal(t.$("tashkeelError").hidden, true);
});

test("model is loaded once and reused on later clicks", async () => {
  const t = setup(); t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10); t.$("tashkeelRun").click(); await tick(10);
  assert.equal(t.calls.load, 1);
});

test("self-hosted, same-origin asset URLs are passed to the loader (no third party)", async () => {
  const t = setup(); t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
  for (const k of ["ortUrl", "wasmUrl", "modelUrl", "configUrl", "wasmBase"]) {
    assert.ok(t.calls.cfg[k].startsWith("https://www.arabic-keyboard.live/assets/vendor/"), k + " = " + t.calls.cfg[k]);
  }
  assert.ok(!/huggingface|cdn|unpkg|jsdelivr/.test(JSON.stringify(t.calls.cfg)));
});

test("load failure -> useful error + retry; failure is NOT cached; retry succeeds", async () => {
  let n = 0;
  const t = setup({ load: async () => { if (++n === 1) throw err("FETCH_FAILED"); return okEngine(); } });
  t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
  assert.equal(t.$("tashkeelError").hidden, false);
  assert.match(t.$("tashkeelErrorMsg").textContent, /تعذّر تحميل نموذج التشكيل/);
  assert.equal(t.$("tashkeelOut").textContent, "—");              // never reports success
  assert.equal(t.$("tashkeelCopy").disabled, true);
  assert.equal(t.$("tashkeelRun").disabled, false);
  t.$("tashkeelRetry").click(); await tick(20);
  assert.equal(t.calls.load, 2);
  assert.equal(t.$("tashkeelError").hidden, true);
  assert.equal(t.$("tashkeelOut").textContent, "قرأُ");
});

test("each failure code maps to its own message; unknown errors get a generic one", async () => {
  const want = { CHECKSUM_FAILED: /تالف/, SESSION_FAILED: /تعذّر تشغيل النموذج/, RUNTIME_LOAD_FAILED: /مكوّن التشغيل/, INFERENCE_FAILED: /أثناء معالجة النص/, INTEGRITY: /لم يُعرض أي ناتج/, WEIRD: /غير متوقع/ };
  for (const [code, re] of Object.entries(want)) {
    const t = setup({ load: async () => { throw err(code); } });
    t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
    assert.match(t.$("tashkeelErrorMsg").textContent, re, code);
  }
});

test("inference error after a successful load shows an error and no output", async () => {
  const t = setup({ load: async () => ({ diacritize: async () => { throw err("INFERENCE_FAILED"); } }) });
  t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
  assert.equal(t.$("tashkeelError").hidden, false);
  assert.equal(t.$("tashkeelOut").textContent, "—");
  assert.notEqual(t.$("tashkeelStatus").dataset.kind, "ok");
});

test("copy writes the exact result; clipboard failure degrades to a message", async () => {
  const t = setup(); t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
  t.$("tashkeelCopy").click(); await tick(10);
  assert.deepEqual(t.calls.clip, ["قرأُ"]);
  assert.ok(t.calls.toasts.some((m) => /نسخ/.test(m)));
  const f = setup({ clipboard: { writeText: async () => { throw new Error("denied"); } } });
  f.type("قرأ"); f.$("tashkeelRun").click(); await tick(10);
  f.w.document.execCommand = () => false;
  f.$("tashkeelCopy").click(); await tick(10);
  assert.match(f.$("tashkeelStatus").textContent, /تعذّر النسخ/);
});

test("clear resets input, output, status, error, counts and disables copy", async () => {
  const t = setup(); t.type("قرأ"); t.$("tashkeelRun").click(); await tick(10);
  t.$("tashkeelClear").click();
  assert.equal(t.$("tashkeelIn").value, ""); assert.equal(t.$("tashkeelOut").textContent, "—");
  assert.equal(t.$("tashkeelCopy").disabled, true); assert.equal(t.$("tashkeelStatus").hidden, true);
  assert.match(t.$("tashkeelCounts").textContent, /٠ حرف/);
});

test("example button fills Arabic sample text and cycles through different examples", () => {
  const t = setup(); const seen = new Set();
  for (let i = 0; i < 3; i++) { t.$("tashkeelExample").click(); seen.add(t.$("tashkeelIn").value); assert.match(t.$("tashkeelIn").value, /[\u0621-\u064A]/); }
  assert.equal(seen.size, 3);
});

/* ---------- Ichkil fixes: loading honesty, self-healing retry, presentation forms ---------- */
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
function fakeCaches(storeUrls) {                // a minimal CacheStorage: which URLs are cached, and what gets deleted
  const deleted = [];
  return {
    deleted,
    match: async (u) => (storeUrls.includes(u) ? {} : undefined),
    keys: async () => ["shell", "vendor"],
    open: async (k) => ({ delete: async (u) => { deleted.push(k + ":" + u.split("/").pop()); return true; } })
  };
}
const downloadStatus = async (t) => {          // run once; report the status text shown while the model downloads
  let seen = "";
  const load = async (cfg) => { cfg.onStatus({ phase: "download", label: "model", loaded: 1048576, total: 5068871 }); seen = t.$("tashkeelStatus").textContent; return okEngine(); };
  return { load, get seen() { return seen; } };
};

test("loading message: model already in this browser's cache -> says so, never 'first time'", async () => {
  let probe;
  const t = setup({ caches: undefined, load: (cfg) => probe.load(cfg) });
  const urls = []; const c = fakeCaches([]);
  Object.defineProperty(t.w, "caches", { value: Object.assign(c, { match: async () => ({}) }), configurable: true });
  probe = await downloadStatus(t);
  t.type("محمد"); t.$("tashkeelRun").click(); await settle();
  assert.match(probe.seen, /المحفوظ في متصفحك/);
  assert.doesNotMatch(probe.seen, /لأول مرة/);
});

test("loading message: nothing cached -> 'first time'; Cache API unavailable -> neutral wording (no false claim)", async () => {
  let probe;
  const t1 = setup({ caches: fakeCaches([]), load: (cfg) => probe.load(cfg) });
  probe = await downloadStatus(t1); t1.type("محمد"); t1.$("tashkeelRun").click(); await settle();
  assert.match(probe.seen, /لأول مرة/);
  let probe2;
  const t2 = setup({ load: (cfg) => probe2.load(cfg) });                  // jsdom has no CacheStorage
  probe2 = await downloadStatus(t2); t2.type("محمد"); t2.$("tashkeelRun").click(); await settle();
  assert.match(probe2.seen, /جارٍ تحميل نموذج التشكيل/);
  assert.doesNotMatch(probe2.seen, /لأول مرة/);
});

test("corrupt file: cached copies of all three files are purged and the retry bypasses the HTTP cache", async () => {
  const caches = fakeCaches([]);
  const fetched = [];
  let attempt = 0, cfgSeen, duringRetry;
  const t = setup({
    caches, fetch: async (u, o) => { fetched.push(o && o.cache); return {}; },
    load: async (cfg) => {
      cfgSeen = cfg;
      if (++attempt === 1) throw Object.assign(new Error("bad hash"), { code: "CHECKSUM_FAILED", corrupt: true });
      await cfg.fetch("https://x/model.onnx", { cache: "default" });      // a download made DURING the retry
      duringRetry = fetched.at(-1);
      return okEngine();
    }
  });
  t.type("محمد"); t.$("tashkeelRun").click(); await settle();
  assert.equal(t.$("tashkeelError").hidden, false);
  assert.match(t.$("tashkeelErrorMsg").textContent, /تالف أو غير مطابق/);
  for (const f of ["model.onnx", "config.json", "ort-wasm-simd-threaded.wasm"]) {
    for (const k of ["shell", "vendor"]) assert.ok(caches.deleted.includes(k + ":" + f), "purged " + k + ":" + f);
  }
  t.$("tashkeelRetry").click(); await settle();                          // retry: second load succeeds
  assert.equal(attempt, 2);
  assert.equal(duringRetry, "reload", "retry bypasses the HTTP cache");
  assert.equal(t.$("tashkeelOut").textContent.length > 1, true);
  await cfgSeen.fetch("https://x/model.onnx", { cache: "default" });      // after success: back to normal caching
  assert.equal(fetched.at(-1), "default");
});

test("ordinary failures (network down) never purge the cache", async () => {
  const caches = fakeCaches([]);
  const t = setup({ caches, load: async () => { throw err("FETCH_FAILED"); } });
  t.type("محمد"); t.$("tashkeelRun").click(); await settle();
  assert.equal(t.$("tashkeelError").hidden, false);
  assert.deepEqual(caches.deleted, []);
});

test("Arabic detection understands presentation forms (PDF text), and defers to the engine when it can", async () => {
  const t1 = setup(); t1.type("ﻣﺤﻤﺪ"); t1.$("tashkeelRun").click(); await settle();
  assert.equal(t1.calls.load, 1, "presentation-form text is accepted (fallback regex)");
  const t2 = setup({ engine: { hasArabicLetters: () => false } }); t2.type("ﻣﺤﻤﺪ"); t2.$("tashkeelRun").click(); await settle();
  assert.equal(t2.calls.load, 0);
  assert.match(t2.$("tashkeelStatus").textContent, /لم أجد حروفًا عربية/);
});
