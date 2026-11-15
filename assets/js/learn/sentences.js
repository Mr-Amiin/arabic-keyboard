/* Learn Arabic — Phase 4 sentence workshop (schema, sets and validators only; content only, no DOM). UNREVIEWED by a qualified Arabic teacher.
   Milestone 1 ships the empty catalogue: RAW below holds NO exercises. About 24 exercises are drafted in a later milestone, in three graded
   sets of eight (pass mark 70%: 6 of 8). Every exercise must carry status "draft-unreviewed" until a qualified Arabic teacher has reviewed it.

   Authoring shapes (RAW entries), all with { id:"bw-<set>-<nn>", set:1|2|3, kind, status:"draft-unreviewed", translit, en, explanation? }:
     order    { accept:[ [word, word, ...], ...alternative valid orders ], punct? }          tap-to-build; every accepted order is an explicit, reviewable list
     complete { sentenceId:"snt-st-...", ar, slot, pool:[2-3 wrong words], punct? }          choose the missing word; the ONLY kind that joins the review schedule
     match    { pairs:[ [firstHalf, secondHalf, en], ... 2-4 ] }                              all-or-nothing per question, with per-pair feedback

   REVIEW CONTRACT (shared with the UI and the tests): "complete" exercises record correct AND wrong answers through the existing sentence-review
   mechanism, exactly as Phase 3 sentence practice does, and the page says so: "Your answers schedule these sentences for review."
   Ordering and matching count toward their set's score only. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./exercises.js"));
  else root.LearnSentences = factory(root.LearnExercises);
})(typeof self !== "undefined" ? self : this, function (X) {
  "use strict";
  if (!X) return null;   // a partial deploy (exercises.js missing): stay inert instead of throwing, so the rest of Learn Arabic is unaffected

  const PASS_PERCENT = X.PASS_PERCENT, STATUS = X.STATUS, DRAFT_NOTICE = X.DRAFT_NOTICE, REVIEW_NOTICE = X.REVIEW_NOTICE;
  const SETS = [
    { id: "build-set-1", n: 1, title: "Nominal sentences",         expected: 8, kinds: ["order", "match"] },
    { id: "build-set-2", n: 2, title: "Verbal sentences",          expected: 8, kinds: ["order", "complete"] },
    { id: "build-set-3", n: 3, title: "Completing and connecting", expected: 8, kinds: ["complete", "match"] }
  ];
  const ITEM_ID = /^bw-([123])-(\d{2})$/, SENTENCE_ID = /^snt-st-[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const RAW = [];   // Milestone 1: intentionally empty. No Arabic exercise text exists yet.

  function build(raw) {
    return (raw || []).map(function (r) {
      const it = Object.assign({}, r);
      it.translit = String(r.translit || ""); it.en = String(r.en || ""); it.explanation = String(r.explanation || "");
      if (r.kind === "order") { it.accept = (r.accept || []).map(a => a.map(X.nfc)); it.punct = r.punct || ""; it.ar = it.accept[0] ? it.accept[0].join(" ") : ""; it.plain = X.strip(it.ar); }
      if (r.kind === "complete") { it.ar = X.nfc(r.ar); it.plain = X.strip(it.ar); it.slot = X.nfc(r.slot); it.pool = (r.pool || []).map(X.nfc); it.punct = r.punct || ""; }
      if (r.kind === "match") it.pairs = (r.pairs || []).map(p => [X.nfc(p[0]), X.nfc(p[1]), String(p[2] || "")]);
      return it;
    });
  }
  const ITEMS = build(RAW);
  const unitIds = () => SETS.map(s => s.id);
  const itemsOf = (list, n) => list.filter(i => i.set === n);

  // The shape the existing review system uses for a sentence (conversations.js SENTENCE_ITEMS). Only "complete" items have one.
  function toReviewSentence(it) {
    if (it.kind !== "complete") throw new Error("only completion exercises join the review schedule: " + it.id);
    return { id: it.sentenceId, unit: "workshop", ar: it.ar, plain: it.plain, translit: it.translit, en: it.en, slot: it.slot, pool: it.pool.slice(), punct: it.punct, reg: "msa" };
  }

  // What review.js registers: the completion exercises only, in the review system's own sentence shape. Read at call time, so an empty catalogue adds nothing.
  const reviewSentences = () => ITEMS.filter(i => i.kind === "complete").map(toReviewSentence);
  const hasContent = () => ITEMS.length > 0;
  // The question object a runner shows for one exercise (a Phase 3-shaped fill-in, a tap-to-build order, or a match).
  function buildExercise(it, rng) {
    if (it.kind === "order") return X.buildOrder(it, rng);
    if (it.kind === "complete") return X.buildComplete(it, rng);
    if (it.kind === "match") {
      const why = it.pairs.map(p => p[0] + " " + p[1] + " — " + p[2]).join("  ·  ");
      return X.buildMatch({ id: it.id, prompt: it.prompt || "Match the two halves of each sentence.", pairs: it.pairs.map(p => [p[0], p[1]]), arLeft: true, arRight: true, explanation: why + (it.explanation ? " " + it.explanation : "") }, rng);
    }
    throw new Error("Unknown exercise kind " + it.kind);
  }

  // ctx: { reservedIds: Set of ids that already exist anywhere (frozen) }
  function validateItem(it, ctx) {
    const p = [], at = (it && it.id) || "exercise", bad = m => p.push(at + ": " + m);
    if (!it || typeof it !== "object") return [at + ": not an object"];
    const m = ITEM_ID.exec(String(it.id)), set = SETS[(it.set | 0) - 1];
    if (!m) bad("id must look like bw-1-01"); else if (+m[1] !== it.set) bad("id does not match its set");
    if (!set) { bad("set must be 1, 2 or 3"); return p; }
    if (set.kinds.indexOf(it.kind) < 0) bad("kind " + it.kind + " is not used in " + set.id + " (allowed: " + set.kinds.join(", ") + ")");
    if (it.status !== STATUS) bad('status must be exactly "' + STATUS + '" (content stays labelled as awaiting qualified teacher review)');
    X.approvalClaims(it).forEach(k => bad("approval claim field " + k));
    if (!X.isStr(it.translit) || X.hasArabic(it.translit)) bad("transliteration missing or contains Arabic script");
    if (!X.isStr(it.en) || X.hasArabic(it.en)) bad("English missing or contains Arabic script");
    if (it.kind !== "complete" && Object.prototype.hasOwnProperty.call(it, "sentenceId")) bad("only completion exercises may have a sentenceId (they alone join the review schedule)");
    const word = w => X.isStr(w) && X.hasArabic(w) && !X.hasLatin(w) && !/\s/.test(w) && w === w.normalize("NFC");
    if (it.kind === "order") {
      const A = it.accept;
      if (!Array.isArray(A) || A.length < 1 || A.length > 4 || !A.every(a => Array.isArray(a))) { bad("needs 1 to 4 accepted orders"); return p; }
      if (!A.every(a => a.length >= 3 && a.length <= 8 && a.every(word))) bad("each accepted order needs 3 to 8 single Arabic words (NFC, no Latin letters)");
      const key = a => a.slice().sort().join("|");
      if (new Set(A.map(key)).size !== 1) bad("every accepted order must use exactly the same words");
      if (new Set(A.map(a => a.join(" "))).size !== A.length) bad("accepted orders repeat");
      if (A[0].length >= 3 && A[0].length <= 8 && X.findUnaccepted(A[0], seq => A.some(a => a.join(" ") === seq.join(" "))) === null) bad("every ordering of these words is accepted");
      if (it.punct != null && ["", ".", "؟", "!"].indexOf(it.punct) < 0) bad("punct must be empty or one of . ؟ !");
    }
    if (it.kind === "complete") {
      if (!SENTENCE_ID.test(String(it.sentenceId)) || String(it.sentenceId).length > 40) bad("sentenceId must look like snt-st-... and be at most 40 characters");
      if (!X.hasArabic(it.ar) || X.hasLatin(it.ar) || it.ar !== it.ar.normalize("NFC")) bad("ar must be NFC Arabic without Latin letters");
      if (it.plain !== X.strip(it.ar)) bad("plain does not equal the vowelled text without harakat");
      const toks = String(it.ar).split(" ");
      if (toks.indexOf(it.slot) < 0 || toks.indexOf(it.slot) !== toks.lastIndexOf(it.slot)) bad("slot must be exactly one word of the sentence");
      const pool = it.pool;
      if (!Array.isArray(pool) || pool.length < 2 || pool.length > 3 || !pool.every(word)) bad("pool needs 2 or 3 single Arabic words");
      else if (new Set(pool.concat([it.slot]).map(w => X.strip(w))).size !== pool.length + 1) bad("pool repeats the slot or itself (even without harakat)");
      if (!word(it.slot)) bad("slot must be a single Arabic word");
    }
    if (it.kind === "match") {
      const P = it.pairs;
      if (!Array.isArray(P) || P.length < 2 || P.length > 4 || !P.every(x => Array.isArray(x) && X.isStr(x[0]) && X.isStr(x[1]) && X.isStr(x[2]) && X.hasArabic(x[0]) && X.hasArabic(x[1]) && !X.hasLatin(x[0]) && !X.hasLatin(x[1]) && !X.hasArabic(x[2]))) bad("needs 2 to 4 [firstHalf, secondHalf, english] pairs (Arabic halves, English translation)");
      else {
        if (new Set(P.map(x => X.strip(x[0]))).size !== P.length) bad("first halves repeat");
        if (new Set(P.map(x => X.strip(x[1]))).size !== P.length) bad("second halves repeat");
      }
    }
    return p;
  }

  // Catalogue checks. opts.complete = true also demands exactly 8 exercises per set (24 in all): the first-release shape.
  function validateCatalog(list, ctx, opts) {
    const p = [], reserved = (ctx && ctx.reservedIds) || new Set(), seen = new Set();
    list.forEach(it => {
      validateItem(it, ctx).forEach(m => p.push(m));
      [it.id, it.sentenceId].filter(Boolean).forEach(id => { if (seen.has(id)) p.push(it.id + ": duplicate id " + id); seen.add(id); if (reserved.has(id)) p.push(it.id + ": collides with an existing id " + id); });
    });
    SETS.forEach(s => { const n = itemsOf(list, s.n).length; if (n > s.expected) p.push(s.id + " has more than " + s.expected + " exercises"); if (opts && opts.complete && n !== s.expected) p.push(s.id + " needs " + s.expected + " exercises (has " + n + ")"); });
    return p;
  }

  return { PASS_PERCENT, STATUS, DRAFT_NOTICE, REVIEW_NOTICE, SETS, ITEM_ID, SENTENCE_ID, RAW, ITEMS, build, unitIds, itemsOf, toReviewSentence, reviewSentences, hasContent, buildExercise, validateItem, validateCatalog };
});
