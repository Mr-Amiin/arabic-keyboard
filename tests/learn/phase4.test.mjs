// Phase 4 (Milestone 1) unit tests: data schemas, pure exercise logic, grading, pass mark, review policy, frozen-ID and learner-record preservation.
// No Phase 4 course content exists yet. Every Arabic string used below is taken from EXISTING Phase 3 text or is a single letter/word probe;
// the "fixtures" assemble that existing text into structurally valid stories and exercises. They make no claim about meaning or grammar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
const fixture = f => JSON.parse(read("tests/learn/fixtures/" + f));
const L = n => require("../../assets/js/learn/" + n + ".js");
const E = L("engine"), X = L("exercises"), S = L("stories"), W = L("sentences");
const V = L("vocab-data"), C = L("conversations"), RD = L("reading"), J = L("journey"), P = L("progress"), R = L("review"), SRS = L("srs");
import { POOL, rawStory, cleanLines, orderTokens, rawOrder, rawComplete, rawMatch } from "./fixtures/phase4-fixtures.mjs";
const FROZEN = fixture("phase3-frozen-ids.json");
const rng = seed => E.mulberry32(seed);
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 86400000;

// ------------------------------------------------------------------ fixtures assembled from existing Phase 3 text
const VOCAB_IDS = new Set(V.ITEMS.map(i => i.id));
const RESERVED = new Set([].concat(FROZEN.letters, FROZEN.vocab, FROZEN.patterns, FROZEN.patternItems, FROZEN.conversationUnits, FROZEN.conversationSentences,
  FROZEN.readingPassages, FROZEN.readingQuestions, FROZEN.journeyStages, FROZEN.unitIds, FROZEN.lessonIds, FROZEN.reviewIds));
const CTX = { vocabIds: VOCAB_IDS, reservedIds: RESERVED };

const builtStory = (band = 1, slug = "fixture", mutate) => { const r = rawStory(band, slug); if (mutate) mutate(r); return S.build([r])[0]; };
const problems = (story, c) => S.validateStory(story, c || CTX);

function memStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; }
function newStore(clock, storage) { const st = P.createStore(storage || memStorage(), () => clock.t); st.load(); return st; }
const journeyOf = st => JSON.stringify(J.build({ lessonDone: st.isDone, unitDone: st.unitDone, unit: st.unit, srsEntry: st.srsEntry }));
// Mirrors the existing app.js finish() mapping so the policy can be proven against what the live code would record:
//   store.reviewAnswers(results.map(r => ({ id: r.q.itemId || (r.letterId ? "letter:" + r.letterId : null), correct: r.correct })).filter(a => a.id && R.kindOf(a.id)))
const finishRows = results => results.map(r => ({ id: r.q.itemId || (r.letterId ? "letter:" + r.letterId : null), correct: r.correct })).filter(a => a.id && R.kindOf(a.id));

// ================================================================== 1. modules, isolation, honesty
test("Milestone 1: modules load, ship EMPTY catalogues, and share the 70% pass mark", () => {
  assert.equal(S.STORIES.length, 0); assert.equal(S.RAW.length, 0); assert.equal(W.ITEMS.length, 0); assert.equal(W.RAW.length, 0);
  assert.equal(X.PASS_PERCENT, 70); assert.equal(S.PASS_PERCENT, 70); assert.equal(W.PASS_PERCENT, 70);
  assert.equal(RD.PASS_PERCENT, 70); assert.equal(C.PASS_PERCENT, 70);
  assert.deepEqual(S.unitIds(), []); assert.deepEqual(W.unitIds(), ["build-set-1", "build-set-2", "build-set-3"]);
  assert.deepEqual(W.SETS.map(s => s.expected), [8, 8, 8]);
  assert.deepEqual(S.BANDS.map(b => b.newWordsMax), [6, 8, 12]); assert.deepEqual(S.BANDS.map(b => b.marks), [true, true, false]);
  assert.deepEqual(S.validateStories([], CTX), []); assert.deepEqual(W.validateCatalog([], CTX), []);
  assert.ok(S.validateStories([], CTX, { complete: true }).length === 3, "the first-release shape needs 4 stories per band");
  assert.ok(W.validateCatalog([], CTX, { complete: true }).length === 3, "the first-release shape needs 8 exercises per set");
});
test("Milestone 2 wiring: the four Phase 4 scripts are in the page in dependency order, precached, and the cache name moved on from v18", () => {
  const html = read("learn-arabic/index.html"), sw = read("sw.js");
  const order = [...html.matchAll(/<script src="\.\.\/assets\/js\/learn\/(\w[\w-]*)\.js"/g)].map(m => m[1]);
  assert.deepEqual(order, ["data", "vocab-packs", "vocab-data", "conversations", "reading", "urls", "srs", "engine", "exercises", "sentences", "stories", "review", "journey", "progress", "audio", "typing-dock", "stories-ui", "app"]);
  for (const f of ["exercises", "sentences", "stories", "stories-ui"]) assert.ok(sw.includes('"/assets/js/learn/' + f + '.js"'), f + " precached");
  { const name = sw.match(/const CACHE_NAME = "([^"]+)"/)[1]; const v = Number((name.match(/^arabic-keyboard-shell-v(\d+)$/) || [])[1]); assert.ok(v >= 21, `shell cache ${name} must be well-formed and at least v21 (the release that introduced the individual lesson URL assets)`); }
  assert.equal(sw.match(/const VENDOR_CACHE = "([^"]+)"/)[1], "arabic-keyboard-vendor-v1", "the 19 MB vendor cache name must not change");
});
test("honesty: new files never name the review package, never claim teacher review, and the draft notice says it is awaiting it", () => {
  const text = ["exercises", "stories", "sentences", "stories-ui"].map(n => read("assets/js/learn/" + n + ".js")).join("\n");
  assert.ok(!/arabic-course-review/.test(text));
  assert.ok(!/(teacher|linguist)[- ](verified|approved|reviewed)|verified by|approved by|has been reviewed|was reviewed|(?<!un)reviewed by a (native|qualified)/i.test(text));
  assert.equal(X.DRAFT_NOTICE, "Draft: awaiting review by a qualified Arabic teacher."); assert.equal(S.DRAFT_NOTICE, X.DRAFT_NOTICE); assert.equal(W.DRAFT_NOTICE, X.DRAFT_NOTICE);
  assert.equal(X.STATUS, "draft-unreviewed");
});
test("approval claims are rejected anywhere in a story or exercise", () => {
  for (const key of ["reviewed", "approved", "verified", "teacherApproved", "reviewedBy", "reviewer"]) {
    assert.ok(problems(builtStory(1, "x", r => { r[key] = true; })).some(m => /approval claim/.test(m)), "story " + key);
    assert.ok(problems(builtStory(1, "x", r => { r.questions[0][key] = true; })).some(m => /approval claim/.test(m)), "question " + key);
    assert.ok(W.validateItem(W.build([Object.assign(rawOrder(), { [key]: true })])[0], CTX).some(m => /approval claim/.test(m)), "exercise " + key);
  }
  assert.ok(problems(builtStory(1, "x", r => { r.status = "reviewed"; })).some(m => /status must be exactly/.test(m)));
  assert.ok(problems(builtStory(1, "x", r => { delete r.status; })).some(m => /status must be exactly/.test(m)));
});

