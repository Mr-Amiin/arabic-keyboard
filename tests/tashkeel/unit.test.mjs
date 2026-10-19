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

/* ============================================================
   Ichkil text-layer fixes (scripted fake model: every assertion is about OUR code, not model quality)
   ============================================================ */
const id2sym = Object.fromEntries(Object.entries(config.sym2id).map(([s, i]) => [i, s]));
function scripted(labelFor) {            // labelFor(char) -> label id; records every char fed to the model
  const fed = [], calls = [];
  class Tensor { constructor(t, d, dims) { this.type = t; this.data = d; this.dims = dims; } }
  const session = {
    async run(feeds) {
      const ids = feeds.input_ids.data, n = ids.length;
      calls.push(n);
      const out = new Float32Array(n * 13);
      for (let i = 0; i < n; i++) {
        const ch = id2sym[Number(ids[i])] ?? "<unk>";
        fed.push(ch);
        out[i * 13 + labelFor(ch)] = 1;
      }
      return { logits: { data: out, dims: [1, n, 13] } };
    },
    async release() {}
  };
  const ort = { Tensor, InferenceSession: { create: async () => session } };
  return { fed, calls, make: () => E.createEngine(ort, new Uint8Array(1), config) };
}
const FATHA = 2, SHADDA_ONLY = 6, SHADDA_FATHA = 7, SHADDA_KASRA = 9;
const unitsOf = (s) => parseUnits(s).map((u) => u.base + u.marks);

test("Quranic sukun U+06E1 / U+0656 / U+0657 count as an existing vowel state: such letters are left exactly as typed", async () => {
  const s = scripted(() => FATHA);
  const e = await s.make();
  const input = "يجۡعل مِنۡ بِسۡمِ هٖ لهٗ بسم";
  const out = await e.diacritize(input);
  const a = unitsOf(input), b = unitsOf(out);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    if (/[\u064B-\u0650\u0652\u0656\u0657\u06E1]/.test(a[i])) assert.equal(b[i], a[i], "unit " + i + " must be unchanged: " + a[i]);
  }
  assert.ok(!/\u06E1[\u064B-\u0652]/.test(out), "no vowel may be stacked on the Quranic sukun");
});

test("shadda-only letter receives just the vowel (never a second shadda); shadda+vowel already present is untouched", async () => {
  const cases = [
    ["دّ", SHADDA_FATHA, "د\u0651\u064E"],       // vowel completed
    ["دّ", SHADDA_KASRA, "د\u0651\u0650"],
    ["دّ", SHADDA_ONLY, "د\u0651"],               // model says "shadda only": nothing to add
    ["دّ", FATHA, "د\u0651\u064E"],               // plain vowel label also completes it
    ["د", SHADDA_FATHA, "د\u0651\u064E"],         // bare letter: full combo, as before
    ["دَّ", SHADDA_KASRA, "دَّ"],                 // user already gave shadda+fatha: untouched
    ["دُ", SHADDA_FATHA, "دُ"]                    // user's vowel kept, model's shadda NOT added
  ];
  for (const [input, label, expected] of cases) {
    const e = await scripted(() => label).make();
    assert.equal(await e.diacritize(input), expected, JSON.stringify(input) + " label " + label);
  }
});

test("invisible format characters are never fed to the model and are emitted exactly where they were", async () => {
  const plain = "ذهب الولد إلى المدرسة";
  const noisy = "ذ\u200Fهب\u200C ال\u200Dولد إلى\u061C المد\uFEFFرسة\u202B";
  const a = scripted(() => FATHA), b = scripted(() => FATHA);
  const ea = await a.make(), eb = await b.make();
  await ea.diacritize(plain);
  const out = await eb.diacritize(noisy);
  assert.deepEqual(b.fed, a.fed, "the model must see the same characters with or without invisible characters");
  for (const inv of ["\u200F", "\u200C", "\u200D", "\u061C", "\uFEFF", "\u202B"]) assert.ok(out.includes(inv), "kept " + inv.codePointAt(0).toString(16));
  assert.equal(out.replace(/[\u064B-\u0652]/g, ""), noisy);
});

test("zero-width SPACE is still treated as a word separator (it is not made invisible to the model)", async () => {
  const s = scripted(() => 0);
  await (await s.make()).diacritize("ذهب\u200Bالولد");
  assert.ok(s.fed.includes("<unk>"), "ZWSP reaches the model as an unknown separator");
});

test("presentation forms (PDF copy-paste): fed as their base letters, decorated in place, user's characters kept", async () => {
  const pairs = JSON.parse(fs.readFileSync(new URL("pres-fixtures.json", import.meta.url), "utf8")).pairs;
  for (const [plain, pres] of pairs) {
    assert.equal(pres.normalize("NFKC"), plain, "fixture sanity");
    const a = scripted((c) => ((c.codePointAt(0) % 3) + 2)), b = scripted((c) => ((c.codePointAt(0) % 3) + 2));
    const ep = await a.make(), eq = await b.make();
    const outPlain = await ep.diacritize(plain);
    const outPres = await eq.diacritize(pres);
    assert.deepEqual(b.fed, a.fed, "identical model input for " + plain);
    assert.equal(stripMarks(outPres), pres, "the user's presentation-form characters are untouched");
    const canon = (s) => parseUnits(s).map((u) => u.base.normalize("NFKC") + [...u.marks].sort().join("")).join("|");
    assert.equal(canon(outPres), canon(outPlain), "same marks on the same letters as the plain text");
  }
});

