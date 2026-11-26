import test from "node:test";
import assert from "node:assert/strict";
import { G, V, lesson, vocabIds, deepFreeze } from "./fixtures.mjs";

const errs = (rec) => G.validateLesson(rec).errors;
const has = (list, text) => list.some((e) => e.includes(text));

test("the shipped catalogue is empty and valid", () => {
  assert.deepEqual(G.RAW, []);
  assert.deepEqual(G.LESSONS, []);
  assert.deepEqual(G.ERRORS, []);
  assert.deepEqual(G.validateCatalogue(G.RAW), { ok: true, errors: [] });
});

test("an empty catalogue is accepted; a non-array catalogue is rejected", () => {
  assert.equal(G.validateCatalogue([]).ok, true);
  for (const bad of [null, undefined, {}, "x", 3]) assert.equal(G.validateCatalogue(bad).ok, false);
});

test("a valid future lesson record is accepted, alone and in a catalogue", () => {
  assert.deepEqual(G.validateLesson(lesson()), { ok: true, errors: [] });
  assert.equal(G.validateCatalogue([lesson(), lesson({ id: "gram-fixture-two", slug: "fixture-two", prerequisites: ["gram-fixture-one"] })]).ok, true);
  // optional fields may be absent and mistakes may be an empty list
  const minimal = lesson({ mistakes: [] }); delete minimal.vocabRefs;
  assert.equal(G.validateLesson(minimal).ok, true);
});

test("every required field is enforced", () => {
  for (const key of G.SCHEMA.lesson.required) {
    const rec = lesson(); delete rec[key];
    assert.ok(has(errs(rec), `missing required field "${key}"`), key);
  }
  const ex = lesson(); delete ex.examples[0].translit;
  assert.ok(has(errs(ex), 'examples[0]: missing required field "translit"'));
  const ck = lesson(); delete ck.check[0].explain;
  assert.ok(has(errs(ck), 'check[0]: missing required field "explain"'));
});

test("unknown fields are rejected, so no review/approval/publication claim can be stored", () => {
  for (const extra of ["status", "reviewed", "approved", "teacherApproved", "published"]) {
    assert.ok(has(errs(lesson({ [extra]: true })), `unknown field "${extra}"`), extra);
  }
  const nested = lesson(); nested.examples[0].approved = true;
  assert.ok(has(errs(nested), 'unknown field "approved"'));
});

test("invalid IDs are rejected", () => {
  for (const id of ["fixture", "gram-", "gram-Upper", "gram--x", "gram-x-", "gram-a b", "gram-x/y", "gram-" + "a".repeat(40), "", 5, null]) {
    assert.ok(has(errs(lesson({ id })), ".id must match"), String(id));
  }
});

test("an ID that collides with an existing course ID is rejected", () => {
  const ctx = { vocabIds: new Set(vocabIds), reservedIds: new Set(["gram-fixture-one"]) };
  assert.ok(has(G.validateLesson(lesson(), ctx).errors, "collides with an existing course ID"));
});

test("invalid slugs are rejected", () => {
  for (const slug of ["Upper", "has space", "a/b", "-x", "x-", "x--y", "caf\u00e9", "", "a".repeat(61), 7, undefined]) {
    const rec = lesson({ slug });
    if (slug === undefined) delete rec.slug;
    assert.equal(G.validateLesson(rec).ok, false, String(slug));
  }
  assert.ok(has(errs(lesson({ slug: "../escape" })), ".slug must be"));
});

test("duplicate IDs and duplicate slugs are rejected", () => {
  const dupId = G.validateCatalogue([lesson(), lesson({ slug: "other" })]);
  assert.ok(has(dupId.errors, 'duplicate lesson ID "gram-fixture-one"'));
  const dupSlug = G.validateCatalogue([lesson(), lesson({ id: "gram-fixture-two" })]);
  assert.ok(has(dupSlug.errors, 'duplicate slug "fixture-one"'));
});

