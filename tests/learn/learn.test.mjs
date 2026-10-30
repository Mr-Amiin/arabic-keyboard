import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = require("../../assets/js/learn/data.js");
const E = require("../../assets/js/learn/engine.js");
const P = require("../../assets/js/learn/progress.js");

const CANON = ["ا","ب","ت","ث","ج","ح","خ","د","ذ","ر","ز","س","ش","ص","ض","ط","ظ","ع","غ","ف","ق","ك","ل","م","ن","ه","و","ي"];
const MARKS = /[\u064B-\u065F\u0670]/g;
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };

/* ---------- data ---------- */
test("all 28 letters are present, in canonical order", () => {
  assert.equal(D.LETTERS.length, 28);
  assert.deepEqual(D.LETTERS.map(l => l.letter), CANON);
});
test("ids, English names, Arabic names and sounds are unique and non-empty", () => {
  for (const key of ["id", "nameEn", "nameAr", "sound"]) {
    const v = D.LETTERS.map(l => l[key]);
    assert.ok(v.every(x => typeof x === "string" && x.length), key + " non-empty");
    assert.equal(new Set(v).size, 28, key + " unique");
  }
});
test("exactly six letters do not connect forward: ا د ذ ر ز و", () => {
  assert.deepEqual(D.LETTERS.filter(l => !l.connects).map(l => l.letter), ["ا","د","ذ","ر","ز","و"]);
});
test("letter forms are correct for connecting and non-connecting letters", () => {
  for (const l of D.LETTERS) {
    assert.equal(l.forms.isolated, l.letter);
    assert.equal(l.forms.final, "\u0640" + l.letter);
    if (l.connects) { assert.equal(l.forms.initial, l.letter + "\u0640"); assert.equal(l.forms.medial, "\u0640" + l.letter + "\u0640"); }
    else { assert.equal(l.forms.initial, null); assert.equal(l.forms.medial, null); }
  }
});
test("every letter has guidance, a difficulty, dots info and three harakat syllables", () => {
  for (const l of D.LETTERS) {
    assert.ok(l.say.length > 10, l.id); assert.ok(["Easy","Medium","Challenging"].includes(l.difficulty), l.id);
    assert.ok(l.dots.length, l.id); assert.equal(l.syllables.length, 3, l.id);
  }
});
test("example words: vowelled form matches plain spelling and the letter sits in the stated position", () => {
  for (const l of D.LETTERS) {
    assert.ok(l.examples.length >= 2, l.id + " has >= 2 examples");
    for (const e of l.examples) {
      assert.equal(E.normalizeAr(e.vowelled), E.normalizeAr(e.plain), `${l.id}: ${e.vowelled} vs ${e.plain}`);
      const chars = Array.from(E.normalizeAr(e.plain)), t = E.normalizeAr(l.letter);
      if (e.position === "initial") assert.equal(chars[0], t, `${l.id} initial in ${e.plain}`);
      else if (e.position === "final") assert.equal(chars[chars.length - 1], t, `${l.id} final in ${e.plain}`);
      else assert.ok(chars.slice(1, -1).includes(t), `${l.id} medial in ${e.plain}`);
      assert.ok(e.translit && e.meaning, l.id);
    }
  }
});
test("all Arabic text is NFC-normalized (canonical mark order, so marks render in the right position)", () => {
  (function walk(o, path) {
    if (typeof o === "string") assert.equal(o, o.normalize("NFC"), "not NFC: " + path + " = " + o);
    else if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], path + "." + k);
  })(D, "D");
});
test("harakat marks used in the data are valid combining marks (no stray marks at word start)", () => {
  for (const l of D.LETTERS) for (const e of l.examples) assert.ok(!/^[\u064B-\u0652]/.test(e.vowelled), e.vowelled);
});
test("no stray Latin letters inside Arabic example words", () => {
  for (const l of D.LETTERS) for (const e of l.examples) assert.ok(!/[A-Za-z]/.test(e.plain + e.vowelled), e.plain);
});
test("similar-letter groups reference real letters only", () => {
  const ids = new Set(D.LETTERS.map(l => l.id));
  for (const g of D.SIMILAR_GROUPS) for (const id of g) assert.ok(ids.has(id), id);
});
test("harakat covers fatha, kasra, damma, sukun, shadda, tanween; lessons reference them", () => {
  assert.deepEqual(D.HARAKAT.map(h => h.id), ["fatha","kasra","damma","sukun","shadda","tanween"]);
  assert.equal(D.HARAKAT[0].mark, "\u064E"); assert.equal(D.HARAKAT[1].mark, "\u0650"); assert.equal(D.HARAKAT[2].mark, "\u064F");
  assert.equal(D.HARAKAT[3].mark, "\u0652"); assert.equal(D.HARAKAT[4].mark, "\u0651"); assert.equal(D.HARAKAT[5].mark, "\u064B\u064C\u064D");
  for (const h of D.HARAKAT_LESSONS) for (const m of h.marks) assert.ok(D.HARAKAT.some(x => x.id === m));
  for (const h of D.HARAKAT_LESSONS) for (const c of h.check) assert.ok(c[2] >= 0 && c[2] < c[1].length, "valid answer index");
});
test("reading stages cover six levels with items", () => {
  assert.equal(D.READING_STAGES.length, 6);
  for (const s of D.READING_STAGES) assert.ok(s.items.length >= 3);
});

