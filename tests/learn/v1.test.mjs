// V1 unit tests: vocabulary data, exercises, spaced repetition, schema-v2 progress store, publishing protection, honesty of claims.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
const D = require("../../assets/js/learn/data.js"), V = require("../../assets/js/learn/vocab-data.js"), E = require("../../assets/js/learn/engine.js");
const S = require("../../assets/js/learn/srs.js"), R = require("../../assets/js/learn/review.js"), P = require("../../assets/js/learn/progress.js");
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const noon = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

/* ---------- vocabulary data ---------- */
test("vocabulary: stable unique ids that are valid scheduler ids; every field present; plain = vowelled minus marks; NFC", () => {
  const all = [...V.ITEMS, ...V.DIALECT, ...V.PATTERN_ITEMS], ids = all.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  for (const i of all) {
    assert.match(i.id, /^[a-z0-9:_-]{1,40}$/, i.id);
    for (const f of ["ar", "plain", "translit", "en"]) assert.ok(typeof i[f] === "string" && i[f].length, `${i.id}.${f}`);
    assert.equal(E.normalizeAr(i.ar), E.normalizeAr(i.plain), `${i.id}: plain spelling must equal the vowelled spelling without marks`);
    assert.equal(i.ar, i.ar.normalize("NFC"), i.id + " not NFC"); if (!i.slot) assert.ok(["word", "phrase"].includes(i.kind), i.id);   // sentence-pattern examples have no kind
  }
});
test("vocabulary: the four V1 topics still exist, first and unchanged in id and size (Phase 3 only adds topics after them)", () => {
  assert.deepEqual(V.TOPICS.slice(0, 4).map(t => t.id), ["numbers", "colours", "family", "greetings"]); assert.deepEqual(V.V1_TOPIC_IDS, ["numbers", "colours", "family", "greetings"]);
  const n = t => V.ITEMS.filter(i => i.topic === t).length;
  assert.equal(n("numbers"), 11); assert.equal(n("colours"), 10); assert.equal(n("family"), 12); assert.ok(n("greetings") >= 16);
  for (const i of V.ITEMS) assert.ok(V.TOPICS.some(t => t.id === i.topic), i.id);
});
test("vocabulary: numbers run zero..ten in order and each carries its Arabic-Indic digit", () => {
  const nums = V.ITEMS.filter(i => i.topic === "numbers"), words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  assert.deepEqual(nums.map(i => i.en), words);
  nums.forEach((i, k) => assert.ok(i.note.includes(String(k).split("").map(d => "٠١٢٣٤٥٦٧٨٩"[d]).join("")), `${i.id} note should show digit for ${k}: ${i.note}`));
});
test("vocabulary: every item is classified; MSA items drive all exercises, dialect items are display-only", () => {
  for (const i of V.ITEMS) assert.equal(i.reg, "msa", i.id);
  assert.equal(V.DIALECT.length, 3); for (const d of V.DIALECT) { assert.equal(d.reg, "dialect"); assert.ok(d.region && /Not Modern Standard Arabic/.test(d.note), d.id); }
  assert.ok(R.ALL_IDS.every(id => !id.startsWith("dia-")), "dialect ids must not be schedulable");
  for (const d of V.DIALECT) { assert.throws(() => R.makeVocabQuestion("v-recognize", d.id)); }
  assert.deepEqual(R.buildVocabSession({ ids: V.DIALECT.map(d => d.id), type: "mixed", rng: E.mulberry32(1) }), []);
});
test("sentence patterns: four patterns x three examples; the blank word occurs in the sentence; distractors are three distinct other words", () => {
  assert.equal(V.PATTERNS.length, 4); assert.equal(V.PATTERN_ITEMS.length, 12);
  for (const e of V.PATTERN_ITEMS) { assert.ok(e.ar.split(" ").includes(e.slot), e.id); assert.equal(e.pool.length, 3); assert.equal(new Set([e.slot, ...e.pool]).size, 4, e.id); assert.ok(e.pool.every(w => w !== e.slot)); }
});

