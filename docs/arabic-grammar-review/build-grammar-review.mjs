// Builds the Arabic GRAMMAR review package from grammar-drafts.json (the single source of the draft lessons):
//   grammar-review-items.csv   one row per reviewable item, with blank teacher columns
//   grammar-review-sheet.md    the same items grouped by lesson, for reading and annotating
//   REVIEWER-GUIDE.md          how to review and record exact corrections
//   MANIFEST.txt               SHA-256 hashes of the drafts and of every generated file, and the explicit UNREVIEWED status
// Run:    node docs/arabic-grammar-review/build-grammar-review.mjs          (writes the four files)
//         node docs/arabic-grammar-review/build-grammar-review.mjs --check  (exits 1 if any file is stale; writes nothing)
// Options: --dir <folder>  package folder to read from and write to (default: the folder of this script)
//          --repo <folder> repository root, used only to load assets/js/learn/grammar.js (default: two levels above this script)
// It only READS grammar-drafts.json and assets/js/learn/grammar.js. It never changes the live course, the grammar catalogue or any page.
// It is deterministic: no timestamps, a fixed item order, LF line endings, and hashes taken over LF-normalised text (so they match on
// Windows checkouts that convert line endings). EVERY automated check below is STRUCTURE ONLY: none of them says a lesson is correct.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : fallback; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = opt("--dir", HERE);
const REPO = opt("--repo", path.resolve(HERE, "../.."));
const CHECK = argv.includes("--check");
const PKG = "docs/arabic-grammar-review";          // path used in every reference, whatever --dir is
const DRAFTS = "grammar-drafts.json";
const G = require(path.join(REPO, "assets/js/learn/grammar.js"));

/* ---------------- author flags: points a teacher is specially asked to assess ----------------
   Keyed by stable item ID. These are the AUTHOR's notes about explanations that are simplified, disputed or context dependent.
   They are not teacher decisions and do not say anything is wrong. */
