// Phase 4 (Milestone 2) integration tests: registration in the review catalogue and the progress store, rollback safety, learner-record preservation,
// the single-call-site review guard, content gating, protected Phase 1-3 files, and markup invariants of the new pages.
// Course content is still EMPTY. Where a test needs content it injects structural fixtures built from existing Phase 3 text into a FRESH copy of the modules.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { rawStory, rawOrder, rawComplete, rawMatch } from "./fixtures/phase4-fixtures.mjs";
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LEARN = path.join(REPO, "assets/js/learn") + path.sep;
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
const fixture = f => JSON.parse(read("tests/learn/fixtures/" + f));
const FROZEN = fixture("phase3-frozen-ids.json"), LEARNER = fixture("phase3-learner-progress.json"), PROTECTED = fixture("protected-files.json");
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 86400000;
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const code = f => stripComments(read(f));

// A FRESH copy of every learn module (so injecting fixture content never leaks into other tests), loaded in the same order as the page.
function fresh(configure) {
  const drop = () => Object.keys(require.cache).filter(k => k.startsWith(LEARN)).forEach(k => delete require.cache[k]);
  drop();
  const M = { E: require(LEARN + "engine.js"), X: require(LEARN + "exercises.js"), S: require(LEARN + "stories.js"), W: require(LEARN + "sentences.js"), C: require(LEARN + "conversations.js"), RD: require(LEARN + "reading.js") };
  if (configure) configure(M);
  M.R = require(LEARN + "review.js"); M.J = require(LEARN + "journey.js"); M.P = require(LEARN + "progress.js"); M.U = require(LEARN + "stories-ui.js"); M.SRS = require(LEARN + "srs.js");
  drop();
  return M;
}
const withStories = (...specs) => M => { M.S.STORIES.push(...M.S.build(specs.map(([b, s]) => rawStory(b, s)))); };
const withItems = (...raws) => M => { M.W.ITEMS.push(...M.W.build(raws)); };
const both = (...fns) => M => fns.forEach(f => f(M));

function memStorage(initial) { const m = new Map(); if (initial !== undefined) m.set(LEARNER.storageKey, initial); const log = []; return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { log.push(k); m.set(k, String(v)); }, removeItem: k => m.delete(k), _m: m, log }; }
const store = (M, clock, storage) => { const st = M.P.createStore(storage || memStorage(), () => clock.t); st.load(); return st; };
const journeyOf = (M, st) => JSON.stringify(M.J.build({ lessonDone: st.isDone, unitDone: st.unitDone, unit: st.unit, srsEntry: st.srsEntry }));