// ================================================================== 2. normalizeAr contract (what the short-answer grader relies on)
test("normalizeAr contract: REMOVED marks", () => {
  assert.equal(E.normalizeAr("مَدْرَسَةٌ"), "مدرسة");                      // short vowels, sukun, tanween
  assert.equal(E.normalizeAr("الطَّالِب"), "الطالب");                       // shadda
  assert.equal(E.normalizeAr("هَٰذَا"), "هذا");                              // dagger alif U+0670
  assert.equal(E.normalizeAr("مـــدرسة"), "مدرسة");                         // tatweel U+0640
  for (const cp of [0x064B, 0x0650, 0x0651, 0x0652, 0x0653, 0x0654, 0x0655, 0x065F, 0x0670]) assert.equal(E.normalizeAr("ب" + String.fromCodePoint(cp)), "ب", "U+" + cp.toString(16));
});
test("normalizeAr contract: UNIFIED letter variants (alef forms, alef maqsura)", () => {
  for (const a of ["أ", "إ", "آ", "ٱ"]) assert.equal(E.normalizeAr(a), "ا", a);
  assert.equal(E.normalizeAr("أَكَلَ"), "اكل"); assert.equal(E.normalizeAr("إِلَى"), "الي");
  assert.equal(E.normalizeAr("على"), "علي");                                  // ى -> ي, so these two spellings are the same answer
  assert.ok(E.checkTyped("على", "علي") && E.checkTyped("أب", "اب"), "the grader accepts alef-hamza and alef-maqsura variants");
});
test("normalizeAr contract: PRESERVED distinctions and characters", () => {
  assert.notEqual(E.normalizeAr("مدرسة"), E.normalizeAr("مدرسه"), "ة is never equal to ه");
  assert.ok(!E.checkTyped("مَدْرَسَة", "مدرسه"));
  for (const c of ["ؤ", "ئ", "ء"]) assert.equal(E.normalizeAr(c), c, "hamza on waw/yeh/line is kept: " + c);
  assert.equal(E.normalizeAr("ی"), "ی"); assert.equal(E.normalizeAr("ک"), "ک");   // Persian yeh and kaf are not unified
  assert.equal(E.normalizeAr("٣"), "٣"); assert.equal(E.normalizeAr("Abc"), "Abc");
  assert.equal(E.normalizeAr("ا\u06D6"), "ا\u06D6", "Quranic annotation marks are not removed");
  assert.equal(E.normalizeAr("ا\u200Cب"), "ا\u200Cب", "ZWNJ kept");
  for (const p of ["المدرسة.", "أين؟", "نعم،", "ما!"]) assert.ok(/[.؟،!]/.test(E.normalizeAr(p)), "punctuation is NOT stripped by the engine: " + p);
  assert.equal(E.normalizeAr("  ا   ب  "), "ا ب"); assert.equal(E.normalizeAr("ا\u00A0ب"), "ا ب", "whitespace (including NBSP) collapses to one space");
  assert.equal(E.normalizeAr(null), ""); assert.equal(E.normalizeAr(undefined), "");
  assert.ok(!E.checkTyped("", ""), "an empty expected answer never matches");
});
test("normalizeAr contract: strict ('exact') mode keeps harakat; the short-answer grader uses letters-only mode", () => {
  assert.equal(E.gradeTyped("exact", "مَدْرَسَة", "مدرسة").reason, "marks");
  assert.equal(E.gradeTyped("exact", "مَدْرَسَة", "مَدْرَسَة").correct, true);
  assert.equal(E.gradeTyped("letters", "مَدْرَسَة", "مدرسة").correct, true);
});

// ================================================================== 3. helpers stay consistent with Phase 3
test("strip() equals the plain text Phase 3 derives for every existing reading line, and vowelled/plain words line up", () => {
  for (const l of POOL) { assert.equal(X.strip(l.ar), l.plain, l.audioKey); assert.equal(X.tokens(l.ar).length, X.tokens(l.plain).length, l.audioKey); }
});

// ================================================================== 4. word ordering
test("order: the shuffled start is never an accepted order, for many seeds; tile ids are stable; accept lists are copied", () => {
  const item = W.build([rawOrder()])[0];
  for (let seed = 1; seed <= 300; seed++) {
    const q = X.buildOrder(item, rng(seed)), seq = q.tiles.map(t => t.text);
    assert.ok(!q.accept.some(a => a.join("|") === seq.join("|")), "seed " + seed);
    assert.deepEqual(q.tiles.map(t => t.tid).sort(), item.accept[0].map((_, i) => "t" + i).sort());
  }
  const q = X.buildOrder(item, rng(1)); q.accept[0][0] = "changed"; assert.notEqual(item.accept[0][0], "changed");
  const five = W.build([rawOrder("bw-1-01", cleanLines.findIndex(l => X.tokens(l.ar).length === 5))])[0];   // 5 words: 118 non-accepted orders, so variety is measurable
  assert.equal(five.accept[0].length, 5);
  const starts = new Set(); for (let seed = 1; seed <= 60; seed++) starts.add(X.buildOrder(five, rng(seed)).tiles.map(t => t.text).join("|"));
  assert.ok(starts.size >= 5, "the start order really is shuffled, not one fixed fallback order (saw " + starts.size + ")");
  assert.equal(X.buildOrder(item, rng(11)).tiles.map(t => t.tid).join(), X.buildOrder(item, rng(11)).tiles.map(t => t.tid).join(), "same seed, same start order (deterministic for tests)");
});
test("order: grading accepts every explicitly accepted order and nothing else", () => {
  const item = W.build([rawOrder()])[0], q = X.buildOrder(item, rng(7)), byText = {}; q.tiles.forEach(t => { byText[t.text] = t.tid; });
  for (const acc of item.accept) { const g = X.gradeOrder(q, acc.map(t => byText[t])); assert.equal(g.correct, true); assert.equal(g.complete, true); assert.equal(g.reason, "ok"); }
  const wrong = item.accept[0].slice().reverse(); if (!item.accept.some(a => a.join() === wrong.join())) assert.equal(X.gradeOrder(q, wrong.map(t => byText[t])).correct, false);
  assert.equal(X.gradeOrder(q, [q.tiles[0].tid]).reason, "incomplete"); assert.equal(X.gradeOrder(q, []).correct, false);
  assert.equal(X.gradeOrder(q, ["t0", "t0", "t1"]).reason, "invalid"); assert.equal(X.gradeOrder(q, ["nope"]).reason, "invalid"); assert.equal(X.gradeOrder(q, "t0").reason, "invalid");
  assert.equal(X.gradeOrder(q, ["__proto__"]).reason, "invalid");
  assert.equal(X.gradeOrder(q, q.tiles.map(t => t.tid)).correct, false, "the shuffled start is not an accepted answer");
  assert.equal(X.gradeOrder(q, q.tiles.map(t => t.tid)).expected, item.accept[0].join(" "));
});
test("order: duplicate word tiles are interchangeable", () => {
  const q = X.buildOrder({ id: "bw-1-09", accept: [["ا", "ب", "ا", "ج"]], punct: "" }, rng(3)), a = q.tiles.filter(t => t.text === "ا").map(t => t.tid);
  assert.equal(a.length, 2);
  const mk = (first, third) => [first, q.tiles.find(t => t.text === "ب").tid, third, q.tiles.find(t => t.text === "ج").tid];
  assert.equal(X.gradeOrder(q, mk(a[0], a[1])).correct, true); assert.equal(X.gradeOrder(q, mk(a[1], a[0])).correct, true, "swapping the two identical tiles is still correct");
});
test("order: a tile set where every ordering is accepted is refused at build time and by the validator", () => {
  assert.throws(() => X.buildOrder({ id: "bw-1-09", accept: [["ا", "ا", "ا"]] }, rng(1)), /every ordering/);
  const only = W.build([Object.assign(rawOrder(), { accept: [["ا", "ا", "ا"]] })])[0];
  assert.ok(W.validateItem(only, CTX).some(m => /every ordering/.test(m)));
});

