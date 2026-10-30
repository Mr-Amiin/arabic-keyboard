/* Learn Arabic — exercise engine (pure logic, no DOM). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.LearnEngine = factory(root.LearnData);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";
  const BY_ID = {}; D.LETTERS.forEach(function (l) { BY_ID[l.id] = l; });
  const TYPES = ["name", "letter", "sound", "form", "missing", "similar"];
  const FORM_LABEL = { initial: "beginning", medial: "middle", final: "end" };

  function mulberry32(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function groupOf(id) { return D.SIMILAR_GROUPS.find(function (g) { return g.indexOf(id) !== -1; }) || null; }

  // Remove harakat, Quranic marks and tatweel; unify alif variants; collapse spaces. Used for typed answers.
  function normalizeAr(s) {
    return String(s == null ? "" : s).normalize("NFC")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
  }
  function checkTyped(expected, typed) { return normalizeAr(expected) !== "" && normalizeAr(expected) === normalizeAr(typed); }

  // Exact vowelled spelling: NFC (canonical mark order), tatweel and extra spaces ignored; letters AND harakat must match.
  function normalizeStrict(s) { return String(s == null ? "" : s).normalize("NFC").replace(/\u0640/g, "").replace(/\s+/g, " ").trim(); }
  function checkTypedStrict(expected, typed) { const e = normalizeStrict(expected); return e !== "" && e === normalizeStrict(typed); }
  // mode: "exact" requires harakat; anything else keeps the original letters-only check. reason explains a miss.
  function gradeTyped(mode, expected, typed) {
    if (!String(typed == null ? "" : typed).trim()) return { correct: false, reason: "empty" };
    if (mode === "exact") {
      if (checkTypedStrict(expected, typed)) return { correct: true, reason: "ok" };
      return { correct: false, reason: checkTyped(expected, typed) ? "marks" : "letters" };
    }
    return checkTyped(expected, typed) ? { correct: true, reason: "ok" } : { correct: false, reason: "letters" };
  }

  function distractors(correctId, n, rng, preferSimilar) {
    const g = groupOf(correctId);
    const pool = [];
    if (preferSimilar && g) g.forEach(function (id) { if (id !== correctId) pool.push(id); });
    shuffle(D.LETTERS.map(function (l) { return l.id; }), rng).forEach(function (id) { if (id !== correctId && pool.indexOf(id) === -1) pool.push(id); });
    return pool.slice(0, n);
  }
  function opts(correctId, rng, mapFn, preferSimilar) {
    const ids = shuffle([correctId].concat(distractors(correctId, 3, rng, preferSimilar)), rng);
    return ids.map(function (id) { return Object.assign({ value: id }, mapFn(BY_ID[id])); });
  }
  const letterOpt = function (l) { return { label: l.letter, ar: true }; };
  const nameOpt = function (l) { return { label: l.nameEn + " (" + l.nameAr + ")" }; };
  function note(l) { return l.connects ? "It joins to the letter after it." : "It never joins to the letter after it."; }

  function makeQuestion(type, letterId, rng) {
    rng = rng || Math.random;
    const l = BY_ID[letterId];
    if (!l) throw new Error("Unknown letter " + letterId);
    const base = { type: type, letterId: letterId, answer: letterId };
    if (type === "name") return Object.assign(base, { prompt: "What is the name of this letter?", show: l.letter, showAr: true, options: opts(letterId, rng, nameOpt, true),
      explanation: l.letter + " is " + l.nameAr + " (" + l.nameEn + "), sound: " + l.sound + ". " + note(l) });
    if (type === "letter") return Object.assign(base, { prompt: "Which letter is called " + l.nameEn + " (" + l.nameAr + ")?", options: opts(letterId, rng, letterOpt, true),
      explanation: l.nameAr + " (" + l.nameEn + ") is written " + l.letter + ", sound: " + l.sound + "." });
    if (type === "sound") return Object.assign(base, { prompt: "Which letter makes this sound: " + l.sound + "?", options: opts(letterId, rng, letterOpt, true),
      explanation: l.letter + " (" + l.nameEn + ") makes the sound: " + l.sound + ". " + l.say });
    if (type === "form") {
      const keys = l.connects ? ["initial", "medial", "final"] : ["final"];
      const k = keys[Math.floor(rng() * keys.length)];
      return Object.assign(base, { prompt: "This is the " + FORM_LABEL[k] + " form of a letter. Which letter is it?", show: l.forms[k], showAr: true, options: opts(letterId, rng, letterOpt, true),
        explanation: l.forms[k] + " is the " + FORM_LABEL[k] + " form of " + l.letter + " (" + l.nameEn + "). Letters change shape by position; " + note(l).toLowerCase() });
    }
    if (type === "missing") {
      const ex = l.examples[Math.floor(rng() * l.examples.length)];
      const target = normalizeAr(l.letter), chars = Array.from(ex.plain);
      let idx = chars.findIndex(function (c) { return normalizeAr(c) === target; });
      if (ex.position === "final") idx = chars.length - 1; else if (ex.position === "initial") idx = 0;
      // The UI draws the blank as an element between two text runs, joining each side only where the
      // real letter would join (the next letter joins the blank only if the missing letter joins forward).
      const hamza = chars[idx] !== l.letter ? " (In this word the alif carries a hamza: " + chars[idx] + ".)" : "";
      return Object.assign(base, { prompt: "Which letter completes the word meaning “" + ex.meaning + "”?",
        blank: { before: chars.slice(0, idx).join(""), after: chars.slice(idx + 1).join(""), joinAfter: l.connects },
        options: opts(letterId, rng, letterOpt, true),
        explanation: "The word is " + ex.vowelled + " (" + ex.translit + "), “" + ex.meaning + "”. The missing letter is " + l.letter + " (" + l.nameEn + ")." + hamza });
    }
    if (type === "similar") {
      const g = groupOf(letterId) || [];
      const others = shuffle(g.filter(function (id) { return id !== letterId; }), rng).slice(0, 3);
      const fill = shuffle(D.LETTERS.map(function (x) { return x.id; }).filter(function (id) { return id !== letterId && others.indexOf(id) === -1; }), rng);
      while (others.length < 3) others.push(fill.shift());
      const ids = shuffle([letterId].concat(others), rng);
      return Object.assign(base, { prompt: "These letters look alike. Which one is " + l.nameEn + " (" + l.nameAr + ")?",
        options: ids.map(function (id) { return { value: id, label: BY_ID[id].letter, ar: true }; }),
        explanation: ids.map(function (id) { return BY_ID[id].letter + " " + BY_ID[id].nameEn + ": " + BY_ID[id].dots; }).join("; ") + "." });
    }
    throw new Error("Unknown question type " + type);
  }

  // opts: {count, rng, focusId, weakIds, types}
  function buildSession(o) {
    o = o || {}; const rng = o.rng || Math.random, count = o.count || 10, types = o.types || TYPES;
    let ids;
    if (o.focusId) ids = [o.focusId];
    else if (o.weakIds && o.weakIds.length) ids = o.weakIds;
    else ids = D.LETTERS.map(function (l) { return l.id; });
    if (types.length === 1 && types[0] === "similar") { const grouped = ids.filter(function (id) { return groupOf(id); }); ids = grouped.length ? grouped : D.LETTERS.map(function (x) { return x.id; }).filter(function (id) { return groupOf(id); }); }
    const qs = [], used = {};
    const order = shuffle(ids, rng);
    for (let i = 0; i < count; i++) {
      let id = order[i % order.length];
      let type = types[(o.focusId ? i : Math.floor(rng() * types.length)) % types.length];
      if (type === "similar" && !groupOf(id) && !o.focusId) type = "name";
      const key = id + type; if (used[key] && o.focusId) type = types[(i + 1) % types.length];
      used[id + type] = true;
      qs.push(makeQuestion(type, id, rng));
    }
    return qs;
  }
  function quickCheck(letterId, rng) { return ["name", "sound", "form"].map(function (t) { return makeQuestion(t, letterId, rng); }); }

  // Build checkable questions from the static harakat banks.
  function harakatCheck(lesson, rng) {
    return lesson.check.map(function (c, i) {
      const vals = c[1].map(function (label, j) { return { value: String(j), label: label, ar: /[\u0600-\u06FF]/.test(label) }; });
      return { type: "harakat", letterId: null, prompt: c[0], options: vals, answer: String(c[2]), explanation: c[3] };
    });
  }
  // items: [text, reading, description] where reading is consonant + a/i/u (e.g. "ba"). Tests reading of the mark itself.
  function readingChoice(items, rng) {
    rng = rng || Math.random;
    return items.map(function (it) {
      const c = it[1].slice(0, -1), mk = D.HARAKAT.find(function (h) { return it[0].indexOf(h.mark) !== -1; });
      const vals = shuffle([c + "a", c + "i", c + "u", c], rng);
      return { type: "harakat-read", letterId: null, prompt: "How is this letter with a mark read?", show: it[0], showAr: true,
        options: vals.map(function (v) { return { value: v, label: v }; }), answer: it[1],
        explanation: it[0] + " has " + (mk ? mk.nameEn.toLowerCase() : "a vowel mark") + ", so it is read “" + it[1] + "”." };
    });
  }
  function checkAnswer(q, value) { const ok = String(value) === String(q.answer); return { correct: ok, explanation: q.explanation }; }
  function scoreSession(results) {
    const total = results.length, correct = results.filter(function (r) { return r.correct; }).length;
    return { correct: correct, total: total, percent: total ? Math.round(correct / total * 100) : 0 };
  }
  return { TYPES, mulberry32, shuffle, normalizeAr, normalizeStrict, checkTyped, checkTypedStrict, gradeTyped, makeQuestion, buildSession, quickCheck, harakatCheck, readingChoice, checkAnswer, scoreSession, groupOf };
});