/* ---------- exercises ---------- */
test("every vocabulary item x applicable exercise type yields a valid question (many seeds)", () => {
  for (const it of V.ITEMS) for (const t of ["v-recognize", "v-match", "v-spelling", "v-recall"]) {
    if (t === "v-spelling" && it.kind !== "word") { assert.throws(() => R.makeVocabQuestion(t, it.id), /single words/); continue; }
    for (let s = 1; s <= 25; s++) {
      const q = R.makeVocabQuestion(t, it.id, E.mulberry32(s)); assert.equal(q.itemId, it.id);
      if (q.typing) { assert.equal(q.mode, "letters"); continue; }
      const v = q.options.map(o => o.value); assert.ok(v.includes(q.answer), `${t}/${it.id} answer present`); assert.equal(new Set(v).size, 4); assert.equal(new Set(q.options.map(o => o.label)).size, 4, "labels distinct");
      assert.equal(E.checkAnswer(q, q.answer).correct, true); assert.equal(E.checkAnswer(q, v.find(x => x !== q.answer)).correct, false);
    }
  }
});
test("spelling options: exactly one correct spelling; misspellings never change ة ى hamza seats, never equal another course word, never duplicate", () => {
  const base = new Set(D.LETTERS.map(l => l.letter)), known = new Set([...V.ITEMS, ...V.PATTERN_ITEMS, ...V.DIALECT].map(i => E.normalizeAr(i.plain)));
  for (const it of V.ITEMS.filter(i => i.kind === "word")) for (let s = 1; s <= 40; s++) {
    const vs = R.spellingVariants(it, E.mulberry32(s), 3); assert.equal(vs.length, 3, it.id); assert.equal(new Set([it.plain, ...vs]).size, 4);
    const o = Array.from(it.plain);
    for (const v of vs) { const c = Array.from(v); assert.equal(c.length, o.length); assert.notEqual(E.normalizeAr(v), E.normalizeAr(it.plain)); assert.ok(!known.has(E.normalizeAr(v)), `${it.id}: ${v} is another course word`); o.forEach((ch, i) => { if (!base.has(ch)) assert.equal(c[i], ch, `${it.id}: special character altered`); }); }
  }
});
test("recall questions never reveal the answer and are graded by the existing letters-mode check", () => {
  for (const it of [...V.ITEMS, ...V.PATTERN_ITEMS]) {
    const q = it.slot ? R.makePatternQuestion("p-type", it.id, E.mulberry32(1)) : R.makeVocabQuestion("v-recall", it.id, E.mulberry32(1));
    assert.ok(q.typing && q.recall && !q.show && !q.options, "recall must not show or list the answer"); assert.ok(q.en && q.hint);
    assert.equal(E.gradeTyped(q.mode, q.ar, it.plain).correct, true, it.id + " plain spelling accepted");
    assert.equal(E.gradeTyped(q.mode, q.ar, it.ar).correct, true, it.id + " vowelled accepted");
    assert.equal(E.gradeTyped(q.mode, q.ar, it.plain + "ب").correct, false, it.id + " wrong answer rejected");
  }
});
test("sentence fill-in: the gap plus the answer rebuilds the sentence; the answer is among 4 distinct Arabic options", () => {
  for (const e of V.PATTERN_ITEMS) for (let s = 1; s <= 10; s++) {
    const q = R.makePatternQuestion("p-fill", e.id, E.mulberry32(s)), b = q.blankWords;
    assert.equal([b.before, q.answer, b.after].filter(Boolean).join(" "), e.ar); assert.equal(b.punct, e.punct);
    const v = q.options.map(o => o.value); assert.ok(v.includes(e.slot)); assert.equal(new Set(v).size, 4); assert.ok(q.options.every(o => o.ar));
  }
});
test("review ladder: questions get harder as the box rises (letters, words, sentences)", () => {
  const rng = E.mulberry32(5), t = (id, b) => R.questionFor(id, { b }, rng).type;
  assert.deepEqual([1, 2, 3, 4, 5].map(b => t("letter:ba", b)), ["name", "name", "letter", "sound", "form"]);
  assert.deepEqual([1, 2, 3, 4, 6].map(b => t("num-3", b)), ["v-recognize", "v-match", "v-spelling", "v-recall", "v-recall"]);
  assert.equal(t("greet-salam", 3), "v-match", "phrases are not spelling-tested");
  assert.deepEqual([1, 3, 4, 6].map(b => t("pat-this-m-1", b)), ["p-fill", "p-fill", "p-type", "p-type"]);
  assert.equal(R.questionFor("num-3", undefined, rng).type, "v-recognize");
  for (const id of R.ALL_IDS) assert.equal(R.questionFor(id, { b: 2 }, rng).itemId, id);
});
test("topic sessions: 10 questions, varied types, no immediate repeats, phrases never get spelling questions", () => {
  const qs = R.buildVocabSession({ ids: V.ITEMS.filter(i => i.topic === "greetings").map(i => i.id), type: "mixed", rng: E.mulberry32(3) });
  assert.equal(qs.length, 10); assert.ok(new Set(qs.map(q => q.type)).size >= 3); assert.ok(qs.filter(q => q.recall).length >= 2);
  qs.forEach((q, i) => { if (i) assert.notEqual(q.itemId, qs[i - 1].itemId); if (q.type === "v-spelling") assert.equal(R.BY_ID[q.itemId].kind, "word"); });
  assert.ok(R.buildVocabSession({ ids: ["greet-salam", "greet-bye"], type: "v-spelling", rng: E.mulberry32(1) }).length === 0, "phrases only: nothing to spell");
  assert.ok(R.buildVocabSession({ ids: ["num-1"], type: "v-match", count: 4, rng: E.mulberry32(1) }).length === 4);
});