// ================================================================== 1. empty catalogues change NOTHING
test("with empty catalogues the integration adds no id anywhere: unit ids, review ids and journey are exactly the Phase 3 ones, in the same order", () => {
  const M = fresh();
  assert.deepEqual(M.P.UNIT_IDS, FROZEN.unitIds); assert.deepEqual(M.R.ALL_IDS, FROZEN.reviewIds); assert.deepEqual(M.J.STAGES.map(s => s.id), FROZEN.journeyStages);
  assert.equal(M.P.UNIT_IDS.length, 22); assert.equal(M.R.ALL_IDS.length, 371); assert.equal(M.J.STAGES.length, 8);
  assert.deepEqual(Object.keys(M.P.UNIT_PASS), FROZEN.unitIds);
  assert.deepEqual(M.RD.PASSAGES.map(p => p.id), FROZEN.readingPassages);
});
test("content gating: no dashboard card, a neutral empty-state page, and no Phase 4 route pretends to have content", () => {
  const M = fresh(), ui = fakeUI(), ext = M.U.ext;
  assert.equal(ext.hasContent(), false); assert.equal(ext.dashboard(ui), "", "no dashboard card until content exists");
  for (const [route, p] of [["stories", ["stories"]], ["story", ["story", "story-s1-x"]], ["workshop", ["workshop"]], ["workshop", ["workshop", "1"]]]) {
    ui.calls.set.length = 0; ui.calls.notFound = 0; ext.routes[route](ui, p);
    assert.equal(ui.calls.set.length, 1, route); assert.equal(ui.calls.notFound, 0, route + " shows the empty state, not a 404");
    const html = ui.calls.set[0]; assert.ok(/not available yet/.test(html)); assert.ok(!/Draft|coming soon|soon|20\d\d|launch|released/i.test(html), "no promises, no dates");
    assert.ok(!/data-action="x-|href="#\/story\/|href="#\/workshop\/\d/.test(html), "nothing to click into");
  }
  assert.equal(ext.typingSubmit(), false, "no active run, so the app's own typing code is never skipped");
});

// ================================================================== 2. review catalogue registration
test("review catalogue: workshop sentences are APPENDED after every existing id, recognised as sentences, and usable by the existing builders", () => {
  const M = fresh(withItems(rawComplete("bw-2-01", "snt-st-fixture-1"), rawComplete("bw-2-02", "snt-st-fixture-2")));
  assert.deepEqual(M.R.ALL_IDS.slice(0, FROZEN.reviewIds.length), FROZEN.reviewIds, "every existing id keeps its place");
  assert.deepEqual(M.R.ALL_IDS.slice(FROZEN.reviewIds.length), ["snt-st-fixture-1", "snt-st-fixture-2"]); assert.equal(new Set(M.R.ALL_IDS).size, M.R.ALL_IDS.length);
  assert.equal(M.R.kindOf("snt-st-fixture-1"), "sentence"); assert.ok(/^[a-z0-9:_-]{1,40}$/.test("snt-st-fixture-1"));
  const rng = M.E.mulberry32(3), q = M.R.makePatternQuestion("p-fill", "snt-st-fixture-1", rng);
  assert.equal(q.itemId, "snt-st-fixture-1"); assert.ok(JSON.stringify(q).includes(M.R.BY_ID["snt-st-fixture-1"].slot));
  assert.equal(M.R.sentenceSession(["snt-st-fixture-1"], M.E.mulberry32(4)).length, 2, "one fill-in and one typing question, as Phase 3 sentence practice");
  assert.equal(M.R.buildReviewSession(["snt-st-fixture-2"], { "snt-st-fixture-2": { b: 1, d: 0, n: 1, w: 1, l: 0 } }, M.E.mulberry32(5)).length, 1);
});
test("review catalogue: an id that already exists is SKIPPED (an existing item and its schedules can never be replaced); ids without the snt- prefix are refused; repeats collapse", () => {
  const existing = fresh().C.SENTENCE_ITEMS[0];
  const M = fresh(withItems(rawComplete("bw-2-01", existing.id), rawComplete("bw-2-02", "snt-st-fixture-1"), rawComplete("bw-2-03", "snt-st-fixture-1"), Object.assign(rawComplete("bw-2-04", "xyz-st-1"), {})));
  assert.deepEqual(M.R.ALL_IDS.slice(FROZEN.reviewIds.length), ["snt-st-fixture-1"]);
  assert.equal(M.R.BY_ID[existing.id].unit, existing.unit, "the original Phase 3 item still owns its id"); assert.notEqual(M.R.BY_ID[existing.id].unit, "workshop");
  assert.equal(M.R.kindOf("xyz-st-1"), null);
  assert.equal(M.R.ALL_IDS.filter(id => id === existing.id).length, 1);
});
test("review: existing learners' review schedules are untouched by registration (entries stay valid and still count)", () => {
  const M = fresh(withItems(rawComplete("bw-2-01", "snt-st-fixture-1"))), clock = { t: Date.parse(LEARNER.clock.reviewUtc) };
  const storage = memStorage(JSON.stringify(LEARNER.stored)), st = store(M, clock, storage), before = JSON.stringify(LEARNER.stored.srs);
  for (const id of Object.keys(LEARNER.stored.srs)) assert.ok(M.R.ALL_IDS.includes(id), id + " is still in the catalogue");
  assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(LEARNER.stored.srs).map(id => [id, st.srsEntry(id)])))), LEARNER.stored.srs);
  assert.equal(JSON.stringify(LEARNER.stored.srs), before);
});

