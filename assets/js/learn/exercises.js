/* Learn Arabic — Phase 4 exercise logic (pure functions, no DOM). UNREVIEWED by a qualified Arabic teacher.
   Used by the Stories and Sentence Workshop track: word ordering, sentence completion, sentence-half matching, true/false, short answer,
   vocabulary in context, and an ungraded model-answer reveal. It holds NO course content; the content lives in stories.js and sentences.js.

   RELIANCE ON engine.normalizeAr (read-only use; engine.js is not modified). What the short-answer grader relies on, measured in
   tests/learn/phase4.test.mjs ("normalizeAr contract"):
     REMOVED      U+064B–U+065F (tanween, short vowels, shadda, sukun, maddah/hamza marks, other small marks), U+0670 (dagger alif), U+0640 (tatweel).
     UNIFIED      alef forms أ إ آ ٱ -> ا ; alef maqsura ى -> ي. So "على" and "علي", or "أب" and "اب", are the same answer.
     PRESERVED    ة (never equal to ه), ؤ ئ ء, ي vs ی (Persian), digits, Latin, ZWNJ/ZWJ, Quranic annotation marks (U+06D6–U+06ED),
                  and ALL punctuation (. ، ؟ ! …). Whitespace is collapsed and trimmed. NFC is applied first.
   Because punctuation is preserved by the engine, this module trims punctuation from both ends of a typed short answer before comparing. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.LearnExercises = factory(root.LearnEngine);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const PASS_PERCENT = 70;                       // same mark as conversations and reading
  const STATUS = "draft-unreviewed";             // every Phase 4 story, question and exercise must carry this exact status
  const DRAFT_NOTICE = "Draft: awaiting review by a qualified Arabic teacher.";
  const QUESTION_TYPES = ["mcq", "tf", "match", "short", "vocab-context", "reveal"];
  const SRS_ID = /^[a-z0-9:_-]{1,40}$/;          // the review system's own ID rule (progress.js)

  // Review behaviour, stated once so the UI and the tests share one contract.
  //  vocabularyInContext: a WRONG answer is recorded for the existing vocabulary ID; a correct answer never creates or advances a review entry.
  //  workshopSentences:   completion exercises record correct AND wrong answers, exactly like Phase 3 sentence practice.
  const REVIEW_POLICY = Object.freeze({ vocabularyInContext: "misses-only", workshopSentences: "all-answers" });
  const REVIEW_NOTICE = Object.freeze({
    workshopSentences: "Your answers schedule these sentences for review.",          // the same sentence Phase 3 shows on sentence practice
    vocabularyInContext: "Words you miss here are added to your review schedule. Correct answers do not change it."
  });

  const MARKS = /[\u064B-\u0670\u0640]/g;
  const EDGE_PUNCT = /^[\s.,!?؟،؛:;"'“”‘’()\[\]«»\-–—…]+|[\s.,!?؟،؛:;"'“”‘’()\[\]«»\-–—…]+$/g;
  const nfc = s => String(s == null ? "" : s).normalize("NFC");
  const strip = s => nfc(s).replace(MARKS, "");
  const tokens = s => nfc(s).trim().split(/\s+/).filter(Boolean);
  const hasLatin = s => /[A-Za-z]/.test(String(s == null ? "" : s));
  const hasArabic = s => /[\u0600-\u06FF]/.test(String(s == null ? "" : s));
  const isStr = s => typeof s === "string" && s.trim().length > 0;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const cleanTyped = s => nfc(s).replace(EDGE_PUNCT, "");
  const sameSeq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const norm = s => E.normalizeAr(s);

  // Keys that would claim a teacher has checked the content. None may appear anywhere in Phase 4 data.
  const CLAIM_KEY = /^(reviewed|approved|verified|teacher\w*|reviewer\w*|approvedby|reviewedby|signedoff|signoff)$/i;
  function approvalClaims(v, path, out) {
    out = out || []; path = path || "";
    if (Array.isArray(v)) v.forEach((x, i) => approvalClaims(x, path + "[" + i + "]", out));
    else if (v && typeof v === "object") Object.keys(v).forEach(k => { if (CLAIM_KEY.test(k)) out.push((path ? path + "." : "") + k); approvalClaims(v[k], (path ? path + "." : "") + k, out); });
    return out;
  }

  // ---------------------------------------------------------------- word ordering
  // Exhaustive search for an ordering that is NOT accepted (the validator caps tiles at 8, so this stays small).
  function findUnaccepted(texts, isAccepted) {
    const n = texts.length, idx = texts.map((_, i) => i); let found = null;
    (function permute(k) {
      if (found) return;
      if (k === n) { const seq = idx.map(i => texts[i]); if (!isAccepted(seq)) found = idx.slice(); return; }
      for (let i = k; i < n && !found; i++) { [idx[k], idx[i]] = [idx[i], idx[k]]; permute(k + 1); [idx[k], idx[i]] = [idx[i], idx[k]]; }
    })(0);
    return found;
  }
  function buildOrder(item, rng) {
    rng = rng || Math.random;
    if (!item || !Array.isArray(item.accept) || !item.accept.length) throw new Error("order item needs an accept list");
    const accepted = item.accept.map(a => a.map(nfc)), texts = accepted[0].slice();
    const isAccepted = seq => accepted.some(a => sameSeq(a, seq));
    const tiles = texts.map((text, i) => ({ tid: "t" + i, text }));
    let order = null;
    for (let k = 0; k < 64 && !order; k++) { const c = E.shuffle(tiles, rng); if (!isAccepted(c.map(t => t.text))) order = c; }
    if (!order) { const f = findUnaccepted(texts, isAccepted); if (f) order = f.map(i => tiles[i]); }
    if (!order) throw new Error("every ordering of these tiles is accepted: " + item.id);
    return { type: "order", id: item.id, prompt: item.prompt || "Put the words in order to make a sentence.", tiles: order, accept: accepted,
      punct: item.punct || "", translit: item.translit || "", en: item.en || "", explanation: item.explanation || "" };
  }
  // placed = tile ids in the order the learner placed them. Duplicate words are interchangeable: the comparison is on the word text.
  function gradeOrder(q, placed) {
    const out = { graded: true, correct: false, complete: false, reason: "invalid", expected: q.accept[0].join(" ") + q.punct, explanation: q.explanation };
    const byId = Object.create(null); q.tiles.forEach(t => { byId[t.tid] = t.text; });
    if (!Array.isArray(placed) || placed.some(id => typeof id !== "string" || !(id in byId)) || new Set(placed).size !== placed.length) return out;
    if (placed.length !== q.tiles.length) { out.reason = "incomplete"; return out; }
    const ok = q.accept.some(a => sameSeq(a, placed.map(id => byId[id])));
    out.complete = true; out.correct = ok; out.reason = ok ? "ok" : "order"; return out;
  }

  // ---------------------------------------------------------------- sentence-half matching (all-or-nothing, per-pair feedback)
  // A built match question is SELF-DESCRIBING, so the engine is reusable for any matching content:
  //   left:  [{ lid, text }]    the items in the left list
  //   right: [{ rid, text }]    the items in the right list, in DISPLAY order
  //   correct: { lid: rid }     the correct pairing, stated explicitly
  // Ids are OPAQUE. Grading looks the right id up in `correct`; it never derives one id from another. To make that impossible to rely on by accident,
  // buildMatch gives each right id an index that is NOT its pair's index. validateBuiltMatch states the invariants any match question must satisfy.
  function buildMatch(q, rng) {
    rng = rng || Math.random;
    const n = q.pairs.length, ident = q.pairs.map((_, i) => i);
    let perm = null;
    for (let k = 0; k < 64 && !perm; k++) { const c = E.shuffle(ident, rng); if (c.some((v, i) => v !== i)) perm = c; }
    if (!perm) perm = ident.slice(1).concat(ident.slice(0, 1));
    const left = q.pairs.map((p, i) => ({ lid: "l" + i, text: nfc(p[0]) })), rightOf = q.pairs.map((p, i) => ({ rid: "r" + perm[i], text: nfc(p[1]) }));
    const correct = {}; left.forEach((l, i) => { correct[l.lid] = rightOf[i].rid; });
    let right = null;
    for (let k = 0; k < 64 && !right; k++) { const c = E.shuffle(rightOf, rng); if (c.some((r, i) => correct[left[i].lid] !== r.rid)) right = c; }   // never displayed row-for-row in answer order
    if (!right) right = rightOf.slice(1).concat(rightOf.slice(0, 1));
    return { type: "match", id: q.id, prompt: q.prompt, left, right, correct, arLeft: !!q.arLeft, arRight: !!q.arRight, explanation: q.explanation || "" };
  }
  // answer = { lid: rid }. The question is correct only when every pair is right; each pair is still reported (with the id that would have been right).
  function gradeMatch(q, answer) {
    answer = answer && typeof answer === "object" ? answer : {};
    const key = q.correct && typeof q.correct === "object" && !Array.isArray(q.correct) ? q.correct : {};   // no explicit pairing => nothing can be marked right (fail closed, never throw)
    const pairResults = q.left.map(l => {
      const chosen = own(answer, l.lid) && typeof answer[l.lid] === "string" ? answer[l.lid] : null, expected = own(key, l.lid) && typeof key[l.lid] === "string" ? key[l.lid] : null;
      return { lid: l.lid, rid: chosen, expected, correct: chosen !== null && expected !== null && chosen === expected };
    });
    const complete = pairResults.every(p => p.rid !== null);
    return { graded: true, correct: complete && pairResults.every(p => p.correct), complete, pairResults, reason: complete ? "ok" : "incomplete", explanation: q.explanation };
  }
  function validateBuiltMatch(q) {
    const p = [], bad = m => p.push((q && q.id || "match") + ": " + m);
    if (!q || typeof q !== "object") return ["match: not an object"];
    const okSide = (arr, k) => Array.isArray(arr) && arr.length >= 2 && arr.length <= 4 && arr.every(x => x && isStr(x[k]) && isStr(x.text));
    if (!okSide(q.left, "lid")) bad("left needs 2 to 4 items with an id and text"); if (!okSide(q.right, "rid")) bad("right needs 2 to 4 items with an id and text");
    if (p.length) return p;
    if (q.left.length !== q.right.length) bad("left and right must have the same number of items");
    const lids = q.left.map(l => l.lid), rids = q.right.map(r => r.rid);
    if (new Set(lids).size !== lids.length) bad("left ids repeat"); if (new Set(rids).size !== rids.length) bad("right ids repeat");
    if (!q.correct || typeof q.correct !== "object" || Array.isArray(q.correct)) { bad("needs an explicit correct map { leftId: rightId }"); return p; }
    const keys = Object.keys(q.correct);
    if (keys.length !== lids.length || !lids.every(id => own(q.correct, id))) bad("correct must have exactly one entry for every left id");
    const targets = keys.map(k => q.correct[k]);
    if (!targets.every(t => rids.indexOf(t) >= 0)) bad("correct points at a right id that does not exist");
    if (new Set(targets).size !== targets.length) bad("correct is not one-to-one (two left items share a right item)");
    if (!p.length && q.left.every((l, i) => q.correct[l.lid] === q.right[i].rid)) bad("the right list is displayed in answer order (row for row)");
    return p;
  }

  // ---------------------------------------------------------------- true / false (fixed order, never shuffled)
  function buildTrueFalse(q) {
    return { type: "tf", id: q.id, prompt: q.prompt, options: [{ value: "true", label: "True" }, { value: "false", label: "False" }], answer: q.answer ? "true" : "false", explanation: q.explanation || "" };
  }
  function gradeTrueFalse(q, value) {
    const v = value === true ? "true" : value === false ? "false" : String(value);
    if (v !== "true" && v !== "false") return { graded: true, correct: false, reason: "invalid", explanation: q.explanation };
    return { graded: true, correct: v === q.answer, reason: v === q.answer ? "ok" : "wrong", explanation: q.explanation };
  }

  // ---------------------------------------------------------------- multiple choice and vocabulary in context
  // The correct option is options[0] in the data; the shuffled option keeps its original index as its value.
  // A vocabulary-in-context question carries reviewItemId, NEVER itemId: itemId is attached only to a wrong answer (see makeResult).
  function buildChoice(q, rng) {
    rng = rng || Math.random;
    const options = E.shuffle(q.options.map((label, i) => ({ value: String(i), label: nfc(label), ar: !!q.arabicOptions })), rng);
    const out = { type: q.type, id: q.id, prompt: q.prompt, options, answer: "0", explanation: q.explanation || "" };
    if (q.type === "vocab-context") { out.line = q.line; out.word = nfc(q.word); out.reviewItemId = q.reviewItemId || null; }
    return out;
  }
  function gradeChoice(q, value) { const ok = String(value) === q.answer; return { graded: true, correct: ok, reason: ok ? "ok" : "wrong", explanation: q.explanation }; }

  // ---------------------------------------------------------------- short answer (Arabic copied from the text; letters-only comparison)
  function buildShort(q) { return { type: "short", id: q.id, prompt: q.prompt, accept: q.accept.map(nfc), hint: q.hint || "", explanation: q.explanation || "" }; }
  function gradeShort(q, typed) {
    const t = cleanTyped(typed);
    if (!t) return { graded: true, correct: false, reason: "empty", expected: q.accept[0], explanation: q.explanation };
    const ok = q.accept.some(a => E.gradeTyped("letters", cleanTyped(a), t).correct);
    return { graded: true, correct: ok, reason: ok ? "ok" : "letters", expected: q.accept[0], explanation: q.explanation };
  }

  // ---------------------------------------------------------------- ungraded model answer (never scored, never recorded)
  function buildReveal(q) { return { type: "reveal", id: q.id, prompt: q.prompt, model: q.model, explanation: q.explanation || "" }; }
  function gradeReveal(q) { return { graded: false, correct: null, reason: "ungraded", model: q.model, explanation: q.explanation }; }

  // ---------------------------------------------------------------- sentence completion (workshop) — mirrors Phase 3's p-fill shape
  function buildComplete(item, rng) {
    rng = rng || Math.random;
    const toks = item.ar.split(" "), at = toks.indexOf(item.slot);
    if (at < 0) throw new Error("slot is not a word of the sentence: " + item.id);
    return { type: "complete", id: item.id, itemId: item.sentenceId, prompt: "Choose the word that completes the sentence: “" + item.en + "”", answer: item.slot,
      blankWords: { before: toks.slice(0, at).join(" "), after: toks.slice(at + 1).join(" "), punct: item.punct || "" },
      options: E.shuffle([item.slot].concat(item.pool), rng).map(w => ({ value: w, label: w, ar: true })),
      explanation: item.ar + " (" + (item.translit || "") + "): " + item.en };
  }
  function gradeComplete(q, value) { const ok = String(value) === q.answer; return { graded: true, correct: ok, reason: ok ? "ok" : "wrong", explanation: q.explanation }; }

  function buildQuestion(q, rng) {
    switch (q && q.type) {
      case "mcq": case "vocab-context": return buildChoice(q, rng);
      case "tf": return buildTrueFalse(q);
      case "match": return buildMatch(q, rng);
      case "short": return buildShort(q);
      case "reveal": return buildReveal(q);
      default: throw new Error("Unknown question type " + (q && q.type));
    }
  }
  function gradeAnswer(built, answer) {
    switch (built && built.type) {
      case "mcq": case "vocab-context": return gradeChoice(built, answer);
      case "tf": return gradeTrueFalse(built, answer);
      case "match": return gradeMatch(built, answer);
      case "short": return gradeShort(built, answer);
      case "reveal": return gradeReveal(built);
      case "order": return gradeOrder(built, answer);
      case "complete": return gradeComplete(built, answer);
      default: throw new Error("Unknown question type " + (built && built.type));
    }
  }

  // ---------------------------------------------------------------- results, score, pass mark
  // A result is what the existing session code stores: { letterId, correct, q }, plus graded. Ungraded answers are marked graded:false and are
  // excluded from the score. For vocabulary in context the stored q carries itemId ONLY when the answer was wrong, so the existing
  // finish() mapping (r.q.itemId) records misses and nothing else.
  function makeResult(built, grade) {
    const q = Object.assign({}, built);
    if (built.type === "vocab-context") { delete q.itemId; if (grade.graded === true && grade.correct === false && built.reviewItemId) q.itemId = built.reviewItemId; }
    return { letterId: null, correct: grade.correct === true, graded: grade.graded === true, q };   // graded only when the grader EXPLICITLY said so
  }
  // Only results explicitly marked graded === true count. A missing, null, truthy-but-not-true or false flag is treated as NOT graded (fail closed).
  const gradedResults = results => results.filter(r => r && r.graded === true);
  function scoreResults(results) { return E.scoreSession(gradedResults(results)); }   // { correct, total, percent } — the same rounded percent the progress store receives
  const passes = percent => percent >= PASS_PERCENT;

  // The rows that should reach store.reviewAnswers. isKnownId is REQUIRED (the existing finish() uses R.kindOf): ids it rejects are dropped,
  // as are ids the review system's own rule would reject. If one id appears twice, a miss wins.
  function reviewRowsFor(results, opts) {
    if (!opts || typeof opts.isKnownId !== "function") throw new Error("reviewRowsFor needs isKnownId (the review system's catalogue check)");
    const rows = [];
    gradedResults(results).forEach(r => {
      const q = r.q || {};
      let id = null, correct = r.correct === true;
      if (q.type === "vocab-context") { if (!correct) id = q.reviewItemId; }          // H-1: misses only; a correct answer never produces a row
      else if (q.type === "complete") id = q.itemId;                                  // H-2: every answer, as Phase 3 sentence practice does
      if (typeof id !== "string" || !SRS_ID.test(id) || !opts.isKnownId(id)) return;
      const at = rows.findIndex(x => x.id === id);
      if (at < 0) rows.push({ id, correct }); else if (!correct) rows[at].correct = false;
    });
    return rows;
  }

  // ---------------------------------------------------------------- the ONLY way a Phase 4 session reaches the shared finish()
  // finishPackage bundles what finish() may use: the GRADED results (an ungraded reveal never reaches the score, the recorded session or the
  // "To review" list) and the review rows that reviewRowsFor produced (so every review submission goes through the policy). It is frozen.
  // isFinishPackage is the check the UI makes before it accepts a package; it guards against mistakes (it cannot stop code that forges one).
  const PACKAGE_VERSION = 1;

  // Create an independent copy of package data and recursively freeze it.
  // The original session results must remain mutable and must never be frozen here.
  function cloneAndFreeze(value, seen) {
    if (typeof value === "function") throw new TypeError("finishPackage does not accept functions");
    if (value === null || typeof value !== "object") return value;

    const isArray = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (isArray ? proto !== Array.prototype : (proto !== Object.prototype && proto !== null)) {
      throw new TypeError("finishPackage accepts only plain objects and arrays");
    }

    const memo = seen || new WeakMap();
    if (memo.has(value)) return memo.get(value);

    const copy = isArray ? [] : Object.create(proto);
    memo.set(value, copy);

    Reflect.ownKeys(value).forEach(key => {
      if (isArray && key === "length") return;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, "value")) {
        throw new TypeError("finishPackage accepts data properties only");
      }
      Object.defineProperty(copy, key, {
        value: cloneAndFreeze(descriptor.value, memo),
        enumerable: descriptor.enumerable,
        writable: true,
        configurable: true
      });
    });

    if (isArray) copy.length = value.length;
    return Object.freeze(copy);
  }

  // Check every nested object and array. Reject accessors and non-plain objects.
  function isDeepFrozen(value, seen) {
    if (typeof value === "function") return false;
    if (value === null || typeof value !== "object") return true;

    const isArray = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (isArray ? proto !== Array.prototype : (proto !== Object.prototype && proto !== null)) return false;
    if (!Object.isFrozen(value)) return false;

    const visited = seen || new WeakSet();
    if (visited.has(value)) return true;
    visited.add(value);

    return Reflect.ownKeys(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor && own(descriptor, "value") && isDeepFrozen(descriptor.value, visited);
    });
  }

  function finishPackage(allResults, opts) {
    return cloneAndFreeze({
      v: PACKAGE_VERSION,
      results: gradedResults(allResults),
      reviewRows: reviewRowsFor(allResults, opts)
    });
  }

  function isFinishPackage(p) {
    try {
      return !!p &&
        typeof p === "object" &&
        isDeepFrozen(p) &&
        p.v === PACKAGE_VERSION &&
        Array.isArray(p.results) &&
        Array.isArray(p.reviewRows) &&
        p.results.every(r =>
          r &&
          r.graded === true &&
          typeof r.correct === "boolean" &&
          r.q &&
          typeof r.q === "object"
        ) &&
        p.reviewRows.every(r =>
          r &&
          typeof r.id === "string" &&
          SRS_ID.test(r.id) &&
          typeof r.correct === "boolean"
        );
    } catch (_) {
      return false;
    }
  }
  // ---------------------------------------------------------------- authoring validators (return a list of problems; empty = valid)
  // ctx: { vocabIds: Set of existing vocabulary ids, lines: story lines (built) for vocabulary-in-context }
  function validateQuestion(q, ctx) {
    const p = [], at = (q && q.id) || "question";
    const bad = m => p.push(at + ": " + m);
    ctx = ctx || {};
    if (!q || typeof q !== "object") return [at + ": not an object"];
    if (QUESTION_TYPES.indexOf(q.type) < 0) { bad("unknown type " + q.type); return p; }
    if (!isStr(q.prompt)) bad("prompt is empty");
    if (q.type !== "reveal" && !isStr(q.explanation)) bad("graded questions need an explanation");
    approvalClaims(q).forEach(k => bad("approval claim field " + k));
    if (q.type === "mcq" || q.type === "vocab-context") {
      const o = q.options;
      if (!Array.isArray(o) || o.length < 3 || o.length > 4 || !o.every(isStr)) bad("needs 3 or 4 non-empty options");
      else {
        if (new Set(o.map(x => norm(x))).size !== o.length) bad("options repeat (after harakat and letter variants are ignored)");
        if (q.arabicOptions) { if (!o.every(x => hasArabic(x) && !hasLatin(x))) bad("arabicOptions must be Arabic only (mixed Arabic and English in one option breaks RTL order)"); }
        else if (o.some(hasArabic)) bad("options containing Arabic must set arabicOptions so they render right-to-left");
      }
    }
    if (q.type === "tf" && typeof q.answer !== "boolean") bad("answer must be true or false");
    if (q.type === "match") {
      const pr = q.pairs;
      if (!Array.isArray(pr) || pr.length < 2 || pr.length > 4 || !pr.every(x => Array.isArray(x) && x.length === 2 && isStr(x[0]) && isStr(x[1]))) bad("needs 2 to 4 [left, right] pairs");
      else {
        if (new Set(pr.map(x => norm(x[0]))).size !== pr.length) bad("left items repeat");
        if (new Set(pr.map(x => norm(x[1]))).size !== pr.length) bad("right items repeat");
        [[0, "arLeft"], [1, "arRight"]].forEach(c => {
          const col = pr.map(x => x[c[0]]);
          if (q[c[1]] ? !col.every(x => hasArabic(x) && !hasLatin(x)) : col.some(hasArabic)) bad("the " + c[1] + " flag does not match the column's text (Arabic columns must be flagged and contain no Latin letters)");
        });
      }
    }
    if (q.type === "short") {
      const a = q.accept;
      if (!Array.isArray(a) || a.length < 1 || a.length > 6 || !a.every(x => isStr(x) && hasArabic(x) && !hasLatin(x) && cleanTyped(x))) bad("needs 1 to 6 Arabic accepted answers");
      else if (new Set(a.map(x => norm(cleanTyped(x)))).size !== a.length) bad("accepted answers repeat");
    }
    if (q.type === "reveal" && !isStr(q.model)) bad("a reveal needs a model answer");
    if (q.type === "vocab-context") {
      const lines = ctx.lines || [], ln = lines[q.line - 1];
      if (!Number.isInteger(q.line) || !ln) bad("line does not exist");
      else if (!isStr(q.word) || !tokens(ln.ar).some(t => strip(cleanTyped(t)) === strip(cleanTyped(q.word)))) bad("word is not a word of that line");
      if (q.reviewItemId != null && (!SRS_ID.test(String(q.reviewItemId)) || !(ctx.vocabIds && ctx.vocabIds.has(q.reviewItemId)))) bad("reviewItemId is not an existing vocabulary id");
      if (own(q, "itemId")) bad("itemId must not be set at authoring time (it is attached only to a wrong answer)");
    }
    return p;
  }

  return { PASS_PERCENT, STATUS, DRAFT_NOTICE, QUESTION_TYPES, SRS_ID, REVIEW_POLICY, REVIEW_NOTICE,
    strip, nfc, tokens, hasLatin, hasArabic, isStr, cleanTyped, approvalClaims,
    buildOrder, gradeOrder, buildMatch, gradeMatch, buildTrueFalse, gradeTrueFalse, buildChoice, gradeChoice, buildShort, gradeShort,
    buildReveal, gradeReveal, buildComplete, gradeComplete, buildQuestion, gradeAnswer,
    makeResult, gradedResults, scoreResults, passes, reviewRowsFor, PACKAGE_VERSION, finishPackage, isFinishPackage, findUnaccepted, validateQuestion, validateBuiltMatch };
});