// ================================================================== 5. matching
test("match: the question carries its correct pairing EXPLICITLY; ids are opaque; the right list never starts in answer order; scoring is all-or-nothing with per-pair feedback", () => {
  const raw = rawMatch(), item = W.build([raw])[0], q = { id: "m", prompt: "p", pairs: item.pairs.map(p => [p[0], p[1]]), explanation: "e" };
  for (let seed = 1; seed <= 200; seed++) {
    const m = X.buildMatch(q, rng(seed));
    assert.deepEqual(X.validateBuiltMatch(m), [], "seed " + seed);
    assert.ok(m.right.some((r, i) => m.correct[m.left[i].lid] !== r.rid), "never displayed row-for-row in answer order (seed " + seed + ")");
    assert.ok(m.left.some((l, i) => m.correct[l.lid] !== "r" + i), "a right id is NOT derived from its pair's position (seed " + seed + ")");
    assert.deepEqual(Object.keys(m.correct).sort(), m.left.map(l => l.lid).sort()); assert.deepEqual(Object.values(m.correct).sort(), m.right.map(r => r.rid).sort());
    q.pairs.forEach((p, i) => { assert.equal(m.right.find(r => r.rid === m.correct[m.left[i].lid]).text, p[1].normalize("NFC"), "the explicit pairing joins the right texts"); });
  }
  const m = X.buildMatch(q, rng(5)), key = Object.assign({}, m.correct), [a, b, c] = m.left.map(l => l.lid);
  let g = X.gradeMatch(m, key); assert.equal(g.correct, true); assert.ok(g.pairResults.every(p => p.correct && p.expected === m.correct[p.lid]));
  g = X.gradeMatch(m, Object.assign({}, key, { [a]: key[b], [b]: key[a] }));
  assert.equal(g.correct, false, "one wrong pair makes the whole question wrong"); assert.deepEqual(g.pairResults.map(p => p.correct), [false, false, true]);
  assert.deepEqual(g.pairResults.map(p => p.expected), [key[a], key[b], key[c]], "each pair reports the id that would have been right");
  g = X.gradeMatch(m, { [a]: key[a] }); assert.equal(g.correct, false); assert.equal(g.complete, false); assert.equal(g.pairResults[1].rid, null);
  assert.equal(X.gradeMatch(m, null).correct, false); assert.equal(X.gradeMatch(m, { [a]: 5, [b]: {}, [c]: [] }).correct, false);
  for (let seed = 1; seed <= 50; seed++) { const two = X.buildMatch({ id: "m", prompt: "p", pairs: [["أ", "ب"], ["ج", "د"]] }, rng(seed)); assert.deepEqual(two.right.map(r => r.rid), [two.correct[two.left[1].lid], two.correct[two.left[0].lid]], "two pairs are always displayed swapped"); }
});
test("match engine is GENERIC: a hand-built question with arbitrary ids grades by its explicit `correct` map, and the old r+index convention would get it wrong", () => {
  const hand = { type: "match", id: "h", prompt: "p", left: [{ lid: "A", text: "1" }, { lid: "B", text: "2" }, { lid: "C", text: "3" }], right: [{ rid: "x", text: "c" }, { rid: "y", text: "a" }, { rid: "z", text: "b" }], correct: { A: "y", B: "z", C: "x" }, explanation: "e" };
  assert.deepEqual(X.validateBuiltMatch(hand), []);
  assert.equal(X.gradeMatch(hand, { A: "y", B: "z", C: "x" }).correct, true); assert.equal(X.gradeMatch(hand, { A: "x", B: "y", C: "z" }).correct, false);
  // a TRAP: ids that look like the old convention but pair the other way round. Deriving "r"+suffix from the left id would mark the right answer wrong.
  const trap = { type: "match", id: "t", prompt: "p", left: [{ lid: "l0", text: "1" }, { lid: "l1", text: "2" }], right: [{ rid: "r0", text: "b" }, { rid: "r1", text: "a" }], correct: { l0: "r1", l1: "r0" } };
  assert.deepEqual(X.validateBuiltMatch(trap), []); assert.equal(X.gradeMatch(trap, { l0: "r1", l1: "r0" }).correct, true, "the explicit pairing wins");
  assert.equal(X.gradeMatch(trap, { l0: "r0", l1: "r1" }).correct, false, "the old derived pairing is now WRONG for this question");
  const noMap = Object.assign({}, hand); delete noMap.correct; assert.equal(X.gradeMatch(noMap, { A: "y", B: "z", C: "x" }).correct, false, "no correct map, nothing is ever marked right (fail closed)");
  assert.ok(X.validateBuiltMatch(noMap).some(m => /explicit correct map/.test(m)));
});
test("validateBuiltMatch: every invariant fails for the right reason", () => {
  const good = () => ({ id: "v", left: [{ lid: "A", text: "1" }, { lid: "B", text: "2" }], right: [{ rid: "x", text: "b" }, { rid: "y", text: "a" }], correct: { A: "y", B: "x" } });
  assert.deepEqual(X.validateBuiltMatch(good()), []);
  const has = (mut, re) => { const q = good(); mut(q); assert.ok(X.validateBuiltMatch(q).some(m => re.test(m)), re + " in " + JSON.stringify(X.validateBuiltMatch(q))); };
  has(q => { q.left = [q.left[0]]; q.right = [q.right[0]]; }, /2 to 4/); has(q => { q.left.push({ lid: "C", text: "3" }, { lid: "D", text: "4" }, { lid: "E", text: "5" }); }, /2 to 4/);
  has(q => { q.right.push({ rid: "z", text: "c" }); }, /same number/); has(q => { q.left[1].lid = "A"; }, /left ids repeat/); has(q => { q.right[1].rid = "x"; }, /right ids repeat/);
  has(q => { q.left[0].text = ""; }, /2 to 4/); has(q => { delete q.correct; }, /explicit correct map/); has(q => { q.correct = []; }, /explicit correct map/);
  has(q => { delete q.correct.B; }, /exactly one entry/); has(q => { q.correct.Z = "x"; }, /exactly one entry/); has(q => { q.correct.B = "nope"; }, /does not exist/);
  has(q => { q.correct.B = "y"; }, /not one-to-one/); has(q => { q.right.reverse(); }, /answer order/);
  assert.ok(X.validateBuiltMatch(null).length && X.validateBuiltMatch("x").length);
});
test("finish package contract: ONLY results with graded === true can reach finish(); a missing, null, 0, 1, 'true' or false flag never counts", () => {
  const good = vc("good", false, "num-1"), reveal = X.makeResult(X.buildQuestion({ id: "r", type: "reveal", prompt: "p", model: "m" }), X.gradeAnswer(X.buildQuestion({ id: "r", type: "reveal", prompt: "p", model: "m" }), null));
  assert.equal(reveal.graded, false, "a reveal is explicitly ungraded"); assert.equal(good.graded, true);
  // makeResult: graded only when the grader said so explicitly
  const built = X.buildQuestion({ id: "t", type: "tf", prompt: "p", answer: true, explanation: "e" });
  for (const flag of [undefined, null, false, 0, 1, "true", "yes", {}]) assert.equal(X.makeResult(built, { correct: true, graded: flag }).graded, false, "makeResult graded:" + String(flag));
  assert.equal(X.makeResult(built, { correct: true }).graded, false, "no flag at all is not graded"); assert.equal(X.makeResult(built, { correct: true, graded: true }).graded, true);
  // a stray vocabulary-in-context MISS with a bad flag must not create a review row, a score entry or an itemId
  const missQ = X.buildQuestion({ id: "v", type: "vocab-context", prompt: "p", line: 1, word: "ا", options: ["a", "b", "c"], reviewItemId: "num-2", explanation: "e" }, rng(1));
  const noFlag = X.makeResult(missQ, { correct: false }); assert.ok(!("itemId" in noFlag.q), "no itemId without an explicit graded:true");
  const odd = [undefined, null, false, 0, 1, "true"].map(flag => ({ letterId: null, correct: false, graded: flag, q: Object.assign({}, missQ, { itemId: "num-2" }) }));
  odd.push({ letterId: null, correct: false, q: Object.assign({}, missQ, { itemId: "num-2" }) });   // the flag missing altogether
  assert.equal(X.gradedResults(odd).length, 0, "none of these is graded"); assert.deepEqual(X.scoreResults(odd), { correct: 0, total: 0, percent: 0 });
  assert.deepEqual(X.reviewRowsFor(odd, { isKnownId: known }), [], "no review row from an ungraded result, even a wrong vocabulary-in-context one");
  const pkg = X.finishPackage([good, reveal].concat(odd), { isKnownId: known });
  assert.equal(pkg.results.length, 1, "only the explicitly graded result is in the package"); assert.ok(pkg.results.every(r => r.graded === true && r.q.type !== "reveal"));
  assert.deepEqual(pkg.reviewRows, [{ id: "num-1", correct: false }], "review rows come only from the graded result");
  assert.deepEqual(X.scoreResults(pkg.results), { correct: 0, total: 1, percent: 0 }, "the reveal and the odd results are outside the score");
  // a FORGED frozen package is rejected unless every result is exactly graded === true
  const forge = r => Object.freeze({ v: 1, results: Object.freeze([Object.freeze(Object.assign({}, r))]), reviewRows: Object.freeze([]) });
  for (const flag of [undefined, null, false, 0, 1, "true"]) assert.equal(X.isFinishPackage(forge({ correct: true, graded: flag, q: {} })), false, "graded:" + String(flag));
  assert.equal(X.isFinishPackage(forge({ correct: true, q: {} })), false, "the flag missing altogether"); assert.equal(X.isFinishPackage(forge(reveal)), false, "a real reveal result smuggled into a package");
  assert.equal(
    X.isFinishPackage(forge({ correct: true, graded: true, q: {} })),
    false,
    "a shallow-frozen package with a mutable question is rejected"
  );

  const deeplyFrozenForge = Object.freeze({
    v: 1,
    results: Object.freeze([
      Object.freeze({
        correct: true,
        graded: true,
        q: Object.freeze({ options: Object.freeze(["a", "b"]) })
      })
    ]),
    reviewRows: Object.freeze([])
  });

  assert.equal(
    X.isFinishPackage(deeplyFrozenForge),
    true,
    "a structurally valid, deeply frozen package is accepted"
  );
});