// ================================================================== 3. progress registration, rollback safety
test("progress: story units and workshop sets are registered only when they have content, after every existing unit, with the 70% pass mark", () => {
  const M = fresh(both(withStories([1, "a"], [2, "b"]), withItems(rawOrder("bw-1-01", 0), rawComplete("bw-2-01"))));
  assert.deepEqual(M.P.UNIT_IDS, FROZEN.unitIds.concat(["story-s1-a", "story-s2-b", "build-set-1", "build-set-2"]), "set 3 has no items, so it is not registered");
  for (const id of ["story-s1-a", "story-s2-b", "build-set-1", "build-set-2"]) assert.equal(M.P.UNIT_PASS[id], 70, id);
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, st = store(M, clock);
  st.recordUnit("story-s1-a", 69); assert.equal(st.unitDone("story-s1-a"), false); st.recordUnit("story-s1-a", 70); assert.equal(st.unitDone("story-s1-a"), true);
  st.recordUnit("story-s1-a", 30); assert.equal(st.unit("story-s1-a").best, 70, "best score is kept");
  assert.equal(st.recordUnit("build-set-3", 100), null, "an unregistered set is ignored");
});
test("progress: an existing unit id is never overridden by a Phase 4 id", () => {
  const M = fresh(M2 => { M2.S.STORIES.push(...M2.S.build([Object.assign(rawStory(1, "x"), { id: "story-s1-x" })])); });
  assert.equal(M.P.UNIT_PASS["read-s1"], 70); assert.equal(Object.keys(M.P.UNIT_PASS).filter(k => k === "read-s1").length, 1);
});
test("ROLLBACK SAFETY: a Phase 4 unit record this build does not list is kept through load and save, and comes back to life when a build lists it again", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, base = clone(LEARNER.stored);
  base.units["story-s1-lost"] = { at: 5, best: 80, tries: 2, spoke: false }; base.units["build-set-2"] = { at: 6, best: 100, tries: 1, spoke: false };
  const storage = memStorage(JSON.stringify(base)), M0 = fresh(), st0 = store(M0, clock, storage);   // an older build: lists no Phase 4 unit
  assert.deepEqual(st0.unit("story-s1-lost") && { best: st0.unit("story-s1-lost").best, complete: st0.unit("story-s1-lost").complete }, { best: 80, complete: false }, "kept but inert");
  assert.equal(st0.unitDone("story-s1-lost"), false); assert.equal(st0.recordUnit("story-s1-lost", 100), null, "an unlisted unit cannot be changed by this build");
  st0.recordUnit("read-p1", 60);   // any save
  const saved = JSON.parse(storage._m.get(LEARNER.storageKey));
  assert.deepEqual(saved.units["story-s1-lost"], { at: 5, best: 80, tries: 2, spoke: false }); assert.deepEqual(saved.units["build-set-2"], { at: 6, best: 100, tries: 1, spoke: false });
  assert.equal(saved.units["read-s1"].best, 100, "Phase 3 records still intact");
  const M1 = fresh(both(withStories([1, "lost"]), withItems(rawOrder("bw-1-01", 0), Object.assign(rawComplete("bw-2-01"), {})))), st1 = store(M1, clock, storage);   // a build that lists them again
  assert.equal(st1.unitDone("story-s1-lost"), true, "the record is live again"); assert.equal(st1.unit("story-s1-lost").best, 80); assert.equal(st1.unitDone("build-set-2"), true);
});
test("rollback safety is narrow: only exact Phase 4 id shapes survive; everything else unlisted is still dropped; the number of dormant records is capped", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, base = clone(LEARNER.stored), rec = { at: 1, best: 50, tries: 1, spoke: false };
  Object.assign(base.units, { zzz: rec, "story-s9-x": rec, "story-s1-UPPER": rec, "build-set-9": rec, "story-s1-": rec, ["story-s1-" + "a".repeat(30)]: rec, "read-zzz": rec, "conv-zzz": rec });
  base.units = JSON.parse(JSON.stringify(base.units).replace("{", '{"__proto__":{"at":1,"best":1,"tries":1},'));
  const storage = memStorage(JSON.stringify(base)), s2 = store(fresh(), clock, storage); s2.recordUnit("read-p1", 60);
  const units = JSON.parse(storage._m.get(LEARNER.storageKey)).units;
  for (const id of ["zzz", "story-s9-x", "story-s1-UPPER", "build-set-9", "story-s1-", "story-s1-" + "a".repeat(30), "read-zzz", "conv-zzz"]) assert.ok(!(id in units), id + " dropped");
  assert.ok(!Object.prototype.hasOwnProperty.call(units, "__proto__"));
  const many = clone(LEARNER.stored); for (let i = 0; i < 70; i++) many.units["story-s1-n" + i] = rec;
  const st3 = memStorage(JSON.stringify(many)), s3 = store(fresh(), clock, st3); s3.recordUnit("read-p1", 60);
  assert.equal(Object.keys(JSON.parse(st3._m.get(LEARNER.storageKey)).units).filter(k => /^story-/.test(k)).length, 60);
});