/* ---------- engine ---------- */
test("every letter x every exercise type yields a valid question", () => {
  const rng = E.mulberry32(42);
  for (const l of D.LETTERS) for (const t of E.TYPES) for (let k = 0; k < 3; k++) {
    const q = E.makeQuestion(t, l.id, rng);
    const vals = q.options.map(o => o.value);
    assert.ok(vals.includes(q.answer), `${t}/${l.id} answer present`);
    assert.equal(new Set(vals).size, vals.length, `${t}/${l.id} unique options`);
    assert.ok(vals.length >= 3 && vals.length <= 4, `${t}/${l.id} option count`);
    assert.ok(q.explanation.length > 5);
    if (t === "missing") { assert.ok(q.blank && !q.show, "blank is structured, not a placeholder glyph"); }
    if (t === "form") assert.ok(q.show.length >= 1);
  }
});
test("question labels are unambiguous (name/sound options are distinct)", () => {
  const rng = E.mulberry32(7);
  for (const l of D.LETTERS) { const q = E.makeQuestion("name", l.id, rng); assert.equal(new Set(q.options.map(o => o.label)).size, q.options.length); }
});
test("similar-letter questions offer look-alikes", () => {
  const q = E.makeQuestion("similar", "ba", E.mulberry32(3));
  const g = new Set(D.SIMILAR_GROUPS[0]);
  assert.ok(q.options.filter(o => g.has(o.value)).length >= 3);
});
test("answer checking and scoring", () => {
  const q = E.makeQuestion("name", "ba", E.mulberry32(1));
  assert.equal(E.checkAnswer(q, "ba").correct, true);
  assert.equal(E.checkAnswer(q, "ta").correct, false);
  assert.deepEqual(E.scoreSession([{ correct: true }, { correct: true }, { correct: false }, { correct: true }]), { correct: 3, total: 4, percent: 75 });
  assert.deepEqual(E.scoreSession([]), { correct: 0, total: 0, percent: 0 });
});
test("sessions have the requested size, are deterministic with a seed, and honour focus/weak sets", () => {
  assert.equal(E.buildSession({ count: 10, rng: E.mulberry32(5) }).length, 10);
  const a = E.buildSession({ count: 10, rng: E.mulberry32(5) }), b = E.buildSession({ count: 10, rng: E.mulberry32(5) });
  assert.deepEqual(a.map(q => q.letterId + q.type), b.map(q => q.letterId + q.type));
  assert.ok(E.buildSession({ count: 10, weakIds: ["sad", "dad"], rng: E.mulberry32(2) }).every(q => ["sad", "dad"].includes(q.letterId)));
  assert.equal(E.quickCheck("shin", E.mulberry32(1)).length, 3);
  const types = new Set(E.buildSession({ count: 60, rng: E.mulberry32(9) }).map(q => q.type)); assert.ok(types.size >= 5);
});
test("harakat quick checks are well-formed", () => {
  for (const h of D.HARAKAT_LESSONS) for (const q of E.harakatCheck(h)) { assert.ok(q.options.some(o => o.value === q.answer)); }
});
test("typed answers ignore harakat, tatweel and alif variants but not letters", () => {
  assert.ok(E.checkTyped("مَرْحَبًا", "مرحبا")); assert.ok(E.checkTyped("السَّلَامُ عَلَيْكُمْ", "السلام   عليكم"));
  assert.ok(E.checkTyped("أَنَا", "انا")); assert.ok(!E.checkTyped("بَيْت", "بنت")); assert.ok(!E.checkTyped("ب", "")); assert.ok(!E.checkTyped("", ""));
});