// ================================================================== 6. true/false, choice, vocabulary in context
test("true/false: fixed True then False order, never shuffled, graded as a boolean", () => {
  for (let seed = 1; seed <= 50; seed++) assert.deepEqual(X.buildTrueFalse({ id: "t", prompt: "p", answer: true }, rng(seed)).options.map(o => o.label), ["True", "False"]);
  const t = X.buildTrueFalse({ id: "t", prompt: "p", answer: true, explanation: "e" }), f = X.buildTrueFalse({ id: "f", prompt: "p", answer: false, explanation: "e" });
  assert.equal(X.gradeTrueFalse(t, "true").correct, true); assert.equal(X.gradeTrueFalse(t, true).correct, true); assert.equal(X.gradeTrueFalse(t, "false").correct, false);
  assert.equal(X.gradeTrueFalse(f, false).correct, true); assert.equal(X.gradeTrueFalse(f, "true").correct, false); assert.equal(X.gradeTrueFalse(f, "maybe").reason, "invalid");
});
test("choice: the correct option keeps its original index as its value after shuffling", () => {
  const q = { id: "c", type: "mcq", prompt: "p", options: ["right", "w1", "w2", "w3"], explanation: "e" };
  for (let seed = 1; seed <= 100; seed++) { const b = X.buildChoice(q, rng(seed)), right = b.options.find(o => o.label === "right"); assert.equal(X.gradeChoice(b, right.value).correct, true); assert.equal(X.gradeChoice(b, b.options.find(o => o.label === "w1").value).correct, false); }
  const orders = new Set(); for (let seed = 1; seed <= 50; seed++) orders.add(X.buildChoice(q, rng(seed)).options.map(o => o.label).join()); assert.ok(orders.size > 3, "options really are shuffled");
});
test("vocabulary in context: the built question carries reviewItemId and NEVER itemId", () => {
  const b = X.buildQuestion({ id: "v", type: "vocab-context", prompt: "p", line: 1, word: "ا", options: ["a", "b", "c"], reviewItemId: "num-0", explanation: "e" }, rng(1));
  assert.equal(b.reviewItemId, "num-0"); assert.ok(!("itemId" in b)); assert.equal(b.type, "vocab-context");
  assert.equal(X.buildQuestion({ id: "v", type: "vocab-context", prompt: "p", line: 1, word: "ا", options: ["a", "b", "c"], explanation: "e" }, rng(1)).reviewItemId, null);
});

// ================================================================== 7. short answer
test("short answer: letters-only comparison against a reviewed accept list; punctuation and harakat do not matter", () => {
  const q = X.buildShort({ id: "s", prompt: "p", accept: ["مَدْرَسَة", "الْمَدْرَسَة"], explanation: "e" });
  for (const typed of ["مدرسة", "مَدْرَسَة", "المدرسة", "  مدرسة  ", "مدرسة.", "«مدرسة»", "مدرسة؟", "مـدرسة"]) assert.equal(X.gradeShort(q, typed).correct, true, typed);
  for (const typed of ["مدرسه", "مدرس", "كتاب", "المدرسة الكبيرة"]) assert.equal(X.gradeShort(q, typed).correct, false, typed);
  assert.equal(X.gradeShort(q, "").reason, "empty"); assert.equal(X.gradeShort(q, "   ").reason, "empty"); assert.equal(X.gradeShort(q, null).reason, "empty"); assert.equal(X.gradeShort(q, "...").reason, "empty");
  assert.equal(X.gradeShort(q, "مدرسه").reason, "letters");
  assert.equal(X.gradeShort(X.buildShort({ id: "s", prompt: "p", accept: ["أَبٌ"] }), "اب").correct, true, "alef-hamza variants are the same answer (documented, flag for the reviewer)");
  assert.equal(X.gradeShort(X.buildShort({ id: "s", prompt: "p", accept: ["عَلَى"] }), "علي").correct, true, "ى and ي are the same answer (documented, flag for the reviewer)");
});

// ================================================================== 8. ungraded reveal
test("reveal: never graded, never scored, never recorded", () => {
  const b = X.buildQuestion({ id: "r", type: "reveal", prompt: "p", model: "m" }), g = X.gradeAnswer(b, "anything");
  assert.equal(g.graded, false); assert.equal(g.correct, null);
  const res = [X.makeResult(X.buildQuestion({ id: "t", type: "tf", prompt: "p", answer: true, explanation: "e" }), { graded: true, correct: true }), X.makeResult(b, g)];
  assert.equal(res[1].graded, false); assert.deepEqual(X.scoreResults(res), { correct: 1, total: 1, percent: 100 }, "the reveal is outside the denominator");
  assert.deepEqual(X.reviewRowsFor(res, { isKnownId: () => true }), []);
});
test("buildQuestion / gradeAnswer reject unknown types instead of guessing", () => {
  assert.throws(() => X.buildQuestion({ type: "essay" }), /Unknown question type/); assert.throws(() => X.gradeAnswer({ type: "essay" }), /Unknown question type/); assert.throws(() => X.buildQuestion(null));
});

// ================================================================== 9. sentence completion (workshop)
test("complete: mirrors the Phase 3 sentence-completion shape and carries the sentence review id", () => {
  const it = W.build([rawComplete()])[0], q = X.buildComplete(it, rng(2));
  assert.equal(q.itemId, "snt-st-fixture-1"); assert.equal(q.answer, it.slot); assert.equal(q.options.length, 4); assert.ok(q.options.every(o => o.ar));
  assert.equal((q.blankWords.before + " " + it.slot + " " + q.blankWords.after).trim().replace(/\s+/g, " "), it.ar);
  assert.equal(X.gradeComplete(q, it.slot).correct, true); assert.equal(X.gradeComplete(q, it.pool[0]).correct, false);
  const rs = W.toReviewSentence(it), live = C.SENTENCE_ITEMS[0];
  assert.deepEqual(Object.keys(rs).sort(), Object.keys(live).sort(), "same keys as a Phase 3 SENTENCE_ITEMS entry");
  assert.equal(rs.id, "snt-st-fixture-1"); assert.equal(rs.slot, it.slot); assert.ok(X.SRS_ID.test(rs.id));
  assert.throws(() => W.toReviewSentence(W.build([rawOrder()])[0]), /only completion/);
  assert.throws(() => X.buildComplete(Object.assign({}, it, { slot: "zzz" }), rng(1)), /slot is not a word/);
});

// ================================================================== 10. scoring and the 70% pass mark
test("pass mark: 69% fails and 70% passes; the percent is the same rounded value Phase 3 stores", () => {
  const pct = (c, n) => X.scoreResults(Array.from({ length: n }, (_, i) => ({ correct: i < c, graded: true }))).percent;
  assert.equal(pct(7, 10), 70); assert.equal(X.passes(70), true); assert.equal(pct(9, 13), 69); assert.equal(X.passes(69), false);
  for (const [c, n, pass] of [[6, 8, true], [5, 8, false], [7, 9, true], [6, 9, false], [5, 7, true], [4, 7, false], [4, 6, false], [5, 6, true], [4, 5, true], [3, 5, false]]) assert.equal(X.passes(pct(c, n)), pass, c + "/" + n);
  assert.equal(pct(139, 200), 70, "characterisation: the shared rule rounds, so 69.5% counts as 70% (same as Phase 3; unreachable at 4 to 10 questions)");
  assert.equal(X.scoreResults([]).total, 0);
});
test("pass mark and best score are enforced by the EXISTING store: 69 does not complete, 70 does, best never decreases, first pass time is kept", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock);
  assert.equal(P.UNIT_PASS["read-s1"], X.PASS_PERCENT);
  st.recordUnit("read-s1", 69); assert.equal(st.unitDone("read-s1"), false);
  st.recordUnit("read-s1", 70); assert.equal(st.unitDone("read-s1"), true); const at = st.unit("read-s1").at;
  clock.t += DAY; st.recordUnit("read-s1", 40); assert.equal(st.unit("read-s1").best, 70, "a worse retry never lowers the best score"); assert.equal(st.unit("read-s1").at, at);
  st.recordUnit("read-s1", 100); assert.equal(st.unit("read-s1").best, 100); assert.equal(st.unit("read-s1").tries, 4);
  st.recordUnit("story-s1-not-yet-registered", 100); assert.equal(st.unit("story-s1-not-yet-registered"), null, "ids that are not in the catalogue are ignored until the integration milestone registers them");
});