test("multi-letter ligature (lam-alef) is fed as two letters but not decorated; non-letter presentation forms are left alone", async () => {
  const s = scripted(() => FATHA);
  const out = await (await s.make()).diacritize("ب \uFEFB \uFDFA \uFE70");
  assert.deepEqual(s.fed.slice(2, 4), ["ل", "ا"]);                 // the ligature contributes both letters
  assert.equal(out, "بَ \uFEFB \uFDFA \uFE70");                    // only the plain letter is decorated
  const only = scripted(() => FATHA);                               // nothing decoratable -> model never called
  assert.equal(await (await only.make()).diacritize("\uFEFB \uFDFA"), "\uFEFB \uFDFA");
  assert.equal(only.calls.length, 0);
});

test("ligatures count as two model characters: no call ever exceeds the 1,024 limit", async () => {
  for (const text of ["بﻻ".repeat(2500), ("بﻻ ").repeat(1500), ("ﻻ".repeat(7) + "ب ").repeat(500), "ﻻ".repeat(1500) + "ب" + "ﻻ".repeat(1500)]) {
    const s = scripted(() => 0);
    const e = await s.make();
    const out = await e.diacritize(text);
    assert.equal(out, text);
    assert.ok(Math.max(...s.calls) <= 1024, "max call " + Math.max(...s.calls));
    const ligatures = [...text].filter((c) => c === "\uFEFB").length;
    if (text !== "ﻻ".repeat(1500) + "ب" + "ﻻ".repeat(1500)) assert.equal(s.fed.filter((c) => c === "ل").length, ligatures, "every ligature reached the model as lam + alef");
  }
});

test("hasArabicLetters: plain and presentation-form letters yes; Latin, digits, marks, symbols-only no", () => {
  const has = E.hasArabicLetters;
  for (const t of ["محمد", "ﻣﺤﻤﺪ", "abc ب", "ﻻ", "ﷲ"]) assert.equal(has(t), true, t);
  for (const t of ["", "hello 123", "\u064E\u064F", "ﷺ", "\uFE70", "😀 ... ؟"]) assert.equal(has(t), false, t);
});

test("long texts yield to the event loop between chunks (so the progress bar can paint); opt-out works; default is time-sliced", async () => {
  const text = ("ذهب الولد إلى المدرسة. ").repeat(300);                // several chunks at chunkSize 300
  async function turns(opts) {
    let n = 0, stop = false;
    const pump = () => { if (!stop) { n++; setImmediate(pump); } };
    pump();
    const seen = [];
    const e = await scripted(() => FATHA).make();
    await e.diacritize(text, Object.assign({ chunkSize: 300, yieldEveryMs: 0, onProgress: () => seen.push(n) }, opts));
    stop = true;
    return { seen, total: seen.length };
  }
  const withYield = await turns({});
  assert.ok(withYield.total > 3);
  assert.ok(withYield.seen.at(-1) - withYield.seen[0] >= withYield.total - 1, "event loop turned between chunks");
  const sliced = await turns({ yieldEveryMs: undefined });               // default: ~every 40 ms, so a fast fake model rarely yields
  assert.ok(sliced.seen.at(-1) - sliced.seen[0] <= withYield.seen.at(-1) - withYield.seen[0]);
  const without = await turns({ yieldToUI: false });
  assert.ok(without.seen.at(-1) - without.seen[0] < withYield.seen.at(-1) - withYield.seen[0], "opt-out does not yield");
});

test("fuzz (new character classes): never throws, text preserved, user's vowel states untouched, no call over the limit", async () => {
  const pool = ["ب", "ت", "م", "ل", "ا", "أ", "ة", "ى", "ﻣ", "ﺤ", "ﻻ", "ﷲ", "ﷺ", "\uFE70", " ", " ", "\n", "\r\n", "\t", ".", "،", "؟",
    "\u064E", "\u064F", "\u0651", "\u0652", "\u06E1", "\u0656", "\u0657", "\u0670", "\u0640", "\u200F", "\u200C", "\u200D", "\u061C", "\uFEFF",
    "\u200B", "😀", "𝒜", "a", "1", "ٱ", "پ"];
  let seed = 20260619;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let iter = 0; iter < 400; iter++) {
    let t = ""; const len = 1 + Math.floor(rnd() * (iter % 40 === 0 ? 1800 : 60));
    for (let k = 0; k < len; k++) t += pool[Math.floor(rnd() * pool.length)];
    const s = scripted((c) => (c.codePointAt(0) % 12) + 1);
    const e = await s.make();
    const out = await e.diacritize(t);                              // would throw INTEGRITY / SEQ_TOO_LONG on any breach
    assert.equal(stripMarks(out), stripMarks(t));
    if (s.calls.length) assert.ok(Math.max(...s.calls) <= 1024);
    const a = parseUnits(t), b = parseUnits(out);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok((b[i].base + b[i].marks).startsWith(a[i].base + a[i].marks), "marks only ever appended");
      if (/[\u064B-\u0650\u0652\u0656\u0657\u06E1]/.test(a[i].marks)) assert.equal(b[i].marks, a[i].marks);
    }
  }
});
