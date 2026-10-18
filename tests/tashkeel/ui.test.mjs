// UI-state tests: the real page HTML + real tashkeel-tool.js in jsdom, with a STUB engine.
// (These verify interface logic only; real inference is covered by model.test.mjs and e2e.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync(new URL("../../tashkeel/index.html", import.meta.url), "utf8");
const toolJs = fs.readFileSync(new URL("../../assets/js/tashkeel-tool.js", import.meta.url), "utf8");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setup({ load, clipboard } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.arabic-keyboard.live/tashkeel/" });
  const w = dom.window;
  Object.defineProperty(w, "isSecureContext", { value: true });
  const calls = { load: 0, toasts: [], clip: [] };
  w.showToast = (m) => calls.toasts.push(m);
  w.IchkilTashkeel = { load: async (cfg) => { calls.load++; calls.cfg = cfg; return load ? load(cfg, calls) : okEngine(); } };
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