// ================================================================== 11. REVIEW POLICY (H-1 and H-2)
test("review contract constants are explicit and the workshop notice reuses the exact Phase 3 sentence", () => {
  assert.deepEqual(X.REVIEW_POLICY, { vocabularyInContext: "misses-only", workshopSentences: "all-answers" }); assert.ok(Object.isFrozen(X.REVIEW_POLICY) && Object.isFrozen(X.REVIEW_NOTICE));
  assert.equal(X.REVIEW_NOTICE.workshopSentences, "Your answers schedule these sentences for review.");
  assert.ok(read("assets/js/learn/app.js").includes(X.REVIEW_NOTICE.workshopSentences), "the same words already appear in Phase 3 sentence practice");
  assert.ok(/Correct answers do not change it/.test(X.REVIEW_NOTICE.vocabularyInContext));
  assert.equal(W.REVIEW_NOTICE.workshopSentences, X.REVIEW_NOTICE.workshopSentences);
});
const vc = (id, ok, rid = "num-0") => { const b = X.buildQuestion({ id, type: "vocab-context", prompt: "p", line: 1, word: "ا", options: ["a", "b", "c"], reviewItemId: rid, explanation: "e" }, rng(1)); return X.makeResult(b, { graded: true, correct: ok }); };
const cp = (id, sid, ok) => { const it = W.build([rawComplete(id, sid)])[0]; return X.makeResult(X.buildComplete(it, rng(1)), { graded: true, correct: ok }); };
const known = id => !!R.kindOf(id), anyKnown = () => true;
test("H-1 vocabulary in context: a wrong answer yields a miss row for the existing id; a correct answer yields NOTHING", () => {
  assert.deepEqual(X.reviewRowsFor([vc("a", false, "num-1")], { isKnownId: known }), [{ id: "num-1", correct: false }]);
  assert.deepEqual(X.reviewRowsFor([vc("a", true, "num-1")], { isKnownId: known }), []);
  assert.deepEqual(X.reviewRowsFor([vc("a", true, "num-0"), vc("b", false, "num-1"), vc("c", true, "num-2")], { isKnownId: known }), [{ id: "num-1", correct: false }]);
  assert.deepEqual(X.reviewRowsFor([vc("a", false, null)], { isKnownId: anyKnown }), [], "no linked vocabulary id, no row");
});
test("H-1: the stored result carries itemId ONLY on a miss, so the existing finish() mapping records exactly the same rows", () => {
  const results = [vc("a", true, "num-0"), vc("b", false, "num-1"), vc("c", false, "num-2"), vc("d", true, "num-3")];
  assert.ok(!("itemId" in results[0].q) && !("itemId" in results[3].q)); assert.equal(results[1].q.itemId, "num-1");
  assert.deepEqual(finishRows(results), X.reviewRowsFor(results, { isKnownId: known }));
  assert.deepEqual(finishRows(results), [{ id: "num-1", correct: false }, { id: "num-2", correct: false }]);
});
test("H-2 workshop sentences: BOTH correct and wrong answers are recorded, like Phase 3 sentence practice", () => {
  const rows = X.reviewRowsFor([cp("bw-2-01", "snt-st-a-1", true), cp("bw-2-02", "snt-st-a-2", false)], { isKnownId: anyKnown });
  assert.deepEqual(rows, [{ id: "snt-st-a-1", correct: true }, { id: "snt-st-a-2", correct: false }]);
  assert.deepEqual(finishRows([cp("bw-2-01", "snt-st-a-1", true)]), [], "until the integration milestone adds the ids to the review catalogue, the existing mapping would drop them (R.kindOf)");
});
test("review rows: only these two cases ever produce rows; order, match, true/false, short, mcq and reveal never do, even with stray ids", () => {
  const stray = { itemId: "num-5", reviewItemId: "num-5", sentenceId: "snt-st-x-1" };
  const mk = (q, ok) => ({ letterId: null, correct: ok, graded: true, q: Object.assign({}, stray, q) });
  const results = [mk({ type: "order" }, true), mk({ type: "order" }, false), mk({ type: "match" }, false), mk({ type: "tf" }, false), mk({ type: "short" }, false), mk({ type: "mcq" }, false), mk({ type: "mcq" }, true),
    { letterId: null, correct: null, graded: false, q: Object.assign({}, stray, { type: "reveal" }) }];
  assert.deepEqual(X.reviewRowsFor(results, { isKnownId: anyKnown }), []);
});
test("review rows: unknown or malformed ids are dropped; isKnownId is required (fail closed); a miss wins over a repeat", () => {
  assert.deepEqual(X.reviewRowsFor([vc("a", false, "zzz-not-a-word")], { isKnownId: known }), [], "not in the review catalogue");
  assert.deepEqual(X.reviewRowsFor([vc("a", false, "BAD ID")], { isKnownId: anyKnown }), [], "fails the review id rule");
  assert.deepEqual(X.reviewRowsFor([vc("a", false, "x".repeat(41))], { isKnownId: anyKnown }), [], "over 40 characters");
  assert.throws(() => X.reviewRowsFor([vc("a", false)], {}), /isKnownId/); assert.throws(() => X.reviewRowsFor([vc("a", false)]), /isKnownId/);
  assert.deepEqual(X.reviewRowsFor([cp("bw-2-01", "snt-st-a-1", true), cp("bw-2-02", "snt-st-a-1", false)], { isKnownId: anyKnown }), [{ id: "snt-st-a-1", correct: false }]);
});

// ---- policy against the REAL progress store, review catalogue and journey
const topic = (() => { const g = {}; V.ITEMS.filter(i => i.reg === "msa").forEach(i => (g[i.topic] = g[i.topic] || []).push(i.id)); return Object.values(g).sort((a, b) => b.length - a.length)[0]; })();
test("H-1 against the real store: 100% correct vocabulary-in-context answers create NO review entry and leave the journey exactly as it was", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock), before = journeyOf(st);
  const results = topic.map((id, i) => vc("q" + i, true, id)), rows = X.reviewRowsFor(results, { isKnownId: known });
  assert.deepEqual(rows, []); st.reviewAnswers(rows);
  for (const id of topic) assert.equal(st.srsEntry(id), null, id);
  assert.equal(journeyOf(st), before, "journey unchanged");
  clock.t += 3 * DAY; assert.deepEqual(st.dueIds(R.ALL_IDS), [], "nothing is due");
});
test("control: the SAME words answered through ordinary practice DO move the journey, so the guard above is meaningful", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock), before = journeyOf(st);
  st.reviewAnswers(topic.map(id => ({ id, correct: true })));
  assert.notEqual(journeyOf(st), before, "ordinary correct practice makes words 'known' and changes journey progress");
});
test("H-1 against the real store: a miss enters the review queue at box 1 (due tomorrow) and does NOT change the journey", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock), before = journeyOf(st);
  const results = topic.map((id, i) => vc("q" + i, false, id)); st.reviewAnswers(X.reviewRowsFor(results, { isKnownId: known }));
  const today = Math.floor(clock.t / DAY);
  for (const id of topic) { const e = st.srsEntry(id); assert.equal(e.b, 1, id); assert.equal(e.l, today); assert.equal(e.d, today + 1, "due tomorrow (the store keeps UTC day numbers)"); }
  assert.equal(journeyOf(st), before, "box 1 is not 'known', so the journey is untouched");
  assert.ok(!st.dueIds(R.ALL_IDS).includes(topic[0]), "not due today"); clock.t += DAY; assert.ok(st.dueIds(R.ALL_IDS).includes(topic[0]), "due tomorrow");
});
test("H-1 against the real store: a correct in-context answer never advances a word that is already scheduled", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock), id = topic[0];
  st.reviewAnswers([{ id, correct: false }]); clock.t += 2 * DAY; const before = JSON.stringify(st.srsEntry(id));
  st.reviewAnswers(X.reviewRowsFor([vc("q", true, id)], { isKnownId: known }));
  assert.equal(JSON.stringify(st.srsEntry(id)), before, "entry unchanged by a correct in-context answer");
});
test("H-2 against the real store: correct and wrong workshop answers follow the established sentence semantics and do not touch the journey", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = newStore(clock), before = journeyOf(st);
  st.reviewAnswers(X.reviewRowsFor([cp("bw-2-01", "snt-st-a-1", true), cp("bw-2-02", "snt-st-a-2", false)], { isKnownId: anyKnown }));
  const day = Math.floor(clock.t / DAY), ok = st.srsEntry("snt-st-a-1"), no = st.srsEntry("snt-st-a-2"), g1 = SRS.grade(undefined, true, day), g2 = SRS.grade(undefined, false, day);
  assert.deepEqual(ok, g1, "a first correct answer is graded exactly as the SRS grades a first correct answer"); assert.deepEqual(no, g2);
  assert.equal(ok.b, 2); assert.equal(no.b, 1);
  assert.equal(journeyOf(st), before, "sentence ids are not read by the journey");
});