test("ROLLBACK ROUND TRIP: Phase 4 progress saved by a Phase 4 build survives REAL saves made by a build that does not know those units, and is restored when the Phase 4 build returns", () => {
  const KEY = LEARNER.storageKey, clock = { t: Date.UTC(2026, 10, 12, 9) }, storage = memStorage(JSON.stringify(LEARNER.stored));
  const content = both(withStories([1, "a"], [2, "b"]), withItems(rawOrder("bw-1-01", 0), rawComplete("bw-2-01", "snt-st-fixture-1")));
  const P4 = ["story-s1-a", "story-s2-b", "build-set-2"], saved = () => JSON.parse(storage._m.get(KEY));
  // 1. THE PHASE 4 BUILD: the learner makes real Phase 4 progress through the real store; every change is written to storage
  const A = fresh(content), a = store(A, clock, storage);
  a.recordUnit("story-s1-a", 85); clock.t += DAY; a.recordUnit("story-s1-a", 60); a.recordUnit("story-s2-b", 100); a.recordUnit("build-set-2", 70);
  a.reviewAnswers([{ id: "snt-st-fixture-1", correct: true }]);   // a workshop sentence scheduled for review
  const atRollback = saved(), p4 = o => Object.fromEntries(P4.map(id => [id, o.units[id]]));
  assert.equal(atRollback.units["story-s1-a"].best, 85); assert.equal(atRollback.units["story-s1-a"].tries, 2); assert.equal(atRollback.units["story-s2-b"].best, 100); assert.equal(atRollback.units["build-set-2"].best, 70);
  assert.ok(atRollback.srs["snt-st-fixture-1"], "the workshop sentence has a review schedule");
  const before = JSON.stringify(p4(atRollback)), srsBefore = JSON.stringify(atRollback.srs["snt-st-fixture-1"]);
  // 2. A BUILD THAT DOES NOT KNOW THEM (a rollback to a catalogue without them): a real load, real learner activity, and several REAL saves of the same storage
  const B = fresh(), b = store(B, clock, storage);
  for (const id of P4) assert.ok(!B.P.UNIT_IDS.includes(id), id + " is unknown to the rollback build");
  assert.equal(b.unitDone("story-s1-a"), false, "inert in the rollback build"); assert.equal(b.recordUnit("story-s1-a", 100), null, "the rollback build cannot change it");
  assert.equal(B.R.kindOf("snt-st-fixture-1"), null, "the rollback build's review catalogue does not list the workshop sentence either");
  clock.t += DAY;
  const saves = [() => b.recordUnit("read-p1", 90), () => b.completeLesson(B.P.LESSON_IDS[5], 100), () => b.reviewAnswers([{ id: "food-tea", correct: false }]), () => b.markSpoke("conv-intro"), () => b.recordSession("reading-comp", [{ letterId: null, correct: true }])];
  let n = 0; for (const act of saves) {
    const w0 = storage.log.filter(k => k === KEY).length; act(); n++;
    assert.ok(storage.log.filter(k => k === KEY).length > w0, "save #" + n + " really wrote the progress record");
    assert.equal(JSON.stringify(p4(saved())), before, "after rollback-build save #" + n + " every Phase 4 unit record is byte-for-byte what the Phase 4 build saved");
    assert.equal(JSON.stringify(saved().srs["snt-st-fixture-1"]), srsBefore, "after save #" + n + " the workshop sentence's review schedule is unchanged");
  }
  assert.equal(saved().units["read-p1"].best, 90, "the learner's Phase 3 progress made under the rollback build is saved too");
  // 3. RETURN TO THE PHASE 4 BUILD: new modules, new store, the SAME storage
  const A2 = fresh(content), a2 = store(A2, clock, storage);
  assert.equal(a2.unitDone("story-s1-a"), true); assert.equal(a2.unit("story-s1-a").best, 85); assert.equal(a2.unit("story-s1-a").tries, 2); assert.equal(a2.unit("story-s1-a").at, atRollback.units["story-s1-a"].at);
  assert.equal(a2.unitDone("story-s2-b"), true); assert.equal(a2.unit("story-s2-b").best, 100); assert.equal(a2.unitDone("build-set-2"), true);
  assert.deepEqual(a2.srsEntry("snt-st-fixture-1"), atRollback.srs["snt-st-fixture-1"], "the workshop sentence is back in the review schedule");
  assert.equal(a2.unit("read-p1").best, 90, "Phase 3 progress made during the rollback is there"); assert.equal(a2.isDone(B.P.LESSON_IDS[5]), true); assert.equal(A2.R.kindOf("snt-st-fixture-1"), "sentence");
  // the restored record is fully live, not just present
  a2.recordUnit("story-s1-a", 95); assert.equal(a2.unit("story-s1-a").best, 95); assert.equal(a2.unit("story-s1-a").tries, 3);
  for (const [id, u] of Object.entries(LEARNER.stored.units)) if (id !== "read-p1") assert.deepEqual({ best: a2.unit(id).best, tries: a2.unit(id).tries, at: a2.unit(id).at }, { best: u.best, tries: u.tries, at: u.at }, "Phase 3 unit " + id + " still exactly as it was");
});
test("NO MILESTONE 3 CONTENT: the catalogues are empty, the empty-catalogue markers are intact, and the Phase 4 source files contain no Arabic letters in executable code", () => {
  const M = fresh(); assert.equal(M.S.STORIES.length, 0); assert.equal(M.S.RAW.length, 0); assert.equal(M.W.ITEMS.length, 0); assert.equal(M.W.RAW.length, 0); assert.deepEqual(M.R.ALL_IDS, FROZEN.reviewIds);
  for (const f of ["stories", "sentences"]) assert.equal((read("assets/js/learn/" + f + ".js").match(/const RAW = \[\];/g) || []).length, 1, f + ".js keeps its single empty RAW marker");
  const LETTERS = /[\u0621-\u063F\u0641-\u064A\u0671-\u06D3]/;
  for (const f of ["stories", "sentences", "exercises", "stories-ui"]) { const c = code("assets/js/learn/" + f + ".js"), hit = c.split("\n").filter(l => LETTERS.test(l)); assert.deepEqual(hit, [], f + ".js has Arabic letters in code: " + hit.slice(0, 2).join(" | ")); }
});