test("invalid vocabulary references are rejected (lesson, example and duplicate)", () => {
  assert.ok(has(errs(lesson({ vocabRefs: ["no-such-word"] })), 'vocabRefs[0] "no-such-word" is not a known vocabulary item ID'));
  const ex = lesson(); ex.examples[0].vocabRefs = ["nope"];
  assert.ok(has(errs(ex), "examples[0].vocabRefs[0]"));
  assert.ok(has(errs(lesson({ vocabRefs: [vocabIds[0], vocabIds[0]] })), "duplicates"));
  assert.ok(has(errs(lesson({ vocabRefs: "num-0" })), "must be an array of vocabulary item IDs"));
  assert.ok(has(errs(lesson({ vocabRefs: [42] })), "is not a known vocabulary item ID"));
  // a real vocabulary ID is accepted, a pattern or topic ID is not a vocabulary ITEM
  assert.equal(G.validateLesson(lesson({ vocabRefs: [V.ITEMS[5].id] })).ok, true);
  assert.equal(G.validateLesson(lesson({ vocabRefs: [V.TOPICS[0].id] })).ok, false);
});

test("prerequisites: unknown, self, duplicate and cyclic references are rejected", () => {
  assert.ok(has(G.validateCatalogue([lesson({ prerequisites: ["gram-ghost"] })]).errors, "is not in the catalogue"));
  assert.ok(has(errs(lesson({ prerequisites: ["gram-fixture-one"] })), "refers to the lesson itself"));
  assert.ok(has(errs(lesson({ prerequisites: ["gram-x", "gram-x"] })), "duplicates"));
  assert.ok(has(errs(lesson({ prerequisites: ["Not an id"] })), "is not a grammar lesson ID"));
  const a = lesson({ id: "gram-a", slug: "a", prerequisites: ["gram-b"] }), b = lesson({ id: "gram-b", slug: "b", prerequisites: ["gram-a"] });
  const cyc = G.validateCatalogue([a, b]);
  assert.equal(cyc.ok, false);
  assert.equal(cyc.errors.filter((e) => e.startsWith("prerequisite cycle")).length, 1);
});

test("malformed nested data is rejected", () => {
  const bad = (mut) => { const r = lesson(); mut(r); return r; };
  const cases = [
    [bad((r) => { r.explanation = []; }), "explanation must contain between 1 and 20"],
    [bad((r) => { r.explanation = "text"; }), "explanation must be an array"],
    [bad((r) => { r.explanation[0] = "text"; }), "explanation[0] must be an object"],
    [bad((r) => { r.explanation[0].text = "  "; }), "explanation[0].text must be a non-empty string"],
    [bad((r) => { r.examples = []; }), "examples must contain between 1 and 30"],
    [bad((r) => { r.examples[0].ar = "latin only"; }), "examples[0].ar must be a non-empty string containing at least one Arabic letter"],
    [bad((r) => { r.examples[0].en = 12; }), "examples[0].en must be a non-empty string"],
    [bad((r) => { r.mistakes = {}; }), "mistakes must be an array"],
    [bad((r) => { r.mistakes[0].ar = "latin"; }), "mistakes[0].ar must be a non-empty string containing at least one Arabic letter"],
    [bad((r) => { r.check = []; }), "check must contain between 1 and 10"],
    [bad((r) => { r.check[0].choices = ["only"]; }), "choices must be 2 to 6"],
    [bad((r) => { r.check[0].choices = ["a", "a"]; }), "must not contain duplicates"],
    [bad((r) => { r.check[0].answerIndex = 2; }), "answerIndex must be an integer index"],
    [bad((r) => { r.check[0].answerIndex = "0"; }), "answerIndex must be an integer index"],
    [bad((r) => { r.check[0].answerIndex = -1; }), "answerIndex must be an integer index"],
    [bad((r) => { r.title = ""; }), "title must be a non-empty string"],
    [bad((r) => { r.summary = "x".repeat(201); }), "summary must be a non-empty string of at most 200"]
  ];
  for (const [rec, expected] of cases) assert.ok(has(errs(rec), expected), expected);
  for (const notObject of [null, undefined, 3, "x", [], () => 1]) assert.equal(G.validateLesson(notObject).ok, false);
});