// ================================================================== 12. frozen IDs and learner-record preservation
test("frozen ids: every Phase 1-3 id still exists, in the same place (additions allowed, removals and renames are not)", () => {
  const live = { letters: L("data").LETTERS.map(x => x.id), vocab: V.ITEMS.map(x => x.id), patterns: V.PATTERNS.map(x => x.id), patternItems: V.PATTERN_ITEMS.map(x => x.id),
    conversationUnits: C.UNITS.map(x => x.id), conversationSentences: C.SENTENCE_ITEMS.map(x => x.id), readingPassages: RD.PASSAGES.map(x => x.id),
    readingQuestions: RD.PASSAGES.flatMap(p => p.questions.map((q, i) => p.id + "-q" + (i + 1))), journeyStages: J.STAGES.map(x => x.id),
    unitIds: P.UNIT_IDS, lessonIds: P.LESSON_IDS, reviewIds: R.ALL_IDS };
  for (const [k, ids] of Object.entries(live)) { const set = new Set(ids); for (const id of FROZEN[k]) assert.ok(set.has(id), k + " lost " + id); }
  assert.deepEqual(FROZEN.journeyStages, J.STAGES.map(x => x.id), "the eight journey stages are unchanged and in order");
  assert.deepEqual(FROZEN.readingPassages, RD.PASSAGES.map(x => x.id));
  for (const [k, n] of Object.entries({ letters: 28, vocab: 310, patterns: 4, patternItems: 12, conversationUnits: 8, conversationSentences: 21, readingPassages: 8, readingQuestions: 32, journeyStages: 8, unitIds: 22, reviewIds: 371 })) assert.equal(FROZEN[k].length, n, k);
});
test("frozen reading: the eight Phase 3 passages are byte-for-byte unchanged (a deliberate, reviewed correction must update the fixture)", () => {
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(RD.PASSAGES)).digest("hex"), FROZEN.readingDigest);
  assert.equal(RD.PASSAGES.length, 8); assert.equal(RD.PASSAGES.reduce((n, p) => n + p.questions.length, 0), 32); assert.equal(RD.PASS_PERCENT, 70);
});
test("ids never collide: Phase 4 id shapes cannot equal any frozen id, and the validators reject a collision", () => {
  for (const id of ["story-s1-a", "story-s2-a", "story-s3-a", "build-set-1", "build-set-2", "build-set-3", "bw-1-01", "snt-st-a-1", "st-a-1"]) assert.ok(!RESERVED.has(id), id);
  assert.ok(S.validateStories([builtStory(1, "a")], { vocabIds: VOCAB_IDS, reservedIds: new Set(["story-s1-a"]) }).some(m => /collides/.test(m)));
  assert.ok(W.validateCatalog(W.build([rawComplete("bw-2-01", "snt-intro-1")]), { reservedIds: RESERVED }).some(m => /collides/.test(m)), "a sentence id equal to a Phase 3 one is rejected");
});
test("Phase 3 learner record: loads unchanged, nothing is dropped, saving it back is a no-op, and Phase 4 modules do not touch it", () => {
  const fx = fixture("phase3-learner-progress.json"), storage = memStorage(); storage.setItem(fx.storageKey, JSON.stringify(fx.stored));
  const clock = { t: Date.parse(fx.clock.reviewUtc) }, st = newStore(clock, storage);
  assert.equal(st.unit("read-s1").best, 100, "best score kept (a later 40 never lowered it)"); assert.equal(st.unitDone("read-s1"), true); assert.equal(st.unitDone("read-s2"), true);
  assert.equal(st.unit("read-p1").best, 50); assert.equal(st.unitDone("read-p1"), false); assert.equal(st.unitDone("conv-intro"), true); assert.equal(st.unitDone("conv-family"), false);
  assert.ok(st.srsEntry("food-tea") && st.srsEntry("food-milk") && st.srsEntry(C.SENTENCE_ITEMS[0].id));
  for (const id of Object.keys(fx.stored.units)) assert.ok(P.UNIT_IDS.includes(id), id);
  const clean = P.sanitize(clone(fx.stored), clock.t); assert.deepEqual(clean.units, fx.stored.units); assert.deepEqual(clean.srs, fx.stored.srs); assert.equal(clean.v, fx.stored.v); assert.equal(clean.v, 2, "progress schema stays at v2");
  const journey = journeyOf(st); X.reviewRowsFor([vc("a", true)], { isKnownId: known }); W.build([rawOrder()]); S.build([rawStory(1, "z")]);
  assert.equal(journeyOf(st), journey); assert.deepEqual(JSON.parse(storage.getItem(fx.storageKey)).units, fx.stored.units);
});
test("journey: still exactly eight stages, and the reading stage still has one step per existing passage", () => {
  assert.equal(J.STAGES.length, 8);
  const j = J.build({ lessonDone: () => false, unitDone: () => false, unit: () => null, srsEntry: () => null });
  assert.equal(j.stages.length, 8); const rs = j.stages.find(s => s.id === "comprehension"); assert.ok(rs, "comprehension stage"); assert.equal(rs.steps.length, RD.PASSAGES.length);
});