/* ---------- scheduler ---------- */
test("scheduler: first answer, promotion through the boxes with the documented intervals, cap at the top box", () => {
  let e = S.grade(undefined, true, 100); assert.deepEqual(e, { b: 2, d: 102, n: 1, w: 0, l: 100 });
  const days = [102]; for (let b = 3; b <= 6; b++) { const today = e.d; e = S.grade(e, true, today); assert.equal(e.b, b); assert.equal(e.d, today + S.INTERVALS[b]); days.push(today); }
  const top = S.grade(e, true, e.d); assert.equal(top.b, 6); assert.equal(top.d, e.d + 30);
  assert.deepEqual(S.grade(undefined, false, 100), { b: 1, d: 101, n: 1, w: 1, l: 100 });
});
test("scheduler: a miss drops to box 1 and returns tomorrow; repeats on the same day never inflate the box; input is never mutated", () => {
  const e = S.grade(S.grade(S.grade(undefined, true, 10), true, 12), true, 16); assert.equal(e.b, 4);
  const frozen = Object.freeze({ ...e }); assert.deepEqual(S.grade(frozen, false, 20), { b: 1, d: 21, n: e.n + 1, w: e.w + 1, l: 20 });
  const same = S.grade(e, true, e.l); assert.equal(same.b, e.b); assert.equal(same.d, e.d); assert.equal(same.n, e.n + 1);
  assert.equal(S.grade(S.grade(undefined, true, 5), false, 5).b, 1, "a miss later the same day still lapses");
});
test("scheduler: due list is ordered most-overdue first, restricted to the catalog, and repairs impossible future dates", () => {
  const entries = { a: { b: 3, d: 8, n: 1, w: 0, l: 4 }, b: { b: 2, d: 5, n: 1, w: 0, l: 3 }, c: { b: 2, d: 9, n: 1, w: 0, l: 4 }, ghost: { b: 2, d: 1, n: 1, w: 0, l: 0 }, far: { b: 4, d: 5000, n: 1, w: 0, l: 1 } };
  assert.deepEqual(S.dueIds(entries, 8, ["a", "b", "c", "far"]), ["b", "a"], "b (due 5) before a (due 8); c is not due yet; far is repaired, not due today");
  assert.equal(S.repair(entries.far, 8).d, 8 + S.INTERVALS[4], "an impossible due date is repaired to today + the box interval");
  const healed = S.repair(entries.far, 8);   // the STORE persists this once; applying it again later is a no-op
  assert.equal(S.repair(healed, 8 + 3), healed, "a repaired entry is stable: it is not pushed forward again");
  assert.deepEqual(S.dueIds({ far: healed }, 8 + S.INTERVALS[4], ["far"]), ["far"], "...so the item comes back after its interval instead of vanishing for years");
  assert.ok(!S.dueIds(entries, 8, ["a", "b", "c"]).includes("ghost"), "ids outside the catalog never appear");
  assert.equal(S.isDue(undefined, 8), false);
});
test("scheduler: summary counts learning, due, mastered, reviewed today and the next due day", () => {
  const entries = { a: { b: 5, d: 20, n: 3, w: 0, l: 10 }, b: { b: 2, d: 10, n: 1, w: 0, l: 8 }, c: { b: 1, d: 12, n: 1, w: 1, l: 10 } };
  assert.deepEqual(S.summary(entries, 10), { learning: 3, due: 1, mastered: 1, reviewedToday: 2, nextDueDay: 10, nextInDays: 0 });
  const later = S.summary({ a: entries.a }, 10); assert.equal(later.due, 0); assert.equal(later.nextInDays, 10);
  assert.deepEqual(S.summary({}, 10), { learning: 0, due: 0, mastered: 0, reviewedToday: 0, nextDueDay: null, nextInDays: null });
});
test("scheduler: day numbers follow local calendar days and format as ISO dates", () => {
  assert.equal(S.dayNumber(noon(2026, 6, 11)) - S.dayNumber(noon(2026, 6, 10)), 1);
  assert.equal(S.dayKey(S.dayNumber(noon(2026, 6, 10))), "2026-06-10");
  assert.equal(S.dayNumber(new Date(2026, 5, 10, 0, 1).getTime()), S.dayNumber(new Date(2026, 5, 10, 23, 59).getTime()));
});

