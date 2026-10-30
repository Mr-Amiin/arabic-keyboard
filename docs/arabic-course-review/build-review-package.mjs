// Builds the Arabic-course review package FROM THE IMPLEMENTATION (nothing is typed in by hand):
//   review-items.csv   one row per reviewable item, with blank teacher columns
//   review-sheet.md    the same items grouped by lesson, for reading and annotating
//   REVIEWER-GUIDE.md  how to review and record corrections
// Run:  node docs/arabic-course-review/build-review-package.mjs
// It only READS source files; it never changes course content. Regenerate after any content change.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const require = createRequire(import.meta.url);
const D = require(path.join(REPO, "assets/js/learn/data.js"));
const E = require(path.join(REPO, "assets/js/learn/engine.js"));
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");

export const COLUMNS = ["item_id", "lesson_no", "lesson_title", "category", "field", "arabic_as_implemented", "plain_spelling", "transliteration",
  "english_text", "context_notes", "special_flags", "automated_checks_STRUCTURE_ONLY", "source", "unicode_codepoints", "review_status",
  "suggested_priority", "priority_reason", "teacher_decision", "proposed_correction", "reviewer_comments"];
export const DECISIONS = ["approved", "correction needed", "uncertain"];

const hex = s => [...String(s)].map(c => c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
const hasArabic = s => /[\u0600-\u06FF]/.test(s);
const pad = n => String(n).padStart(2, "0");
const strip = s => E.normalizeAr(s);
const FLAGS = [
  ["hamza", /[أإآؤئء]/], ["dagger-alif", /\u0670/], ["ta-marbuta", /ة/], ["shadda", /\u0651/], ["tanween", /[\u064B-\u064D]/],
  ["sukun", /\u0652/], ["alif-maqsura", /ى/]
];
const NONJOIN = new Set(D.NON_CONNECTING);
// Only features that need specialist judgement raise priority; sukun / ordinary non-joining letters are routine.
const HIGH_FLAGS = ["hamza", "dagger-alif", "ta-marbuta", "alif-maqsura", "tanween", "shadda", "lam-alif-ligature"];
const highOf = sp => String(sp || "").split("; ").filter(f => HIGH_FLAGS.includes(f)).join("; ");
const flagsFor = (...texts) => {
  const t = texts.join(" "); const f = FLAGS.filter(([, re]) => re.test(t)).map(([n]) => n);
  const word = Array.from(strip(texts[0] || "")); const mid = word.slice(0, -1).filter(c => NONJOIN.has(c) || /[ةءؤ]/.test(c));
  if (mid.length) f.push("non-joining-letter-inside-word");
  if (/لا/.test(strip(texts[0] || ""))) f.push("lam-alif-ligature");
  if (/[ةءأإآؤئى]/.test(t)) f.push("uses-character-outside-the-28-letter-table");
  return [...new Set(f)].join("; ");
};

// Machine-derived joining/shape table for a word (rules only; flagged for the teacher to confirm).
const joinsForward = c => !NONJOIN.has(c) && !/[ةءؤأإآى]/.test(c);
function shapeTable(word) {
  const L = Array.from(strip(word).replace(/ا(?=)/g, "ا")); // letters only (marks and hamza seats already normalised)
  const raw = Array.from(word.replace(/[\u064B-\u065F\u0670\u0640]/g, ""));
  return raw.map((c, i) => {
    const pj = i > 0 && joinsForward(raw[i - 1]) && c !== "ء";
    const nj = i < raw.length - 1 && joinsForward(c) && raw[i + 1] !== "ء";
    return `${c} (${pj && nj ? "medial" : nj ? "initial" : pj ? "final" : "isolated"})`;
  }).join("  ") + (/لا/.test(strip(word)) ? "  [NOTE: ل followed by ا is normally written as the lam-alif ligature لا, not as two separate shapes]" : "");
}

const rows = [];
function add(r) {
  // every column always exists (as "" when not applicable) so rows, CSV and Markdown can never disagree about missing values
  const row = Object.assign(Object.fromEntries(COLUMNS.map(c => [c, ""])), { suggested_priority: "standard" }, r);
  row.unicode_codepoints = hasArabic(row.arabic_as_implemented) ? hex(row.arabic_as_implemented) : "";
  row.review_status = "REQUIRES REVIEW";
  row.teacher_decision = ""; row.proposed_correction = ""; row.reviewer_comments = "";   // intentionally blank: no approvals are pre-filled
  if (hasArabic(row.arabic_as_implemented) && row.arabic_as_implemented !== row.arabic_as_implemented.normalize("NFC")) row.automated_checks_STRUCTURE_ONLY += " NOT-NFC;";
  rows.push(row);
}
const nfcOk = s => (s === s.normalize("NFC") ? "NFC ok" : "NOT NFC");
const PRIORITY_LETTERS = { hah: "pharyngeal sound: no English equivalent", sad: "emphatic consonant", dad: "emphatic consonant", tah: "emphatic consonant", zah: "emphatic consonant", ayn: "pharyngeal sound: no English equivalent", ghayn: "uvular sound", qaf: "uvular sound; dialect variation claimed", kha: "uvular/velar fricative: comparison with Scottish/German", jim: "dialect variation claimed (Egyptian g)", tha: "dialect variation claimed", zah_: "" };

/* ---------- letter lessons ---------- */
D.LETTERS.forEach(l => {
  const n = pad(l.order), id = "L" + n, lesson = String(l.order), title = `Letter ${l.order}: ${l.nameEn} ${l.letter} (${l.nameAr})`;
  const src = i => `assets/js/learn/data.js → LETTERS[${l.order - 1}]${i}`;
  const base = { lesson_no: lesson, lesson_title: title };
  const pr = PRIORITY_LETTERS[l.id];
  add({ ...base, item_id: `${id}-LETTER`, category: "alphabet", field: "letter, Arabic name, English name, sound label, difficulty tag", arabic_as_implemented: `${l.letter}  |  ${l.nameAr}`,
    transliteration: l.nameEn, english_text: `Sound label: ${l.sound}. Difficulty tag: ${l.difficulty}.`, context_notes: `Roman consonant used in syllable labels: “${l.roman}”. Position in alphabet: ${l.order}.`,
    special_flags: l.connects ? "" : "non-joining-letter", automated_checks_STRUCTURE_ONLY: `letter is one of the 28; name/sound unique; ${nfcOk(l.letter + l.nameAr)}`, source: src(""), suggested_priority: pr ? "high" : "standard", priority_reason: pr || "" });
  add({ ...base, item_id: `${id}-SAY`, category: "pronunciation", field: "pronunciation guidance (English-speaker approximation)", arabic_as_implemented: "", english_text: l.say,
    context_notes: "Teacher: is this approximation accurate, safe for beginners, and correctly scoped to MSA?", special_flags: /dialect|Egyptian|dialects/i.test(l.say) ? "makes-a-dialect-claim" : "", automated_checks_STRUCTURE_ONLY: "text present, > 10 chars", source: src(".say"),
    suggested_priority: pr || /dialect/i.test(l.say) ? "high" : "standard", priority_reason: pr || (/dialect/i.test(l.say) ? "dialect claim" : "") });
  add({ ...base, item_id: `${id}-DOTS`, category: "alphabet", field: "how to tell the letter apart (dots)", arabic_as_implemented: l.letter, english_text: l.dots, source: src(".dots"), automated_checks_STRUCTURE_ONLY: "text present" });
  const f = l.forms;
  add({ ...base, item_id: `${id}-SHAPES`, category: "letter-shapes", field: "isolated / beginning / middle / end forms (derived from the isolated letter + joining flag)",
    arabic_as_implemented: `isolated ${f.isolated}  |  beginning ${f.initial === null ? "— (none)" : f.initial}  |  middle ${f.medial === null ? "— (none)" : f.medial}  |  end ${f.final}`,
    english_text: l.connects ? "Joins to the letter after it: four shapes." : "Does NOT join to the letter after it: only isolated (also used at the start of a word) and final (after a joining letter).",
    context_notes: "Forms are generated with a tatweel (ـ U+0640) to show the joining side. Confirm the displayed shapes and the joining statement.", special_flags: l.connects ? "" : "non-joining-letter",
    automated_checks_STRUCTURE_ONLY: `connects flag = ${l.connects}; non-joining set matches ا د ذ ر ز و: ${l.connects === !NONJOIN.has(l.letter)}`, source: src(".forms / .connects"), suggested_priority: l.connects ? "standard" : "high", priority_reason: l.connects ? "" : "non-joining letter" });
  add({ ...base, item_id: `${id}-SYL`, category: "harakat", field: "letter with fatha / kasra / damma (syllable examples)", arabic_as_implemented: l.syllables.map(s => s[0]).join("  "),
    transliteration: l.syllables.map(s => s[1]).join("  "), english_text: "Short vowels a / i / u on this letter" + (l.letter === "ا" ? " (alif is shown with hamza: أَ إِ أُ)" : ""),
    special_flags: l.letter === "ا" ? "hamza" : "", automated_checks_STRUCTURE_ONLY: `3 syllables; ${nfcOk(l.syllables.map(s => s[0]).join(""))}`, source: src(".syllables"), suggested_priority: l.letter === "ا" ? "high" : "standard", priority_reason: l.letter === "ا" ? "hamza-seated alif used as the carrier" : "" });
  l.examples.forEach((e, i) => {
    const chars = Array.from(strip(e.plain)), t = strip(l.letter);
    const posOk = e.position === "initial" ? chars[0] === t : e.position === "final" ? chars[chars.length - 1] === t : chars.slice(1, -1).includes(t);
    const specials = flagsFor(e.vowelled);
    add({ ...base, item_id: `${id}-W${i + 1}`, category: "example-word", field: "example word", arabic_as_implemented: e.vowelled, plain_spelling: e.plain, transliteration: e.translit, english_text: e.meaning,
      context_notes: `Target letter ${l.letter} claimed at the ${e.position.toUpperCase()} position. Connected shapes (machine-derived, confirm): ${shapeTable(e.plain)}`,
      special_flags: specials, automated_checks_STRUCTURE_ONLY: `vowelled = plain after stripping marks: ${strip(e.vowelled) === strip(e.plain)}; letter at claimed position: ${posOk}; ${nfcOk(e.vowelled)}`,
      source: src(`.examples[${i}]`), suggested_priority: highOf(specials) || !posOk ? "high" : "standard", priority_reason: !posOk ? "position check failed" : highOf(specials) ? "contains " + highOf(specials) : "" });
  });
});

/* ---------- quick-check and missing-letter exercises, taken from the real question generator ---------- */
D.LETTERS.forEach(l => {
  const id = "L" + pad(l.order), lesson = String(l.order), title = `Letter ${l.order}: ${l.nameEn} ${l.letter} (${l.nameAr})`, base = { lesson_no: lesson, lesson_title: title };
  const qn = E.makeQuestion("name", l.id, E.mulberry32(1)), qs = E.makeQuestion("sound", l.id, E.mulberry32(1));
  const correct = q => q.options.find(o => o.value === q.answer).label;
  add({ ...base, item_id: `${id}-QC-NAME`, category: "quick-check", field: "question: name this letter", arabic_as_implemented: qn.show, english_text: `Prompt: ${qn.prompt}  Correct answer: ${correct(qn)}.  Explanation shown: ${qn.explanation}`,
    context_notes: "Answer options = the correct name + 3 distractors, randomly chosen (look-alike letters preferred). Distractors are not fixed.", automated_checks_STRUCTURE_ONLY: "correct answer always among 4 distinct options (tested over many seeds)", source: "assets/js/learn/engine.js → makeQuestion('name')" });
  add({ ...base, item_id: `${id}-QC-SOUND`, category: "quick-check", field: "question: which letter makes this sound", arabic_as_implemented: correct(qs), english_text: `Prompt: ${qs.prompt}  Explanation shown: ${qs.explanation}`,
    context_notes: "Arabic = the correct answer letter. Options are the correct letter + 3 randomly chosen distractors.", automated_checks_STRUCTURE_ONLY: "correct answer always present", source: "assets/js/learn/engine.js → makeQuestion('sound')", suggested_priority: PRIORITY_LETTERS[l.id] ? "high" : "standard", priority_reason: PRIORITY_LETTERS[l.id] ? "sound label is an approximation: " + PRIORITY_LETTERS[l.id] : "" });
  const seen = new Map(); for (let s = 1; s <= 60; s++) { const q = E.makeQuestion("form", l.id, E.mulberry32(s)); if (!seen.has(q.show)) seen.set(q.show, q); }
  [...seen.values()].forEach((q, i) => add({ ...base, item_id: `${id}-QC-FORM${i + 1}`, category: "quick-check", field: "question: which letter is this shape", arabic_as_implemented: q.show, english_text: `Prompt: ${q.prompt}  Correct answer: ${l.letter}.  Explanation shown: ${q.explanation}`,
    special_flags: l.connects ? "" : "non-joining-letter", automated_checks_STRUCTURE_ONLY: "correct answer always present", source: "assets/js/learn/engine.js → makeQuestion('form')" }));
  const miss = new Map(); for (let s = 1; s <= 80; s++) { const q = E.makeQuestion("missing", l.id, E.mulberry32(s)); miss.set(q.blank.before + "|" + q.blank.after, q); }
  [...miss.values()].forEach((q, i) => add({ ...base, item_id: `${id}-MISS${i + 1}`, category: "missing-letter exercise", field: "word shown with one letter missing", arabic_as_implemented: `${q.blank.before} ▁ ${q.blank.after}`,
    plain_spelling: strip(q.blank.before + l.letter + q.blank.after), english_text: `Prompt: ${q.prompt}  Explanation shown: ${q.explanation}`,
    context_notes: `The blank is drawn as a gap; the letter after it joins the gap only if the missing letter joins forward (here: ${q.blank.joinAfter ? "yes" : "no"}). The meaning in the prompt is what makes the answer unambiguous: confirm no other option also forms a valid word with that meaning.`,
    special_flags: flagsFor(q.blank.before + l.letter + q.blank.after), automated_checks_STRUCTURE_ONLY: "word rebuilds to an example word; join flag matches the letter", source: "assets/js/learn/engine.js → makeQuestion('missing')" }));
});

/* ---------- similar-letter groups ---------- */
D.SIMILAR_GROUPS.forEach((g, i) => {
  const ls = g.map(id => D.LETTERS.find(l => l.id === id));
  add({ item_id: `X-SIMILAR${i + 1}`, lesson_no: "X", lesson_title: "Cross-cutting: look-alike letter groups", category: "look-alike group", field: "letters treated as visually similar, with the distinguishing dots",
    arabic_as_implemented: ls.map(l => l.letter).join("  "), english_text: ls.map(l => `${l.letter} ${l.nameEn}: ${l.dots}`).join("; "), automated_checks_STRUCTURE_ONLY: "all members are real letters", source: `assets/js/learn/data.js → SIMILAR_GROUPS[${i}]` });
});

/* ---------- harakat ---------- */
D.HARAKAT.forEach((h, i) => add({ item_id: `H-MARK-${h.id.toUpperCase()}`, lesson_no: i < 3 ? "H1" : "H2", lesson_title: i < 3 ? D.HARAKAT_LESSONS[0].title : D.HARAKAT_LESSONS[1].title, category: "harakat", field: "mark explanation + example",
  arabic_as_implemented: `${h.nameAr}  |  mark: ${h.mark}  |  example: ${h.example[0]}  |  word: ${h.word[0]}`, plain_spelling: strip(h.word[0]), transliteration: `${h.example[1]}  |  ${h.word[1]}`, english_text: `${h.nameEn}: ${h.sound}. ${h.note}  Example word meaning: ${h.word[2]}`,
  special_flags: flagsFor(h.word[0], h.example[0]), automated_checks_STRUCTURE_ONLY: `marks used are valid Unicode combining marks; ${nfcOk(h.word[0] + h.example[0])}`, source: `assets/js/learn/data.js → HARAKAT[${i}]`,
  suggested_priority: ["tanween", "shadda"].includes(h.id) ? "high" : "standard", priority_reason: h.id === "tanween" ? "describes pausal-form behaviour and the alif seat for fathatayn" : h.id === "shadda" ? "ordering of shadda and vowel marks" : "" }));
D.HARAKAT_LESSONS.forEach((h, hi) => {
  const no = "H" + (hi + 1);
  add({ item_id: `${no}-INTRO`, lesson_no: no, lesson_title: h.title, category: "harakat", field: "lesson introduction", english_text: h.intro, automated_checks_STRUCTURE_ONLY: "text present", source: `assets/js/learn/data.js → HARAKAT_LESSONS[${hi}].intro`, suggested_priority: "high", priority_reason: "factual claims about when marks are written" });
  h.check.forEach((c, qi) => add({ item_id: `${no}-Q${qi + 1}`, lesson_no: no, lesson_title: h.title, category: "quick-check", field: "question + answer options", arabic_as_implemented: c[1].filter(hasArabic).join("  "), english_text: `Question: ${c[0]}  Options: ${c[1].map((o, oi) => (oi === c[2] ? "[CORRECT] " : "") + o).join(" / ")}  Explanation shown: ${c[3]}`,
    special_flags: flagsFor(c[1].filter(hasArabic).join(" "), c[3]), automated_checks_STRUCTURE_ONLY: `correct index ${c[2]} is within the options`, source: `assets/js/learn/data.js → HARAKAT_LESSONS[${hi}].check[${qi}]` }));
});

/* ---------- reading & typing stages ---------- */
D.READING_STAGES.forEach((s, si) => {
  const no = "R" + (si + 1), mode = { letters: "typed; letters must match, harakat optional", exact: "typed; letters AND harakat must match exactly", choice: "multiple choice (read the mark, choose its sound)" }[s.check];
  add({ item_id: `${no}-STAGE`, lesson_no: no, lesson_title: s.title, category: "reading-stage", field: "stage definition + how answers are graded", english_text: `${s.title}. Grading: ${mode}.`, automated_checks_STRUCTURE_ONLY: `check mode = ${s.check}`, source: `assets/js/learn/data.js → READING_STAGES[${si}]` });
  s.items.forEach((it, ii) => {
    const sp = flagsFor(it[0]);
    add({ item_id: `${no}-I${ii + 1}`, lesson_no: no, lesson_title: s.title, category: "reading-item", field: "text the learner reads/types", arabic_as_implemented: it[0], plain_spelling: strip(it[0]), transliteration: it[1], english_text: it[2],
      context_notes: `Grading: ${mode}. ` + (hasArabic(it[0]) && Array.from(strip(it[0])).length > 1 ? `Connected shapes (machine-derived, confirm): ${shapeTable(it[0])}` : ""),
      special_flags: sp, automated_checks_STRUCTURE_ONLY: `${nfcOk(it[0])}; typed answer accepted when typed exactly and (letters mode) without marks`, source: `assets/js/learn/data.js → READING_STAGES[${si}].items[${ii}]`,
      suggested_priority: highOf(sp) ? "high" : "standard", priority_reason: highOf(sp) ? "contains " + highOf(sp) : "" });
  });
  if (s.check === "choice") E.readingChoice(s.items, E.mulberry32(1)).forEach((q, qi) => add({ item_id: `${no}-Q${qi + 1}`, lesson_no: no, lesson_title: s.title, category: "quick-check", field: "generated reading question", arabic_as_implemented: q.show,
    english_text: `Prompt: ${q.prompt}  Correct: ${q.answer}.  Options (order random): ${q.options.map(o => o.value).sort().join(" / ")}.  Explanation shown: ${q.explanation}`, automated_checks_STRUCTURE_ONLY: "correct option present; 4 distinct options", source: "assets/js/learn/engine.js → readingChoice()" }));
});

/* ---------- page text and templates that carry teaching claims ---------- */
const html = read("learn-arabic/index.html"), app = read("assets/js/learn/app.js");
const text = h => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const lead = html.match(/<p class="lead lang-en"[^>]*>([\s\S]*?)<\/p>/); if (lead) add({ item_id: "P-LEAD", lesson_no: "P", lesson_title: "Page text", category: "page-text", field: "hero sentence", english_text: text(lead[1]), source: "learn-arabic/index.html (hero)" });
const intro = html.match(/<section class="lx-intro"[\s\S]*?<\/section>/)[0];
[...intro.matchAll(/<(h2|p)[^>]*>([\s\S]*?)<\/\1>/g)].forEach((m, i) => {
  const t = text(m[2]); add({ item_id: `P-INTRO${i + 1}`, lesson_no: "P", lesson_title: "Page text", category: "page-text", field: m[1] === "h2" ? "heading" : "paragraph", arabic_as_implemented: (t.match(/[\u0600-\u06FF][\u0600-\u06FF\s\u064B-\u065F]*/g) || []).join("  |  "),
    english_text: t, special_flags: /non-joining|never join/i.test(t) ? "non-joining-letter" : "", source: "learn-arabic/index.html (section.lx-intro)", suggested_priority: m[1] === "p" ? "high" : "standard", priority_reason: m[1] === "p" ? "explains joining rules and dialect scope to learners" : "" });
});
const conn = app.match(/const conn = l\.connects \? esc\(l\.letter\) \+ "(.*?)" : esc\(l\.letter\) \+ "(.*?)";/);
if (conn) {
  add({ item_id: "X-JOIN-YES", lesson_no: "X", lesson_title: "Cross-cutting: lesson text templates", category: "page-template", field: "sentence shown on every JOINING letter's lesson (“<letter>” is inserted)", english_text: "<letter>" + conn[1], source: "assets/js/learn/app.js → letter(): const conn", suggested_priority: "high", priority_reason: "states the joining rule" });
  add({ item_id: "X-JOIN-NO", lesson_no: "X", lesson_title: "Cross-cutting: lesson text templates", category: "page-template", field: "sentence shown on every NON-JOINING letter's lesson (“<letter>” is inserted)", english_text: "<letter>" + conn[2], special_flags: "non-joining-letter", source: "assets/js/learn/app.js → letter(): const conn", suggested_priority: "high", priority_reason: "states the non-joining rule" });
}
add({ item_id: "X-AUDIO-NOTE", lesson_no: "X", lesson_title: "Cross-cutting: lesson text templates", category: "page-template", field: "caution shown on every lesson", english_text: "Transliteration is only a rough guide. (followed by the device-voice status message from audio.js)", source: "assets/js/learn/app.js → letter()/harakat()", automated_checks_STRUCTURE_ONLY: "text present" });

/* ---------- learner-facing instructional sentences hard-coded in the UI layer (app.js) ----------
   Each sentence is VERIFIED against the source: if the app wording changes, this throws, so the package can never silently drift
   from what learners actually see. Re-run the generator (and update this list) after any such change. */
const UI_SENTENCES = [
  ["X-UI-HARAKAT-LINE", "sentence on every letter lesson, above the letter-with-harakat examples", "Short vowel marks change how the letter is read.", "", "standard"],
  ["X-UI-READING-INTRO", "introduction on the Reading and typing page", "Work up from single letters to sentences. Read the Arabic, then type it. An on-screen Arabic keyboard (including harakat keys) opens when you start typing, and your own keyboard works too. The vocabulary is Modern Standard Arabic.", "claims the vocabulary is Modern Standard Arabic", "high"],
  ["X-UI-TYPE-LETTERS", "typing instruction in stages graded on letters only", "The check compares letters only, so harakat are optional.", "defines what counts as correct", "high"],
  ["X-UI-TYPE-EXACT", "typing instruction in the stage graded on letters AND harakat", "(use the mark keys on the Arabic keyboard); the letters and marks must both match.", "defines what counts as correct (shown after the words “Include the harakat”)", "high"],
  ["X-UI-MARKS-MISS", "feedback when letters are right but harakat differ", "The letters are right, but the harakat do not match.", "feedback shown to learners", "standard"],
  ["X-UI-STAGE-CHOICE", "stage card text for the harakat-reading stage", "items: read each mark and choose its sound.", "", "standard"],
  ["X-UI-STAGE-EXACT", "stage card text for the vowelled-words stage", "items to type with harakat (letters and marks must match).", "", "standard"],
  ["X-UI-STAGE-LETTERS", "stage card text for letters-only typing stages", "items to read and type (harakat optional).", "", "standard"],
  ["X-UI-PASS-RULE", "rule shown before every quick check", "Get at least 2 right to complete this lesson.", "pedagogical rule: 2 of 3 correct completes a lesson", "high"]
];
UI_SENTENCES.forEach(([id, field, sentence, why, prio]) => {
  if (!app.includes(sentence)) throw new Error(`UI sentence for ${id} not found in app.js: the app wording changed; update UI_SENTENCES in build-review-package.mjs`);
  add({ item_id: id, lesson_no: "X", lesson_title: "Cross-cutting: lesson text templates", category: "page-template", field, english_text: sentence, context_notes: "Exact wording taken from the UI code; shown to every learner in the situation described in “field”.",
    automated_checks_STRUCTURE_ONLY: "sentence verified present in assets/js/learn/app.js at generation time", source: "assets/js/learn/app.js", suggested_priority: prio, priority_reason: why });
});

/* ---------- special-case index ---------- */
export function specialIndex() {
  const idx = {}; rows.forEach(r => (r.special_flags || "").split("; ").filter(Boolean).forEach(f => (idx[f] = idx[f] || []).push(r.item_id)));
  return idx;
}

/* ---------- outputs ---------- */
const q = v => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCsv = () => "\uFEFF" + [COLUMNS.join(","), ...rows.map(r => COLUMNS.map(c => q(r[c])).join(","))].join("\r\n") + "\r\n";
const cell = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
export function toMarkdown() {
  const out = [`# Arabic course review sheet`, ``, `Generated from the implementation by \`docs/arabic-course-review/build-review-package.mjs\`. **Every item below is UNREVIEWED.** Nothing here has been approved by a qualified Arabic teacher.`, `Read \`REVIEWER-GUIDE.md\` first. Record decisions in \`review-items.csv\` (same item IDs) or tick the boxes here.`, ``,
    `Decision key: ☐ approved · ☐ correction needed · ☐ uncertain. “Priority” is a machine-assigned suggestion (see the guide), not a linguistic judgement. Arabic text is shown exactly as implemented; open this file in a viewer with an Arabic font.`, ``];
  const lessons = []; rows.forEach(r => { if (!lessons.includes(r.lesson_no)) lessons.push(r.lesson_no); });
  const order = l => (/^\d+$/.test(l) ? Number(l) : { H1: 100, H2: 101, R1: 110, R2: 111, R3: 112, R4: 113, R5: 114, R6: 115, X: 200, P: 300 }[l] ?? 400);
  lessons.sort((a, b) => order(a) - order(b)).forEach(l => {
    const rs = rows.filter(r => r.lesson_no === l); out.push(`## ${rs[0].lesson_title}`, ``);
    out.push(`| ID | Category | Arabic (as implemented) | Plain / transliteration | English / explanation / notes | Flags | Priority | Decision |`, `|---|---|---|---|---|---|---|---|`);
    rs.forEach(r => out.push(`| ${cell(r.item_id)} | ${cell(r.category)}${r.field ? "<br>" + cell(r.field) : ""} | ${cell(r.arabic_as_implemented)} | ${cell([r.plain_spelling, r.transliteration].filter(Boolean).join("  /  "))} | ${cell(r.english_text)}${r.context_notes ? "<br>" + cell(r.context_notes) : ""} | ${cell(r.special_flags)} | ${r.suggested_priority}${r.priority_reason ? " (" + cell(r.priority_reason) + ")" : ""} | ☐ ☐ ☐ |`));
    out.push(``);
  });
  out.push(`## Special-case index`, ``, `Items grouped by the feature that usually needs a second look. IDs refer to rows above.`, ``);
  const idx = specialIndex(); Object.keys(idx).sort().forEach(k => out.push(`- **${k}** (${idx[k].length}): ${idx[k].join(", ")}`));
  return out.join("\n") + "\n";
}
export function toGuide() {
  const c = {}; rows.forEach(r => (c[r.category] = (c[r.category] || 0) + 1));
  const hi = rows.filter(r => r.suggested_priority === "high").length, idx = specialIndex();
  return `# Reviewer guide — Arabic course content

## What this is
The Learn Arabic course (alphabet, harakat, reading practice) was written and tested by software. Automated tests can check **structure** (for example: all 28 letters exist, a vowelled spelling matches its plain spelling, a letter sits where the lesson says). They **cannot** tell whether a pronunciation note is good teaching, whether a word is natural Modern Standard Arabic, or whether an English meaning is the best choice. **That judgement needs a qualified Arabic teacher.** Until a teacher has completed this review, none of the course content should be described as linguistically verified.

## Files
| File | Purpose |
|---|---|
| \`review-items.csv\` | One row per reviewable item (${rows.length} rows). Open in Excel/Sheets (UTF-8 with BOM, so Arabic displays correctly). **Fill in the last three columns.** |
| \`review-sheet.md\` | The same items grouped by lesson, easier to read straight through. |
| \`build-review-package.mjs\` | Regenerates both files from the course source, so every value traces to a source location (the \`source\` column). |

## Contents
${Object.keys(c).sort().map(k => `- ${k}: ${c[k]} items`).join("\n")}

${hi} items are marked **high** priority. This is a rule-based suggestion (emphatic/pharyngeal/uvular letters, claims about dialects, hamza, dagger alif, ta marbuta, non-joining letters, factual statements about the writing system). It is not a judgement that other items are safe, so please review all of them.

## How to review
1. Work lesson by lesson. For each row, read the **arabic_as_implemented**, **plain_spelling**, **transliteration** and **english_text** columns and check them against your own knowledge and a reference you trust.
2. In **teacher_decision** enter exactly one of: \`${DECISIONS.join("`, `")}\`.
3. If the decision is \`correction needed\`, write the exact replacement in **proposed_correction** (Arabic with all marks you want, then transliteration and English if they change) and explain in **reviewer_comments**.
4. Use \`uncertain\` whenever you cannot confirm an item, and say why in **reviewer_comments**. Please do not guess.
5. Do not edit item IDs or the other columns. IDs are how corrections are matched back to the source.
6. When finished, fill in the sign-off block below.

## What to check, by category
- **alphabet / letter-shapes:** letter, Arabic name, English label, dots description; isolated / beginning / middle / end forms; the joining statement. The six letters that do not join to the following letter are ${D.NON_CONNECTING.join(" ")}.
- **pronunciation:** accuracy and safety of each English-speaker approximation; whether statements about dialects are correct and appropriately worded; whether the guidance is MSA.
- **example-word:** correct spelling; correct short-vowel marks; correct transliteration; best English meaning; natural MSA usage; the position (beginning/middle/end) of the target letter. The context column contains **machine-derived** connected shapes: please confirm them, as they are produced by a simple joining rule.
- **harakat:** definitions, sounds, where each mark is written, and the notes about tanween and shadda.
- **quick-check / missing-letter exercise:** is the keyed answer correct; is the explanation shown to learners accurate; could a distractor also produce a valid word with the stated meaning.
- **reading-stage / reading-item:** spelling and vowelling, transliteration, meaning; whether the stage order is a sensible beginner progression; whether the stated grading (letters only, or letters and harakat) suits the stage.
- **page-text / page-template:** statements the page makes to every learner about joining rules, audio and dialects.

## Special cases that need extra care
${Object.keys(idx).sort().map(k => `- **${k}**: ${idx[k].length} items (listed at the end of \`review-sheet.md\`)`).join("\n")}

## What the automated checks do and do not cover
The column \`automated_checks_STRUCTURE_ONLY\` records what software verified. It never means a row is approved. In particular, software has **not** checked: pronunciation, naturalness of usage, correctness of English meanings, correctness of vowel marks beyond consistency with the plain spelling, or dialect statements.

## Known limits of the course content (for context)
- Examples are Modern Standard Arabic; dialect pronunciations are mentioned only briefly.
- Transliteration is a rough guide; audio uses a device text-to-speech voice (not native recordings) where available.
- Words containing hamza, ta marbuta or alif maqsura use characters beyond the 28-letter table; they are flagged \`uses-character-outside-the-28-letter-table\`.

## After the review
A developer will apply corrections using the \`source\` column and the proposed corrections, regenerate this package, and re-run the automated tests. Please keep the returned CSV: it is the record of what was approved. Do not edit course files directly.

## Note on location
This folder sits inside the website repository's root. If the site is published from the repository root, these files may be publicly reachable at their paths. They contain only course content, but publication is a decision for the site owner.

## Reviewer sign-off (to be completed by the reviewer)
- Reviewer name:
- Qualification / relevant experience:
- Date review completed:
- Scope reviewed (all items / listed lessons only):
- Overall comments:
`;
}
export function buildPackage() { return { rows, csv: toCsv(), markdown: toMarkdown(), guide: toGuide(), special: specialIndex() }; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = buildPackage();
  fs.writeFileSync(path.join(HERE, "review-items.csv"), p.csv); fs.writeFileSync(path.join(HERE, "review-sheet.md"), p.markdown); fs.writeFileSync(path.join(HERE, "REVIEWER-GUIDE.md"), p.guide);
  console.log(`rows: ${p.rows.length}; csv: ${p.csv.length} chars; sheet: ${p.markdown.length} chars; high priority: ${p.rows.filter(r => r.suggested_priority === "high").length}`);
}