// ================================================================== 4. existing learner records are unchanged (safeguard 3)
test("PRESERVATION: the Phase 3 learner record loads identically, is not rewritten by loading, and sanitising it is a no-op (empty AND populated catalogues)", () => {
  for (const [label, M] of [["empty catalogues", fresh()], ["populated catalogues", fresh(both(withStories([1, "a"]), withItems(rawOrder("bw-1-01", 0), rawComplete("bw-2-01"))))]]) {
    const raw = JSON.stringify(LEARNER.stored), storage = memStorage(raw), clock = { t: Date.parse(LEARNER.clock.reviewUtc) }, st = store(M, clock, storage);
    assert.deepEqual(M.P.sanitize(clone(LEARNER.stored), clock.t), LEARNER.stored, label + ": sanitize is a no-op for a Phase 3 learner");
    assert.deepEqual([...new Set(storage.log)], [LEARNER.storageKey + ".t"], label + ": the only write while loading is the storage availability probe (existing behaviour); the progress record is never written");
    assert.equal(storage._m.get(LEARNER.storageKey), raw, label + ": the stored record is byte-for-byte untouched");
    for (const [id, u] of Object.entries(LEARNER.stored.units)) { const got = st.unit(id); assert.equal(got.best, u.best, id); assert.equal(got.tries, u.tries, id); assert.equal(got.at, u.at, id); }
    assert.deepEqual(Object.keys(LEARNER.stored.units).sort(), ["conv-family", "conv-intro", "read-p1", "read-s1", "read-s2"]);
    for (const id of Object.keys(LEARNER.stored.srs)) assert.deepEqual(st.srsEntry(id), LEARNER.stored.srs[id], id);
    assert.equal(st.unitDone("read-s1"), true); assert.equal(st.unit("read-s1").best, 100); assert.equal(st.unitDone("conv-intro"), true); assert.equal(st.unitDone("read-p1"), false);
  }
});
test("PRESERVATION: a fully completed learner stays 'course complete' with the same journey after Phase 4 content is added", () => {
  const clock = { t: Date.UTC(2026, 10, 12, 9) }, Me = fresh(), storage = memStorage(), st = store(Me, clock, storage);
  Me.P.LESSON_IDS.forEach(id => st.completeLesson(id, 100)); Me.P.UNIT_IDS.forEach(id => st.recordUnit(id, 100)); st.reviewAnswers(Me.R.ALL_IDS.map(id => ({ id, correct: true })));
  const before = journeyOf(Me, st); assert.equal(JSON.parse(before).complete, true, "the control learner really has finished the journey"); assert.equal(JSON.parse(before).next, null);
  const Mf = fresh(both(withStories([1, "a"], [3, "c"]), withItems(rawOrder("bw-1-01", 0), rawComplete("bw-2-01")))), st2 = store(Mf, clock, storage);
  assert.equal(journeyOf(Mf, st2), before, "identical journey"); assert.equal(JSON.parse(journeyOf(Mf, st2)).complete, true);
  assert.equal(st2.unitDone("story-s1-a"), false, "new units start untouched");
});
test("PRESERVATION: protected Phase 1-3 files are byte-for-byte what commit 67dca19 had (line endings normalised)", () => {
  for (const [f, want] of Object.entries(PROTECTED.files)) assert.equal(crypto.createHash("sha256").update(read(f).replace(/\r\n/g, "\n"), "utf8").digest("hex"), want, f + " must not change in Phase 4");
  assert.equal(Object.keys(PROTECTED.files).length, 9);
  for (const f of ["reading", "journey", "data", "vocab-data", "vocab-packs", "conversations", "srs", "engine", "audio"]) assert.ok(PROTECTED.files["assets/js/learn/" + f + ".js"], f);
});