/* ---------- progress store v2 ---------- */
test("migration v1 -> v2: lessons, stats, sessions and streak are preserved; passed LETTER lessons become review items; nothing else is invented", () => {
  const st = mem(), at = noon(2026, 6, 10);
  st.setItem(P.KEY, JSON.stringify({ v: 1, lessons: { "letter-ba": { at, best: 100 }, "letter-ta": { at, best: 67 }, "harakat-1": { at, best: 100 } }, stats: { ba: { c: 2, w: 1 } }, sessions: [{ at, kind: "check", correct: 2, total: 3 }], days: ["2026-06-10"] }));
  const s = P.createStore(st, () => at); s.load(); const d = s.data;
  assert.equal(d.v, 2); assert.ok(s.isDone("letter-ba") && s.isDone("letter-ta") && s.isDone("harakat-1")); assert.deepEqual(d.stats, { ba: { c: 2, w: 1 } }); assert.equal(d.sessions.length, 1); assert.deepEqual(d.days, ["2026-06-10"]);
  assert.deepEqual(Object.keys(d.srs).sort(), ["letter:ba", "letter:ta"], "only letter lessons seed reviews");
  assert.deepEqual(d.srs["letter:ba"], { b: 2, d: S.dayNumber(at) + 2, n: 1, w: 0, l: S.dayNumber(at) });
  s.reviewAnswers([{ id: "num-1", correct: true }]); assert.equal(JSON.parse(st.getItem(P.KEY)).v, 2, "saved back as v2");
  const s2 = P.createStore(st, () => at); s2.load(); assert.ok(s2.srsEntry("letter:ba") && s2.srsEntry("num-1"));
});
test("migration: seeds never overwrite existing schedules, are not re-created after a v2 save, and tolerate a missing completion time", () => {
  const st = mem(), now = noon(2026, 6, 10);
  st.setItem(P.KEY, JSON.stringify({ v: 1, lessons: { "letter-ba": { at: 0, best: 100 }, "letter-ta": { at: now, best: 100 } }, srs: { "letter:ta": { b: 5, d: 99999, n: 9, w: 1, l: 99990 } } }));
  const s = P.createStore(st, () => now); s.load();
  assert.equal(s.data.srs["letter:ta"].b, 5); assert.equal(s.data.srs["letter:ba"].l, S.dayNumber(now), "no usable completion time: seed is dated 'now'");
  s.reviewAnswers([{ id: "num-2", correct: false }]); s.reset();
  const raw = JSON.stringify({ v: 2, lessons: { "letter-ba": { at: now, best: 100 } }, srs: {} }); st.setItem(P.KEY, raw);
  const s3 = P.createStore(st, () => now); s3.load(); assert.deepEqual(s3.data.srs, {}, "a v2 blob is never re-migrated");
});
test("malformed or hostile schedule data is dropped safely; valid entries survive", () => {
  const bad = { "": { b: 2, d: 5 }, "bad id!": { b: 2, d: 5, n: 1, w: 0, l: 1 }, ["x".repeat(60)]: { b: 2, d: 5 }, "num-1": { b: 9, d: 5 }, "num-2": { b: 0, d: 5 }, "num-3": { b: 2, d: 1e9 }, "num-4": "oops", "num-5": null, "num-6": { b: "2", d: 7, n: 1, w: 0, l: 3 }, "num-7": { b: 2, d: 7, n: -4, w: "x", l: 3 }, "col-red": { b: 3, d: 20000, n: 4, w: 1, l: 19990 } };
  const out = P.sanitize({ v: 2, srs: bad }); assert.deepEqual(Object.keys(out.srs).sort(), ["col-red", "num-7"], "numeric strings are rejected (b: \"2\"), bad counters are coerced to 0");
  assert.deepEqual(out.srs["num-7"], { b: 2, d: 7, n: 0, w: 0, l: 3 }); for (const raw of [{ v: 2, srs: "x" }, { v: 2, srs: [] }, { v: 2, srs: 7 }, null, "x", []]) assert.deepEqual(P.sanitize(raw).srs, {});
  const st = mem(); st.setItem(P.KEY, "{broken json"); const s = P.createStore(st); assert.doesNotThrow(() => s.load()); assert.deepEqual(s.data.srs, {});
});
test("unavailable storage: reviews work in memory, report non-persistent, and reset clears them", () => {
  const thrower = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  for (const st of [thrower, null]) { const s = P.createStore(st); s.load(); assert.equal(s.reviewAnswers([{ id: "num-1", correct: true }]), 1); assert.ok(s.srsEntry("num-1")); assert.equal(s.summary().persistent, false); s.reset(); assert.equal(s.srsEntry("num-1"), null); }
});
test("reviews are recorded per item from real answers: invalid ids ignored, same-day repeats not inflated, a miss lapses, the day counts toward the streak", () => {
  let t = noon(2026, 6, 10); const s = P.createStore(mem(), () => t); s.load();
  assert.equal(s.reviewAnswers([{ id: "num-1", correct: true }, { id: "BAD ID", correct: true }, null, { id: "col-red", correct: false }]), 2);
  assert.equal(s.srsEntry("num-1").b, 2); assert.equal(s.srsEntry("col-red").b, 1); assert.equal(s.srsEntry("BAD ID"), null);
  s.reviewAnswers([{ id: "num-1", correct: true }, { id: "num-1", correct: true }]); assert.equal(s.srsEntry("num-1").b, 2); assert.equal(s.srsEntry("num-1").n, 3);
  s.reviewAnswers([{ id: "num-1", correct: false }]); assert.equal(s.srsEntry("num-1").b, 1);
  assert.equal(s.summary().streak, 1); assert.equal(s.summary().practicedToday, true);
});
test("reviews become due at the expected times (injected clock) and the queue reflects what was answered", () => {
  let t = noon(2026, 6, 10); const s = P.createStore(mem(), () => t), CAT = R.ALL_IDS; s.load();
  s.reviewAnswers([{ id: "num-1", correct: true }, { id: "num-2", correct: false }]);   // num-1: box 2 -> due in 2 days; num-2: box 1 -> due tomorrow
  assert.deepEqual(s.dueIds(CAT), []); assert.equal(s.srsSummary(CAT).nextInDays, 1);
  t = noon(2026, 6, 11); assert.deepEqual(s.dueIds(CAT), ["num-2"]);
  t = new Date(2026, 5, 12, 0, 5).getTime(); assert.deepEqual(s.dueIds(CAT), ["num-2", "num-1"].sort((a, b) => s.srsEntry(a).d - s.srsEntry(b).d || (a < b ? -1 : 1)), "both due once their calendar day arrives, even just after midnight");
  s.reviewAnswers([{ id: "num-2", correct: true }, { id: "num-1", correct: true }]); assert.deepEqual(s.dueIds(CAT), []);
  assert.equal(s.srsEntry("num-1").b, 3); assert.equal(s.srsEntry("num-2").b, 2);                // num-1 due 16 Jun (+4), num-2 due 14 Jun (+2)
  t = noon(2026, 6, 13); assert.deepEqual(s.dueIds(CAT), []);
  t = noon(2026, 6, 14); assert.deepEqual(s.dueIds(CAT), ["num-2"], "box 2 comes back 2 days after 12 Jun");
  t = noon(2026, 6, 15); assert.deepEqual(s.dueIds(CAT), ["num-2"]);
  t = noon(2026, 6, 16); assert.deepEqual(s.dueIds(CAT), ["num-2", "num-1"], "box 3 comes back 4 days after 12 Jun; the more overdue item is first");
});
test("clock changes: a clock set far ahead and then corrected does not hide items for years", () => {
  let t = noon(2026, 6, 10); const s = P.createStore(mem(), () => t); s.load();
  t = noon(2030, 1, 1); s.reviewAnswers([{ id: "num-1", correct: true }]); assert.ok(s.srsEntry("num-1").d > S.dayNumber(noon(2029, 12, 1)), "scheduled relative to the (wrong) clock");
  t = noon(2026, 6, 10); assert.deepEqual(s.dueIds(R.ALL_IDS), [], "not due the moment the clock is corrected");
  t = noon(2026, 6, 12); assert.deepEqual(s.dueIds(R.ALL_IDS), ["num-1"], "but it returns after its 2-day interval instead of vanishing until 2030");
});
test("two tabs sharing storage keep each other's reviews", () => {
  const st = mem(), now = () => noon(2026, 6, 10), a = P.createStore(st, now), b = P.createStore(st, now); a.load(); b.load();
  a.reviewAnswers([{ id: "num-1", correct: true }]); b.reviewAnswers([{ id: "num-2", correct: true }]);
  const c = P.createStore(st, now); c.load(); assert.ok(c.srsEntry("num-1") && c.srsEntry("num-2"));
});
test("reset removes the schedule from memory and storage", () => {
  const st = mem(), s = P.createStore(st); s.load(); s.reviewAnswers([{ id: "num-1", correct: true }]); assert.ok(st.getItem(P.KEY)); s.reset();
  assert.equal(st.getItem(P.KEY), null); assert.deepEqual(s.data.srs, {}); assert.equal(s.srsSummary(R.ALL_IDS).learning, 0);
});

