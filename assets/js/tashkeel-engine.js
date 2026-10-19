/* ============================================================
   لوحة عربي — Arabic Tashkeel engine (browser + Node, no dependencies)

   Runs the MIT-licensed Ichkil character-level diacritization model
   (https://huggingface.co/ichkil/ichkil, ~5 MB ONNX) with ONNX Runtime
   Web, entirely on the user's device. Nothing is sent to a server.

   The label contract and pipeline mirror the reference implementation
   in the `ichkil` npm package (src/pipeline.ts, MIT, (c) 2026 Maaouia
   BenHamed). The npm package itself is Node-only (it imports
   onnxruntime-node, fs, os, path, crypto), so only its pure text logic
   is reused here; everything around it is new:

     - code-point-safe parsing (letters + their marks are one unit)
     - sentence-aware chunking under the model's 1,024-char limit
     - the user's text is NEVER rewritten: marks are only added; letters
       the user already vocalized are left exactly as written
     - a post-condition check that stripping all marks from the result
       gives back exactly the input
     - invisible format characters (RLM/LRM, ZWNJ/ZWJ, ALM, bidi controls,
       BOM) are never fed to the model, so they cannot change its output
     - Arabic Presentation Forms (what copying from a PDF produces) are
       mapped to their base letters for the model only; the user's own
       characters are emitted unchanged
     - letters already carrying a vowel state (including the Quranic sukun
       U+06E1) are left alone; a letter carrying only a shadda receives just
       the vowel
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IchkilTashkeel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EXPECTED_MODEL_SHA256 =
    "9055816b214346b0a8044a4a8deceb36e818dffd0b04699715ea23883bf54744";

  // Label id -> mark(s) to attach. Matches the Ichkil label contract (13).
  const LABEL_TO_COMBO = [
    "", "",
    "\u064E", "\u064F", "\u0650", "\u0652",       // fatha damma kasra sukun
    "\u0651",                                      // shadda
    "\u0651\u064E", "\u0651\u064F", "\u0651\u0650",
    "\u064B", "\u064C", "\u064D"                   // tanwin fatha/damma/kasra
  ];

  const RE_LETTER = /[\u0621-\u064A]/;                      // letters the model decorates
  const RE_MARK = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/; // any Arabic mark
  const RE_MARKS_G = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
  // A letter that already carries any of these has a vowel state of its own: fathatan..kasra,
  // sukun, subscript alef / inverted damma (Quranic), and the Quranic sukun U+06E1. Shadda
  // (U+0651) is deliberately NOT in this set: a letter with only a shadda still needs its vowel.
  const RE_VOWEL_STATE = /[\u064B-\u0650\u0652\u0656\u0657\u06E1]/;
  const SHADDA = "\u0651";
  // Never fed to the model (they are invisible, so they must not influence its prediction):
  // ALM, RLM/LRM/ZWNJ/ZWJ (not ZWSP, which separates words), bidi embeddings/isolates, WJ, BOM.
  const RE_INVISIBLE = /[\u061C\u200C-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
  // Arabic Presentation Forms-A/-B: what PDF/Word copy-paste usually produces.
  const RE_PRESENTATION = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const TATWEEL = "\u0640";
  const SENT_END = new Set([".", "!", "?", "\u061F", "\u061B", "\u2026", "\u06D4"]);
  const SOFT_BREAK = new Set(["\u060C", ",", ":", ";"]);
  const NEWLINES = new Set(["\n", "\r", "\u2028", "\u2029", "\u0085"]);
  // Pack sentences up to the model's own limit (1,024): output for any text that fits is then
  // identical to the reference implementation; longer text is split at sentence/word boundaries.
  const DEFAULT_CHUNK = 1024;

  class TashkeelError extends Error {
    constructor(code, message, cause, corrupt) {
      super(message);
      this.name = "TashkeelError";
      this.code = code;
      // true when a downloaded/cached file is unusable: retrying must not reuse the cached copy
      this.corrupt = !!corrupt;
      if (cause) this.cause = cause;
    }
  }

  const isSpace = (s) => /^\s$/u.test(s);
  const stripMarks = (s) => String(s).replace(RE_MARKS_G, "");

  /* ---------- presentation forms ---------- */
  const presCache = new Map();
  // Plain Arabic letters a presentation-form character stands for, or "" if it is not a pure
  // letter form (marks such as U+FE70, the ﷺ phrase ligature, ... are left exactly as they are).
  function presentationLetters(ch) {
    if (!RE_PRESENTATION.test(ch)) return "";
    let r = presCache.get(ch);
    if (r === undefined) {
      const n = ch.normalize("NFKC");
      r = n !== ch && /^[\u0621-\u064A]+$/.test(n) ? n : "";
      presCache.set(ch, r);
    }
    return r;
  }

  /* ---------- parsing: one unit = one base code point + its marks ---------- */
  function parseUnits(text) {
    const units = [];
    for (const cp of Array.from(String(text))) {
      if (units.length && RE_MARK.test(cp)) { units[units.length - 1].marks += cp; continue; }
      const exp = cp.length === 1 ? presentationLetters(cp) : "";
      units.push({
        base: cp,
        marks: "",
        // plain letters, and presentation forms of exactly one letter, receive marks;
        // a multi-letter ligature (e.g. lam-alef) is fed to the model but not decorated
        letter: cp.length === 1 && (RE_LETTER.test(cp) || exp.length === 1),
        exp
      });
    }
    // A leading orphan mark becomes its own (non-letter) unit; it is never
    // sent to the model and is emitted verbatim.
    return units;
  }
  const unitString = (u) => u.base + u.marks;
  // What the model sees for a unit: null (nothing: marks, tatweel, invisible format characters),
  // or the plain character(s). Presentation forms are fed as their base letters.
  function modelChar(u) {
    if (u.base === TATWEEL || RE_MARK.test(u.base) || RE_INVISIBLE.test(u.base)) return null;
    return u.exp ? u.exp : u.base;
  }
  const weight = (u) => { const c = modelChar(u); return c === null ? 0 : (u.exp ? u.exp.length : 1); };
  const isNewline = (u) => NEWLINES.has(u.base);

  /* ---------- chunk planning ---------- */
  function planChunks(units, maxLen) {
    maxLen = Math.max(8, maxLen | 0);
    const pieces = [];
    const n = units.length;
    const len = (a, b) => { let c = 0; for (let i = a; i < b; i++) c += weight(units[i]); return c; };

    function pushSplitLong(a, b) {
      let s = a, count = 0, lastBreak = -1;
      for (let u = a; u < b; u++) {
        const w = weight(units[u]);
        if (count + w > maxLen) {
          const cut = lastBreak > s ? lastBreak : u;  // prefer a word/clause boundary
          pieces.push({ from: s, to: cut, model: true });
          s = cut; count = len(s, u); lastBreak = -1;
        }
        count += w;
        const ch = units[u].base;
        if (isSpace(ch) || SOFT_BREAK.has(ch)) lastBreak = u + 1;
      }
      if (s < b) pieces.push({ from: s, to: b, model: true });
    }

    function planLine(a, b) {
      // 1) sentences (a sentence keeps its terminal punctuation + trailing space)
      const sents = [];
      let s = a, k = a;
      while (k < b) {
        if (SENT_END.has(units[k].base)) {
          while (k < b && SENT_END.has(units[k].base)) k++;
          while (k < b && isSpace(units[k].base)) k++;
          sents.push([s, k]); s = k;
        } else k++;
      }
      if (s < b) sents.push([s, b]);
      // 2) pack sentences up to maxLen; split any sentence that alone exceeds it
      let curFrom = -1, curLen = 0;
      const flush = (to) => { if (curFrom >= 0 && to > curFrom) pieces.push({ from: curFrom, to, model: true }); curFrom = -1; curLen = 0; };
      for (const [x, y] of sents) {
        const l = len(x, y);
        if (l > maxLen) { flush(x); pushSplitLong(x, y); continue; }
        if (curFrom >= 0 && curLen + l > maxLen) flush(x);
        if (curFrom < 0) curFrom = x;
        curLen += l;
        if (y === b) flush(y);
      }
      if (curFrom >= 0) flush(b);
    }

    let i = 0;
    while (i < n) {
      if (isNewline(units[i])) { pieces.push({ from: i, to: i + 1, model: false }); i++; continue; }
      let j = i;
      while (j < n && !isNewline(units[j])) j++;
      planLine(i, j);
      i = j;
    }
    return pieces;
  }

  /* ---------- keeping the page responsive ---------- */
  // Inference runs on the page's main thread (GitHub Pages cannot send the headers a worker
  // with threads needs). Between chunks we hand control back so the browser can paint the
  // progress bar and handle input. Timers are throttled in background tabs, so use a message
  // channel there.
  function yieldToUI() {
    if (typeof document !== "undefined" && document.hidden && typeof MessageChannel === "function") {
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
        ch.port2.postMessage(0);
      });
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** True when the text has at least one letter the model can vocalize (plain or presentation form). */
  function hasArabicLetters(text) {
    return parseUnits(text).some((u) => u.letter || u.exp);
  }

  /* ---------- engine ---------- */
  function argmaxRow(data, off, k) {
    let best = 0, bv = data[off];
    for (let i = 1; i < k; i++) { const v = data[off + i]; if (v > bv) { bv = v; best = i; } }
    return best;
  }

  function makeEngine(ort, session, config) {
    const numLabels = config.num_tags;
    const maxSeq = config.max_seq_len || 1024;
    const sym2id = config.sym2id;
    const unkId = Object.prototype.hasOwnProperty.call(sym2id, "<unk>") ? sym2id["<unk>"] : 1;
    const has = (c) => Object.prototype.hasOwnProperty.call(sym2id, c);
    let released = false;

    async function predictIds(chars) {
      const n = chars.length;
      if (n === 0) return [];
      if (n > maxSeq) throw new TashkeelError("SEQ_TOO_LONG", "sequence of " + n + " exceeds model limit " + maxSeq);
      const ids = new BigInt64Array(n);
      for (let i = 0; i < n; i++) ids[i] = BigInt(has(chars[i]) ? sym2id[chars[i]] : unkId);
      let out;
      try {
        out = await session.run({ input_ids: new ort.Tensor("int64", ids, [1, n]) });
      } catch (e) {
        throw new TashkeelError("INFERENCE_FAILED", "inference failed: " + (e && e.message || e), e);
      }
      const logits = out && out.logits;
      if (!logits || !logits.data) throw new TashkeelError("INFERENCE_FAILED", "model produced no 'logits' output");
      const data = logits.data;
      if (data.length !== n * numLabels) {
        throw new TashkeelError("INFERENCE_FAILED", "unexpected logits size " + data.length + " (expected " + n * numLabels + ")");
      }
      const labels = new Array(n);
      for (let i = 0; i < n; i++) labels[i] = argmaxRow(data, i * numLabels, numLabels);
      return labels;
    }

    // Labels for already-bare text, one per code point (reference-package behaviour).
    async function predictLabels(text) {
      const chars = Array.from(stripMarks(text).split(TATWEEL).join(""));
      return predictIds(chars);
    }

    async function diacritize(text, opts) {
      if (released) throw new TashkeelError("RELEASED", "engine has been released");
      opts = opts || {};
      text = String(text == null ? "" : text);
      const units = parseUnits(text);
      const maxLen = Math.min(opts.chunkSize || DEFAULT_CHUNK, maxSeq);
      const pieces = planChunks(units, maxLen);
      const work = pieces.filter((p) => p.model && units.slice(p.from, p.to).some((u) => u.letter));
      let done = 0, added = 0;
      const out = [];
      const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
      let lastYield = now();

      for (const p of pieces) {
        let lo = p.from, hi = p.to;
        const isWork = p.model && units.slice(lo, hi).some((u) => u.letter);
        if (isWork) {
          while (lo < hi && isSpace(units[lo].base)) lo++;          // keep edge whitespace verbatim
          while (hi > lo && isSpace(units[hi - 1].base)) hi--;
        }
        for (let i = p.from; i < lo; i++) out.push(unitString(units[i]));
        if (isWork) {
          // Hand control back about every 40 ms (not every chunk): enough for smooth progress,
          // negligible overhead. opts.yieldEveryMs = 0 yields before every chunk (used by tests).
          if (work.length > 1 && opts.yieldToUI !== false && now() - lastYield >= (opts.yieldEveryMs == null ? 40 : opts.yieldEveryMs)) {
            await yieldToUI(); lastYield = now();
          }
          const idx = [], chars = [];
          for (let i = lo; i < hi; i++) {
            const c = modelChar(units[i]);
            if (c === null) continue;
            for (const ch of c) { idx.push(i); chars.push(ch); }   // a ligature contributes several chars
          }
          const labels = await predictIds(chars);
          const labelAt = new Map();
          for (let k = 0; k < idx.length; k++) labelAt.set(idx[k], labels[k]);
          for (let i = lo; i < hi; i++) {
            const u = units[i];
            let s = unitString(u);
            if (u.letter && !RE_VOWEL_STATE.test(u.marks)) {       // respect the user's own vowel states
              let combo = LABEL_TO_COMBO[labelAt.get(i)] || "";
              // The user already typed the shadda: add only the vowel, never a second shadda.
              if (combo && u.marks.indexOf(SHADDA) !== -1) combo = combo.split(SHADDA).join("");
              if (combo) { s = u.base + u.marks + combo; added++; }
            }
            out.push(s);
          }
          done++;
          if (typeof opts.onProgress === "function") opts.onProgress(done, work.length);
        } else {
          for (let i = lo; i < hi; i++) out.push(unitString(units[i]));
        }
        for (let i = hi; i < p.to; i++) out.push(unitString(units[i]));
      }

      const result = out.join("");
      // Post-condition: we may only ever have ADDED marks.
      if (stripMarks(result) !== stripMarks(text)) {
        throw new TashkeelError("INTEGRITY", "output changed the original text; refusing to return it");
      }
      return opts.detailed ? { text: result, chunks: work.length, marksAdded: added } : result;
    }

    return {
      diacritize, predictLabels, numLabels, maxSeqLen: maxSeq,
      release: async () => { if (!released) { released = true; await session.release(); } }
    };
  }

  /* ---------- loading ---------- */
  function hex(buf) { return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""); }

  async function fetchBytes(url, label, onStatus, fetchFn, knownSize) {
    let res;
    try { res = await fetchFn(url, { cache: "default" }); }
    catch (e) { throw new TashkeelError("FETCH_FAILED", label + ": network error (" + (e && e.message || e) + ")", e); }
    if (!res.ok) throw new TashkeelError("FETCH_FAILED", label + ": HTTP " + res.status);
    // content-length can be the *compressed* size; prefer the known decoded size.
    const total = knownSize || Number(res.headers.get("content-length")) || 0;
    if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const parts = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length;
      if (onStatus) onStatus({ phase: "download", label, loaded: got, total });
    }
    const all = new Uint8Array(got); let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    return all;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new TashkeelError("RUNTIME_LOAD_FAILED", "could not load the ONNX runtime script"));
      document.head.appendChild(s);
    });
  }

  /**
   * Browser loader. opts: { ortUrl, wasmBase, wasmUrl, modelUrl, configUrl, sizes:{runtime,model}, onStatus, fetch }
   * All URLs should be same-origin (self-hosted).
   */
  async function load(opts) {
    const fetchFn = opts.fetch || ((u, o) => fetch(u, o));
    const status = opts.onStatus || function () {};
    let ort = (typeof globalThis !== "undefined" && globalThis.ort) || null;
    if (!ort) {
      status({ phase: "runtime" });
      await loadScript(opts.ortUrl);
      ort = globalThis.ort;
      if (!ort) throw new TashkeelError("RUNTIME_LOAD_FAILED", "ONNX runtime did not initialise");
    }
    const sizes = opts.sizes || {};
    ort.env.wasm.wasmPaths = opts.wasmBase;   // self-hosted loader (.mjs)
    ort.env.wasm.numThreads = 1;              // GitHub Pages cannot send COOP/COEP => no SharedArrayBuffer
    ort.env.wasm.proxy = false;
    if (opts.wasmUrl) {                       // fetch the runtime ourselves: real progress, one download
      const wasm = await fetchBytes(opts.wasmUrl, "runtime", status, fetchFn, sizes.runtime);
      if (!(wasm.length > 4 && wasm[0] === 0 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d)) {
        throw new TashkeelError("FETCH_FAILED", "runtime: file is not a valid WebAssembly binary", null, true);
      }
      ort.env.wasm.wasmBinary = wasm;
    }

    const cfgBytes = await fetchBytes(opts.configUrl, "config", status, fetchFn);
    let config;
    try { config = JSON.parse(new TextDecoder("utf-8").decode(cfgBytes)); }
    catch (e) { throw new TashkeelError("CONFIG_INVALID", "config.json is not valid JSON", e, true); }
    if (!config || !config.sym2id || config.num_tags !== 13) throw new TashkeelError("CONFIG_INVALID", "config.json has an unexpected format", null, true);

    const model = await fetchBytes(opts.modelUrl, "model", status, fetchFn, sizes.model);
    status({ phase: "verify" });
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (subtle) {
      const got = hex(await subtle.digest("SHA-256", model));
      if (got !== EXPECTED_MODEL_SHA256) {
        throw new TashkeelError("CHECKSUM_FAILED", "model file failed its SHA-256 check (got " + got.slice(0, 12) + "…)", null, true);
      }
    } else if (typeof console !== "undefined") {
      console.warn("[tashkeel] crypto.subtle unavailable (insecure context); skipping model checksum");
    }

    status({ phase: "init" });
    let session;
    try {
      session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    } catch (e) {
      throw new TashkeelError("SESSION_FAILED", "could not start the model: " + (e && e.message || e), e);
    } finally {
      ort.env.wasm.wasmBinary = undefined;
    }
    return makeEngine(ort, session, config);
  }

  /** Node/test helper: build an engine from an ort module + raw model bytes + parsed config. */
  async function createEngine(ort, modelBytes, config) {
    const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return makeEngine(ort, session, config);
  }

  return {
    load, createEngine, hasArabicLetters, TashkeelError, EXPECTED_MODEL_SHA256,
    // exposed for unit tests
    _internal: { parseUnits, planChunks, stripMarks, modelChar, LABEL_TO_COMBO, DEFAULT_CHUNK }
  };
});