test("Arabic example text must contain at least one actual Arabic-script letter", () => {
  const MSG = "must be a non-empty string containing at least one Arabic letter";
  const withAr = (ar) => { const r = lesson(); r.examples[0].ar = ar; r.mistakes[0].ar = ar; return r; };
  // accepted: real letters, vowelled or plain, alone or mixed with digits, punctuation and spaces
  const accepted = ["كِتَابٌ", "كتاب", "ب", "ء", "أ", "پ", "\uFEFB", "ب١٢٣", "؟ب", "أَيْنَ الْقَلَمُ؟", "١ كِتَابٌ ،"];
  for (const ar of accepted) assert.deepEqual(G.validateLesson(withAr(ar)).errors, [], "accepted: " + ar);
  // rejected: strings that sit in the Arabic block but contain no letter, plus non-Arabic text
  const rejected = {
    "Arabic-Indic digits": "١٢٣",
    "a single Arabic-Indic digit": "٠",
    "Extended Arabic-Indic digits": "۱۲۳",
    "the Arabic question mark": "؟",
    "the Arabic comma": "،",
    "the Arabic semicolon": "؛",
    "a run of Arabic punctuation": "؟،؛",
    "digits and punctuation together": "١٢٣ ؟ ،",
    "vowel marks only": "\u064E\u064F\u0650\u0651",
    "tatweel only": "\u0640\u0640",
    "Latin letters": "latin",
    "ASCII digits": "123",
    "Latin letters with Arabic digits": "abc ١٢٣"
  };
  for (const [what, ar] of Object.entries(rejected)) {
    const errors = G.validateLesson(withAr(ar)).errors;
    assert.ok(has(errors, "examples[0].ar " + MSG), what + " is rejected as an example");
    assert.ok(has(errors, "mistakes[0].ar " + MSG), what + " is rejected as a mistake");
  }
  // an optional mistake `ar` may still be left out, and the other fields are not blamed for a bad `ar`
  const noAr = lesson(); delete noAr.mistakes[0].ar;
  assert.equal(G.validateLesson(noAr).ok, true);
  assert.equal(G.validateLesson(withAr("١٢٣")).errors.length, 2);
});

test("summary is validated as non-empty text of at most 200 characters, with no sentence counting", () => {
  const MSG = "summary must be a non-empty string of at most 200 characters";
  assert.equal(G.validateLesson(lesson({ summary: "One sentence." })).ok, true);
  assert.equal(G.validateLesson(lesson({ summary: "First. Second. Third. Fourth." })).ok, true, "more than two sentences is fine");
  assert.equal(G.validateLesson(lesson({ summary: "no full stop at all" })).ok, true, "a single fragment is fine");
  assert.equal(G.validateLesson(lesson({ summary: "x".repeat(200) })).ok, true, "exactly 200 characters is accepted");
  for (const bad of ["x".repeat(201), "", "   ", 5, null]) assert.ok(has(errs(lesson({ summary: bad })), MSG), "rejected: " + String(bad).slice(0, 10));
});

test("validation never mutates its input (deep-frozen records still validate)", () => {
  const rec = lesson({ prerequisites: ["gram-other"] });
  const copy = JSON.parse(JSON.stringify(rec));
  deepFreeze(rec);
  assert.doesNotThrow(() => G.validateLesson(rec));
  assert.doesNotThrow(() => G.validateCatalogue(deepFreeze([lesson(), lesson({ id: "gram-b", slug: "b" })])));
  assert.deepEqual(rec, copy);
});

test("validation is deterministic and independent of browser APIs", () => {
  const catalogue = [lesson({ id: "bad" }), lesson({ slug: "Bad" })];
  const first = JSON.stringify(G.validateCatalogue(catalogue));
  for (let i = 0; i < 5; i++) assert.equal(JSON.stringify(G.validateCatalogue(catalogue)), first);
  assert.equal(typeof window, "undefined");
  assert.equal(typeof document, "undefined");
});

test("a catalogue-level error label names the record index and ID", () => {
  const r = G.validateCatalogue([lesson(), lesson({ id: "gram-two", slug: "fixture-one" })]);
  assert.ok(r.errors.some((e) => e.startsWith("lessons[1] (gram-two)")));
});