// ================================================================== 13. story validator
test("story fixtures built from existing text are valid in every band (proves the validator accepts a well-formed story)", () => {
  for (const band of [1, 2, 3]) { const s = builtStory(band, "ok" + band); assert.deepEqual(problems(s), [], "band " + band + ": " + problems(s).join(" | ")); }
  const s1 = builtStory(1), s3 = builtStory(3, "fixture3");
  assert.equal(s1.marks, true); assert.equal(s3.marks, false); assert.equal(s1.lines[0].audioKey, "st-fixture-1"); assert.equal(s1.questions[0].id, "story-s1-fixture-q1");
  assert.ok(s1.lines.every(l => l.plain === X.strip(l.ar) && l.tokens.length === X.tokens(l.plain).length));
  assert.ok(s1.glossary[0].vocabId === "num-0" && s1.glossary[0].isNew === false && s1.glossary[1].isNew === true); assert.equal(s1.newWordCount, 2);
});
test("story validator: every rule fails for the right reason", () => {
  const expect = (mut, re, band = 1) => { const m = problems(builtStory(band, "bad", mut)); assert.ok(m.some(x => re.test(x)), re + " not reported; got: " + m.join(" | ")); };
  expect(r => { r.id = "story-s1-" + "x".repeat(30); }, /at most 32/); expect(r => { r.id = "Story_S1"; }, /id must look like/); expect(r => { r.id = "story-s2-bad"; }, /does not match its band/);
  expect(r => { r.title = ""; }, /title is empty/); expect(r => { r.intro = " "; }, /intro is empty/);
  expect(r => { r.lines.pop(); r.lines.pop(); }, /needs 5–7 lines/); expect(r => { r.lines.push(...r.lines.slice(0, 3)); }, /needs 5–7 lines/);
  expect(r => { r.lines = r.lines.map(l => [l[0].split(" ")[0], l[1], l[2]]); }, /needs 25–45 words/);
  expect(r => { r.lines[0][0] = r.lines[0][0] + " Latin"; }, /Latin letters/); expect(r => { r.lines[0][1] = "ب"; }, /transliteration/); expect(r => { r.lines[0][2] = "ب"; }, /English missing or contains Arabic/);
  expect(r => { r.lines[0][0] = ""; }, /no Arabic text/);
  { const s = builtStory(1, "nfc"); s.lines[0].ar = "ا\u0653"; assert.ok(problems(s).some(m => /not NFC/.test(m)), "a non-NFC line is reported"); }
  { const s = builtStory(1, "pl"); s.lines[0].plain = s.lines[0].ar; assert.ok(problems(s).some(m => /plain does not equal/.test(m)), "plain must equal the text without harakat"); }
  { const s = builtStory(1, "tk"); s.lines[0].tokens.pop(); assert.ok(problems(s).some(m => /do not line up/.test(m)), "token alignment"); }
  expect(r => { r.glossary = []; }, /glossary is empty/); expect(r => { r.glossary[0].vocabId = "no-such-word"; }, /not an existing vocabulary id/);
  expect(r => { r.glossary[1].ar = "ظظظظ"; }, /does not occur in the story/); expect(r => { r.glossary.push(Object.assign({}, r.glossary[1])); }, /repeats a word/);
  expect(r => { r.vocab = ["num-0", "num-0"]; }, /distinct, existing/); expect(r => { r.vocab = ["nope"]; }, /distinct, existing/);
  expect(r => { r.questions = r.questions.slice(0, 5); }, /needs 6–9 questions/); expect(r => { r.questions = r.questions.filter(q => q.type !== "vocab-context"); r.questions.push({ type: "tf", prompt: "p", answer: true, explanation: "e" }); }, /vocabulary-in-context/);
  expect(r => { r.questions = r.questions.map(q => (q.type === "reveal" || q.type === "tf" || q.type === "match" || q.type === "short") ? { type: "mcq", prompt: "p", options: ["a", "b", "c"], explanation: "e" } : q); }, /different question types/);
  expect(r => { r.questions = r.questions.map(q => q.type === "mcq" || q.type === "short" ? { type: "reveal", prompt: "p", model: "m" } : q); }, /graded questions/);
});
test("story validator: new-word caps are 6, 8 and 12 by band (new word = glossary entry without an existing vocabulary id)", () => {
  const withNew = (band, n) => builtStory(band, "caps" + band + n, r => { r.glossary = [r.glossary[0]]; const toks = []; for (const l of r.lines) for (const t of X.tokens(l[0])) { const c = X.cleanTyped(t); if (X.hasArabic(c) && !toks.some(x => E.normalizeAr(x) === E.normalizeAr(c)) && c !== r.glossary[0].ar) toks.push(c); } for (let i = 0; i < n; i++) r.glossary.push({ ar: toks[i], translit: "t", en: "e" }); });
  for (const [band, cap] of [[1, 6], [2, 8], [3, 12]]) {
    assert.ok(!problems(withNew(band, cap)).some(m => /new words/.test(m)), "band " + band + " allows " + cap);
    assert.ok(problems(withNew(band, cap + 1)).some(m => /more than \d+ new words/.test(m)), "band " + band + " rejects " + (cap + 1));
  }
});
test("question validator: each type's rules, including Arabic/RTL safety (no mixed Arabic and English in one option, flags match the text)", () => {
  const ctx = { vocabIds: VOCAB_IDS, lines: builtStory(1).lines }, ok = q => X.validateQuestion(Object.assign({ id: "q" }, q), ctx);
  const has = (q, re) => assert.ok(ok(q).some(m => re.test(m)), re + " in " + JSON.stringify(ok(q)));
  assert.deepEqual(ok({ type: "mcq", prompt: "p", options: ["a", "b", "c"], explanation: "e" }), []);
  has({ type: "mcq", prompt: "p", options: ["a", "b"], explanation: "e" }, /3 or 4/); has({ type: "mcq", prompt: "p", options: ["a", "a", "c"], explanation: "e" }, /repeat/);
  has({ type: "mcq", prompt: "p", options: ["أ", "ب", "ج"], explanation: "e" }, /arabicOptions/); has({ type: "mcq", prompt: "p", options: ["ب (here you are)", "ب", "ج"], arabicOptions: true, explanation: "e" }, /Arabic only/);
  has({ type: "mcq", prompt: "p", options: ["مَدْرَسَة", "مدرسة", "ج"], arabicOptions: true, explanation: "e" }, /repeat/);
  has({ type: "mcq", prompt: "p", options: ["a", "b", "c"] }, /explanation/); has({ type: "tf", prompt: "p", answer: "true", explanation: "e" }, /true or false/);
  has({ type: "match", prompt: "p", pairs: [["أ", "x"]], explanation: "e" }, /2 to 4/); has({ type: "match", prompt: "p", pairs: [["أ", "x"], ["ب", "x"]], arLeft: true, explanation: "e" }, /right items repeat/);
  has({ type: "match", prompt: "p", pairs: [["أ", "x"], ["ب", "y"]], explanation: "e" }, /arLeft/); has({ type: "match", prompt: "p", pairs: [["أ", "x"], ["ب", "y"]], arLeft: true, arRight: true, explanation: "e" }, /arRight/);
  has({ type: "short", prompt: "p", accept: ["abc"], explanation: "e" }, /Arabic accepted/); has({ type: "short", prompt: "p", accept: ["أب", "اب"], explanation: "e" }, /repeat/); has({ type: "short", prompt: "p", accept: [], explanation: "e" }, /1 to 6/);
  has({ type: "short", prompt: "p", accept: ["؟"], explanation: "e" }, /Arabic accepted|1 to 6/);
  has({ type: "reveal", prompt: "p" }, /model answer/);
  const base = { type: "vocab-context", prompt: "p", line: 1, word: X.cleanTyped(X.tokens(ctx.lines[0].ar)[0]), options: ["a", "b", "c"], explanation: "e" };
  assert.deepEqual(ok(base), []); assert.deepEqual(ok(Object.assign({}, base, { reviewItemId: "num-0" })), []);
  has(Object.assign({}, base, { line: 99 }), /line does not exist/); has(Object.assign({}, base, { word: "ظظظ" }), /not a word of that line/);
  has(Object.assign({}, base, { reviewItemId: "no-such-word" }), /existing vocabulary id/); has(Object.assign({}, base, { itemId: "num-0" }), /itemId must not be set/);
  has({ type: "essay", prompt: "p" }, /unknown type/); has({ type: "mcq", prompt: "", options: ["a", "b", "c"], explanation: "e" }, /prompt/);
});
test("catalogue validator: duplicate ids across stories, band-to-band difficulty, and the first-release shape", () => {
  const a = builtStory(1, "a"), dup = builtStory(1, "a");
  assert.ok(S.validateStories([a, dup], CTX).some(m => /duplicate id/.test(m)));
  assert.ok(S.validateStories([builtStory(1, "p"), builtStory(2, "q")], CTX).filter(m => /shorter than/.test(m)).length === 0, "increasing difficulty is fine");
  const big1 = builtStory(1, "big"); big1.lines = big1.lines.concat(big1.lines.slice(0, 2)); big1.wordCount = S.countWords(big1.lines);
  const small2 = builtStory(2, "small"); small2.lines = small2.lines.slice(0, 7); small2.wordCount = 10;
  assert.ok(S.validateStories([big1, small2], CTX).some(m => /band 2 is shorter than band 1/.test(m)));
  const set = [1, 2, 3].flatMap(b => [1, 2, 3, 4].map(n => builtStory(b, "s" + b + "n" + n)));
  assert.deepEqual(S.validateStories(set, CTX, { complete: true }), [], S.validateStories(set, CTX, { complete: true }).join(" | "));
  assert.ok(S.validateStories(set.slice(1), CTX, { complete: true }).some(m => /band 1 needs 4 stories/.test(m)));
});