// ================================================================== 5. review submission guard (safeguard 4) and the finish contract
test("GUARD: exactly one store.reviewAnswers call exists in app.js (the shared finish()), the legacy mapping is unchanged, and the Phase 4 branch takes rows only from the package", () => {
  const app = code("assets/js/learn/app.js");
  assert.equal((app.match(/store\.reviewAnswers\s*\(/g) || []).length, 1);
  const legacy = 'session.results.map(function (r) { return { id: r.q.itemId || (r.letterId ? R.letterId(r.letterId) : null), correct: r.correct }; }).filter(function (a) { return a.id && R.kindOf(a.id); })';
  assert.ok(app.includes("store.reviewAnswers(session.ext ? session.ext.reviewRows : " + legacy + ")"), "Phase 4 rows come only from session.ext.reviewRows; the legacy expression is verbatim");
  const fin = app.slice(app.indexOf("function finish()")), head = fin.slice(0, fin.indexOf("E.scoreSession(session.results)"));
  assert.ok(head.includes("if (session.ext) session.results = session.ext.results;"), "the package's graded results replace whatever the runner held BEFORE scoring");
  assert.ok(app.includes("if (!s || !XP || !XP.isFinishPackage(s.ext)) throw new Error"), "UI.finish refuses anything but a finish package");
});
test("GUARD: Phase 4 modules never touch the progress store or call reviewAnswers; the UI object has no store handle", () => {
  for (const f of ["stories-ui", "exercises", "stories", "sentences"]) {
    const c = code("assets/js/learn/" + f + ".js");
    assert.ok(!/reviewAnswers\s*\(/.test(c), f + " must not call reviewAnswers"); assert.ok(!/\bstore\b/.test(c), f + " must not reference the store"); assert.ok(!/ak-learn-progress/.test(c), f + " must not touch the progress key");
    assert.ok(!/recordUnit|recordSession|completeLesson|markSpoke/.test(c), f + " records nothing itself");
  }
  const ui = code("assets/js/learn/stories-ui.js"); assert.equal((ui.match(/localStorage/g) || []).length, 1, "the only storage access is the harakat preference"); assert.ok(ui.includes("ak-learn-st-prefs"));
  const app = code("assets/js/learn/app.js"), uiObj = app.slice(app.indexOf("const UI = Object.freeze"), app.indexOf('root.addEventListener("click", onAction)'));
  assert.ok(!/\bstore\.(?!unit\b)\w+/.test(uiObj), "the only store member the UI object reaches is store.unit (read-only)"); assert.ok(!/reviewAnswers|recordUnit|recordSession|reset/.test(uiObj));
});
test("GUARD: every Phase 4 hook in app.js is guarded, so without LearnExt the page behaves as before; all source files parse", () => {
  const app = code("assets/js/learn/app.js");
  for (const snippet of ["(EXT && EXT.dashboard ? EXT.dashboard(UI) : \"\")", "else if (EXT && EXT.routes && Object.prototype.hasOwnProperty.call(EXT.routes, p[0])) EXT.routes[p[0]](UI, p);", "else if (a.indexOf(\"x-\") === 0 && EXT && EXT.action) EXT.action(UI, a, b, e);",
    "if (EXT && EXT.typingSubmit && EXT.typingSubmit()) return; typeCheck();", "dock.onSubmit(function () { if (EXT && EXT.typingSubmit && EXT.typingSubmit()) return;", "e.preventDefault(); if (EXT && EXT.typingSubmit && EXT.typingSubmit()) return;"])
    assert.equal(app.split(snippet).length - 1, 1, snippet);
  for (const line of app.split("\n").filter(l => /\bEXT\./.test(l))) assert.ok(/EXT &&/.test(line), "unguarded EXT use: " + line.trim().slice(0, 100));
  assert.equal(app.split("\n").filter(l => /\bEXT\./.test(l)).length, 6, "exactly six lines use EXT, each guarded");
  for (const f of ["app", "stories-ui", "exercises", "stories", "sentences", "review", "progress"]) assert.doesNotThrow(() => new vm.Script(read("assets/js/learn/" + f + ".js"), { filename: f + ".js" }), f);
  assert.ok(!/LearnExt/.test(code("assets/js/learn/journey.js")));
});
test("Phase 1-3 routes and reading functionality are still wired in app.js", () => {
  const app = code("assets/js/learn/app.js");
  for (const r of ['p[0] === "reading"', "readingHome", "readingPage", "startComprehension", "toggleReading", 'p[0] === "conversations"', 'p[0] === "review"']) assert.ok(app.includes(r), r);
  for (const r of ["#/reading, #/reading/<passage>"]) assert.ok(read("assets/js/learn/app.js").includes(r));
});
test("the Phase 4 suites are part of the normal test workflow", () => {
  const pkg = JSON.parse(read("tests/learn/package.json"));
  assert.ok(/phase4\.test\.mjs/.test(pkg.scripts.test) && /phase4-integration\.test\.mjs/.test(pkg.scripts.test)); assert.equal(pkg.scripts.phase4, "node browser/phase4.browser.mjs"); assert.ok(/npm run phase4/.test(pkg.scripts.all));
  for (const f of ["phase4.test.mjs", "phase4-integration.test.mjs", "browser/phase4.browser.mjs", "fixtures/phase4-fixtures.mjs"]) assert.ok(fs.existsSync(path.join(REPO, "tests/learn", f)), f);
  assert.ok(/phase3\.test\.mjs/.test(pkg.scripts.test), "the Phase 3 suites are still listed");
});

// ================================================================== 6. the harakat preference
test("harakat preference: band defaults until the learner explicitly changes it; stored in its OWN key; safe with corrupt or blocked storage", () => {
  const { createPrefs, effectiveMarks, PREF_KEY } = fresh().U, band1 = { marks: true }, band3 = { marks: false };
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _m: m }; };
  const s = mem(), p = createPrefs(s);
  assert.deepEqual(p.get(), { marks: null, tap: false }); assert.equal(effectiveMarks(band1, p.get()), true); assert.equal(effectiveMarks(band3, p.get()), false, "band defaults");
  p.setMarks(false); assert.equal(effectiveMarks(band1, p.get()), false, "an explicit choice applies to every story"); p.setMarks(true); assert.equal(effectiveMarks(band3, p.get()), true);
  p.setTap(true); assert.equal(p.get().tap, true);
  assert.equal(PREF_KEY, "ak-learn-st-prefs"); assert.deepEqual([...s._m.keys()], ["ak-learn-st-prefs"], "nothing is written to the progress key"); assert.deepEqual(JSON.parse(s._m.get(PREF_KEY)), { v: 1, marks: true, tap: true });
  p.setMarks(null); assert.equal(effectiveMarks(band3, p.get()), false, "resetting returns to the band default"); assert.equal(JSON.parse(s._m.get(PREF_KEY)).marks, null);
  const bad = mem(); bad.setItem(PREF_KEY, "{not json"); assert.deepEqual(createPrefs(bad).get(), { marks: null, tap: false });
  bad.setItem(PREF_KEY, JSON.stringify({ marks: "yes", tap: "no" })); assert.deepEqual(createPrefs(bad).get(), { marks: null, tap: false }, "wrong types are ignored");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }, bp = createPrefs(blocked);
  assert.doesNotThrow(() => bp.setMarks(false)); assert.equal(bp.get().marks, false, "kept in memory for this visit"); assert.equal(effectiveMarks(band1, bp.get()), false);
});

