// Tests for the Arabic GRAMMAR review package (docs/arabic-grammar-review/). They check structure, traceability, determinism and the
// project boundaries. They do NOT and cannot show that any lesson is linguistically correct: the drafts are UNREVIEWED and need a
// qualified Arabic teacher. Nothing here records or implies approval.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { MARKS, stripMarks, consonantsMatch, vowelsMatch, arabicSkeleton, translitSkeleton } from "./lint.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PKG = path.join(ROOT, "docs/arabic-grammar-review");
const PKG_REL = "docs/arabic-grammar-review";
const G = require(path.join(ROOT, "assets/js/learn/grammar.js"));
const V = require(path.join(ROOT, "assets/js/learn/vocab-data.js"));
const C = require(path.join(ROOT, "assets/js/learn/conversations.js"));
const R = require(path.join(ROOT, "assets/js/learn/reading.js"));
const U = require(path.join(ROOT, "assets/js/learn/urls.js"));

const lf = (s) => s.replace(/\r\n/g, "\n");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readPkg = (name) => fs.readFileSync(path.join(PKG, name), "utf8");
const sha = (s) => crypto.createHash("sha256").update(lf(s), "utf8").digest("hex");
const bundle = JSON.parse(readPkg("grammar-drafts.json"));
const lessons = bundle.lessons;
const hasLetter = (s) => /(?=\p{L})\p{Script=Arabic}/u.test(s);

// RFC 4180 CSV parser (handles quotes, embedded newlines and the BOM).
const parseCsv = (text) => {
  const rows = []; let row = [], cell = "", q = false; text = lf(text.replace(/^\uFEFF/, ""));
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};
const csvRows = () => { const raw = parseCsv(readPkg("grammar-review-items.csv")); const head = raw[0]; return { head, rows: raw.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) }; };
const pointer = (obj, ptr) => ptr.split("/").slice(1).reduce((o, k) => (o === undefined || o === null ? undefined : o[k.replace(/~1/g, "/").replace(/~0/g, "~")]), obj);
const runBuilder = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, "build-grammar-review.mjs"), "--dir", dir, "--repo", ROOT, ...args], { encoding: "utf8" });
const tempCopy = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "grammar-review-")); fs.cpSync(PKG, d, { recursive: true }); return d; };
const GENERATED = ["grammar-review-items.csv", "grammar-review-sheet.md", "REVIEWER-GUIDE.md", "MANIFEST.txt"];

// The expected lessons, exactly as specified for this milestone.
const EXPECTED = [
  ["gram-article", "definite-article-sun-moon-letters", "Definite article: sun and moon letters"],
  ["gram-nominal", "nominal-sentences-pronouns", "Pronouns and nominal sentences"],
  ["gram-gender", "masculine-feminine-gender", "Masculine and feminine forms"],
  ["gram-adjectives", "adjective-agreement", "Adjective agreement"],
  ["gram-possession", "possessive-idafa", "Possessive constructions (الإضافة)"],
  ["gram-questions", "arabic-question-words", "Arabic question words"],
  ["gram-present", "present-tense-verbs", "Present-tense verbs"],
  ["gram-negation", "negation-prepositions", "Basic negation and prepositions"]
];

/* ============================== the drafts ============================== */

test("exactly eight drafts with the specified IDs, slugs and titles, marked UNREVIEWED", () => {
  assert.deepEqual(Object.keys(bundle), ["package", "status", "notice", "schema", "lessons"]);
  assert.equal(bundle.status, "UNREVIEWED");
  assert.match(bundle.notice, /NOT been reviewed or approved by a qualified Arabic teacher/);
  assert.match(bundle.notice, /NOT in the live course catalogue/);
  assert.equal(lessons.length, 8);
  assert.deepEqual(lessons.map((l) => [l.id, l.slug, l.title]), EXPECTED);
});

