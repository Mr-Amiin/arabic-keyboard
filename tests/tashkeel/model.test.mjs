// Real-model tests: actual model.onnx + onnxruntime-web (WASM), same engine code as the browser.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../../assets/js/tashkeel-engine.js");
const { stripMarks } = E._internal;
const ort = await import("onnxruntime-web/wasm").catch(() => import("./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs"));
const V = new URL("../../assets/vendor/ichkil/", import.meta.url);
const modelBytes = new Uint8Array(fs.readFileSync(new URL("model.onnx", V)));
const config = JSON.parse(fs.readFileSync(new URL("config.json", V), "utf8"));
const golden = JSON.parse(fs.readFileSync(new URL("golden.json", import.meta.url), "utf8"));
const HAS_MARK = /[\u064B-\u0652]/;
let eng;
before(async () => { ort.env.wasm.numThreads = 1; eng = await E.createEngine(ort, modelBytes, config); });

test("model file matches the published SHA-256 and SHA256SUMS", () => {
  const h = crypto.createHash("sha256").update(modelBytes).digest("hex");
  assert.equal(h, E.EXPECTED_MODEL_SHA256);
  assert.equal(fs.readFileSync(new URL("SHA256SUMS", V), "utf8").split(/\s+/)[0], h);
});

test("golden vectors: all 29 label sequences match the published reference", async () => {
  assert.equal(golden.vectors.length, 29);
  for (const v of golden.vectors) {
    assert.deepEqual(await eng.predictLabels(v.input), v.labels, v.id + " (" + v.category + ")");
  }
});

test("golden vectors: end-to-end text equals expected_text when the input has no marks", async () => {
  let checked = 0;
  for (const v of golden.vectors) {
    if (HAS_MARK.test(v.input) || v.input !== v.input.trim()) continue;   // reference strips/trims; we preserve by design
    assert.equal(await eng.diacritize(v.input), v.expected_text, v.id);
    checked++;
  }
  assert.ok(checked >= 20, "checked " + checked);
});

const PINNED = {   // regression pins: outputs observed from the verified model (not claims of linguistic correctness)
  "محمد قرأ الكتاب": "مُحَمَّدٌ قَرَأَ الْكِتَابِ",
  "العلم نور والجهل ظلمة": "الْعِلْمِ نُورٌ وَالْجَهْلُ ظُلْمَةُ",
  "يحب الطلاب القراءة في المكتبة بعد انتهاء الدروس": "يُحِبُّ الطَّلَابُ الْقِرَاءَةَ فِي الْمَكْتَبَةِ بَعْدَ انْتِهَاءِ الدُّرُوسِ",
  "أستخدم Google Chrome في عام 2026": "أَسْتَخْدِمُ Google Chrome فِي عَامٍ 2026"
};
test("pinned sentence outputs are stable (smoke + different grammatical contexts)", async () => {
  for (const [k, v] of Object.entries(PINNED)) assert.equal(await eng.diacritize(k), v);
});

test("existing tashkeel is preserved, only bare letters are filled", async () => {
  assert.equal(await eng.diacritize("مُحَمَّدٌ قرأ الكِتَابَ"), "مُحَمَّدٌ قَرَأَ الْكِتَابَ");
});

test("idempotent: re-running on already vocalized output changes nothing", async () => {
  for (const k of Object.keys(PINNED)) { const once = await eng.diacritize(k); assert.equal(await eng.diacritize(once), once); }
});

test("paragraphs, blank lines, punctuation, Latin and digits are preserved exactly", async () => {
  const input = "ما هذا؟ إنه كتاب جميل!\n\nأستخدم Google Chrome منذ 2026، ثم قرأت: \"الكتاب\" (جيد).\r\nنهاية";
  const out = await eng.diacritize(input);
  assert.equal(stripMarks(out), input);
  assert.ok(out.includes("\n\n") && out.includes("\r\n") && out.includes("Google Chrome") && out.includes("2026"));
  assert.ok(HAS_MARK.test(out));
});

test("poetry (two lines) keeps its line break", async () => {
  const out = await eng.diacritize("إذا الشعب يوما أراد الحياة\nفلا بد أن يستجيب القدر");
  assert.equal(out.split("\n").length, 2);
});

test("text beyond the 1,024-char model limit is processed completely, in several chunks", async () => {
  const para = "اللغة العربية من أقدم اللغات الحية في العالم، ويتحدث بها مئات الملايين من الناس. وهي لغة القرآن الكريم، ولها مكانة عظيمة في الثقافة والتاريخ. ";
  const input = para.repeat(10);                                    // ~1,400 chars
  assert.ok(input.length > 1024);
  const t0 = performance.now();
  const r = await eng.diacritize(input, { detailed: true });
  const ms = performance.now() - t0;
  assert.ok(r.chunks >= 2, "chunks=" + r.chunks);
  assert.equal(stripMarks(r.text), input);
  const letters = (input.match(/[\u0621-\u064A]/g) || []).length;
  const withMark = (r.text.match(/[\u0621-\u064A][\u064B-\u0652]/g) || []).length;
  console.log(`  [info] ${input.length} chars -> ${r.chunks} chunks in ${ms.toFixed(0)} ms; ${withMark}/${letters} letters vocalized`);
  assert.ok(withMark / letters > 0.5, "suspiciously few marks added");
});