/* ---------- progress ---------- */
test("progress persists across store instances", () => {
  const st = memStorage(); const a = P.createStore(st); a.load();
  a.recordSession("check", [{ letterId: "ba", correct: true }, { letterId: "ba", correct: false }]);
  a.completeLesson("letter-ba", 67);
  const b = P.createStore(st); b.load();
  assert.ok(b.isDone("letter-ba")); assert.deepEqual(b.data.stats.ba, { c: 1, w: 1 });
  const s = b.summary(); assert.equal(s.completed, 1); assert.equal(s.total, 30); assert.equal(s.accuracy, 50); assert.equal(s.persistent, true);
});
test("summary reflects real activity only (fresh store is empty)", () => {
  const s = P.createStore(memStorage()); s.load(); const m = s.summary();
  assert.equal(m.completed, 0); assert.equal(m.accuracy, null); assert.equal(m.streak, 0); assert.equal(m.practicedToday, false); assert.equal(m.level.n, 1);
});
test("malformed or hostile stored data is handled safely", () => {
  for (const bad of ["{not json", "null", "[]", '"x"', '{"lessons":{"letter-zzz":{"at":1},"letter-ba":"x"},"stats":{"ba":{"c":-5,"w":"a"}},"sessions":"no","days":["bad","2025-01-02"]}']) {
    const st = memStorage(); st.setItem(P.KEY, bad); const s = P.createStore(st); assert.doesNotThrow(() => s.load());
    const m = s.summary(); assert.equal(m.completed, 0); assert.equal(m.correct, 0);
  }
});
test("unavailable or throwing storage does not crash and reports non-persistent", () => {
  const thrower = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  for (const st of [thrower, null]) { const s = P.createStore(st); s.load(); s.recordSession("x", [{ letterId: "ba", correct: true }]); assert.ok(s.completeLesson("letter-ba", 100)); assert.equal(s.summary().persistent, false); assert.ok(s.isDone("letter-ba")); s.reset(); assert.equal(s.isDone("letter-ba"), false); }
});
test("completeLesson rejects unknown lessons; stats ignore unknown letters", () => {
  const s = P.createStore(memStorage()); s.load();
  assert.equal(s.completeLesson("letter-nope", 100), false);
  s.recordSession("practice", [{ letterId: "nope", correct: true }, { letterId: null, correct: true }]);
  assert.deepEqual(s.data.stats, {});
});
test("reset clears stored data", () => {
  const st = memStorage(); const s = P.createStore(st); s.load(); s.completeLesson("letter-ba", 100); assert.ok(st.getItem(P.KEY));
  s.reset(); assert.equal(st.getItem(P.KEY), null); assert.equal(s.summary().completed, 0);
});
test("daily streak counts consecutive days and breaks after a gap", () => {
  let t = new Date(2026, 5, 10, 12).getTime(); const s = P.createStore(memStorage(), () => t); s.load();
  s.recordSession("practice", [{ letterId: "ba", correct: true }]); assert.equal(s.summary().streak, 1);
  t += 86400000; s.recordSession("practice", [{ letterId: "ba", correct: true }]); assert.equal(s.summary().streak, 2);
  t += 86400000; assert.equal(s.summary().streak, 2, "yesterday still counts before practicing today");
  t += 86400000; assert.equal(s.summary().streak, 0, "two missed days break it");
});
test("review list contains letters with repeated misses; level advances with real completions", () => {
  const s = P.createStore(memStorage()); s.load();
  s.recordSession("practice", [{ letterId: "ayn", correct: false }, { letterId: "ayn", correct: false }, { letterId: "ba", correct: true }, { letterId: "ba", correct: true }]);
  assert.deepEqual(s.summary().review, ["ayn"]);
  D.LETTERS.slice(0, 10).forEach(l => s.completeLesson("letter-" + l.id, 100)); assert.equal(s.summary().level.n, 2);
  D.LETTERS.forEach(l => s.completeLesson("letter-" + l.id, 100)); assert.equal(s.summary().level.n, 3);
  D.HARAKAT_LESSONS.forEach(h => s.completeLesson(h.id, 100)); assert.equal(s.summary().level.n, 4); assert.equal(s.summary().completed, 30);
});