/* ---------- publishing protection and honesty ---------- */
test("publishing: _config.yml keeps the review package out of the published site and re-lists Jekyll's default exclusions", () => {
  const y = read("_config.yml"), list = y.split("\n").filter(l => /^\s+-\s/.test(l)).map(l => l.replace(/^\s+-\s+/, "").trim());
  assert.ok(list.includes("docs/arabic-course-review")); for (const d of ["node_modules", "Gemfile", "Gemfile.lock", "vendor/bundle"]) assert.ok(list.includes(d), d);
  assert.ok(fs.existsSync(path.join(REPO, "docs/arabic-course-review/build-review-package.mjs")), "the excluded folder is still in the repository, so generation and tests keep working");
  assert.ok(!fs.existsSync(path.join(REPO, ".nojekyll")), "a .nojekyll file would switch the exclusion off");
});
test("publishing: no page, sitemap, service worker entry or script links to the review package", () => {
  for (const f of ["sitemap.xml", "sw.js", "learn-arabic/index.html", "robots.txt", ...fs.readdirSync(path.join(REPO, "assets/js/learn")).map(n => "assets/js/learn/" + n)]) assert.ok(!/arabic-course-review/.test(read(f)), f);
});
test("honesty: no claim of teacher verification, and every mention of a 'native recording' is a negation", () => {
  const files = ["learn-arabic/index.html", "assets/js/learn/app.js", "assets/js/learn/audio.js", "assets/js/learn/vocab-data.js", "assets/js/learn/data.js"], text = files.map(read).join("\n");
  assert.ok(!/(teacher|linguist)[- ](verified|approved|reviewed)|verified by|approved by|has been reviewed|was reviewed|(?<!un)reviewed by a (native|qualified)/i.test(text.replace(/has not yet been reviewed by a qualified Arabic teacher/g, "")), "unreviewed content must not be described as reviewed");
  assert.ok(/has not yet been reviewed by a qualified Arabic teacher/.test(read("learn-arabic/index.html")), "beta notice present");
  const hits = text.match(/.{0,40}native[ -](speaker )?recording.{0,10}/gi) || []; assert.ok(hits.length >= 2); for (const h of hits) assert.ok(/\bnot\b|\bno\b|\bnever\b/i.test(h), "affirmative recording claim: " + h);
});
test("static page: audio controls exist exactly once with a polite live region; new scripts are precached; cache is above the live v15", () => {
  const html = read("learn-arabic/index.html"), sw = read("sw.js");
  for (const id of ["lxSpeech", "lxSpeedBtn", "lxSpeechStatus", "lxSpeechMsg"]) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
  assert.ok(/id="lxSpeechMsg"[^>]*role="status"[^>]*aria-live="polite"/.test(html) && /id="lxSpeedBtn"[^>]*aria-pressed=/.test(html));
  for (const f of ["vocab-data", "srs", "review"]) assert.ok(sw.includes(`"/assets/js/learn/${f}.js"`), f);
  assert.ok(Number(sw.match(/shell-v(\d+)"/)[1]) >= 16);
});
test("review package covers every new item: vocabulary, dialect, patterns and examples, verbatim, with blank decisions", async () => {
  const { buildPackage } = await import("../../docs/arabic-course-review/build-review-package.mjs"), rows = buildPackage().rows, by = Object.fromEntries(rows.map(r => [r.item_id, r]));
  for (const it of V.ITEMS) { const r = by["V-" + it.id.toUpperCase()]; assert.ok(r, it.id); assert.equal(r.arabic_as_implemented, it.ar + (it.punct || "")); assert.equal(r.plain_spelling, it.plain); assert.equal(r.transliteration, it.translit); assert.equal(r.english_text, it.en); assert.equal(r.teacher_decision, ""); }
  for (const d of V.DIALECT) assert.ok(/dialect/.test(by["V-" + d.id.toUpperCase()].special_flags) && by["V-" + d.id.toUpperCase()].context_notes.includes(d.region));
  for (const pt of V.PATTERNS) { assert.ok(by["PAT-" + pt.id.toUpperCase()]); for (const e of pt.examples) { const r = by["PAT-" + e.id.slice(4).toUpperCase()]; assert.ok(r, e.id); assert.equal(r.arabic_as_implemented, e.ar + (e.punct || "")); assert.ok(r.context_notes.includes(e.pool[0])); } }
  assert.ok(by["V-NUM-2"].special_flags.includes("hamzat-wasl") && by["V-NUM-2"].suggested_priority === "high");
  assert.equal(rows.filter(r => r.category === "vocabulary").length, V.ITEMS.length); assert.ok(rows.filter(r => r.item_id.startsWith("X-UI-")).length >= 17);
});
