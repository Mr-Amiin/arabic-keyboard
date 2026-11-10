/* Learn Arabic — vocabulary, sentence-pattern and review exercises (pure logic, no DOM).
   Builds on LearnEngine (letters) and produces questions in the SAME format, so the existing UI renders them.
   Every question carries `itemId`: the stable id that the spaced-repetition store schedules. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./vocab-data.js"), require("./engine.js"), require("./conversations.js"));
  else root.LearnReview = factory(root.LearnData, root.LearnVocab, root.LearnEngine, root.LearnConversations);
})(typeof self !== "undefined" ? self : this, function (D, V, E, C) {
  "use strict";
  const letterId = id => "letter:" + id;
  // Sentence-completion items from the conversation units (ids "snt-…") have the same shape as the V1 sentence patterns ("pat-…"),
  // so the same fill-in and typing exercises, and the same scheduler, handle both.
  const SENTENCES = C ? C.SENTENCE_ITEMS : [];
  const WORDS = V.ITEMS, BY_ID = {}; WORDS.concat(V.PATTERN_ITEMS, SENTENCES).forEach(i => { BY_ID[i.id] = i; });
  const ALL_IDS = D.LETTERS.map(l => letterId(l.id)).concat(WORDS.map(i => i.id), V.PATTERN_ITEMS.map(i => i.id), SENTENCES.map(i => i.id));
  const kindOf = id => (id.indexOf("letter:") === 0 ? "letter" : id.indexOf("pat-") === 0 ? "pattern" : id.indexOf("snt-") === 0 && BY_ID[id] ? "sentence" : BY_ID[id] ? "vocab" : null);
  const shuffle = E.shuffle;
  const lbl = i => i.ar + (i.punct || "");
  const known = new Set(WORDS.concat(V.PATTERN_ITEMS, V.DIALECT, V.VARIANTS || []).map(i => E.normalizeAr(i.plain)));

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
    // Listening: the learner HEARS the word (device speech) and chooses it among Arabic options. Distractors never share its plain spelling.
    if (type === "v-listen") {
      const ds = distractorItems(it, rng, 6).filter(w => E.normalizeAr(w.plain) !== E.normalizeAr(it.plain)).slice(0, 3);
      return Object.assign(base, { prompt: "Listen, then choose the word you hear.", audio: { text: it.ar, key: "vocab-" + id }, answer: id,
        options: shuffle([it].concat(ds), rng).map(w => ({ value: w.id, label: lbl(w), ar: true })), explanation: say });
    }
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
    if (kind === "pattern" || kind === "sentence") return makePatternQuestion(box <= 3 ? "p-fill" : "p-type", id, rng);
    throw new Error("Unknown item " + id);
  }

  const MIXED = ["v-recognize", "v-match", "v-spelling", "v-recognize", "v-match", "v-recall", "v-spelling", "v-match", "v-recognize", "v-recall"];
  // The same mix with two listening questions; used only when the device has an Arabic voice (o.listen === true).
  const MIXED_LISTEN = ["v-recognize", "v-listen", "v-match", "v-spelling", "v-recognize", "v-recall", "v-listen", "v-match", "v-spelling", "v-recall"];
  // opts: { ids: vocabulary ids (already ordered by priority), type: "mixed" | a vocab type, count, rng, listen: true when audio can be played }
  // A "v-listen" request without audio falls back to "v-match", so a learner without an Arabic voice is never given a silent question.
  function buildVocabSession(o) {
    const rng = o.rng || Math.random, count = o.count || 10; let type = o.type || "mixed";
    if (type === "v-listen" && !o.listen) type = "v-match";
    let ids = o.ids.filter(id => BY_ID[id] && BY_ID[id].reg === "msa" && kindOf(id) === "vocab");
    if (type === "v-spelling") ids = ids.filter(id => BY_ID[id].kind === "word");
    if (!ids.length) return [];
    const qs = []; let pool = [];
    for (let i = 0; i < count; i++) {
      if (!pool.length) pool = (o.ordered ? ids.slice() : shuffle(ids, rng)); let id = pool.shift();
      if (qs.length && qs[qs.length - 1].itemId === id && pool.length) { const next = pool.shift(); pool.push(id); id = next; }
      let t = type === "mixed" ? (o.listen ? MIXED_LISTEN : MIXED)[i % MIXED.length] : type;
      if (t === "v-spelling" && BY_ID[id].kind !== "word") t = "v-match";
      qs.push(makeVocabQuestion(t, id, rng));
    }
    return qs;
  }
  // Mixed-topic review: interleaves several topics so every chosen topic is represented. Inside each topic, words that are DUE come first,
  // then words never answered, then the rest. opts: { topics (default: every topic), count, rng, listen, entries (srs map), dueIds }
  function buildMixedTopicSession(o) {
    o = o || {}; const rng = o.rng || Math.random, count = o.count || 12, entries = o.entries || {}, due = new Set(o.dueIds || []);
    const topics = (o.topics && o.topics.length ? o.topics : V.TOPICS.map(t => t.id)).filter(t => WORDS.some(w => w.topic === t));
    const queues = shuffle(topics, rng).map(t => {
      const ids = WORDS.filter(w => w.topic === t && w.reg === "msa").map(w => w.id), rank = id => (due.has(id) ? 0 : entries[id] ? 2 : 1);
      return shuffle(ids, rng).sort((a, b) => rank(a) - rank(b));
    });
    const picked = []; let guard = 0;
    while (picked.length < count && queues.some(q => q.length) && guard++ < 10000) queues.forEach(q => { if (picked.length < count && q.length) picked.push(q.shift()); });
    const qs = picked.map((id, i) => {
      let t = (o.listen ? MIXED_LISTEN : MIXED)[i % MIXED.length];
      if (t === "v-spelling" && BY_ID[id].kind !== "word") t = "v-match";
      return makeVocabQuestion(t, id, rng);
    });
    return shuffle(qs, rng).filter((q, i, a) => i === 0 || q.itemId !== a[i - 1].itemId);
  }
  // Comprehension questions for a conversation or reading passage. Data lists the correct option first; the order is shuffled here and each
  // option keeps its ORIGINAL index as its value, so grading never depends on position. `unitId` identifies the unit the answers belong to.
  function buildComprehension(questions, rng) {
    rng = rng || Math.random;
    return questions.map(q => ({ type: "comprehension", itemId: null, letterId: null, qid: q.id, prompt: q.prompt, answer: String(q.answer),
      options: shuffle(q.options.map((label, i) => ({ value: String(i), label: label, ar: !!q.arabicOptions })), rng), explanation: q.explanation }));
  }
  function buildPatternSession(o) {
    const rng = o.rng || Math.random, ids = o.ids.filter(id => BY_ID[id] && BY_ID[id].slot); if (!ids.length) return [];
    const qs = []; (o.count || ids.length * 2) && ids.forEach(id => qs.push(makePatternQuestion("p-fill", id, rng)));
    shuffle(ids, rng).forEach(id => qs.push(makePatternQuestion("p-type", id, rng)));
    return qs;
  }
  // dueIds are already ordered most-overdue first; entries maps id -> {b,...}
  function buildReviewSession(dueIds, entries, rng, limit) { return dueIds.slice(0, limit || 15).map(id => questionFor(id, entries[id], rng)); }
  function sentenceSession(ids, rng) {
    rng = rng || Math.random; const ok = ids.filter(id => kindOf(id) === "sentence" || kindOf(id) === "pattern"); if (!ok.length) return [];
    return ok.map(id => makePatternQuestion("p-fill", id, rng)).concat(shuffle(ok, rng).map(id => makePatternQuestion("p-type", id, rng)));
  }
  function label(id) { const k = kindOf(id); if (k === "letter") { const l = D.LETTERS.find(x => x.id === id.slice(7)); return `${l.letter} (${l.nameEn})`; } const it = BY_ID[id]; return it ? `${it.ar} — ${it.en}` : id; }

  return { ALL_IDS, BY_ID, kindOf, letterId, label, spellingVariants, makeVocabQuestion, makePatternQuestion, questionFor, buildVocabSession, buildMixedTopicSession, buildComprehension, sentenceSession, buildPatternSession, buildReviewSession, MIXED, MIXED_LISTEN };
});