/* ---------- regression tests for defects found in the quality audit ---------- */
test("REGRESSION similar: the correct letter is always among 4 distinct options (400 seeds x 28 letters)", () => {
  for (const l of D.LETTERS) for (let seed = 1; seed <= 400; seed++) {
    const q = E.makeQuestion("similar", l.id, E.mulberry32(seed)), v = q.options.map(o => o.value);
    assert.ok(v.includes(l.id), `${l.id} missing from options at seed ${seed}`);
    assert.equal(new Set(v).size, 4, `${l.id} duplicate options at seed ${seed}`);
  }
});
test("REGRESSION look-alike rounds contain only look-alike questions about letters that have look-alikes", () => {
  const grouped = new Set(D.SIMILAR_GROUPS.flat());
  for (let seed = 1; seed <= 100; seed++) for (const q of E.buildSession({ count: 10, types: ["similar"], rng: E.mulberry32(seed) })) {
    assert.equal(q.type, "similar"); assert.ok(grouped.has(q.letterId), q.letterId);
  }
  // also when practising only weak letters that have no look-alikes
  for (const q of E.buildSession({ count: 10, types: ["similar"], weakIds: ["alif", "lam"], rng: E.mulberry32(1) })) assert.equal(q.type, "similar");
});
test("REGRESSION missing-letter: word is reconstructable, no placeholder glyph, joins match the missing letter", () => {
  for (const l of D.LETTERS) for (let seed = 1; seed <= 20; seed++) {
    const q = E.makeQuestion("missing", l.id, E.mulberry32(seed)), b = q.blank;
    assert.ok(b && typeof b.before === "string" && typeof b.after === "string", l.id);
    assert.equal(b.joinAfter, l.connects, `${l.id}: next letter may join the blank only if the missing letter joins forward`);
    assert.ok(!/[＿_\u0640\u200D]/.test(b.before + b.after), "no placeholder / tatweel / ZWJ in data");
    const words = l.examples.map(e => E.normalizeAr(e.plain));
    const rebuilt = [E.normalizeAr(b.before) + E.normalizeAr(l.letter) + E.normalizeAr(b.after)];
    assert.ok(words.includes(rebuilt[0]), `${l.id}: "${rebuilt[0]}" is not one of its example words`);
    assert.ok(b.before.length + b.after.length >= 1, "word has other letters");
  }
});
test("REGRESSION harakat reading stage: options include the answer and distinct readings; mark is named in the explanation", () => {
  const stage = D.READING_STAGES.find(s => s.id === "marked"), qs = E.readingChoice(stage.items, E.mulberry32(4));
  assert.equal(qs.length, stage.items.length);
  for (const q of qs) {
    const v = q.options.map(o => o.value);
    assert.ok(v.includes(q.answer)); assert.equal(new Set(v).size, 4);
    assert.ok(/fatha|kasra|damma/.test(q.explanation), q.explanation);
    assert.equal(E.checkAnswer(q, q.answer).correct, true); assert.equal(E.checkAnswer(q, v.find(x => x !== q.answer)).correct, false);
  }
});
test("REGRESSION two tabs sharing storage do not overwrite each other's progress", () => {
  const st = memStorage(), a = P.createStore(st), b = P.createStore(st); a.load(); b.load();
  a.completeLesson("letter-ba", 100); b.completeLesson("letter-ta", 100);
  b.recordSession("practice", [{ letterId: "sin", correct: true }]); a.recordSession("practice", [{ letterId: "sin", correct: false }]);
  const c = P.createStore(st); c.load();
  assert.ok(c.isDone("letter-ba") && c.isDone("letter-ta")); assert.deepEqual(c.data.stats.sin, { c: 1, w: 1 });
  // a reset in one tab is respected by the other's next write rather than resurrecting old data
  a.reset(); b.completeLesson("letter-ha" in {} ? "x" : "letter-ha", 100);
  const d = P.createStore(st); d.load(); assert.ok(d.isDone("letter-ha")); assert.equal(d.isDone("letter-ba"), false);
});
test("every typed reading item is accepted when typed exactly and when typed without harakat", () => {
  for (const s of D.READING_STAGES) for (const it of s.items) { assert.ok(E.checkTyped(it[0], it[0]), it[0]); assert.ok(E.checkTyped(it[0], it[0].replace(/[\u064B-\u0652\u0670]/g, "")), it[0]); }
});
test("non-joining letters document the shapes they really use (isolated at start, final after a joiner)", () => {
  for (const l of D.LETTERS.filter(x => !x.connects)) { assert.equal(l.forms.initial, null); assert.equal(l.forms.medial, null); assert.ok(l.forms.isolated && l.forms.final); }
});
