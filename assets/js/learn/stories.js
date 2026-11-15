/* Learn Arabic — Phase 4 short stories (schema, bands and validators only; content only, no DOM). UNREVIEWED by a qualified Arabic teacher.
   Milestone 1 ships the empty catalogue: RAW below holds NO stories. The twelve stories are drafted in a later milestone, after the outlines
   are confirmed, and every one of them must carry status "draft-unreviewed" until a qualified Arabic teacher has reviewed it.

   Authoring shape of one story (RAW entry):
     { id:"story-s1-<slug>", band:1|2|3, title, theme, intro,
       lines:[ [ar, translit, en, speaker?], ... ],                      // `plain` is derived from `ar` (harakat removed), never typed by hand
       glossary:[ { ar, translit, en, vocabId? } ],                      // vocabId = an EXISTING vocabulary id; an entry without one is a NEW word
       vocab:[ existing vocabulary ids the story relies on ],
       questions:[ { type:"mcq"|"tf"|"match"|"short"|"vocab-context"|"reveal", ... } ],   // see exercises.js validateQuestion
       status:"draft-unreviewed" }
   Existing vocabulary, pattern, reading and conversation ids are never edited; stories only reference them. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./exercises.js"));
  else root.LearnStories = factory(root.LearnExercises);
})(typeof self !== "undefined" ? self : this, function (X) {
  "use strict";
  if (!X) return null;   // a partial deploy (exercises.js missing): stay inert instead of throwing, so the rest of Learn Arabic is unaffected

  const PASS_PERCENT = X.PASS_PERCENT, STATUS = X.STATUS, DRAFT_NOTICE = X.DRAFT_NOTICE;
  // Band limits (approved): lines, words (whitespace-separated Arabic words across all lines), new words per story, and harakat default.
  const BANDS = [
    { band: 1, id: "s1", title: "Beginner",           lines: [5, 7],  words: [25, 45],  newWordsMax: 6,  marks: true },
    { band: 2, id: "s2", title: "Elementary",         lines: [7, 9],  words: [45, 80],  newWordsMax: 8,  marks: true },
    { band: 3, id: "s3", title: "Lower-intermediate", lines: [8, 10], words: [80, 130], newWordsMax: 12, marks: false }
  ];
  const PER_BAND = 4, QUESTIONS = [6, 9], MIN_GRADED = 5, MIN_TYPES = 3;
  const ID_RE = /^story-s[123]-[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const RAW = [];   // Milestone 1: intentionally empty. No Arabic story text exists yet.

  const slugOf = id => String(id).replace(/^story-s[123]-/, "");
  function countWords(lines) { return lines.reduce((n, l) => n + X.tokens(l.ar).filter(t => X.hasArabic(t)).length, 0); }

  // Turns authoring data into what the app reads. Tolerant of bad input on purpose: validateStory reports the problems.
  function build(raw) {
    return (raw || []).map(function (s) {
      const band = BANDS[(s.band | 0) - 1] || BANDS[0], slug = slugOf(s.id || "");
      const lines = (s.lines || []).map(function (l, i) {
        const ar = X.nfc(l && l[0]), plain = X.strip(ar), at = X.tokens(ar), pt = X.tokens(plain);
        return { n: i + 1, ar, plain, translit: String((l && l[1]) || ""), en: String((l && l[2]) || ""), speaker: String((l && l[3]) || ""),
          audioKey: "st-" + slug + "-" + (i + 1), tokens: at.map((t, k) => ({ ar: t, plain: pt[k] })) };
      });
      const glossary = (s.glossary || []).map(g => ({ ar: X.nfc(g && g.ar), plain: X.strip(g && g.ar), translit: String((g && g.translit) || ""), en: String((g && g.en) || ""),
        vocabId: g && g.vocabId ? g.vocabId : null, isNew: !(g && g.vocabId) }));
      const base = { id: s.id, band: s.band, bandId: band.id, slug, title: String(s.title || ""), theme: String(s.theme || ""), intro: String(s.intro || ""),
        status: s.status, marks: band.marks, lines, glossary, vocab: (s.vocab || []).slice() };
      Object.keys(s).forEach(k => { if (!(k in base) && k !== "questions") base[k] = s[k]; });          // keep stray keys so the validator can flag them
      base.questions = (s.questions || []).map((q, i) => Object.assign({}, q, { id: s.id + "-q" + (i + 1) }));
      base.wordCount = countWords(lines); base.newWordCount = glossary.filter(g => g.isNew).length;
      return base;
    });
  }
  const STORIES = build(RAW);
  const unitIds = () => STORIES.map(s => s.id);
  const hasContent = () => STORIES.length > 0;

  // ctx: { vocabIds:Set of existing vocabulary ids, reservedIds:Set of ids that already exist anywhere (frozen) }
  function validateStory(s, ctx) {
    const p = [], at = (s && s.id) || "story", bad = m => p.push(at + ": " + m);
    ctx = ctx || {};
    if (!s || typeof s !== "object") return [at + ": not an object"];
    if (!ID_RE.test(String(s.id)) || String(s.id).length > 32) bad("id must look like story-s1-slug and be at most 32 characters");
    const band = BANDS[(s.band | 0) - 1];
    if (!band) { bad("band must be 1, 2 or 3"); return p; }
    if (String(s.id).indexOf("story-s" + s.band + "-") !== 0) bad("id does not match its band");
    ["title", "theme", "intro"].forEach(k => { if (!X.isStr(s[k])) bad(k + " is empty"); });
    if (s.status !== STATUS) bad('status must be exactly "' + STATUS + '" (content stays labelled as awaiting qualified teacher review)');
    X.approvalClaims(s).forEach(k => bad("approval claim field " + k));
    if (s.marks !== band.marks) bad("harakat default does not match the band");
    const L = s.lines || [];
    if (L.length < band.lines[0] || L.length > band.lines[1]) bad("needs " + band.lines[0] + "–" + band.lines[1] + " lines (has " + L.length + ")");
    L.forEach(l => {
      const w = "line " + l.n;
      if (l.ar !== l.ar.normalize("NFC")) bad(w + ": not NFC");
      if (!X.isStr(l.ar) || !X.hasArabic(l.ar)) bad(w + ": no Arabic text");
      if (X.hasLatin(l.ar)) bad(w + ": Latin letters inside Arabic text");
      if (l.plain !== X.strip(l.ar)) bad(w + ": plain does not equal the vowelled text without harakat");
      if (l.tokens.length !== X.tokens(l.plain).length || l.tokens.some(t => !t.plain)) bad(w + ": vowelled and plain words do not line up");
      if (!X.isStr(l.translit) || X.hasArabic(l.translit)) bad(w + ": transliteration missing or contains Arabic script");
      if (!X.isStr(l.en) || X.hasArabic(l.en)) bad(w + ": English missing or contains Arabic script");
      if (!/^st-[a-z0-9-]+-\d+$/.test(l.audioKey)) bad(w + ": audio key shape");
    });
    const wc = countWords(L);
    if (wc < band.words[0] || wc > band.words[1]) bad("needs " + band.words[0] + "–" + band.words[1] + " words (has " + wc + ")");
    const G = s.glossary || [];
    if (!G.length) bad("glossary is empty");
    G.forEach(g => {
      if (!X.hasArabic(g.ar) || X.hasLatin(g.ar) || !X.isStr(g.translit) || !X.isStr(g.en)) bad("glossary entry incomplete: " + g.ar);
      if (g.vocabId && !(ctx.vocabIds && ctx.vocabIds.has(g.vocabId))) bad("glossary vocabId is not an existing vocabulary id: " + g.vocabId);
      if (!L.some(l => l.plain.indexOf(g.plain) >= 0)) bad("glossary word does not occur in the story: " + g.ar);
    });
    if (new Set(G.map(g => g.plain)).size !== G.length) bad("glossary repeats a word");
    if (G.filter(g => !g.vocabId).length > band.newWordsMax) bad("more than " + band.newWordsMax + " new words (glossary entries without a vocabId)");
    const V = s.vocab || [];
    if (!Array.isArray(V) || new Set(V).size !== V.length || V.some(v => !(ctx.vocabIds && ctx.vocabIds.has(v)))) bad("vocab must list distinct, existing vocabulary ids");
    const Q = s.questions || [];
    if (Q.length < QUESTIONS[0] || Q.length > QUESTIONS[1]) bad("needs " + QUESTIONS[0] + "–" + QUESTIONS[1] + " questions (has " + Q.length + ")");
    Q.forEach((q, i) => {
      if (q.id !== s.id + "-q" + (i + 1)) bad("question id must be " + s.id + "-q" + (i + 1));
      X.validateQuestion(q, { vocabIds: ctx.vocabIds, lines: L }).forEach(m => p.push(m));
    });
    if (new Set(Q.map(q => q.type)).size < MIN_TYPES) bad("needs at least " + MIN_TYPES + " different question types");
    if (!Q.some(q => q.type === "vocab-context")) bad("needs at least one vocabulary-in-context question");
    if (Q.filter(q => q.type !== "reveal").length < MIN_GRADED) bad("needs at least " + MIN_GRADED + " graded questions");
    return p;
  }

  // Catalogue checks. opts.complete = true also demands 4 stories per band (the first release).
  function validateStories(list, ctx, opts) {
    const p = [], reserved = (ctx && ctx.reservedIds) || new Set(), seen = new Set();
    list.forEach(s => {
      validateStory(s, ctx).forEach(m => p.push(m));
      const ids = [s.id].concat((s.questions || []).map(q => q.id), (s.lines || []).map(l => l.audioKey));
      ids.forEach(id => { if (seen.has(id)) p.push(s.id + ": duplicate id " + id); seen.add(id); if (reserved.has(id)) p.push(s.id + ": collides with an existing id " + id); });
    });
    const avg = (b, f) => { const g = list.filter(s => s.band === b); return g.length ? g.reduce((n, s) => n + f(s), 0) / g.length : null; };
    [[1, 2], [2, 3]].forEach(pair => ["wordCount", "lines"].forEach(k => {
      const f = s => k === "lines" ? s.lines.length : s.wordCount, a = avg(pair[0], f), b = avg(pair[1], f);
      if (a !== null && b !== null && b < a) p.push("band " + pair[1] + " is shorter than band " + pair[0] + " on " + k);
    }));
    if (opts && opts.complete) BANDS.forEach(b => { const n = list.filter(s => s.band === b.band).length; if (n !== PER_BAND) p.push("band " + b.band + " needs " + PER_BAND + " stories (has " + n + ")"); });
    return p;
  }

  return { PASS_PERCENT, STATUS, DRAFT_NOTICE, BANDS, PER_BAND, QUESTIONS, MIN_GRADED, MIN_TYPES, ID_RE, RAW, STORIES, build, unitIds, hasContent, countWords, validateStory, validateStories };
});