const AUTHOR_FLAGS = {
  "GR-ARTICLE-EXP-02": "Says the first moon letter, alif, stands for words that begin with a hamza (for example الْأَبُ). Please confirm this is an acceptable way to present the 14 moon letters.",
  "GR-ARTICLE-EXP-03": "Teaching aid: the claim that all sun letters are made with the front of the tongue and that the lam “blends into” them. Please assess its accuracy and whether it suits beginners.",
  "GR-ARTICLE-EXP-04": "Silent alif of ال after another word (hamzat al-wasl): the elision rule, the pronunciation “fil-bayti”, and the course transliteration convention “l-”.",
  "GR-ARTICLE-EX-09": "اللَّيْلُ: the lam is itself a sun letter, so the doubled lam is said “allaylu”. Please confirm the description and the transliteration “al-laylu”.",
  "GR-ARTICLE-EX-12": "فِي الْبَيْتِ shows a kasra case ending before case endings are taught (lesson 8), and the note “said fil-bayti”. Please confirm.",
  "GR-NOMINAL-EXP-02": "Broad statement that an ordinary present-tense nominal sentence has no word for “am/is/are”. This is context dependent (other tenses use كَانَ, and a pronoun can appear between the two parts of some sentences). Please assess the level of simplification.",
  "GR-NOMINAL-EXP-03": "Case endings: the subject ends in a damma, and an indefinite predicate in tanween damma. Please confirm the endings shown.",
  "GR-NOMINAL-EXP-05": "Plurals used with نَحْنُ: طُلَّابٌ for men or a mixed group and طَالِبَاتٌ for women, and the statement that plurals have no single rule.",
  "GR-NOMINAL-EXP-06": "Nominal versus verbal sentences. Traditional grammar classes a sentence that begins with a pronoun or noun followed by a verb as nominal; the lessons use pronoun + verb sentences for clarity and teach verb-first sentences in lesson 7. Presentation varies between teachers; please assess.",
  "GR-NOMINAL-EX-08": "طُلَّابٌ as the plural “students” for men or a mixed group.",
  "GR-NOMINAL-EX-09": "طَالِبَاتٌ as the sound feminine plural with tanween damma.",
  "GR-NOMINAL-CHK-02": "The keyed answer (“there is no word for am”) depends on the broad statement flagged in GR-NOMINAL-EXP-02.",
  "GR-GENDER-EXP-02": "Claims that the vowel before ة is always a fatha, and that ة is added to the masculine form for many (not all) words, especially people.",
  "GR-GENDER-EXP-03": "Pronunciation of ة: “a” (or a soft “h”) in pause or without case endings, and “t” when something follows.",
  "GR-GENDER-EXP-05": "Exceptions: أُمّ, أُخْت, شَمْس, يَد and عَيْن as feminine without ة; خَلِيفَة and the name أُسَامَةُ as masculine with ة; the sun feminine and the moon masculine.",
  "GR-GENDER-EX-10": "يَدٌ presented as a feminine noun without ة.",
  "GR-GENDER-EX-11": "Feminine agreement with الشَّمْسُ (the sun) and the adjective جَمِيلَةٌ.",
  "GR-GENDER-EX-12": "أُسَامَةُ: a man’s name that ends in ة, written without tanween. Please confirm the case ending and the description.",
  "GR-ADJECTIVES-EXP-01": "States that the adjective agrees in gender, definiteness and case. Plural agreement (including non-human plurals) is deliberately not covered.",
  "GR-ADJECTIVES-EXP-04": "Phrase versus sentence: the adjective after a definite noun is presented as what is said about it (a predicate) when it has no ال. Please assess the wording for beginners.",
  "GR-POSSESSION-EXP-02": "Three rules of the idafa: “nothing can come between the two nouns” (a simplification), the case ending of the first noun, and that an indefinite second noun makes the whole phrase indefinite.",
  "GR-POSSESSION-EXP-03": "ة in the first noun of an idafa is pronounced “t” because the second noun follows.",
  "GR-POSSESSION-EXP-04": "Possessive endings ـِي ـكَ ـكِ ـهُ ـهَا ـنَا and the claim that the noun then takes neither ال nor tanween. The vowel before the ending can change with case; this is not shown.",
  "GR-POSSESSION-EX-05": "اِسْمُ الْوَلَدِ: written with a kasra on the alif of اِسْم (hamzat al-wasl) following the course spelling.",
  "GR-POSSESSION-EX-06": "كِتَابُ طَالِبٍ: an indefinite idafa, with tanween kasra on the second noun.",
  "GR-POSSESSION-EX-08": "كِتَابِي: the kasra before ـي whatever the case of the noun.",
  "GR-QUESTIONS-EXP-03": "Simplified beginner rule: مَا before a noun or pronoun and مَاذَا before a verb. Real usage is more flexible. Please assess whether this guide is acceptable.",
  "GR-QUESTIONS-EXP-04": "كَمْ with a counted noun is not covered; بِكَمْ is explained as “for how much” to ask a price; literal gloss of كَمْ عُمْرُكَ؟.",
  "GR-QUESTIONS-EXP-05": "هَلْ is presented as the yes/no particle, although it is not one of the eight question words.",
  "GR-QUESTIONS-EX-04": "مَا لَوْنُ الْبَابِ؟: naturalness and the literal gloss.",
  "GR-QUESTIONS-EX-05": "مَاذَا تَشْرَبُ؟ uses a verb before verbs are taught, and illustrates the مَاذَا rule.",
  "GR-QUESTIONS-EX-08": "لِمَاذَا أَنْتَ هُنَا؟: word order and the use of هُنَا.",
  "GR-QUESTIONS-EX-09": "كَيْفَ الطَّقْسُ الْيَوْمَ؟: naturalness, and the accusative adverb الْيَوْمَ.",
  "GR-QUESTIONS-EX-10": "كَمْ عُمْرُكَ؟: the idiom for asking age and its literal gloss.",
  "GR-QUESTIONS-EX-11": "بِكَمْ هَٰذَا الْقَمِيصُ؟: naturalness, and the nominative قَمِيصُ after the demonstrative.",
  "GR-QUESTIONS-CHK-06": "The keyed answer (مَا) rests on the simplified مَا / مَاذَا rule flagged in GR-QUESTIONS-EXP-03.",
  "GR-PRESENT-EXP-02": "The conjugation of كَتَبَ with the prefixes أَـ تَـ يَـ نَـ, the ending ـِينَ, and the statement that “you (to a man)” and “she” share a form.",
  "GR-PRESENT-EXP-03": "Stem vowels: كَتَبَ → يَكْتُبُ, ذَهَبَ → يَذْهَبُ, شَرِبَ → يَشْرَبُ, and the sukun on the first stem letter.",
  "GR-PRESENT-EXP-04": "Final damma as the normal ending of a statement, ـِينَ for “you (to a woman)”, and the remark that the pronoun is often dropped.",
  "GR-PRESENT-EXP-05": "A direct object takes a fatha and a noun after إِلَى takes a kasra.",
  "GR-PRESENT-EXP-06": "Verb-first sentences: the verb stays singular before its subject, the classification as a verbal sentence, and the remark that pronoun + verb order is also correct.",
  "GR-PRESENT-EX-12": "يَكْتُبُ الطَّالِبُ الدَّرْسَ: a verb-first sentence; case endings of the subject (damma) and object (fatha).",
  "GR-NEGATION-EXP-02": "The six forms of لَيْسَ: لَسْتُ, لَسْتَ, لَسْتِ, لَيْسَ, لَيْسَتْ, لَسْنَا.",
  "GR-NEGATION-EXP-03": "The predicate after لَيْسَ takes tanween fatha (with an alif, or on ة without one); the named subject keeps its damma.",
  "GR-NEGATION-EXP-04": "The prepositions فِي, عَلَى, مِنْ, إِلَى, مَعَ and the kasra after them; مِنْ is pronounced and written مِنَ before ال.",
  "GR-NEGATION-EXP-05": "Please assess carefully: the rule that لَا goes with verbs and لَيْسَ with sentences that have no verb; the remark that لَيْسَ can also precede a verb (لَسْتُ أَدْرِي); and the statement that لَمْ and لَنْ (named only) are used with past and future meanings and change the verb ending.",
  "GR-NEGATION-EX-03": "Accusative predicate after لَيْسَ: لَسْتُ مُهَنْدِسًا.",
  "GR-NEGATION-EX-04": "Accusative predicate on ة: لَسْتِ مُعَلِّمَةً.",
  "GR-NEGATION-EX-05": "لَيْسَتْ and the accusative predicate طَبِيبَةً.",
  "GR-NEGATION-EX-06": "لَيْسَ with a named subject (damma) and an accusative predicate: لَيْسَ الْبَيْتُ كَبِيرًا.",
  "GR-NEGATION-EX-07": "لَسْنَا and the accusative plural طُلَّابًا.",
  "GR-NEGATION-EX-08": "لَا، شُكْرًا as a polite refusal.",
  "GR-NEGATION-EX-11": "مِنَ before ال (هُوَ مِنَ الْمَدِينَةِ)."
};