// ================================================================== 7. markup of the new pages
const escH = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fakeUI() {
  const calls = { set: [], notFound: 0, finish: [] };
  return { calls, esc: escH, ar: (t, cls) => '<span class="lx-ar ' + (cls || "") + '" lang="ar" dir="rtl">' + escH(t) + "</span>", href: h => "#/" + h,
    hear: (t, k, l) => '<button type="button" class="lx-hear" data-action="speak" data-text="' + escH(t) + '" data-key="' + escH(k || "") + '" aria-label="' + escH(l || "Hear pronunciation") + '">🔊 Hear</button>',
    unitBadge: rec => (rec && rec.complete ? '<span class="lx-tick-i">✓ Passed</span>' : '<span class="lx-small">Not started</span>'), set: h => calls.set.push(h), notFound: () => { calls.notFound++; },
    unit: () => null, typing: { available: () => true }, finish: s => calls.finish.push(s) };
}
const ids = h => [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
function assertMarkup(html, label) {
  assert.ok(!/<form/i.test(html), label + ": no <form>"); assert.deepEqual([...html.matchAll(/<button(?![^>]*\btype=")[^>]*>/g)].map(m => m[0]), [], label + ": every button has type=button");
  const dup = ids(html).filter((x, i, a) => a.indexOf(x) !== i); assert.deepEqual(dup, [], label + ": ids unique");
  for (const m of html.matchAll(/aria-pressed="([^"]*)"/g)) assert.ok(m[1] === "true" || m[1] === "false", label + ": aria-pressed " + m[1]);
  for (const m of html.matchAll(/data-action="([^"]+)"/g)) assert.ok(/^(x-[a-z-]+|speak)$/.test(m[1]), label + ": action " + m[1]);
  assert.ok(!/<[^>]*\son\w+\s*=|<script|(?:href|src)="\s*javascript:/i.test(html), label + ": no inline handlers or scripts inside any tag");
  for (const m of html.matchAll(/role="img"[^>]*>/g)) assert.ok(/aria-label="[^"]+"/.test(m[0]), label + ": role=img has a label");
}
test("pages: stories index, story page and set page carry the draft notice, valid markup, and the right defaults", () => {
  const M = fresh(both(withStories([1, "a"], [2, "b"], [3, "c"]), withItems(rawOrder("bw-1-01", 0), rawMatch("bw-1-02"), rawComplete("bw-2-01")))), ui = fakeUI(), ext = M.U.ext, NOTE = "Draft: awaiting review by a qualified Arabic teacher.";
  assert.equal(ext.hasContent(), true); const dash = ext.dashboard(ui); assert.ok(dash.includes("#/stories") && dash.includes("Draft")); assertMarkup(dash, "dashboard");
  ext.routes.stories(ui, ["stories"]); const idx = ui.calls.set.pop(); assert.ok(idx.includes(NOTE)); assert.equal((idx.match(/href="#\/story\//g) || []).length, 3); assert.equal((idx.match(/href="#\/workshop\//g) || []).length, 2, "sets with items only"); assertMarkup(idx, "index");
  for (const [id, marks] of [["story-s1-a", true], ["story-s2-b", true], ["story-s3-c", false]]) {
    ext.routes.story(ui, ["story", id]); const h = ui.calls.set.pop(); assert.ok(h.includes(NOTE), id); assertMarkup(h, id);
    assert.equal(/class="lx-rd st-rd is-marks"/.test(h), marks, id + " harakat default by band"); assert.ok(h.includes('data-what="marks" aria-pressed="' + marks + '"'));
    assert.ok(/data-what="tap"[^>]*disabled/.test(h) === marks, "the tap-a-word aid is disabled while harakat are on");
    assert.ok(h.includes('data-action="x-st-start"')); assert.ok(h.includes('data-action="x-tw"')); assert.ok(/lang="ar" dir="rtl"/.test(h));
  }
  ext.routes.workshop(ui, ["workshop", "2"]); const s2 = ui.calls.set.pop(); assert.ok(s2.includes(NOTE)); assert.ok(s2.includes("Your answers schedule these sentences for review."), "the sentence-review notice is shown for completion exercises"); assertMarkup(s2, "set 2");
  ext.routes.workshop(ui, ["workshop", "1"]); const s1 = ui.calls.set.pop(); assert.ok(!s1.includes("Your answers schedule"), "no notice when a set has no completion exercises");
  ext.routes.workshop(ui, ["workshop", "3"]); assert.equal(ui.calls.notFound, 1, "a set with no items is not a page"); ext.routes.story(ui, ["story", "nope"]); assert.equal(ui.calls.notFound, 2);
  ext.routes.workshop(ui, ["workshop"]); const wh = ui.calls.set.pop(); assertMarkup(wh, "workshop home"); assert.ok(!/href="#\/story\//.test(wh));
});
test("story page: tap-a-word markup (one tab stop per line, labelled groups, plain and vowelled forms) and the vowelled/plain alignment", () => {
  const M = fresh(withStories([3, "c"])), ui = fakeUI(); M.U.ext.routes.story(ui, ["story", "story-s3-c"]); const h = ui.calls.set.pop(), story = M.S.STORIES[0];
  const groups = [...h.matchAll(/<span class="st-t" role="group" aria-label="Line (\d+): [^"]*">(.*?)<\/span>(?=<div class="rd-tr">)/g)];
  assert.equal(groups.length, story.lines.length, "one labelled group per line");
  groups.forEach((g, i) => { const btns = [...g[2].matchAll(/<button type="button" class="st-w" data-action="x-tw" data-p="([^"]*)" data-v="([^"]*)" aria-pressed="false" tabindex="(-?\d)">/g)];
    assert.equal(btns.length, story.lines[i].tokens.length); assert.deepEqual(btns.map(b => b[3]), btns.map((_, k) => (k === 0 ? "0" : "-1")), "roving tabindex: only the first word is a tab stop");
    btns.forEach((b, k) => { assert.equal(b[1], escH(story.lines[i].tokens[k].plain)); assert.equal(b[2], escH(story.lines[i].tokens[k].ar)); }); });
});
test("pages escape every piece of text (a title, translation, glossary or prompt can never inject markup)", () => {
  const evil = '<img src=x onerror=alert(1)>', M = fresh(M2 => { const r = rawStory(1, "evil"); r.title = evil; r.intro = evil; r.lines[0][1] = evil; r.lines[0][2] = evil; r.glossary[1].translit = evil; r.glossary[1].en = evil; r.questions[0].prompt = evil; M2.S.STORIES.push(...M2.S.build([r])); }), ui = fakeUI();
  M.U.ext.routes.stories(ui, ["stories"]); M.U.ext.routes.story(ui, ["story", "story-s1-evil"]);
  const html = ui.calls.set.join("\n"); assert.ok(!html.includes(evil), "raw payload absent"); assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;")); assert.ok(!/<img/i.test(html));
  const run = { i: 0, qs: [M.X.buildQuestion(M.S.STORIES[0].questions[0])], order: { placed: [] }, match: { sel: null, pairs: {} }, lines: M.S.STORIES[0].lines }, q = M.U.html.questionHtml(ui, run, run.qs[0]);
  assert.ok(!q.includes(evil) && q.includes("&lt;img")); assertMarkup(q, "question");
});
test("question markup: ordering is right-to-left with labelled live-announced tiles, matching uses paired lists, completion blanks are labelled images, true/false order is fixed", () => {
  const M = fresh(withItems(rawOrder("bw-1-01", 0), rawMatch("bw-1-02"), rawComplete("bw-2-01"))), ui = fakeUI(), X = M.X, qs = M.W.ITEMS.map(it => M.W.buildExercise(it, M.E.mulberry32(2)));
  const mk = q => ({ i: 0, qs: [q], order: { placed: [] }, match: { sel: null, pairs: {} }, lines: [] }), html = q => M.U.html.questionHtml(ui, mk(q), q);
  const order = html(qs[0]); assertMarkup(order, "order"); assert.ok(/<div class="st-bank" dir="rtl" role="group"/.test(order)); assert.ok(/<ol class="st-slots" dir="rtl" aria-label="Your sentence, in reading order">/.test(order));
  assert.equal((order.match(/data-action="x-tile"/g) || []).length, qs[0].tiles.length); assert.ok(/id="lxCheck" disabled/.test(order), "Check is disabled until every tile is placed"); assert.ok(!/id="lxLive"/.test(order), "the live region lives outside the re-rendered body");
  const placedRun = mk(qs[0]); placedRun.order.placed = qs[0].tiles.map(t => t.tid); const done = M.U.html.questionHtml(ui, placedRun, qs[0]);
  assert.ok(!/id="lxCheck" disabled/.test(done)); assert.ok(/position 1 of \d, activate to remove/.test(done)); assert.equal((done.match(/data-action="x-untile"/g) || []).length, qs[0].tiles.length);
  const match = html(qs[1]); assertMarkup(match, "match"); assert.ok(/aria-label="First halves \(3 left\)"/.test(match) && /aria-label="Second halves \(3 left\)"/.test(match));
  const comp = html(qs[2]); assertMarkup(comp, "complete"); assert.ok(/role="img" aria-label="Arabic sentence with one missing word:/.test(comp)); assert.equal((comp.match(/data-action="x-answer"/g) || []).length, 4);
  const tf = html(X.buildQuestion({ id: "t", type: "tf", prompt: "p", answer: true, explanation: "e" })); assertMarkup(tf, "tf"); assert.ok(tf.indexOf(">True<") < tf.indexOf(">False<"));
  const rv = html(X.buildQuestion({ id: "r", type: "reveal", prompt: "p", model: "m" })); assertMarkup(rv, "reveal"); assert.ok(/\(not scored\)/.test(rv));
  const sp = M.U.html.shortPrompt(ui, mk(qs[0]), { prompt: "Copy a word.", hint: "h" }); assert.ok(/compares letters only/.test(sp) && /Hint: h/.test(sp));
});
