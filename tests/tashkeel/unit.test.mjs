// Engine logic tests with a FAKE model whose label depends only on the character.
// This proves alignment / preservation / chunking independent of model quality.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../../assets/js/tashkeel-engine.js");
const { parseUnits, planChunks, stripMarks, LABEL_TO_COMBO } = E._internal;
const config = JSON.parse(fs.readFileSync(new URL("../../assets/vendor/ichkil/config.json", import.meta.url), "utf8"));

function fakeOrt(counter) {
  class Tensor { constructor(t, d, dims) { this.type = t; this.data = d; this.dims = dims; } }
  const session = {
    async run(feeds) {
      const ids = feeds.input_ids.data, n = ids.length;
      counter.calls++; counter.maxLen = Math.max(counter.maxLen, n);
      const out = new Float32Array(n * 13);
      for (let i = 0; i < n; i++) out[i * 13 + (Number(ids[i]) % 11) + 2] = 1;   // label in 2..12
      return { logits: { data: out, dims: [1, n, 13] } };
    },
    async release() {}
  };
  return { Tensor, InferenceSession: { create: async () => session } };
}
const labelOf = (ch) => ((Object.hasOwn(config.sym2id, ch) ? config.sym2id[ch] : 1) % 11) + 2;
async function engine() {
  const counter = { calls: 0, maxLen: 0 };
  const e = await E.createEngine(fakeOrt(counter), new Uint8Array(1), config);
  return { e, counter };
}

test("parseUnits keeps a letter and its marks together; round-trips exactly", () => {
  for (const s of ["مُحَمَّدٌ", "ـَ orphan", "😀 قرأ", "\u064E\u064E", "a\u0651", ""]) {
    assert.equal(parseUnits(s).map((u) => u.base + u.marks).join(""), s);
  }
  const u = parseUnits("مُحَمَّد");
  assert.equal(u.length, 4);
  assert.ok(u[2].marks.includes("\u0651") && u[2].marks.includes("\u064E"));
  assert.equal(parseUnits("😀").length, 1);                         // astral char = one unit
});

test("planChunks: contiguous partition, size limit, no mid-word cuts when spaces exist", () => {
  const sentence = "ذهب الولد إلى المدرسة صباحا ";
  const text = sentence.repeat(120);                               // ~3,300 chars, no sentence punctuation
  const units = parseUnits(text);
  const max = 400;
  const pieces = planChunks(units, max);
  assert.equal(pieces[0].from, 0);
  assert.equal(pieces.at(-1).to, units.length);
  for (let i = 1; i < pieces.length; i++) assert.equal(pieces[i].from, pieces[i - 1].to);
  for (const p of pieces) {
    assert.ok(p.to - p.from <= max, "piece too long");
    // each cut must follow whitespace (word boundary)
    if (p.to < units.length) assert.match(units[p.to - 1].base, /\s/);
  }
});

test("planChunks: very long unbroken word is hard-cut at the limit, never over", () => {
  const units = parseUnits("ب".repeat(2500));
  const pieces = planChunks(units, 400);
  assert.ok(pieces.every((p) => p.to - p.from <= 400));
  assert.equal(pieces.reduce((a, p) => a + (p.to - p.from), 0), 2500);
});

test("planChunks: newlines are their own pass-through pieces; sentences pack together", () => {
  const units = parseUnits("جملة أولى. جملة ثانية.\n\nفقرة جديدة؟");
  const pieces = planChunks(units, 400);
  const nl = pieces.filter((p) => !p.model);
  assert.equal(nl.length, 2);
  assert.equal(pieces.filter((p) => p.model).length, 2);          // line 1 (2 sentences packed) + line 3
});

test("diacritize: every letter gets exactly the mark the fake model assigns (alignment)", async () => {
  const { e } = await engine();
  const input = "ذهب الولد إلى المدرسة، ثم عاد!\nقرأ الكتاب 2026 و Google";
  const out = await e.diacritize(input);
  const outUnits = parseUnits(out), inUnits = parseUnits(input);
  assert.equal(outUnits.length, inUnits.length);
  outUnits.forEach((u, i) => {
    if (inUnits[i].letter) assert.equal(u.marks, LABEL_TO_COMBO[labelOf(u.base)], "letter " + u.base);
    else assert.equal(u.marks, "");
    assert.equal(u.base, inUnits[i].base);
  });
});