/* ---------------- helpers ---------------- */
const lf = (s) => s.replace(/\r\n/g, "\n");
const sha = (s) => crypto.createHash("sha256").update(lf(s), "utf8").digest("hex");
const MARKS = /[\u064B-\u0652\u0670]/;
const stripMarks = (s) => s.replace(/[\u064B-\u0652\u0670]/g, "");
const ARABIC_RUN = /[\u0600-\u06FF]+(?: [\u0600-\u06FF]+)*/g;
const arabicRuns = (s) => { const out = []; for (const m of s.matchAll(ARABIC_RUN)) if (!out.includes(m[0])) out.push(m[0]); return out; };
const codepoints = (s) => [...s].map((c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
const hasLetter = (s) => /(?=\p{L})\p{Script=Arabic}/u.test(s);
const csvCell = (v) => { v = String(v ?? ""); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const mdCell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");

/* ---------------- STRUCTURE-ONLY consonant / vowel consistency lint (not a linguistic check) ---------------- */
const LETTER = { "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "ḥ", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "ṣ", "ض": "ḍ", "ط": "ṭ", "ظ": "ẓ", "ع": "ʿ", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "t" };
const SKIP = new Set(["ا", "آ", "أ", "إ", "ؤ", "ئ", "ء", "ى", "ـ"]);
const collapse = (t) => t.filter((x, i) => i === 0 || x !== t[i - 1]);
const arabicSkeleton = (text) => {
  const out = [];
  for (let word of text.normalize("NFC").split(/\s+/)) {
    word = word.replace(/[؟،؛!?.,]/g, ""); if (!word) continue;
    if (word.startsWith("ال") && word.length > 2) word = word.slice(2);
    const ch = [...word];
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]; if (MARKS.test(c) || SKIP.has(c)) continue;
      let j = i + 1, marks = ""; while (j < ch.length && MARKS.test(ch[j])) marks += ch[j++];
      if (c === "و" || c === "ي") { if (/[\u064B-\u0652]/.test(marks)) out.push(c === "و" ? "w" : "y"); }
      else if (LETTER[c]) out.push(LETTER[c]); else return null;
      if (/[\u064B\u064C\u064D]/.test(marks)) out.push("n");
    }
  }
  return collapse(out).join(" ");
};
const translitSkeleton = (text) => {
  let t = text.normalize("NFC").toLowerCase().replace(/[?!.,؟]/g, "").replace(/(^|\s)a?(?:sh|dh|th|[lnsdrzṭṣḍẓt])-/g, "$1").replace(/[\s-]+/g, "").replace(/ʾ/g, "");
  const out = []; let i = 0;
  while (i < t.length) { const two = t.slice(i, i + 2); if (["sh", "kh", "gh", "dh", "th"].includes(two)) { out.push(two); i += 2; continue; } const c = t[i++]; if ("aāiīuū".includes(c)) continue; if ("btjḥdrzsṣḍṭẓʿfqklmnhwy".includes(c)) out.push(c); else return null; }
  return collapse(out).join(" ");
};
const VOWEL = { "\u064E": "a", "\u064B": "a", "\u064F": "u", "\u064C": "u", "\u0650": "i", "\u064D": "i" };
const arabicVowels = (s) => [...s.normalize("NFC")].filter((c) => VOWEL[c]).map((c) => VOWEL[c]).join("");
const translitVowels = (s) => [...s.normalize("NFC").toLowerCase().replace(/(^|\s)a?(?:sh|dh|th|[lnsdrzṭṣḍẓt])-/g, "$1")].filter((c) => "aāiīuū".includes(c)).map((c) => ({ ā: "a", ī: "i", ū: "u" }[c] || c)).join("");

const specialFlags = (s) => {
  const f = [];
  if (/\u0651/.test(s)) f.push("shadda");
  if (/\u0652/.test(s)) f.push("sukun");
  if (/[\u064B-\u064D]/.test(s)) f.push("tanween");
  if (/[أإؤئءآ]/.test(s)) f.push("hamza");
  if (/ة/.test(s)) f.push("ta-marbuta");
  if (/\u0670/.test(s)) f.push("dagger-alif");
  if (/ى/.test(s)) f.push("alif-maqsura");
  if (/(^|\s)ال/.test(s) || /(^|\s)اِ/.test(s)) f.push("hamzat-wasl");
  return f.join(" ");
};

/* ---------------- read and validate the drafts ---------------- */
const draftsPath = path.join(DIR, DRAFTS);
const draftsText = fs.readFileSync(draftsPath, "utf8");
const bundle = JSON.parse(draftsText);
const lessons = bundle.lessons;
if (!Array.isArray(lessons)) throw new Error("grammar-drafts.json must contain a lessons array");
const validation = G.validateCatalogue(lessons);
if (!validation.ok) throw new Error("The grammar drafts do not pass the grammar schema:\n  " + validation.errors.join("\n  "));
const schemaText = fs.readFileSync(path.join(REPO, "assets/js/learn/grammar.js"), "utf8");

/* ---------------- review items ---------------- */
const items = [];
const FILE_REF = `${PKG}/${DRAFTS}`;
const KIND = { SUM: "lesson-summary", EXP: "explanation", EX: "example", MIS: "common-mistake", CHK: "mini-check" };
lessons.forEach((l, li) => {
  const key = l.id.replace(/^gram-/, "").toUpperCase();
  const base = `/lessons/${li}`;
  const add = (kind, n, pointer, fields, o) => {
    const id = `GR-${key}-${kind}-${String(n).padStart(2, "0")}`;
    const flag = AUTHOR_FLAGS[id] || "";
    const arabicText = o.arabicList.join(" | ");
    items.push({
      id, lessonNo: li + 1, lessonId: l.id, lessonSlug: l.slug, lessonTitle: l.title, kind, category: KIND[kind], field: o.field,
      arabic: arabicText, plain: o.arabicList.map(stripMarks).join(" | "), translit: o.translit || "", english: o.english, context: o.context || "",
      special: specialFlags(arabicText), structure: o.structure, source: `${FILE_REF}#${pointer}`, fieldRefs: fields.map((f) => `${pointer}${f}`).join(" ; "),
      codepoints: o.codepoints ? codepoints(arabicText) : "", flag, priority: flag ? "high" : "standard", priorityReason: flag
    });
  };
  add("SUM", 1, base, ["/title", "/summary"], {
    field: "lesson title and summary", arabicList: arabicRuns(l.title + " " + l.summary), english: `Title: ${l.title}\nSummary: ${l.summary}`,
    context: `Proposed URL (not live): /learn-arabic/grammar/${l.slug}/. Prerequisites: ${(l.prerequisites || []).join(", ") || "none"}.`,
    structure: `STRUCTURE ONLY: title (${l.title.length} characters) and summary (${l.summary.length} of 200 characters) present.`
  });
  l.explanation.forEach((b, j) => add("EXP", j + 1, `${base}/explanation/${j}`, ["/heading", "/text"], {
    field: "explanation block (heading and text)", arabicList: arabicRuns(b.heading + " " + b.text), english: `Heading: ${b.heading}\n${b.text}`,
    structure: `STRUCTURE ONLY: heading and text present; text ${b.text.length} of 2000 characters.`
  }));
  l.examples.forEach((x, j) => {
    const sk = arabicSkeleton(x.ar) === translitSkeleton(x.translit), vw = arabicVowels(x.ar) === translitVowels(x.translit);
    const words = x.ar.replace(/[؟،]/g, "").trim().split(/\s+/);
    add("EX", j + 1, `${base}/examples/${j}`, ["/ar", "/translit", "/en"].concat(x.vocabRefs ? ["/vocabRefs"] : []), {
      field: "example sentence or phrase (Arabic with marks, transliteration, English)", arabicList: [x.ar], translit: x.translit, english: x.en, codepoints: true,
      context: x.vocabRefs ? `Linked course vocabulary: ${x.vocabRefs.join(", ")}.` : "",
      structure: `STRUCTURE ONLY (software rule, not a linguistic check): contains an Arabic letter ${hasLetter(x.ar) ? "yes" : "NO"}; every word carries vowel marks ${words.every((w) => MARKS.test(w)) ? "yes" : "NO"}; plain spelling is the Arabic without marks; transliteration consonants match the Arabic ${sk ? "yes" : "NO"}; short vowels match ${vw ? "yes" : "NO"}.`
    });
  });
  l.mistakes.forEach((m, j) => add("MIS", j + 1, `${base}/mistakes/${j}`, ["/text"].concat(m.ar ? ["/ar"] : []), {
    field: "common mistake and the explanation of why it is a mistake", arabicList: m.ar ? [m.ar] : [], english: m.text, codepoints: !!m.ar,
    structure: `STRUCTURE ONLY: text present${m.ar ? `; the Arabic form contains an Arabic letter ${hasLetter(m.ar) ? "yes" : "NO"}` : ""}.`
  }));
  l.check.forEach((q, j) => {
    const distinct = new Set(q.choices).size === q.choices.length;
    add("CHK", j + 1, `${base}/check/${j}`, ["/prompt"].concat(q.choices.map((_, k) => `/choices/${k}`), ["/answerIndex", "/explain"]), {
      field: "mini-check question, choices, keyed answer and explanation",
      arabicList: arabicRuns([q.prompt, ...q.choices, q.explain].join(" ")),
      english: `Prompt: ${q.prompt}\nChoices: ${q.choices.map((c, k) => `${k + 1}) ${c}`).join("  ")}\nKeyed answer: ${q.answerIndex + 1}) ${q.choices[q.answerIndex]}\nExplanation shown: ${q.explain}`,
      context: "Teacher: is the keyed answer correct, is every other choice wrong, and does the explanation say why?",
      structure: `STRUCTURE ONLY: ${q.choices.length} choices (2 to 6 allowed), ${distinct ? "all distinct" : "NOT all distinct"}; answer index ${q.answerIndex} is within range; explanation present.`
    });
  });
});
const ids = new Set(items.map((i) => i.id));
if (ids.size !== items.length) throw new Error("duplicate review item IDs");
for (const k of Object.keys(AUTHOR_FLAGS)) if (!ids.has(k)) throw new Error("author flag for an item that does not exist: " + k);
const flagged = items.filter((i) => i.flag);
const byKind = Object.fromEntries(Object.keys(KIND).map((k) => [k, items.filter((i) => i.kind === k).length]));

/* ---------------- CSV ---------------- */
const COLUMNS = [
  ["item_id", (i) => i.id], ["lesson_no", (i) => i.lessonNo], ["lesson_id", (i) => i.lessonId], ["lesson_slug", (i) => i.lessonSlug], ["lesson_title", (i) => i.lessonTitle],
  ["category", (i) => i.category], ["field", (i) => i.field], ["arabic_as_implemented", (i) => i.arabic], ["plain_spelling", (i) => i.plain], ["transliteration", (i) => i.translit],
  ["english_text", (i) => i.english], ["context_notes", (i) => i.context], ["special_flags", (i) => i.special], ["automated_checks_STRUCTURE_ONLY", (i) => i.structure],
  ["source", (i) => i.source], ["field_refs", (i) => i.fieldRefs], ["unicode_codepoints", (i) => i.codepoints], ["review_status", () => "UNREVIEWED"],
  ["author_flag_for_teacher", (i) => i.flag], ["suggested_priority", (i) => i.priority], ["priority_reason", (i) => i.priorityReason],
  ["teacher_decision", () => ""], ["corrected_field_ref", () => ""], ["proposed_correction", () => ""], ["reviewer_comments", () => ""]
];
const csv = "\uFEFF" + [COLUMNS.map(([n]) => n).join(","), ...items.map((i) => COLUMNS.map(([, f]) => csvCell(f(i))).join(","))].join("\n") + "\n";

/* ---------------- Markdown review sheet ---------------- */
const signOff = [
  "## Reviewer sign-off (to be completed by the reviewer)",
  "- Reviewer name:",
  "- Qualification / relevant experience:",
  "- Date review completed:",
  "- Scope reviewed (all items / listed lessons only):",
  "- Overall comments:"
];
const md = [];
md.push("# Arabic grammar review sheet", "");
md.push(`Generated from \`${FILE_REF}\` by \`${PKG}/build-grammar-review.mjs\`. **Every item below is UNREVIEWED.** Nothing here has been approved or verified by a qualified Arabic teacher, and these lessons are **not** in the live course (the grammar catalogue is empty and no grammar page exists).`);
md.push("", `Read \`REVIEWER-GUIDE.md\` first. Record decisions in \`grammar-review-items.csv\` (same item IDs) or tick the boxes here. ${items.length} items in ${lessons.length} lessons.`);
md.push("", "Decision key: ☐ approved · ☐ correction needed · ☐ uncertain. “Priority” is the author’s suggestion (flagged points are marked **high**), not a linguistic judgement. “STRUCTURE ONLY” checks were made by software and never mean an item is correct. Arabic text is shown with the marks exactly as implemented in the draft.", "");
lessons.forEach((l, li) => {
  const mine = items.filter((i) => i.lessonId === l.id);
  md.push(`## Lesson ${li + 1}: ${l.title}`, "");
  md.push(`- Lesson ID: \`${l.id}\` · slug: \`${l.slug}\` · proposed URL (not live): \`/learn-arabic/grammar/${l.slug}/\``);
  md.push(`- Prerequisites: ${(l.prerequisites || []).map((p) => `\`${p}\``).join(", ") || "none"} · items: ${mine.length} (${mine.filter((i) => i.flag).length} flagged for special attention)`);
  md.push("", "| ID | Category | Arabic (as implemented) | Plain / transliteration | English / explanation / notes | Flags | Priority | Decision | Source |", "|---|---|---|---|---|---|---|---|---|");
  for (const i of mine) {
    md.push(`| ${i.id} | ${mdCell(i.category)} | ${mdCell(i.arabic)} | ${mdCell([i.plain, i.translit].filter(Boolean).join("\n"))} | ${mdCell(i.english + (i.flag ? `\n**Author flag:** ${i.flag}` : ""))} | ${mdCell(i.special)} | ${i.priority} | ☐ ☐ ☐ | \`${i.source.split("#")[1]}\` |`);
  }
  md.push("");
});
md.push("## Points the author flagged for special attention", "");
md.push(flagged.length ? "These are explanations that are simplified, disputed or depend on context. Please assess each one." : "(none)", "");
for (const i of flagged) md.push(`- **${i.id}** (${i.lessonId}, ${i.category}): ${i.flag}`);
md.push("");
const flagNames = [...new Set(items.flatMap((i) => i.special.split(" ").filter(Boolean)))].sort();
md.push("## Items by special flag", "");
for (const f of flagNames) { const m = items.filter((i) => i.special.split(" ").includes(f)); md.push(`- **${f}**: ${m.length} items — ${m.map((i) => i.id).join(", ")}`); }
md.push("", ...signOff, "");
const sheet = md.join("\n");

