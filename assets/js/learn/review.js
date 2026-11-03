/* Learn Arabic — vocabulary, sentence-pattern and review exercises (pure logic, no DOM).
   Builds on LearnEngine (letters) and produces questions in the SAME format, so the existing UI renders them.
   Every question carries `itemId`: the stable id that the spaced-repetition store schedules. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./vocab-data.js"), require("./engine.js"));
  else root.LearnReview = factory(root.LearnData, root.LearnVocab, root.LearnEngine);
})(typeof self !== "undefined" ? self : this, function (D, V, E) {
  "use strict";
  const letterId = id => "letter:" + id;
  const WORDS = V.ITEMS, BY_ID = {}; WORDS.concat(V.PATTERN_ITEMS).forEach(i => { BY_ID[i.id] = i; });
  const ALL_IDS = D.LETTERS.map(l => letterId(l.id)).concat(WORDS.map(i => i.id), V.PATTERN_ITEMS.map(i => i.id));
  const kindOf = id => (id.indexOf("letter:") === 0 ? "letter" : id.indexOf("pat-") === 0 ? "pattern" : BY_ID[id] ? "vocab" : null);
  const shuffle = E.shuffle;
  const lbl = i => i.ar + (i.punct || "");
  const known = new Set(WORDS.concat(V.PATTERN_ITEMS, V.DIALECT).map(i => E.normalizeAr(i.plain)));

  function distractorItems(item, rng, n) {
    const same = WORDS.filter(w => w.topic === item.topic && w.id !== item.id && w.reg === "msa");
    const other = WORDS.filter(w => w.topic !== item.topic && w.reg === "msa");
    const out = [], seenEn = new Set([item.en]);
    shuffle(same, rng).concat(shuffle(other, rng)).forEach(w => { if (out.length < n && !seenEn.has(w.en)) { out.push(w); seenEn.add(w.en); } });
    return out;
  }
  // Misspellings built from visually similar letters (then random letters, then a transposition). A variant is never the correct
  // spelling, never a duplicate, and never another word of this course. ONLY the 28 base letters are ever changed: characters such as
  // ة ى or hamza seats (أ إ ؤ ئ) are left alone, because swapping them (e.g. ة -> ه) can produce a spelling that is accepted in practice,
  // which would make a "wrong" option arguably right.
  const BASE = new Set(D.LETTERS.map(l => l.letter));
  function spellingVariants(item, rng, n) {
    const chars = Array.from(item.plain), tries = [], idx = [];
    chars.forEach((c, i) => { if (BASE.has(c)) idx.push(i); });
    idx.forEach(i => {
      const L = D.LETTERS.find(l => l.letter === chars[i]), g = E.groupOf(L.id); if (!g) return;
      g.forEach(id => { if (id !== L.id) tries.push(chars.slice(0, i).concat(D.LETTERS.find(x => x.id === id).letter, chars.slice(i + 1)).join("")); });
    });
    const pool = shuffle(tries, rng);
    idx.forEach(i => { if (BASE.has(chars[i + 1]) && chars[i] !== chars[i + 1]) pool.push(chars.slice(0, i).concat(chars[i + 1], chars[i], chars.slice(i + 2)).join("")); });
    for (let k = 0; k < 60 && idx.length; k++) { const i = idx[Math.floor(rng() * idx.length)], r = D.LETTERS[Math.floor(rng() * D.LETTERS.length)].letter; pool.push(chars.slice(0, i).concat(r, chars.slice(i + 1)).join("")); }
    const out = [];
    pool.forEach(v => { if (out.length < n && v !== item.plain && E.normalizeAr(v) !== E.normalizeAr(item.plain) && out.indexOf(v) === -1 && !known.has(E.normalizeAr(v))) out.push(v); });
    return out;
  }

  function makeVocabQuestion(type, id, rng) {
    rng = rng || Math.random; const it = BY_ID[id]; if (!it || it.reg !== "msa") throw new Error("Unknown vocabulary item " + id);
    const base = { type, itemId: id, letterId: null }, say = `${lbl(it)} (${it.translit}) means “${it.en}”.` + (it.note ? " " + it.note : "");
    if (type === "v-recognize") { const ds = distractorItems(it, rng, 3); return Object.assign(base, { prompt: "What does this word mean?", show: lbl(it), showAr: true, answer: id,
      options: shuffle([it].concat(ds), rng).map(w => ({ value: w.id, label: w.en })), explanation: say }); }
    if (type === "v-match") { const ds = distractorItems(it, rng, 3); return Object.assign(base, { prompt: `Which Arabic means “${it.en}”?`, answer: id,
      options: shuffle([it].concat(ds), rng).map(w => ({ value: w.id, label: lbl(w), ar: true })), explanation: say }); }
    if (type === "v-spelling") {
      if (it.kind !== "word") throw new Error("Spelling questions are for single words only: " + id);
      const vs = spellingVariants(it, rng, 3);
      return Object.assign(base, { prompt: `Which is the correct spelling of “${it.en}” (${it.translit})?`, answer: it.plain,
        options: shuffle([it.plain].concat(vs), rng).map(v => ({ value: v, label: v, ar: true })),
        explanation: `${it.plain} is the spelling of ${it.ar} (${it.translit}), “${it.en}”. Check each letter and its dots.` });
    }
    if (type === "v-recall") return Object.assign(base, { typing: true, recall: true, mode: "letters", ar: it.ar, plain: it.plain, translit: it.translit, en: it.en, hint: it.translit });
    throw new Error("Unknown vocabulary question type " + type);
  }

  function makePatternQuestion(type, id, rng) {
    rng = rng || Math.random; const it = BY_ID[id]; if (!it || !it.slot) throw new Error("Unknown pattern item " + id);
    const base = { type, itemId: id, letterId: null }, say = `${lbl(it)} (${it.translit}): ${it.en}`;
    if (type === "p-fill") {
      const toks = it.ar.split(" "), at = toks.indexOf(it.slot);
      return Object.assign(base, { prompt: `Choose the word that completes the sentence: “${it.en}”`, answer: it.slot,
        blankWords: { before: toks.slice(0, at).join(" "), after: toks.slice(at + 1).join(" "), punct: it.punct },
        options: shuffle([it.slot].concat(it.pool), rng).map(w => ({ value: w, label: w, ar: true })), explanation: say });
    }
    if (type === "p-type") return Object.assign(base, { typing: true, recall: true, mode: "letters", ar: it.ar, plain: it.plain, translit: it.translit, en: it.en, hint: it.translit });
    throw new Error("Unknown pattern question type " + type);
  }

  // The question type for an item climbs with its box, so reviews get harder as the item is learned.
  function questionFor(id, entry, rng) {
    rng = rng || Math.random; const box = entry ? entry.b : 1, kind = kindOf(id);
    if (kind === "letter") { const t = box <= 2 ? "name" : box === 3 ? "letter" : box === 4 ? "sound" : "form"; return Object.assign(E.makeQuestion(t, id.slice(7), rng), { itemId: id }); }
    if (kind === "vocab") { const it = BY_ID[id]; const t = box <= 1 ? "v-recognize" : box === 2 ? "v-match" : box === 3 ? (it.kind === "word" ? "v-spelling" : "v-match") : "v-recall"; return makeVocabQuestion(t, id, rng); }
    if (kind === "pattern") return makePatternQuestion(box <= 3 ? "p-fill" : "p-type", id, rng);
    throw new Error("Unknown item " + id);
  }

  const MIXED = ["v-recognize", "v-match", "v-spelling", "v-recognize", "v-match", "v-recall", "v-spelling", "v-match", "v-recognize", "v-recall"];
  // opts: { ids: vocabulary ids (already ordered by priority), type: "mixed" | a vocab type, count, rng }
  function buildVocabSession(o) {
    const rng = o.rng || Math.random, count = o.count || 10, type = o.type || "mixed";
    let ids = o.ids.filter(id => BY_ID[id] && BY_ID[id].reg === "msa");
    if (type === "v-spelling") ids = ids.filter(id => BY_ID[id].kind === "word");
    if (!ids.length) return [];
    const qs = []; let pool = [];
    for (let i = 0; i < count; i++) {
      if (!pool.length) pool = (o.ordered ? ids.slice() : shuffle(ids, rng)); let id = pool.shift();
      if (qs.length && qs[qs.length - 1].itemId === id && pool.length) { const next = pool.shift(); pool.push(id); id = next; }
      let t = type === "mixed" ? MIXED[i % MIXED.length] : type;
      if (t === "v-spelling" && BY_ID[id].kind !== "word") t = "v-match";
      qs.push(makeVocabQuestion(t, id, rng));
    }
    return qs;
  }
  function buildPatternSession(o) {
    const rng = o.rng || Math.random, ids = o.ids.filter(id => BY_ID[id] && BY_ID[id].slot); if (!ids.length) return [];
    const qs = []; (o.count || ids.length * 2) && ids.forEach(id => qs.push(makePatternQuestion("p-fill", id, rng)));
    shuffle(ids, rng).forEach(id => qs.push(makePatternQuestion("p-type", id, rng)));
    return qs;
  }
  // dueIds are already ordered most-overdue first; entries maps id -> {b,...}
  function buildReviewSession(dueIds, entries, rng, limit) { return dueIds.slice(0, limit || 15).map(id => questionFor(id, entries[id], rng)); }
  function label(id) { const k = kindOf(id); if (k === "letter") { const l = D.LETTERS.find(x => x.id === id.slice(7)); return `${l.letter} (${l.nameEn})`; } const it = BY_ID[id]; return it ? `${it.ar} — ${it.en}` : id; }

  return { ALL_IDS, BY_ID, kindOf, letterId, label, spellingVariants, makeVocabQuestion, makePatternQuestion, questionFor, buildVocabSession, buildPatternSession, buildReviewSession, MIXED };
});