// ================================================================== 14. workshop validator
test("workshop fixtures built from existing text are valid, and the three set definitions are fixed", () => {
  const items = W.build([rawOrder("bw-1-01", 0), rawMatch("bw-1-02"), rawComplete("bw-2-01"), Object.assign(rawOrder("bw-2-02", 1), { set: 2 }), Object.assign(rawComplete("bw-3-01", "snt-st-fixture-2"), { set: 3 }), Object.assign(rawMatch("bw-3-02"), { set: 3 })]);
  for (const it of items) assert.deepEqual(W.validateItem(it, CTX), [], it.id + ": " + W.validateItem(it, CTX).join(" | "));
  assert.deepEqual(W.validateCatalog(items, CTX), []);
  assert.deepEqual(W.SETS.map(s => s.kinds.join("+")), ["order+match", "order+complete", "complete+match"]);
});
test("workshop validator: every rule fails for the right reason", () => {
  const expect = (raw, re) => { const m = W.validateItem(W.build([raw])[0], CTX); assert.ok(m.some(x => re.test(x)), re + " not reported; got: " + m.join(" | ")); };
  expect(Object.assign(rawOrder(), { id: "bw-2-01" }), /id does not match its set/); expect(Object.assign(rawOrder(), { id: "x1" }), /id must look like/); expect(Object.assign(rawOrder(), { set: 4 }), /set must be/);
  expect(Object.assign(rawComplete("bw-1-03"), { set: 1 }), /kind complete is not used in build-set-1/); expect(Object.assign(rawOrder(), { status: "x" }), /status must be exactly/);
  expect(Object.assign(rawOrder(), { translit: "" }), /transliteration/); expect(Object.assign(rawOrder(), { en: "ب" }), /English/);
  expect(Object.assign(rawOrder(), { accept: [["ا", "ب"]] }), /3 to 8 single Arabic words/); expect(Object.assign(rawOrder(), { accept: [orderTokens(0), orderTokens(1)] }), /same words/);
  expect(Object.assign(rawOrder(), { accept: [orderTokens(0), orderTokens(0)] }), /repeat/); expect(Object.assign(rawOrder(), { punct: "?" }), /punct/);
  expect(Object.assign(rawOrder(), { sentenceId: "snt-st-x-1" }), /only completion exercises may have a sentenceId/); expect(Object.assign(rawMatch(), { sentenceId: "snt-st-x-1" }), /only completion exercises may have a sentenceId/);
  expect(Object.assign(rawComplete(), { sentenceId: "snt-intro-9" }), /sentenceId must look like snt-st-/); expect(Object.assign(rawComplete(), { sentenceId: "snt-st-" + "a".repeat(40) }), /at most 40/);
  expect(Object.assign(rawComplete(), { slot: "ظظظ" }), /exactly one word/); expect(Object.assign(rawComplete(), { pool: ["ا"] }), /2 or 3/);
  expect(Object.assign(rawComplete(), { pool: [C.SENTENCE_ITEMS[0].slot.normalize("NFC"), "ب", "ج"] }), /repeats the slot/);
  expect(Object.assign(rawComplete(), { pool: [X.strip(C.SENTENCE_ITEMS[0].slot), "ب", "ج"] }), /repeats the slot/);
  expect(Object.assign(rawMatch(), { pairs: rawMatch().pairs.slice(0, 1) }), /2 to 4/); expect(Object.assign(rawMatch(), { pairs: [["ا", "ب", "ب"], ["ج", "د", "x"]] }), /English translation/);
  expect(Object.assign(rawMatch(), { pairs: [["ا", "ب", "x"], ["ا", "د", "y"]] }), /first halves repeat/); expect(Object.assign(rawMatch(), { pairs: [["ا", "ب", "x"], ["ج", "ب", "y"]] }), /second halves repeat/);
});
test("workshop catalogue: unique ids and sentence ids, collisions rejected, 8 per set in the first-release shape", () => {
  const a = W.build([rawOrder("bw-1-01", 0), rawOrder("bw-1-01", 1)]); assert.ok(W.validateCatalog(a, CTX).some(m => /duplicate id bw-1-01/.test(m)));
  const b = W.build([rawComplete("bw-2-01", "snt-st-dup-1"), rawComplete("bw-2-02", "snt-st-dup-1")]); assert.ok(W.validateCatalog(b, CTX).some(m => /duplicate id snt-st-dup-1/.test(m)));
  const full = []; for (const s of [1, 2, 3]) for (let n = 1; n <= 8; n++) { const id = "bw-" + s + "-0" + n; full.push(s === 1 ? (n % 2 ? Object.assign(rawOrder(id, n), { set: 1 }) : Object.assign(rawMatch(id), { set: 1 })) : s === 2 ? (n % 2 ? Object.assign(rawOrder(id, n), { set: 2 }) : Object.assign(rawComplete(id, "snt-st-w2-" + n), { set: 2 })) : (n % 2 ? Object.assign(rawComplete(id, "snt-st-w3-" + n), { set: 3 }) : Object.assign(rawMatch(id), { set: 3 }))); }
  const items = W.build(full); assert.equal(items.length, 24);
  assert.deepEqual(W.validateCatalog(items, CTX, { complete: true }), [], W.validateCatalog(items, CTX, { complete: true }).join(" | "));
  assert.ok(W.validateCatalog(items.slice(1), CTX, { complete: true }).some(m => /build-set-1 needs 8/.test(m)));
  assert.ok(W.validateCatalog(items.concat(W.build([Object.assign(rawOrder("bw-1-09", 2), { set: 1 })])), CTX).some(m => /more than 8/.test(m)));
});

// ================================================================== 16. Milestone 2 pure logic: finish package, workshop exercises, content gating
test("finishPackage: only explicitly graded results enter; the package is deeply frozen without freezing source results", () => {
  const graded = [
    vc("a", true, "num-0"),
    vc("b", false, "num-1")
  ];

  const revealQuestion = X.buildQuestion({
    id: "r",
    type: "reveal",
    prompt: "p",
    model: "m"
  });
  const reveal = X.makeResult(
    revealQuestion,
    X.gradeAnswer(revealQuestion, null)
  );

  const all = graded.concat([reveal]);
  const expectedRows = X.reviewRowsFor(all, { isKnownId: known });
  const pkg = X.finishPackage(all, { isKnownId: known });

  const isDeeplyFrozen = (value, seen = new Set()) => {
    if (value === null || typeof value !== "object") return true;
    if (seen.has(value)) return true;
    if (!Object.isFrozen(value)) return false;
    seen.add(value);
    return Reflect.ownKeys(value).every(key => isDeeplyFrozen(value[key], seen));
  };

  assert.equal(pkg.results.length, 2, "the reveal is excluded");
  assert.ok(pkg.results.every(r => r.graded === true));
  assert.deepEqual(pkg.reviewRows, expectedRows);
  assert.deepEqual(pkg.reviewRows, [{ id: "num-1", correct: false }]);
  assert.ok(isDeeplyFrozen(pkg), "every nested object and array is frozen");

  assert.equal(Object.isFrozen(graded[0]), false);
  assert.equal(Object.isFrozen(graded[0].q), false);
  assert.equal(Object.isFrozen(graded[0].q.options), false);

  // Changing the original nested session data cannot alter the finished package.
  const originalOption = graded[0].q.options[0].label;
  graded[0].q.options[0].label = "source-mutated";
  assert.equal(pkg.results[0].q.options[0].label, originalOption);

  assert.equal(X.scoreResults(pkg.results).total, 2);
  assert.equal(X.isFinishPackage(pkg), true);
  assert.throws(
    () => X.finishPackage(graded, {}),
    /isKnownId/,
    "no review rows without the catalogue check"
  );
  assert.equal(X.finishPackage([], { isKnownId: known }).results.length, 0);
});test("isFinishPackage rejects anything that is not exactly what finishPackage makes", () => {
  const good = X.finishPackage([vc("a", false, "num-1")], { isKnownId: known });
  for (const bad of [null, undefined, 5, "x", [], {}, { v: 1, results: [], reviewRows: [] }, Object.freeze({ v: 2, results: Object.freeze([]), reviewRows: Object.freeze([]) }),
    Object.freeze({ v: 1, results: [], reviewRows: Object.freeze([]) }), Object.freeze({ v: 1, results: Object.freeze([]), reviewRows: [] }),
    Object.freeze({ v: 1, results: Object.freeze([Object.freeze({ correct: null, graded: false, q: {} })]), reviewRows: Object.freeze([]) }),
    Object.freeze({ v: 1, results: Object.freeze([]), reviewRows: Object.freeze([Object.freeze({ id: "BAD ID", correct: false })]) }),
    Object.freeze({ v: 1, results: Object.freeze([Object.freeze({ correct: true, q: {} })]), reviewRows: Object.freeze([Object.freeze({ id: "num-1" })]) }),
    Object.assign({}, good)]) assert.equal(X.isFinishPackage(bad), false, JSON.stringify(bad));
  assert.equal(X.isFinishPackage(good), true);
});
test("workshop: buildExercise gives each kind its runnable question, and only completion items become review sentences", () => {
  const items = W.build([rawOrder("bw-1-01", 0), rawMatch("bw-1-02"), rawComplete("bw-2-01", "snt-st-fixture-1")]);
  assert.equal(W.buildExercise(items[0], rng(1)).type, "order"); assert.equal(W.buildExercise(items[2], rng(1)).type, "complete");
  const m = W.buildExercise(items[1], rng(1)); assert.equal(m.type, "match"); assert.ok(m.arLeft && m.arRight); assert.ok(/—/.test(m.explanation), "explanation carries each pair's English");
  assert.throws(() => W.buildExercise({ kind: "essay" }), /Unknown exercise kind/);
  assert.equal(W.reviewSentences().length, 0, "the shipped catalogue is empty");
  W.ITEMS.push(...items); try { const rs = W.reviewSentences(); assert.deepEqual(rs.map(r => r.id), ["snt-st-fixture-1"]); assert.equal(W.hasContent(), true); } finally { W.ITEMS.length = 0; }
  assert.equal(W.hasContent(), false); assert.equal(S.hasContent(), false);
});

// ================================================================== 15. fixtures themselves
test("fixtures: both exist, are labelled synthetic or generated, and hold the expected shape", () => {
  assert.equal(FROZEN.generatedFrom, "67dca19"); assert.ok(/never remove, rename or reuse/.test(FROZEN._note));
  const fx = fixture("phase3-learner-progress.json"); assert.ok(/SYNTHETIC/.test(fx._note)); assert.equal(fx.stored.v, 2); assert.equal(fx.storageKey, P.KEY);
});