/* ---------------- reviewer guide ---------------- */
const total = items.length;
const guide = `# Reviewer guide — Arabic grammar lessons (DRAFT)

## What this is
Eight beginner Arabic grammar lessons for the Learn Arabic Academy were **drafted by software** and have **not been reviewed or approved by any qualified Arabic teacher**. They are **not published**: they are not in the live course catalogue, no grammar page has been generated, and nothing here is verified. This package lets a qualified teacher check every explanation, example, common mistake and mini-check question, and record exact corrections.

Automated tests can check **structure** (for example: every example contains Arabic letters and vowel marks, a quiz has a valid answer index and distinct choices, the consonants of a transliteration match the Arabic). They **cannot** tell whether an explanation is good teaching, whether a sentence is natural Modern Standard Arabic, whether a vowel mark or case ending is right, or whether an English translation is the best one. Every software check is labelled **STRUCTURE ONLY** and never means an item is correct.

## Files
| File | Purpose |
|---|---|
| \`grammar-review-items.csv\` | One row per reviewable item (${total} rows). Open in Excel/Sheets (UTF-8 with BOM, so Arabic displays correctly). **Fill in the last four columns.** |
| \`grammar-review-sheet.md\` | The same items grouped by lesson, easier to read straight through. |
| \`grammar-drafts.json\` | The eight draft lessons exactly as written. Every item points into this file (the \`source\` column). Do not edit it; send corrections back through the CSV. |
| \`build-grammar-review.mjs\` | Regenerates the CSV, the sheet, this guide and the manifest from \`grammar-drafts.json\`. |
| \`MANIFEST.txt\` | SHA-256 hashes identifying the exact drafts and generated files, with the explicit UNREVIEWED status. |

## Contents
- ${lessons.length} lessons, ${total} review items: ${Object.entries(KIND).map(([k, v]) => `${byKind[k]} ${v}`).join("; ")}.
- ${flagged.length} items are flagged by the author for special attention (listed at the end of \`grammar-review-sheet.md\` and in the \`author_flag_for_teacher\` column). A flag means “simplified, disputed or context dependent — please assess”; it does not mean the item is wrong, and unflagged items are **not** safe. Please review everything.

## How to review
1. Work lesson by lesson. For each row read **arabic_as_implemented**, **plain_spelling**, **transliteration** and **english_text** and check them against your own knowledge and a reference you trust.
2. In **teacher_decision** enter exactly one of: \`approved\`, \`correction needed\`, \`uncertain\`.
3. If the decision is \`correction needed\`, write the exact replacement in **proposed_correction** (Arabic with every mark you want, then transliteration and English if they change) and name the field you are correcting in **corrected_field_ref** by copying one pointer from the **field_refs** column (for example \`/lessons/2/examples/4/ar\`). Explain in **reviewer_comments**. If a correction touches several fields, put each pointer on its own line.
4. Use \`uncertain\` whenever you cannot confirm an item, and say why in **reviewer_comments**. Please do not guess.
5. Do not edit item IDs or any other column. The item ID and the \`source\` column are how a correction is traced back to the exact lesson field.
6. When finished, fill in the sign-off block at the end of \`grammar-review-sheet.md\` (copy it into your returned file if you work in the CSV).

## How an item traces back to its lesson field
- **item_id** is stable and positional: \`GR-<LESSON>-<KIND>-<NN>\`, for example \`GR-GENDER-EX-04\` is the 4th example of the gender lesson. Kinds: SUM (title and summary), EXP (explanation block), EX (example), MIS (common mistake), CHK (mini-check question).
- **source** is \`${FILE_REF}#<JSON pointer>\` to the item. **field_refs** lists a JSON pointer for each individual field of the item (\`/ar\`, \`/translit\`, \`/en\`, \`/choices/2\`, \`/answerIndex\` …), so a correction can name exactly what to change.
- IDs follow the order in the drafts. After corrections are applied the package is regenerated and IDs are re-issued, so please keep your returned file: it is the record of what was approved.

## What to look at in each lesson
- **Definite article:** which letters are classed as sun and moon letters; how the lam of الـ is pronounced and written (sukun or shadda); the silent alif after another word; whether the transliteration conventions (\`al-\`, \`ash-\`, \`l-\`) are acceptable.
- **Pronouns and nominal sentences:** the six pronouns and their forms; the statement that an ordinary present-tense nominal sentence has no word for “am/is/are”; the contrast between nominal and verbal sentences and how pronoun + verb sentences are classed; the plurals used with نَحْنُ.
- **Masculine and feminine:** the ة (taa marbuta) pattern, its pronunciation, and the exceptions (feminine nouns without ة; masculine words and names that end in ة).
- **Adjective agreement:** gender, definiteness and case agreement; the difference between a noun phrase and a sentence; whether the adjectives are natural.
- **Possession (الإضافة):** the form of the first noun (no ال, no tanween), the genitive second noun, the possessive endings, and every case ending shown.
- **Question words:** the meaning and usage of مَنْ، مَا، مَاذَا، أَيْنَ، مَتَى، لِمَاذَا، كَيْفَ، كَمْ, the simplified مَا / مَاذَا rule, and the idioms used.
- **Present-tense verbs:** the prefixes and endings for أَنَا، أَنْتَ، أَنْتِ، هُوَ، هِيَ، نَحْنُ; the stem vowels; the final damma; verb-first sentences and verb agreement.
- **Negation and prepositions:** لَا with verbs; لَيْسَ with its six forms and the accusative predicate; the other negation words that are only named (لَمْ, لَنْ); the prepositions فِي، عَلَى، مِنْ، إِلَى، مَعَ and the genitive after them.
- **Every Arabic example:** spelling, **all** vowel marks and case endings, transliteration, the English translation, and whether it is natural beginner-level Modern Standard Arabic.
- **Every mini-check:** is the keyed answer correct; is every other choice really wrong; could a distractor also be acceptable; is the explanation accurate.

## What the automated checks do and do not cover
The column \`automated_checks_STRUCTURE_ONLY\` records what software verified. It never means a row is approved. In particular, software has **not** checked: grammar rules, naturalness of usage, correctness of vowel marks and case endings, correctness of English meanings, the answer keys, or the accuracy of any explanation.

## Known limits of these drafts (for context)
- Examples are Modern Standard Arabic written with full vowel marks, including case endings, because the lessons teach endings. The existing course shows vocabulary in dictionary (pausal) form.
- The transliteration follows the existing course style (macrons, \`ʿ\`, \`l-\` for the silent alif of الـ) and is a guide only.
- Some words used in examples are not in the course vocabulary. They have no vocabulary link.

## After the review
A developer will apply corrections to \`grammar-drafts.json\` using the \`source\` and \`corrected_field_ref\` columns, regenerate this package and re-run the tests. The drafts will stay unpublished until the owner decides otherwise.

## Note on location
This folder sits inside the website repository. If the site is published from the repository root, these files may be publicly reachable at their paths. They contain only draft course content, but publication is a decision for the site owner.

${signOff.join("\n")}
`;