test("diacritize: user's existing vowels are kept verbatim, only bare letters are filled", async () => {
  const { e } = await engine();
  const out = await e.diacritize("مُحَمَّد قرأ");
  assert.ok(out.startsWith("مُحَمَّد"), "pre-vocalized word must be untouched: " + out);
  assert.notEqual(stripMarks(out.slice(out.indexOf(" "))), out.slice(out.indexOf(" ")), "bare word should gain marks");
});

test("diacritize: empty, whitespace-only and non-Arabic text pass through with no inference", async () => {
  const { e, counter } = await engine();
  for (const s of ["", "   ", "\n\t \n", "Hello, World 123!", "😀"]) assert.equal(await e.diacritize(s), s);
  assert.equal(counter.calls, 0);
});

test("diacritize: whitespace, CRLF, blank lines, tatweel, emoji, orphan marks are preserved", async () => {
  const { e } = await engine();
  const input = "  أ\r\n\r\nبـب\t😀 \u064E ج\n  ";
  const out = await e.diacritize(input);
  assert.equal(stripMarks(out), stripMarks(input));
  assert.ok(out.startsWith("  ") && out.endsWith("\n  "));
  assert.ok(out.includes("\r\n\r\n") && out.includes("😀") && out.includes("ـ"));
});

test("diacritize: long text (>1024) is chunked, each call within limits, result identical regardless of chunk size", async () => {
  const para = "اللغة العربية من أقدم اللغات الحية في العالم، ويتحدث بها مئات الملايين من الناس. وهي لغة القرآن الكريم! ";
  const input = (para.repeat(8) + "\n").repeat(3);                 // ~2,400 chars, 3 paragraphs
  const a = await engine(), b = await engine();
  const small = await a.e.diacritize(input, { chunkSize: 150 });
  const big = await b.e.diacritize(input, { chunkSize: 1024 });
  assert.equal(small, big);                                         // per-char fake => chunking must not change anything
  assert.ok(a.counter.calls > b.counter.calls && b.counter.calls >= 3);
  assert.ok(a.counter.maxLen <= 150 && b.counter.maxLen <= 1024);
  assert.equal(stripMarks(big), stripMarks(input));
});

test("diacritize: chunkSize can never exceed the model limit", async () => {
  const { e, counter } = await engine();
  await e.diacritize("ب ".repeat(3000), { chunkSize: 99999 });
  assert.ok(counter.maxLen <= 1024);
});

test("diacritize: onProgress reports every chunk; detailed result has counts", async () => {
  const { e } = await engine();
  const seen = [];
  const r = await e.diacritize("جملة. ".repeat(200), { chunkSize: 100, detailed: true, onProgress: (d, t) => seen.push([d, t]) });
  assert.ok(seen.length === r.chunks && seen.at(-1)[0] === seen.at(-1)[1]);
  assert.ok(r.marksAdded > 0);
});

test("fuzz: output with all marks stripped always equals input with all marks stripped", async () => {
  const { e } = await engine();
  const alphabet = ["ا","ب","ت","ع","ء","ة","ى","\u064E","\u0651","\u064B","\u0670","ـ"," ","\n","\r\n",".","،","؟","a","Z","7","😀","ك","پ","ٱ","\u0640"];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 300; t++) {
    let s = ""; const n = Math.floor(rnd() * 60);
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const out = await e.diacritize(s, { chunkSize: 8 + Math.floor(rnd() * 40) });
    assert.equal(stripMarks(out), stripMarks(s), JSON.stringify(s));
  }
});

test("errors: inference failure and malformed output surface typed errors, never partial text", async () => {
  const counter = { calls: 0, maxLen: 0 };
  const ort = fakeOrt(counter);
  const bad = await E.createEngine({ ...ort, InferenceSession: { create: async () => ({ run: async () => { throw new Error("boom"); }, release: async () => {} }) } }, new Uint8Array(1), config);
  await assert.rejects(bad.diacritize("قرأ"), (e) => e instanceof E.TashkeelError && e.code === "INFERENCE_FAILED");
  const wrong = await E.createEngine({ ...ort, InferenceSession: { create: async () => ({ run: async () => ({ logits: { data: new Float32Array(5), dims: [1, 1, 5] } }), release: async () => {} }) } }, new Uint8Array(1), config);
  await assert.rejects(wrong.diacritize("قرأ"), (e) => e.code === "INFERENCE_FAILED");
  const rel = await engine(); await rel.e.release();
  await assert.rejects(rel.e.diacritize("قرأ"), (e) => e.code === "RELEASED");
});