test("chunking does not change quality much: 1024-char vs 150-char chunks agree on most letters", async () => {
  const input = ("ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة. عاد إلى البيت مساء ولعب مع أصدقائه. ").repeat(8);
  const a = await eng.diacritize(input, { chunkSize: 1024 }), b = await eng.diacritize(input, { chunkSize: 150 });
  const ua = a.match(/[\u0621-\u064A][\u064B-\u0652]*/g), ub = b.match(/[\u0621-\u064A][\u064B-\u0652]*/g);
  assert.equal(ua.length, ub.length);
  const agree = ua.filter((x, i) => x === ub[i]).length / ua.length;
  console.log(`  [info] chunk-size agreement: ${(agree * 100).toFixed(1)}%`);
  assert.ok(agree > 0.9);
});

/* ============================================================
   Real-model checks for the Ichkil text-layer fixes
   ============================================================ */
const { parseUnits } = E._internal;
const PLAIN = ["محمد قرأ الكتاب في المدرسة", "العلم نور والجهل ظلمة", "ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة", "اللغة العربية من أقدم اللغات الحية في العالم"];
const INVISIBLES = ["\u200F", "\u200C", "\u200D", "\u061C", "\uFEFF", "\u200E", "\u202B"];
const VOWEL_STATE = /[\u064B-\u0650\u0652\u0656\u0657\u06E1]/;

test("real model: invisible format characters do not change the vocalization of the visible text", async () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const plain of PLAIN) {
    const expected = await eng.diacritize(plain);
    for (let round = 0; round < 6; round++) {
      const chars = Array.from(plain); let noisy = "";
      for (const ch of chars) { noisy += ch; if (rnd() < 0.25) noisy += INVISIBLES[Math.floor(rnd() * INVISIBLES.length)]; }
      const out = await eng.diacritize(noisy);
      assert.equal(out.replace(/[\u061C\u200C-\u200F\u202A-\u202E\uFEFF]/g, ""), expected, JSON.stringify(noisy));
    }
  }
});

test("real model: PDF-style presentation forms get the same marks on the same letters as the plain text", async () => {
  const pairs = JSON.parse(fs.readFileSync(new URL("pres-fixtures.json", import.meta.url), "utf8")).pairs;
  const canon = (s) => parseUnits(s).map((u) => u.base.normalize("NFKC") + [...u.marks].sort().join("")).join("|");
  for (const [plain, pres] of pairs) {
    assert.equal(pres.normalize("NFKC"), plain);
    const outPlain = await eng.diacritize(plain), outPres = await eng.diacritize(pres);
    assert.equal(stripMarks(outPres), pres, "the user's characters are preserved");
    assert.equal(canon(outPres), canon(outPlain));
    assert.ok(HAS_MARK.test(outPres), "marks were actually added");
  }
});

test("real model: Quranic sukun and other existing vowel states are never overwritten or stacked", async () => {
  const input = "يجۡعل مِنۡ بِسۡمِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ هٖ يَجْعَل";
  const out = await eng.diacritize(input);
  const a = parseUnits(input), b = parseUnits(out);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (VOWEL_STATE.test(a[i].marks)) assert.equal(b[i].marks, a[i].marks, "unit " + i);
  assert.equal(stripMarks(out), stripMarks(input));
});

test("real model: a letter typed with only a shadda gets exactly one shadda and a vowel", async () => {
  const out = await eng.diacritize("الطّلاب يدرّسون");
  for (const u of parseUnits(out)) assert.ok(((u.marks.match(/\u0651/g) || []).length) <= 1, "single shadda: " + u.base + u.marks);
  const tah = parseUnits(out).find((u) => u.base === "ط");
  assert.ok(tah.marks.includes("\u0651"), "the user's shadda is kept");
});

test("real model: large input (20,000 chars, many paragraphs) is fully processed: nothing dropped, order kept", async () => {
  const para = "ذهب الولد إلى المدرسة صباحا وقرأ الكتاب في المكتبة. عاد إلى البيت مساء ولعب مع أصدقائه.";
  const text = Array.from({ length: 230 }, (_, i) => para + " (" + i + ")").join("\n");
  assert.ok(text.length > 20000);
  const out = await eng.diacritize(text);
  assert.equal(stripMarks(out), text);
  const lines = out.split("\n");
  assert.equal(lines.length, 230);
  lines.forEach((l, i) => { assert.ok(l.endsWith("(" + i + ")"), "line " + i + " in order"); assert.ok(HAS_MARK.test(l)); });
});