/* ---------------- manifest ---------------- */
const files = { [DRAFTS]: draftsText, "grammar-review-items.csv": csv, "grammar-review-sheet.md": sheet, "REVIEWER-GUIDE.md": guide };
const selfPath = path.join(DIR, "build-grammar-review.mjs");
const builderText = fs.readFileSync(fs.existsSync(selfPath) ? selfPath : fileURLToPath(import.meta.url), "utf8");
const hashLines = [
  `${sha(draftsText)}  ${PKG}/${DRAFTS}`,
  `${sha(csv)}  ${PKG}/grammar-review-items.csv`,
  `${sha(sheet)}  ${PKG}/grammar-review-sheet.md`,
  `${sha(guide)}  ${PKG}/REVIEWER-GUIDE.md`,
  `${sha(builderText)}  ${PKG}/build-grammar-review.mjs`
];
const manifest = [
  "Arabic grammar review package — MANIFEST",
  "",
  "STATUS: UNREVIEWED.",
  "Nothing in this package has been reviewed, approved or verified by a qualified Arabic teacher. The eight lessons are draft content: they are not in the live",
  "course catalogue (assets/js/learn/grammar.js keeps RAW = []), no grammar page has been generated, and nothing is published.",
  "All teacher decision, proposed correction and reviewer comment fields are blank. Every automated check in the package is STRUCTURE ONLY.",
  "",
  "Hash rule: SHA-256 of the file text with CRLF line endings normalised to LF, so the hashes are identical on Windows and Linux checkouts.",
  "Generator: docs/arabic-grammar-review/build-grammar-review.mjs (deterministic: no timestamps, fixed order). Check freshness with: node docs/arabic-grammar-review/build-grammar-review.mjs --check",
  "",
  `Drafts: ${lessons.length} lessons, ${items.length} review items (${Object.entries(KIND).map(([k, v]) => `${byKind[k]} ${v}`).join("; ")}), ${flagged.length} flagged by the author.`,
  "",
  "== Files (the drafts and everything generated from them) ==",
  ...hashLines,
  "",
  "== Draft lesson records (SHA-256 of each record as compact JSON, keys in file order) ==",
  ...lessons.map((l) => `${sha(JSON.stringify(l))}  ${l.id}  ${l.slug}`),
  "",
  "== Validated against (structure only; informational) ==",
  `${sha(schemaText)}  assets/js/learn/grammar.js`,
  ""
].join("\n");
files["MANIFEST.txt"] = manifest;

/* ---------------- write or check ---------------- */
const generated = ["grammar-review-items.csv", "grammar-review-sheet.md", "REVIEWER-GUIDE.md", "MANIFEST.txt"];
if (CHECK) {
  const stale = generated.filter((f) => { const p = path.join(DIR, f); return !fs.existsSync(p) || lf(fs.readFileSync(p, "utf8")) !== lf(files[f]); });
  if (stale.length) { console.error("STALE (regenerate with: node docs/arabic-grammar-review/build-grammar-review.mjs):\n  " + stale.join("\n  ")); process.exit(1); }
  console.log(`up to date: ${lessons.length} lessons, ${items.length} review items, ${flagged.length} flagged`);
} else {
  for (const f of generated) fs.writeFileSync(path.join(DIR, f), lf(files[f]));
  console.log(`wrote ${generated.length} files: ${lessons.length} lessons, ${items.length} review items (${Object.entries(KIND).map(([k, v]) => `${byKind[k]} ${v}`).join(", ")}), ${flagged.length} flagged`);
}