test("IDs and slugs are unique and every record passes the grammar schema and catalogue validation", () => {
  assert.equal(new Set(lessons.map((l) => l.id)).size, 8);
  assert.equal(new Set(lessons.map((l) => l.slug)).size, 8);
  for (const l of lessons) {
    assert.match(l.id, /^gram-[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.ok(l.id.length <= 32);
    assert.match(l.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/); assert.ok(l.slug.length <= 60);
    assert.deepEqual(G.validateLesson(l), { ok: true, errors: [] }, l.id);
    const allowed = [...G.SCHEMA.lesson.required, ...G.SCHEMA.lesson.optional];
    assert.deepEqual(Object.keys(l).filter((k) => !allowed.includes(k)), [], l.id + ": no unsupported fields");
  }
  assert.deepEqual(G.validateCatalogue(lessons), { ok: true, errors: [] });
  const order = lessons.map((l) => l.id);
  for (const [i, l] of lessons.entries()) for (const p of l.prerequisites || []) assert.ok(order.indexOf(p) >= 0 && order.indexOf(p) < i, `${l.id} requires an earlier lesson`);
});

test("every lesson has the required parts: summary, ordered explanation, vowelled examples, mistakes with reasons, and mini-check questions", () => {
  for (const l of lessons) {
    assert.ok(l.summary.trim().length > 0 && l.summary.length <= 200, l.id + " summary");
    assert.ok(l.explanation.length >= 4, `${l.id}: several explanation blocks`);
    assert.ok(l.explanation.some((b) => /^Guided practice/.test(b.heading)), `${l.id}: guided practice`);
    assert.equal(l.explanation.at(-1).heading, "Lesson review", `${l.id}: ends with a short lesson review`);
    assert.ok(l.examples.length >= 4, `${l.id}: at least four examples`);
    assert.ok(l.mistakes.length >= 2 && l.mistakes.every((m) => m.text.length >= 40), `${l.id}: common mistakes with an explanation of why`);
    assert.ok(l.check.length >= 4, `${l.id}: at least four mini-check questions`);
    for (const [i, x] of l.examples.entries()) {
      const w = `${l.id} example ${i + 1} (${x.ar})`;
      assert.ok(hasLetter(x.ar), w + ": contains an actual Arabic-script letter");
      for (const word of x.ar.replace(/[؟،]/g, "").trim().split(/\s+/)) assert.ok(MARKS.test(word), `${w}: ${word} is fully vowelled`);
      assert.ok(x.translit.trim() && x.en.trim(), w + ": transliteration and translation");
      assert.notEqual(stripMarks(x.ar), x.ar, w + ": the plain spelling differs from the vowelled text");
      assert.equal(x.ar, x.ar.normalize("NFC"), w + ": NFC");
    }
    for (const [i, q] of l.check.entries()) {
      const w = `${l.id} question ${i + 1}`;
      assert.ok(q.choices.length >= 2 && q.choices.length <= 6, w + ": two to six choices");
      assert.equal(new Set(q.choices).size, q.choices.length, w + ": distinct choices");
      assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.choices.length, w + ": valid answer index");
      assert.ok(q.explain.length >= 40, w + ": a real answer explanation");
    }
  }
});

test("examples are consistent with their transliteration (STRUCTURE ONLY: consonants and short vowels, not linguistic correctness)", () => {
  let n = 0;
  for (const l of lessons) for (const [i, x] of l.examples.entries()) { n++; assert.ok(consonantsMatch(x.ar, x.translit), `${l.id} ex ${i + 1} consonants: ${x.ar} / ${x.translit}`); assert.ok(vowelsMatch(x.ar, x.translit), `${l.id} ex ${i + 1} vowels: ${x.ar} / ${x.translit}`); }
  assert.ok(n >= 80, "checked " + n);
  // the lint must really detect problems, or the check above means nothing
  for (const [ar, tr] of [["كِتَابٌ", "qitābun"], ["كِتَابٌ", "kitābu"], ["أَكْتُبُ", "aktibu"], ["هِيَ", "huwa"], ["كِتَابُهَا", "kitābuhu"]]) assert.ok(!(consonantsMatch(ar, tr) && vowelsMatch(ar, tr)), `${ar} / ${tr} must be flagged`);
  assert.deepEqual(arabicSkeleton("اللَّيْلُ"), translitSkeleton("al-laylu"));
});

test("the drafts expand the existing patterns instead of copying them", () => {
  const norm = (s) => stripMarks(s.normalize("NFC")).replace(/[؟،?.!,]/g, "").trim();
  const known = new Map(); const add = (a, src) => { if (a) { known.set(a.normalize("NFC"), src); known.set("P:" + norm(a), src); } };
  V.PATTERN_ITEMS.forEach((i) => add(i.ar, "pattern " + i.id)); V.ITEMS.forEach((i) => add(i.ar, "vocabulary " + i.id));
  C.UNITS.forEach((u) => u.lines.forEach((ln, j) => add(ln.ar || ln[0], `conversation ${u.short}#${j}`))); R.PASSAGES.forEach((p) => p.lines.forEach((ln, j) => add(ln.ar || ln[0], `reading ${p.id}#${j}`)));
  for (const l of lessons) for (const [i, x] of l.examples.entries()) assert.ok(!known.has(x.ar.normalize("NFC")) && !known.has("P:" + norm(x.ar)), `${l.id} example ${i + 1} (${x.ar}) copies existing course text`);
  const patternSentences = V.PATTERN_ITEMS.map((i) => i.ar.normalize("NFC"));
  const scan = (v, where) => { if (typeof v === "string") for (const s of patternSentences) assert.ok(!v.includes(s), `${where} quotes the existing pattern sentence ${s}`); else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${where}[${i}]`)); else if (v && typeof v === "object") for (const k of Object.keys(v)) scan(v[k], `${where}.${k}`); };
  for (const l of lessons) scan(l, l.id);
});

test("the nominal / verbal contrast, the question words and the negation forms in the brief are all taught", () => {
  const text = (id) => JSON.stringify(lessons.find((l) => l.id === id));
  for (const s of ["الْجُمْلَةُ الِاسْمِيَّةُ", "الْجُمْلَةُ الْفِعْلِيَّةُ"]) assert.ok(text("gram-nominal").includes(s.normalize("NFC")), s);
  for (const w of ["مَنْ", "مَا", "مَاذَا", "أَيْنَ", "مَتَى", "لِمَاذَا", "كَيْفَ", "كَمْ"]) assert.ok(lessons[5].explanation[0].text.includes(w), w);
  for (const w of ["لَا", "لَيْسَ", "فِي", "عَلَى", "مِنْ", "إِلَى", "مَعَ"]) assert.ok(JSON.stringify(lessons[7]).includes(w), w);
  for (const p of ["أَنَا", "أَنْتَ", "أَنْتِ", "هُوَ", "هِيَ", "نَحْنُ"]) assert.ok(lessons[1].explanation[0].text.includes(p) && lessons[6].examples.some((x) => x.ar.startsWith(p)), p);
});

/* ============================== the review rows ============================== */

const EXPECTED_COLUMNS = ["item_id", "lesson_no", "lesson_id", "lesson_slug", "lesson_title", "category", "field", "arabic_as_implemented", "plain_spelling", "transliteration", "english_text", "context_notes", "special_flags", "automated_checks_STRUCTURE_ONLY", "source", "field_refs", "unicode_codepoints", "review_status", "author_flag_for_teacher", "suggested_priority", "priority_reason", "teacher_decision", "corrected_field_ref", "proposed_correction", "reviewer_comments"];
const expectedIds = () => lessons.flatMap((l) => { const key = l.id.replace(/^gram-/, "").toUpperCase(); const n = (k, c) => Array.from({ length: c }, (_, i) => `GR-${key}-${k}-${String(i + 1).padStart(2, "0")}`); return [...n("SUM", 1), ...n("EXP", l.explanation.length), ...n("EX", l.examples.length), ...n("MIS", l.mistakes.length), ...n("CHK", l.check.length)]; });

test("every explanation, example, mistake and mini-check has exactly one stable review row (plus one per lesson summary)", () => {
  const { head, rows } = csvRows();
  assert.deepEqual(head, EXPECTED_COLUMNS);
  assert.deepEqual(rows.map((r) => r.item_id), expectedIds());
  assert.equal(new Set(rows.map((r) => r.item_id)).size, rows.length);
  assert.equal(rows.length, 258);
  const count = (c) => rows.filter((r) => r.category === c).length;
  assert.equal(count("explanation"), lessons.reduce((n, l) => n + l.explanation.length, 0));
  assert.equal(count("example"), lessons.reduce((n, l) => n + l.examples.length, 0));
  assert.equal(count("common-mistake"), lessons.reduce((n, l) => n + l.mistakes.length, 0));
  assert.equal(count("mini-check"), lessons.reduce((n, l) => n + l.check.length, 0));
  for (const r of rows) assert.match(r.item_id, /^GR-[A-Z]+-(SUM|EXP|EX|MIS|CHK)-\d{2}$/);
});

test("every row's source reference resolves to its draft field, and the row matches what it points at", () => {
  const { rows } = csvRows();
  for (const r of rows) {
    const [file, ptr] = r.source.split("#");
    assert.equal(file, `${PKG_REL}/grammar-drafts.json`, r.item_id);
    const li = Number(ptr.split("/")[2]), lesson = lessons[li], target = pointer(bundle, ptr);
    assert.ok(target !== undefined, `${r.item_id}: ${ptr} resolves`);
    assert.equal(r.lesson_id, lesson.id); assert.equal(r.lesson_slug, lesson.slug); assert.equal(r.lesson_no, String(li + 1));
    const refs = r.field_refs.split(" ; ");
    assert.ok(refs.length >= 1);
    for (const f of refs) { assert.ok(f.startsWith(ptr), `${r.item_id}: ${f} lies inside ${ptr}`); assert.ok(pointer(bundle, f) !== undefined, `${r.item_id}: field ${f} resolves`); }
    switch (r.category) {
      case "lesson-summary": assert.ok(r.english_text.includes(target.title) && r.english_text.includes(target.summary)); break;
      case "explanation": assert.ok(r.english_text.includes(target.heading) && lf(r.english_text).includes(target.text)); break;
      case "example": assert.equal(r.arabic_as_implemented, target.ar); assert.equal(r.transliteration, target.translit); assert.equal(r.english_text, target.en); assert.equal(r.plain_spelling, stripMarks(target.ar)); break;
      case "common-mistake": assert.equal(r.english_text, target.text); assert.equal(r.arabic_as_implemented, target.ar || ""); break;
      case "mini-check":
        assert.ok(r.english_text.includes(target.prompt) && r.english_text.includes(target.explain));
        for (const c of target.choices) assert.ok(r.english_text.includes(c));
        assert.ok(r.english_text.includes(`Keyed answer: ${target.answerIndex + 1}) ${target.choices[target.answerIndex]}`));
        assert.ok(refs.includes(`${ptr}/answerIndex`) && refs.includes(`${ptr}/explain`) && refs.includes(`${ptr}/prompt`));
        assert.equal(refs.filter((f) => /\/choices\/\d+$/.test(f)).length, target.choices.length);
        break;
      default: assert.fail("unknown category " + r.category);
    }
  }
});

test("all teacher decision, correction, field-reference and comment cells are blank, and every row is UNREVIEWED", () => {
  const { rows } = csvRows();
  for (const r of rows) {
    for (const c of ["teacher_decision", "corrected_field_ref", "proposed_correction", "reviewer_comments"]) assert.equal(r[c], "", `${r.item_id}.${c}`);
    assert.equal(r.review_status, "UNREVIEWED");
  }
  const sheet = lf(readPkg("grammar-review-sheet.md"));
  assert.equal((sheet.match(/☐ ☐ ☐/g) || []).length, rows.length, "one unticked decision box set per item");
  assert.doesNotMatch(sheet, /[☑☒✔✅]|\[x\]/i, "nothing is ticked");
  const guide = lf(readPkg("REVIEWER-GUIDE.md"));
  for (const d of ["approved", "correction needed", "uncertain"]) { assert.ok(guide.includes("`" + d + "`"), "guide documents the decision " + d); assert.ok(sheet.includes(d)); }
  for (const f of ["Reviewer name", "Qualification", "Date review completed", "Scope reviewed", "Overall comments"]) { assert.ok(sheet.includes(f), "sheet sign-off: " + f); assert.ok(guide.includes(f), "guide sign-off: " + f); }
});

test("automated checks are labelled STRUCTURE ONLY and no file claims approval or verified linguistic correctness", () => {
  const { rows } = csvRows();
  for (const r of rows) assert.ok(r.automated_checks_STRUCTURE_ONLY.startsWith("STRUCTURE ONLY"), r.item_id);
  for (const r of rows.filter((x) => x.category === "example")) {
    const lessonNo = Number(r.lesson_no) - 1, ex = pointer(bundle, r.source.split("#")[1]);
    const cs = consonantsMatch(ex.ar, ex.translit), vw = vowelsMatch(ex.ar, ex.translit);
    assert.ok(r.automated_checks_STRUCTURE_ONLY.includes(`transliteration consonants match the Arabic ${cs ? "yes" : "NO"}`), r.item_id + " consonant result agrees with the independent lint");
    assert.ok(r.automated_checks_STRUCTURE_ONLY.includes(`short vowels match ${vw ? "yes" : "NO"}`), r.item_id);
    assert.doesNotMatch(r.automated_checks_STRUCTURE_ONLY, /: NO|\bNO\b/, `${r.item_id} (lesson ${lessonNo + 1}) has a failed structure check`);
  }
  // A sentence that mentions approval or verification is only acceptable when it NEGATES it (“Nothing here has been approved or verified…”).
  const claim = /\b(teacher[- ]approved|approved by|verified by|linguistically (correct|verified)|fully reviewed|review(ed)? complete|has been (approved|verified))\b/i;
  const negated = /\b(not|nothing|no|never|none|without)\b/i;
  for (const f of [...GENERATED, "grammar-drafts.json"]) for (const sentence of readPkg(f).split(/(?<=[.!?])\s+|\n/)) if (claim.test(sentence)) assert.match(sentence, negated, `${f}: a positive approval claim: ${sentence.slice(0, 100)}`);
  assert.ok(claim.test("The lessons have been approved by a teacher.") && !negated.test("The lessons have been approved by a teacher."), "the detector does catch a positive claim");
  for (const f of ["REVIEWER-GUIDE.md", "MANIFEST.txt"]) assert.ok(readPkg(f).includes("STRUCTURE ONLY"), f);
  assert.match(readPkg("MANIFEST.txt"), /^STATUS: UNREVIEWED\.$/m);
  assert.match(readPkg("REVIEWER-GUIDE.md"), /not been reviewed or approved by any qualified Arabic teacher/);
  assert.match(readPkg("grammar-review-sheet.md"), /Every item below is UNREVIEWED/);
});

test("author flags each point at a real item, and the flagged list is the same in the CSV and the sheet", () => {
  const { rows } = csvRows();
  const flagged = rows.filter((r) => r.author_flag_for_teacher);
  assert.ok(flagged.length >= 40, "the disputed / context-dependent points are flagged: " + flagged.length);
  for (const r of flagged) { assert.equal(r.suggested_priority, "high"); assert.ok(r.author_flag_for_teacher.length >= 20); }
  for (const r of rows.filter((x) => !x.author_flag_for_teacher)) assert.equal(r.suggested_priority, "standard");
  const sheet = lf(readPkg("grammar-review-sheet.md"));
  const listed = [...sheet.matchAll(/^- \*\*(GR-[A-Z]+-[A-Z]+-\d{2})\*\* \(/gm)].map((m) => m[1]);
  assert.deepEqual(listed, flagged.map((r) => r.item_id));
  // the specific topics named in the brief are flagged
  for (const id of ["GR-QUESTIONS-EXP-03", "GR-NOMINAL-EXP-06", "GR-GENDER-EXP-05", "GR-POSSESSION-EXP-02", "GR-NEGATION-EXP-05", "GR-PRESENT-EXP-06", "GR-ARTICLE-EXP-03"]) assert.ok(flagged.some((r) => r.item_id === id), id + " is flagged");
});

test("the CSV and the Markdown sheet contain the same review items, in the same order", () => {
  const { rows } = csvRows();
  const sheet = lf(readPkg("grammar-review-sheet.md"));
  const mdRows = sheet.split("\n").filter((l) => /^\| GR-/.test(l));
  const mdIds = mdRows.map((l) => l.split("|")[1].trim());
  assert.deepEqual(mdIds, rows.map((r) => r.item_id));
  mdRows.forEach((l, i) => { assert.ok(l.includes("`" + rows[i].source.split("#")[1] + "`"), rows[i].item_id + ": same source pointer"); assert.ok(l.includes(rows[i].category)); });
  for (const [i, l] of lessons.entries()) assert.ok(sheet.includes(`## Lesson ${i + 1}: ${l.title}`) && sheet.includes(`/learn-arabic/grammar/${l.slug}/\``));
  assert.ok(sheet.includes("(not live)"));
});

/* ============================== determinism and the manifest ============================== */

test("generation is deterministic and the committed package is up to date", () => {
  const check = spawnSync(process.execPath, [path.join(PKG, "build-grammar-review.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout.trim(), "up to date: 8 lessons, 258 review items, 53 flagged");
  const a = tempCopy(), b = tempCopy();
  try {
    for (const d of [a, b]) for (const f of GENERATED) fs.rmSync(path.join(d, f));
    for (const d of [a, b]) { const r = runBuilder(d); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /wrote 4 files: 8 lessons, 258 review items/); }
    for (const f of GENERATED) {
      assert.equal(fs.readFileSync(path.join(a, f), "utf8"), fs.readFileSync(path.join(b, f), "utf8"), f + ": two runs are byte-identical");
      assert.equal(lf(fs.readFileSync(path.join(a, f), "utf8")), lf(readPkg(f)), f + ": equals the committed file");
      assert.ok(!fs.readFileSync(path.join(a, f), "utf8").includes("\r"), f + ": written with LF");
    }
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

test("the package still verifies when every file has CRLF line endings (Windows checkout)", () => {
  const d = tempCopy();
  try {
    for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.writeFileSync(p, lf(fs.readFileSync(p, "utf8")).replace(/\n/g, "\r\n")); }
    assert.ok(fs.readFileSync(path.join(d, "MANIFEST.txt"), "utf8").includes("\r\n"));
    const r = runBuilder(d, "--check");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /up to date/);
    assert.equal(fs.readFileSync(path.join(d, "grammar-review-items.csv"), "utf8").charCodeAt(0), 0xFEFF, "the BOM survives");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("MANIFEST hashes identify the exact drafts, every generated file, each lesson record and the schema, and state UNREVIEWED", () => {
  const m = lf(readPkg("MANIFEST.txt"));
  const entries = [...m.matchAll(/^([0-9a-f]{64})  (\S+)(?:  (\S+))?$/gm)].map((x) => ({ hash: x[1], name: x[2], slug: x[3] }));
  const files = entries.filter((e) => e.name.startsWith(PKG_REL + "/"));
  assert.deepEqual(files.map((e) => e.name.slice(PKG_REL.length + 1)), ["grammar-drafts.json", "grammar-review-items.csv", "grammar-review-sheet.md", "REVIEWER-GUIDE.md", "build-grammar-review.mjs"]);
  for (const e of files) assert.equal(e.hash, sha(read(e.name)), e.name);
  assert.ok(!entries.some((e) => e.name.endsWith("MANIFEST.txt")), "the manifest does not list itself");
  const records = entries.filter((e) => /^gram-/.test(e.name));
  assert.deepEqual(records.map((e) => [e.name, e.slug]), EXPECTED.map(([id, slug]) => [id, slug]));
  for (const e of records) assert.equal(e.hash, sha(JSON.stringify(lessons.find((l) => l.id === e.name))), e.name + ": record hash");
  assert.equal(entries.find((e) => e.name === "assets/js/learn/grammar.js").hash, sha(read("assets/js/learn/grammar.js")));
  assert.match(m, /^STATUS: UNREVIEWED\.$/m);
  assert.match(m, /Nothing in this package has been reviewed, approved or verified by a qualified Arabic teacher/);
  assert.match(m, /\(8 lesson-summary; 57 explanation; 96 example; 31 common-mistake; 66 mini-check\)/);
});

test("any change to a draft, or a pre-filled teacher decision, is detected and changes the right hashes", () => {
  const before = lf(readPkg("MANIFEST.txt")).split("\n"), orig = lf(readPkg("grammar-drafts.json"));
  const d = tempCopy();
  try {
    const changed = orig.replace("I go to school.", "I go to the school.");
    assert.notEqual(changed, orig);
    fs.writeFileSync(path.join(d, "grammar-drafts.json"), changed);
    const stale = runBuilder(d, "--check");
    assert.equal(stale.status, 1);
    for (const f of ["grammar-review-items.csv", "grammar-review-sheet.md", "MANIFEST.txt"]) assert.ok(stale.stderr.includes(f), f + " reported stale");
    assert.equal(runBuilder(d).status, 0);
    const after = lf(fs.readFileSync(path.join(d, "MANIFEST.txt"), "utf8")).split("\n");
    const diff = after.map((l, i) => [l, before[i]]).filter(([x, y]) => x !== y).map(([x]) => x.split("  ").slice(1).join(" "));
    assert.ok(diff.some((n) => n.endsWith("grammar-drafts.json")) && diff.some((n) => n.startsWith("gram-present")), "drafts hash and only the affected lesson record hash change");
    assert.ok(!diff.some((n) => n.startsWith("gram-article")), "untouched lessons keep their hash");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  const d2 = tempCopy();
  try {
    const p = path.join(d2, "grammar-review-items.csv"), csv = lf(fs.readFileSync(p, "utf8"));   // normalised: a Windows checkout has CRLF on disk
    const filled = csv.replace(/,UNREVIEWED,([^\n]*?),(high|standard),([^\n]*?),,,,\n/, (m0) => m0.replace(/,,,,\n$/, ",approved,,,\n"));
    assert.notEqual(filled, csv);
    fs.writeFileSync(p, filled);
    assert.equal(runBuilder(d2, "--check").status, 1, "a pre-filled decision is not accepted as the generated blank package");
  } finally { fs.rmSync(d2, { recursive: true, force: true }); }
});

/* ============================== boundaries ============================== */

test("the real grammar catalogue is still empty, the drafts are not registered, and no grammar page exists", () => {
  assert.deepEqual(G.RAW, []); assert.deepEqual(G.LESSONS, []); assert.deepEqual(G.ERRORS, []);
  assert.equal((read("assets/js/learn/grammar.js").match(/const RAW = \[\];/g) || []).length, 1);
  for (const l of lessons) { assert.equal(G.byId[l.id], undefined); assert.equal(U.pathFor("grammar/" + l.id), null); }
  assert.equal(U.entries.length, 62); assert.equal(U.entries.filter((e) => e.category === "grammar").length, 0);
  assert.ok(!fs.existsSync(path.join(ROOT, "learn-arabic/grammar")), "no grammar page directory");
  const sitemap = read("sitemap.xml"); assert.equal((sitemap.match(/<loc>/g) || []).length, 78); assert.ok(!sitemap.includes("/grammar/"));
  assert.doesNotMatch(read("learn-arabic/index.html"), /Grammar lessons|learn-arabic\/grammar|href="grammar\//);
  assert.doesNotMatch(read("sw.js"), /grammar/i);
});

test("the existing page generator still reports 62 lesson pages up to date", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-learn-pages.mjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "up to date: 62 lesson pages + dashboard index");
});

const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const inGit = fs.existsSync(path.join(ROOT, ".git")) && git("rev-parse", "--is-inside-work-tree").stdout.trim() === "true";

test("milestone scope gate: the only changes in the working tree are the grammar review package and its tests", { skip: inGit ? false : "not a git work tree" }, () => {
  const status = git("status", "--porcelain", "--untracked-files=all").stdout.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ""));
  const outside = status.filter((p) => !p.startsWith("docs/arabic-grammar-review/") && !p.startsWith("tests/grammar-review/"));
  assert.deepEqual(outside, [], "files changed outside the review package and its tests");
});

test("the existing Arabic course review package and the protected course files are untouched", { skip: inGit ? false : "not a git work tree" }, () => {
  const paths = ["docs/arabic-course-review", "assets/js/learn/grammar.js", "assets/js/learn/urls.js", "scripts/build-learn-pages.mjs", "assets/js/learn/app.js", "assets/js/learn/progress.js", "assets/js/learn/journey.js", "assets/js/learn/review.js", "assets/js/learn/exercises.js", "assets/js/learn/stories.js", "assets/js/learn/sentences.js", "learn-arabic", "sitemap.xml", "sw.js"];
  assert.equal(git("diff", "--quiet", "HEAD", "--", ...paths).status, 0, "tracked files unchanged");
  assert.equal(git("ls-files", "--others", "--exclude-standard", "--", ...paths).stdout.trim(), "", "no new untracked files in those paths");
});
