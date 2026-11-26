/* Learn Arabic — grammar lesson catalogue and validation (content + pure functions, no DOM, no browser APIs).

   P5-1 FOUNDATION ONLY. The catalogue below is deliberately EMPTY: no grammar lesson content exists yet, and none may be added
   before it has been written and reviewed by a qualified Arabic teacher. This module carries NO review/approval/publication
   field on purpose — a record that tries to carry one is rejected as an unknown field — so nothing here can be read as a claim
   that a lesson has been teacher-approved.

   The catalogue feeds the single lesson URL registry (urls.js -> /learn-arabic/grammar/{slug}/) and, through it, the static page
   generator (scripts/build-learn-pages.mjs). It is not connected to progress, the journey or spaced repetition yet.

   LESSON RECORD (all fields are strict: missing required fields and unknown fields are both errors)
     id            "gram-" + lower-case ASCII words joined by hyphens, at most 32 characters (fits the progress unit-id limit)
     slug          lower-case ASCII words joined by hyphens, at most 60 characters; becomes /learn-arabic/grammar/{slug}/
     title         English lesson title
     summary       non-empty text of at most 200 characters (no sentence counting); used for the page introduction and meta description
     explanation   [ { heading, text } ]                       at least one block
     examples      [ { ar, translit, en, vocabRefs? } ]        at least one; ar must contain at least one Arabic letter
     mistakes      [ { text, ar? } ]                           common mistakes (may be an empty list)
     check         [ { prompt, choices[2..6], answerIndex, explain } ]   the mini-check, at least one question
     vocabRefs     optional [ vocabulary item ID ]             every ID must exist in vocab-data.js ITEMS
     prerequisites optional [ grammar lesson ID ]              must exist in the catalogue; no self-reference, no cycles
   Array order is the lesson order (as in the other catalogues). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vocab-data.js"));
  else root.LearnGrammar = factory(root.LearnVocab);
})(typeof self !== "undefined" ? self : this, function (V) {
  "use strict";

  /* ---------- catalogue (empty until real, teacher-reviewed lessons are authored) ---------- */
  const RAW = [];

  /* ---------- schema ---------- */
  const ID_RE = /^gram-[a-z0-9]+(?:-[a-z0-9]+)*$/, MAX_ID = 32;
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, MAX_SLUG = 60;
  // "Arabic" text must contain at least one actual Arabic-script LETTER. The Arabic block also holds digits (٠-٩), punctuation (؟ ، ؛), tatweel
  // and vowel marks, so a plain \u0600-\u06FF range would accept strings that contain no letter at all.
  const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u;
  const SCHEMA = {
    lesson: { required: ["id", "slug", "title", "summary", "explanation", "examples", "mistakes", "check"], optional: ["vocabRefs", "prerequisites"] },
    explanation: { required: ["heading", "text"], optional: [] },
    example: { required: ["ar", "translit", "en"], optional: ["vocabRefs"] },
    mistake: { required: ["text"], optional: ["ar"] },
    check: { required: ["prompt", "choices", "answerIndex", "explain"], optional: [] }
  };

  const hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  const isPlain = function (v) { return Object.prototype.toString.call(v) === "[object Object]"; };
  const isStr = function (v, max) { return typeof v === "string" && v.trim().length > 0 && v.length <= max; };
  const show = function (v) { const s = typeof v === "string" ? v : String(v); return JSON.stringify(s.length > 40 ? s.slice(0, 40) + "…" : s); };

  const checkKeys = function (obj, spec, path, errs) {
    spec.required.forEach(function (k) { if (!hasOwn(obj, k)) errs.push(path + ': missing required field "' + k + '"'); });
    Object.keys(obj).forEach(function (k) { if (spec.required.indexOf(k) < 0 && spec.optional.indexOf(k) < 0) errs.push(path + ': unknown field "' + k + '"'); });
  };
  const checkText = function (obj, key, max, path, errs) {
    if (hasOwn(obj, key) && !isStr(obj[key], max)) errs.push(path + "." + key + " must be a non-empty string of at most " + max + " characters");
  };
  const checkArabic = function (obj, key, path, errs) {
    if (hasOwn(obj, key) && !(isStr(obj[key], 300) && ARABIC_LETTER.test(obj[key]))) errs.push(path + "." + key + " must be a non-empty string containing at least one Arabic letter");
  };
  const checkList = function (v, path, min, max, errs) {
    if (!Array.isArray(v)) { errs.push(path + " must be an array"); return false; }
    if (v.length < min || v.length > max) errs.push(path + " must contain between " + min + " and " + max + " items");
    return true;
  };
  const checkRefs = function (v, path, ctx, errs) {
    if (!Array.isArray(v)) { errs.push(path + " must be an array of vocabulary item IDs"); return; }
    const seen = {};
    v.forEach(function (r, i) {
      if (typeof r !== "string" || !ctx.vocabIds.has(r)) errs.push(path + "[" + i + "] " + show(r) + " is not a known vocabulary item ID");
      else if (hasOwn(seen, r)) errs.push(path + "[" + i + "] duplicates " + show(r));
      else seen[r] = true;
    });
  };

  const buildContext = function () {
    const ids = [];
    if (V) [].concat(V.ITEMS || [], V.TOPICS || [], V.PATTERNS || [], V.PATTERN_ITEMS || []).forEach(function (x) { if (x && typeof x.id === "string") ids.push(x.id); });
    const vocab = new Set((V && V.ITEMS ? V.ITEMS : []).map(function (x) { return x.id; }));
    return { vocabIds: vocab, reservedIds: new Set(ids) };
  };
  const normaliseContext = function (ctx) {
    const d = buildContext();
    if (!ctx) return d;
    const vocab = new Set(ctx.vocabIds || []);
    return { vocabIds: vocab, reservedIds: ctx.reservedIds ? new Set(ctx.reservedIds) : (ctx.vocabIds ? vocab : d.reservedIds) };
  };

  /* Validates ONE lesson record. Pure: never mutates the record. Returns { ok, errors } (errors in a fixed, deterministic order). */
  const validateLesson = function (record, ctx, label) {
    const c = normaliseContext(ctx), errs = [];
    if (!isPlain(record)) return { ok: false, errors: [(label || "lesson") + ": must be an object"] };
    const p = label || (typeof record.id === "string" && record.id ? record.id : "lesson");
    checkKeys(record, SCHEMA.lesson, p, errs);

    if (hasOwn(record, "id")) {
      if (typeof record.id !== "string" || !ID_RE.test(record.id) || record.id.length > MAX_ID) errs.push(p + ".id must match gram-<words> (lower-case ASCII, hyphen separated, at most " + MAX_ID + " characters)");
      else if (c.reservedIds.has(record.id)) errs.push(p + ".id " + show(record.id) + " collides with an existing course ID");
    }
    if (hasOwn(record, "slug") && (typeof record.slug !== "string" || !SLUG_RE.test(record.slug) || record.slug.length > MAX_SLUG)) errs.push(p + ".slug must be lower-case ASCII words joined by hyphens (at most " + MAX_SLUG + " characters)");
    checkText(record, "title", 90, p, errs);
    checkText(record, "summary", 200, p, errs);

    if (hasOwn(record, "explanation") && checkList(record.explanation, p + ".explanation", 1, 20, errs)) {
      record.explanation.forEach(function (b, i) {
        const q = p + ".explanation[" + i + "]";
        if (!isPlain(b)) { errs.push(q + " must be an object"); return; }
        checkKeys(b, SCHEMA.explanation, q, errs); checkText(b, "heading", 90, q, errs); checkText(b, "text", 2000, q, errs);
      });
    }
    if (hasOwn(record, "examples") && checkList(record.examples, p + ".examples", 1, 30, errs)) {
      record.examples.forEach(function (x, i) {
        const q = p + ".examples[" + i + "]";
        if (!isPlain(x)) { errs.push(q + " must be an object"); return; }
        checkKeys(x, SCHEMA.example, q, errs); checkArabic(x, "ar", q, errs); checkText(x, "translit", 300, q, errs); checkText(x, "en", 300, q, errs);
        if (hasOwn(x, "vocabRefs")) checkRefs(x.vocabRefs, q + ".vocabRefs", c, errs);
      });
    }
    if (hasOwn(record, "mistakes") && checkList(record.mistakes, p + ".mistakes", 0, 20, errs)) {
      record.mistakes.forEach(function (m, i) {
        const q = p + ".mistakes[" + i + "]";
        if (!isPlain(m)) { errs.push(q + " must be an object"); return; }
        checkKeys(m, SCHEMA.mistake, q, errs); checkText(m, "text", 500, q, errs); checkArabic(m, "ar", q, errs);
      });
    }
    if (hasOwn(record, "check") && checkList(record.check, p + ".check", 1, 10, errs)) {
      record.check.forEach(function (k, i) {
        const q = p + ".check[" + i + "]";
        if (!isPlain(k)) { errs.push(q + " must be an object"); return; }
        checkKeys(k, SCHEMA.check, q, errs); checkText(k, "prompt", 500, q, errs); checkText(k, "explain", 500, q, errs);
        if (hasOwn(k, "choices")) {
          if (!Array.isArray(k.choices) || k.choices.length < 2 || k.choices.length > 6 || !k.choices.every(function (s) { return isStr(s, 200); })) errs.push(q + ".choices must be 2 to 6 non-empty strings");
          else if (new Set(k.choices).size !== k.choices.length) errs.push(q + ".choices must not contain duplicates");
        }
        if (hasOwn(k, "answerIndex") && !(Number.isInteger(k.answerIndex) && Array.isArray(k.choices) && k.answerIndex >= 0 && k.answerIndex < k.choices.length)) errs.push(q + ".answerIndex must be an integer index into choices");
      });
    }
    if (hasOwn(record, "vocabRefs")) checkRefs(record.vocabRefs, p + ".vocabRefs", c, errs);
    if (hasOwn(record, "prerequisites")) {
      if (!Array.isArray(record.prerequisites)) errs.push(p + ".prerequisites must be an array of grammar lesson IDs");
      else {
        const seen = {};
        record.prerequisites.forEach(function (r, i) {
          if (typeof r !== "string" || !ID_RE.test(r)) errs.push(p + ".prerequisites[" + i + "] " + show(r) + " is not a grammar lesson ID");
          else if (r === record.id) errs.push(p + ".prerequisites[" + i + "] refers to the lesson itself");
          else if (hasOwn(seen, r)) errs.push(p + ".prerequisites[" + i + "] duplicates " + show(r));
          else seen[r] = true;
        });
      }
    }
    return { ok: errs.length === 0, errors: errs };
  };

  /* Validates a whole catalogue: every record, plus duplicate IDs / slugs, unknown or cyclic prerequisites.
     An empty catalogue is valid. Pure: never mutates its input. Returns { ok, errors }. */
  const validateCatalogue = function (records, ctx) {
    const c = normaliseContext(ctx), errs = [];
    if (!Array.isArray(records)) return { ok: false, errors: ["catalogue must be an array"] };
    const ids = {}, slugs = {};
    records.forEach(function (r, i) {
      const label = "lessons[" + i + "]" + (isPlain(r) && typeof r.id === "string" && r.id ? " (" + r.id + ")" : "");
      validateLesson(r, c, label).errors.forEach(function (e) { errs.push(e); });
      if (!isPlain(r)) return;
      if (typeof r.id === "string") { if (hasOwn(ids, r.id)) errs.push(label + ": duplicate lesson ID " + show(r.id)); else ids[r.id] = i; }
      if (typeof r.slug === "string") { if (hasOwn(slugs, r.slug)) errs.push(label + ": duplicate slug " + show(r.slug)); else slugs[r.slug] = i; }
    });
    const graph = {};
    records.forEach(function (r, i) {
      if (!isPlain(r) || typeof r.id !== "string" || ids[r.id] !== i || !Array.isArray(r.prerequisites)) return;
      graph[r.id] = [];
      r.prerequisites.forEach(function (d) {
        if (typeof d !== "string" || !ID_RE.test(d) || d === r.id) return;
        if (!hasOwn(ids, d)) errs.push("lessons[" + i + "] (" + r.id + "): prerequisite " + show(d) + " is not in the catalogue");
        else graph[r.id].push(d);
      });
    });
    const state = {}, reported = {};
    const visit = function (id, stack) {
      state[id] = 1;
      (graph[id] || []).forEach(function (d) {
        if (state[d] === 1) { const cyc = stack.slice(stack.indexOf(d)).concat(d); const key = cyc.slice().sort().join(","); if (!reported[key]) { reported[key] = true; errs.push("prerequisite cycle: " + cyc.join(" -> ")); } }
        else if (!state[d]) visit(d, stack.concat(d));
      });
      state[id] = 2;
    };
    Object.keys(graph).forEach(function (id) { if (!state[id]) visit(id, [id]); });
    return { ok: errs.length === 0, errors: errs };
  };

  /* ---------- the validated catalogue ----------
     ERRORS lists every problem found in RAW at load time. LESSONS is the catalogue when it is valid and [] otherwise, so a broken
     catalogue can never publish a page by accident; urls.js turns a non-empty ERRORS into a build failure. */
  const ERRORS = validateCatalogue(RAW).errors;
  const LESSONS = ERRORS.length ? [] : RAW.slice();
  const byId = {}, bySlug = {};
  LESSONS.forEach(function (g) { byId[g.id] = g; bySlug[g.slug] = g; });

  return { RAW: RAW, LESSONS: LESSONS, ERRORS: ERRORS, SCHEMA: SCHEMA, byId: byId, bySlug: bySlug, validateLesson: validateLesson, validateCatalogue: validateCatalogue };
});
