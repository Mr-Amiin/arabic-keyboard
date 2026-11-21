#!/usr/bin/env node
/* Builds the individual Learn Arabic lesson pages (static HTML, so GitHub Pages can serve them at clean URLs, refresh safely and
   be crawled without running JavaScript).

   SOURCE OF TRUTH
     - The course data modules in assets/js/learn/ (letters, harakat, vocabulary, conversations, reading). Nothing is invented here.
     - assets/js/learn/urls.js decides which pages exist and where (the browser app uses the very same module for its links).
     - learn-arabic/index.html (the live dashboard page) supplies the <head> tags (AdSense verification meta + loader, Google
       Analytics, icons, fonts, CSS), the header, mobile menu, footer and script list, so those can never drift from the site.
       NOTE: site/build/pages.py is a stale, superseded generator (last changed in the very first commit, no AdSense/GA).
       It is NOT used and must not be re-run: it would overwrite the hand-maintained pages.

   WHAT A LESSON PAGE CONTAINS
     breadcrumb -> H1 -> short introduction -> [primary ad slot, inserted at runtime by SiteAds only when ads are enabled]
     -> lesson (static, crawlable copy of the lesson, inside #learnApp; the existing JS replaces it with the interactive version
        and keeps owning exercises, answer checking and progress) -> reference material -> related lessons.

   USAGE   node scripts/build-learn-pages.mjs              write pages + the static lesson index on the dashboard
           node scripts/build-learn-pages.mjs --sitemap    also write the lesson URLs into sitemap.xml (run AFTER verifying)
           node scripts/build-learn-pages.mjs --check      write nothing; exit 1 if anything on disk is out of date */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEARN = (f) => require(path.join(ROOT, "assets/js/learn", f));
const D = LEARN("data.js"), V = LEARN("vocab-data.js"), C = LEARN("conversations.js"), RD = LEARN("reading.js"), U = LEARN("urls.js");
const SITE = "https://www.arabic-keyboard.live";
const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check"), SITEMAP = args.has("--sitemap");

/* ---------- small helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ar = (t, cls) => `<span class="lx-ar ${cls || ""}" lang="ar" dir="rtl">${esc(t)}</span>`;
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const list = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
const url = (route) => U.pathFor(route);
const link = (href, text, cls) => `<a${cls ? ` class="${cls}"` : ""} href="${href}">${text}</a>`;
const pageUrl = (e) => `${SITE}${e.url}`;
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const eolOf = (s) => (s.includes("\r\n") ? "\r\n" : "\n");
const lf = (s) => s.replace(/\r\n/g, "\n");
const DASH = U.PREFIX;                                   // "/learn-arabic/"
const L = D.LETTERS, byLetter = Object.fromEntries(L.map((l) => [l.id, l]));
const AUDIO_NOTE = "Transliteration is only a rough guide. Audio uses your device’s text-to-speech voice where available; it approximates pronunciation but is not a native recording.";

/* ---------- template pieces taken from the live dashboard page ---------- */
const tpl = lf(readText("learn-arabic/index.html"));
const rebase = (s) => s.replace(/(href|src|data-keyboard-src)="\.\.\//g, '$1="../../../');   // dashboard is 1 level deep, lessons are 3
const cut = (from, to, why) => {
  const a = tpl.indexOf(from), b = to ? tpl.indexOf(to, a + 1) : tpl.length;
  if (a < 0 || b < 0) throw new Error("learn-arabic/index.html no longer contains the marker for: " + why);
  return tpl.slice(a, b);
};
const HEAD_TAIL = rebase(cut('<meta name="theme-color"', "</head>", "head tail (theme-color .. scripts)"));
const BODY_TOP = rebase(cut("<body>", '<nav class="breadcrumbs', "header + mobile menu"));
const MAIN_BLOCK = rebase(cut('<div class="lx lx-main"', '<div class="lx lx-after"', "course container + keyboard host"));
const REST = rebase(tpl.slice(tpl.indexOf("</main>")));
for (const [name, ok] of [["AdSense verification meta", HEAD_TAIL.includes('name="google-adsense-account"')], ["urls.js script", REST.includes("learn/urls.js")], ["learnApp mount", MAIN_BLOCK.includes('id="learnApp"')]]) {
  if (!ok) throw new Error("dashboard template check failed: " + name);
}

/* ---------- lesson renderers: static, crawlable copy of what the interactive view shows ---------- */
const lessonList = U.entries;
const idx = (e) => lessonList.filter((x) => x.kind === e.kind);
const neighbours = (e) => { const g = idx(e), i = g.indexOf(e); return { prev: g[i - 1] || null, next: g[i + 1] || null }; };
const back = `<nav class="lx-back">${link(DASH, "← Dashboard")}</nav>`;
const pager = (prev, next, label) => `<div class="lx-pager">${prev ? link(prev.url, "← " + esc(label(prev)), "lx-btn lx-btn-alt") : "<span></span>"}${next ? link(next.url, esc(label(next)) + " →", "lx-btn lx-btn-alt") : "<span></span>"}</div>`;
const itemRow = (i) => `<li class="lx-ex">${ar(i.ar + (i.punct || ""), "lx-ex-ar")}<div><b>${esc(i.translit)}</b> — ${esc(i.en)}<br><small>${i.kind === "phrase" ? "phrase" : "word"} · Modern Standard Arabic${i.difficulty ? " · " + esc(i.difficulty) : ""} · plain spelling ${ar(i.plain)}</small>${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</div></li>`;
const exercisePanel = (title, text) => `<div class="lx-panel"><h3>${title}</h3><p>${text}</p></div>`;

const kinds = {};

kinds.letter = (e) => {
  const l = byLetter[e.key], i = l.order - 1, prev = L[i - 1], next = L[i + 1], f = l.forms;
  const cell = (k, cap) => { const alt = k === "initial" ? f.isolated : f.final, same = k === "initial" ? "same as Alone" : "same as End"; return `<div class="lx-form${f[k] ? "" : " is-na"}">${ar(f[k] || alt)}<small>${cap}${f[k] ? "" : " · " + same}</small></div>`; };
  const conn = l.connects ? `${esc(l.letter)} joins to the letter after it, so it has four shapes depending on where it sits in a word.` : `${esc(l.letter)} never joins to the letter after it. It has only two shapes: the isolated form (also used at the start of a word) and the final form (used after a letter that joins). The next letter always starts fresh.`;
  const exs = l.examples.map((x) => `<li class="lx-ex">${ar(x.vowelled, "lx-ex-ar")}<div><b>${esc(x.translit)}</b> — ${esc(x.meaning)}<br><small>${esc(x.position)} position · written ${ar(x.plain)}</small></div></li>`).join("");
  const syl = l.syllables.map((s) => `<div class="lx-syl">${ar(s[0], "lx-syl-ar")}<small>${esc(s[1])}</small></div>`).join("");
  const letterLink = (x) => (x ? link(url("letter/" + x.id), `${x.nameEn} ${ar(x.letter)}`, "lx-btn lx-btn-alt") : "");
  const staticHtml = `${back}<article><h2 class="lx-h">Letter ${l.order} of 28: ${esc(l.nameEn)}</h2><div class="lx-hero">${ar(l.letter, "lx-hero-ar")}<div><p class="lx-name">${ar(l.nameAr)} · ${esc(l.nameEn)}</p><p><span class="lx-badge lx-d-${l.difficulty.toLowerCase()}">${l.difficulty}</span></p><p>Sound: <b>${esc(l.sound)}</b></p></div></div>` +
    `<h3 class="lx-h3">How to say it</h3><p>${esc(l.say)}</p><p class="lx-note" role="note">${AUDIO_NOTE}</p>` +
    `<h3 class="lx-h3">Letter shapes</h3><div class="lx-forms">${cell("isolated", "Alone")}${cell("initial", "Beginning")}${cell("medial", "Middle")}${cell("final", "End")}</div><p>${conn}</p><p>How to tell it apart: <b>${esc(l.dots)}</b>.</p>` +
    `<h3 class="lx-h3">Example words</h3><ul class="lx-exs">${exs}</ul><h3 class="lx-h3">With harakat</h3><p>Short vowel marks change how the letter is read. Marks are shown on ${esc(l.letter)}:</p><div class="lx-syls">${syl}</div>` +
    exercisePanel("Quick check", `Answer 3 questions about ${esc(l.nameEn)}. Get at least 2 right to complete this lesson. (The interactive check loads with JavaScript.)`) +
    `<div class="lx-pager">${prev ? link(url("letter/" + prev.id), "← " + esc(prev.nameEn) + " " + prev.letter, "lx-btn lx-btn-alt") : "<span></span>"}${next ? link(url("letter/" + next.id), esc(next.nameEn) + " " + next.letter + " →", "lx-btn lx-btn-alt") : link(url("harakat/harakat-1"), "Harakat →", "lx-btn lx-btn-alt")}</div></article>`;
  const similar = D.SIMILAR_GROUPS.filter((g) => g.includes(l.id)).flatMap((g) => g.filter((id) => id !== l.id)).map((id) => byLetter[id]);
  const related = [
    ...similar.map((x) => ({ href: url("letter/" + x.id), text: `${x.letter} ${x.nameEn} (looks similar)` })),
    ...[prev, next].filter(Boolean).filter((x) => !similar.includes(x)).map((x) => ({ href: url("letter/" + x.id), text: `${x.letter} ${x.nameEn} (${x === prev ? "previous" : "next"} letter)` })),
    { href: url("harakat/harakat-1"), text: "Harakat: fatha, kasra, damma" },
    { href: "/arabic-alphabet/", text: "Arabic alphabet chart" },
    { href: "/arabic-keyboard/", text: "Arabic keyboard" }
  ];
  const lessonsWhere = l.connects ? "four shapes (alone, beginning, middle and end)" : "two shapes (alone and end)";
  return {
    title: `Arabic Letter ${l.nameEn} (${l.letter}) — Sound, Shapes & Examples | Learn Arabic`,
    h1: `Arabic letter ${l.nameEn} (${l.letter}): sound, shapes and example words`,
    eyebrow: `Letter ${l.order} of 28 · ${l.difficulty}`,
    intro: `${l.nameEn} (${l.nameAr}) is letter ${l.order} of the 28 Arabic letters. Sound: ${l.sound}. ${l.connects ? "It joins to the next letter, so it has four shapes." : "It never joins to the next letter, so it has two shapes."}`,
    description: clip(`Learn the Arabic letter ${l.nameEn} (${l.letter}): how to say it, its ${lessonsWhere}, example words such as ${l.examples[0].vowelled} (${l.examples[0].translit}, ${l.examples[0].meaning}) and a quick check.`, 160),
    crumb: `Letter ${l.nameEn} ${l.letter}`, staticHtml, extra: "", related
  };
};

kinds.harakat = (e) => {
  const h = D.HARAKAT_LESSONS.find((x) => x.id === e.key), n = D.HARAKAT_LESSONS.indexOf(h);
  const marks = h.marks.map((m) => D.HARAKAT.find((k) => k.id === m));
  const names = list(marks.map((m) => m.nameEn));
  const markLi = marks.map((x) => `<li class="lx-mark"><div class="lx-mark-h">${ar(x.example[0], "lx-syl-ar")}<div><b>${esc(x.nameEn)}</b> · ${ar(x.nameAr)}<br>Sound: <b>${esc(x.sound)}</b></div></div><p>${esc(x.note)}</p><p class="lx-ex">${ar(x.word[0], "lx-ex-ar")}<span><b>${esc(x.word[1])}</b> — ${esc(x.word[2])}</span></p></li>`).join("");
  const other = D.HARAKAT_LESSONS[1 - n];
  const staticHtml = `${back}<article><h2 class="lx-h">${esc(h.title)}</h2><p>${esc(h.intro)}</p><ul class="lx-marks">${markLi}</ul><p class="lx-note" role="note">${AUDIO_NOTE}</p>` +
    exercisePanel("Quick check", "Answer 3 questions. Get at least 2 right to complete this lesson. (The interactive check loads with JavaScript.)") +
    `<div class="lx-pager">${n === 0 ? link(url("letter/ya"), "← Letter Ya", "lx-btn lx-btn-alt") : link(url("harakat/harakat-1"), "← Short vowels", "lx-btn lx-btn-alt")}${n === 0 ? link(url("harakat/harakat-2"), "Sukun, shadda, tanween →", "lx-btn lx-btn-alt") : link(DASH + "#/read", "Reading practice →", "lx-btn lx-btn-alt")}</div></article>`;
  // Reference table (page text, not part of the interactive view): derived from the same letter data, so it cannot disagree with the letter lessons.
  const extra = n === 0 ? `<section class="lx-intro lx-ref" aria-labelledby="lxRefTable"><h2 id="lxRefTable">Every letter with fatha, kasra and damma</h2><p>Each row shows one of the 28 letters carrying the three short vowel marks, with a rough transliteration. Alif is written with hamza (أ, إ) when it carries a vowel.</p><div class="lx-tablewrap"><table class="lx-table"><thead><tr><th scope="col">Letter</th><th scope="col">Fatha (a)</th><th scope="col">Kasra (i)</th><th scope="col">Damma (u)</th></tr></thead><tbody>${L.map((l) => `<tr><th scope="row">${link(url("letter/" + l.id), `${ar(l.letter)} <span class="lx-small">${esc(l.nameEn)}</span>`)}</th>${l.syllables.map((s) => `<td>${ar(s[0], "lx-syl-ar")} <small>${esc(s[1])}</small></td>`).join("")}</tr>`).join("")}</tbody></table></div></section>` : "";
  const related = [
    { href: url("harakat/" + other.id), text: other.title },
    { href: url("letter/ba"), text: "Letter Ba ب (a good first letter to practise with)" },
    { href: "/tashkeel/", text: "Tashkeel: add harakat to your own text" },
    { href: DASH + "#/read", text: "Reading and typing practice" },
    { href: "/arabic-keyboard/", text: "Arabic keyboard with harakat keys" }
  ];
  return {
    title: `Arabic Harakat: ${names} — Lesson | Learn Arabic`,
    h1: `Arabic harakat: ${names}`,
    eyebrow: `Harakat lesson ${n + 1} of ${D.HARAKAT_LESSONS.length}`,
    intro: `Learn what the Arabic marks ${names} look like, the sound each one gives, and an example word for each, then take a three-question check.`,
    description: clip(`Learn the Arabic harakat ${names}: what each mark looks like, the sound it gives, example words such as ${marks[0].word[0]} (${marks[0].word[1]}, ${marks[0].word[2]}) and a 3-question check.`, 160),
    crumb: `Harakat: ${names}`, staticHtml, extra, related
  };
};

kinds.vocab = (e) => {
  const t = V.TOPICS.find((x) => x.id === e.key), items = V.ITEMS.filter((i) => i.topic === t.id);
  const dia = V.DIALECT.filter((d) => d.topic === t.id), vars = V.VARIANTS.filter((d) => d.topic === t.id);
  const dialect = dia.length ? `<div class="lx-panel lx-dialect"><h3>Regional variants (not Modern Standard Arabic)</h3><p>These are shown so you can recognise them; they are not quizzed.</p><ul class="lx-exs">${dia.map((d) => `<li class="lx-ex">${ar(d.ar + d.punct, "lx-ex-ar")}<div><b>${esc(d.translit)}</b> — ${esc(d.en)}<br><small>${esc(d.region)} · dialect</small></div></li>`).join("")}</ul></div>` : "";
  const variants = vars.length ? `<div class="lx-panel lx-dialect"><h3>Regional words and usage (not quizzed)</h3><p>These are shown so you can recognise them. Each is labelled with its region and whether it is spoken dialect or standard Arabic used in only some countries.</p><ul class="lx-exs">${vars.map((d) => `<li class="lx-ex">${ar(d.ar, "lx-ex-ar")}<div><b>${esc(d.translit)}</b> — ${esc(d.en)}<br><small>${esc(d.region)} · ${d.reg === "dialect" ? "dialect" : "standard Arabic, regional usage"}</small>${d.note ? `<br><small>${esc(d.note)}</small>` : ""}</div></li>`).join("")}</ul></div>` : "";
  const staticHtml = `<nav class="lx-back">${link(DASH + "#/vocab", "← Vocabulary")}</nav><h2 class="lx-h">${esc(t.title)}</h2><p>${esc(t.note)}</p><ul class="lx-exs">${items.map(itemRow).join("")}</ul>${dialect}${variants}` +
    exercisePanel("Practise this topic", "Each round has 10 questions. Your answers schedule each word for review. (The interactive exercises load with JavaScript.)");
  const { prev, next } = neighbours(e);
  const topicOf = (x) => V.TOPICS.find((y) => y.id === x.key).title;
  const related = [
    ...[prev, next].filter(Boolean).map((x) => ({ href: x.url, text: `${topicOf(x)} (${x === prev ? "previous" : "next"} topic)` })),
    { href: DASH + "#/vocab", text: "All vocabulary topics" },
    { href: DASH + "#/review", text: "Daily review" },
    { href: DASH + "#/conversations", text: "Conversations" },
    { href: "/arabic-keyboard/", text: "Arabic keyboard" }
  ];
  const sample = items.slice(0, 2).map((i) => `${i.ar} (${i.translit}) = ${i.en}`).join(", ");
  return {
    title: `Arabic ${t.title} — Vocabulary with Pronunciation | Learn Arabic`,
    h1: `Arabic vocabulary: ${t.title}`,
    eyebrow: `Vocabulary · ${t.group === "starter" ? "Starter" : "Everyday"}`,
    intro: `${t.blurb} ${items.length} words and phrases with harakat, transliteration and English meanings, all in Modern Standard Arabic.`,
    description: clip(`Learn ${items.length} Arabic words and phrases for “${t.title}” with harakat, transliteration and English meanings, such as ${sample}. Practise with interactive exercises.`, 160),
    crumb: t.title, staticHtml, extra: "", related
  };
};

kinds.conversation = (e) => {
  const u = C.UNITS.find((x) => x.short === e.key), i = C.UNITS.indexOf(u), prev = C.UNITS[i - 1], next = C.UNITS[i + 1];
  const byId = Object.fromEntries(V.ITEMS.map((x) => [x.id, x]));
  const lines = u.lines.map((l) => `<li class="lx-dl"><span class="lx-dl-who">${esc(u.speakers[l.speaker])}</span>${ar(l.ar, "lx-ex-ar")}<div><b>${esc(l.translit)}</b><br><span class="lx-dl-en">${esc(l.en)}</span></div></li>`).join("");
  const vocab = u.vocab.map((id) => byId[id]).filter(Boolean).map(itemRow).join("");
  const dia = u.dialect.length ? `<div class="lx-panel lx-dialect"><h3>Spoken variants (not Modern Standard Arabic)</h3><p>People often say it differently in speech. These are shown for recognition only and are not quizzed.</p><ul class="lx-exs">${u.dialect.map((d) => `<li class="lx-ex">${ar(d.ar, "lx-ex-ar")}<div><b>${esc(d.translit)}</b> — ${esc(d.en)}<br><small>${esc(d.region)} · dialect</small>${d.note ? `<br><small>${esc(d.note)}</small>` : ""}</div></li>`).join("")}</ul></div>` : "";
  const speak = u.speak.map((t) => { const l = u.lines[t.line - 1]; return `<li class="lx-ex">${ar(l.ar, "lx-ex-ar")}<div><b>Line ${l.n}:</b> ${esc(t.tip)}</div></li>`; }).join("");
  const staticHtml = `<nav class="lx-back">${link(DASH + "#/conversations", "← Conversations")}</nav><article><h2 class="lx-h">Unit ${i + 1}: ${esc(u.title)}</h2><p>${esc(u.scenario)}</p><p class="lx-note" role="note"><b>Register:</b> Modern Standard Arabic. ${esc(u.registerNote)}</p>` +
    `<h3 class="lx-h3">Dialogue</h3><ol class="lx-dlg">${lines}</ol><h3 class="lx-h3">Key vocabulary</h3><ul class="lx-exs">${vocab}</ul>${dia}` +
    `<h3 class="lx-h3">Speaking practice</h3><p>Listen to each line, then say it aloud two or three times.</p><ul class="lx-exs">${speak}</ul>` +
    exercisePanel("Comprehension check", `Answer ${u.questions.length} questions about the dialogue. Score at least ${C.PASS_PERCENT}% to complete this unit. (The interactive practice loads with JavaScript.)`) +
    pager(prev && U.byRoute["conversation/" + prev.short], next && U.byRoute["conversation/" + next.short], (x) => C.UNITS.find((y) => y.short === x.key).title) + `</article>`;
  const related = [
    ...[prev, next].filter(Boolean).map((x) => ({ href: url("conversation/" + x.short), text: `${x.title} (${x === prev ? "previous" : "next"} unit)` })),
    { href: DASH + "#/conversations", text: "All conversations" },
    { href: DASH + "#/reading", text: "Reading comprehension" },
    { href: DASH + "#/review", text: "Daily review" }
  ];
  return {
    title: `Arabic Conversation: ${u.title} — Dialogue & Vocabulary | Learn Arabic`,
    h1: `Arabic conversation: ${u.title}`,
    eyebrow: `Conversation unit ${i + 1} of ${C.UNITS.length}`,
    intro: `${u.scenario} Read the dialogue with harakat, transliteration and English translation.`,
    description: clip(`Read and listen to an Arabic dialogue: ${u.scenario} With harakat, transliteration, English translation, ${u.vocab.length} key words and comprehension questions.`, 160),
    crumb: u.title, staticHtml, extra: "", related
  };
};

kinds.reading = (e) => {
  const p = RD.PASSAGES.find((x) => x.id === e.key), i = RD.PASSAGES.indexOf(p), prev = RD.PASSAGES[i - 1], next = RD.PASSAGES[i + 1], lv = RD.LEVELS[p.level - 1];
  const lines = p.lines.map((l) => `<li class="lx-rd-l">${l.speaker ? `<span class="lx-dl-who">${esc(l.speaker)}</span>` : ""}<span class="rd-v">${ar(l.ar, "lx-rd-ar")}</span><div class="rd-tr"><b>${esc(l.translit)}</b></div><div class="rd-en">${esc(l.en)}</div></li>`).join("");
  const gl = p.glossary.map((g) => `<li class="lx-ex">${ar(g.ar, "lx-ex-ar")}<div><b>${esc(g.translit)}</b> — ${esc(g.en)}</div></li>`).join("");
  const staticHtml = `<nav class="lx-back">${link(DASH + "#/reading", "← Reading comprehension")}</nav><article><h2 class="lx-h">${esc(p.title)}</h2><p><span class="lx-badge lx-d-${p.level === 1 ? "easy" : p.level === 4 ? "hard" : "medium"}">Level ${p.level}: ${esc(lv.title)}</span></p><p>${esc(p.intro)} All texts are Modern Standard Arabic.</p>` +
    `<ol class="lx-rd is-marks" id="lxRd">${lines}</ol><h3 class="lx-h3">Vocabulary explained</h3><ul class="lx-exs">${gl}</ul>` +
    exercisePanel("Comprehension questions", `Answer ${p.questions.length} questions about the text. Score at least ${RD.PASS_PERCENT}% to count it as read. (The interactive questions load with JavaScript.)`) +
    pager(prev && U.byRoute["reading/" + prev.id], next && U.byRoute["reading/" + next.id], (x) => RD.PASSAGES.find((y) => y.id === x.key).title) + `</article>`;
  const related = [
    ...[prev, next].filter(Boolean).map((x) => ({ href: url("reading/" + x.id), text: `${x.title} (${x === prev ? "previous" : "next"} text)` })),
    { href: DASH + "#/reading", text: "All reading texts" },
    { href: DASH + "#/conversations", text: "Conversations" },
    { href: DASH + "#/read", text: "Reading and typing practice" }
  ];
  return {
    title: `Arabic Reading Practice: ${p.title} (Level ${p.level}) | Learn Arabic`,
    h1: `Arabic reading practice: ${p.title}`,
    eyebrow: `Reading · Level ${p.level}: ${lv.title}`,
    intro: `${p.intro} A short Modern Standard Arabic text with transliteration, English translation and comprehension questions.`,
    description: clip(`Read “${p.title}”, a level ${p.level} Arabic text (${lv.title.toLowerCase()}) with harakat, transliteration, English translation, a glossary and ${p.questions.length} comprehension questions.`, 160),
    crumb: p.title, staticHtml, extra: "", related
  };
};

/* ---------- page assembly ---------- */
function buildPage(e) {
  return buildPageRaw(e).replace(/[ \t]+$/gm, "");   // no trailing whitespace in generated files (keeps `git diff --check` clean once they are staged)
}
function buildPageRaw(e) {
  const c = kinds[e.kind](e), canonical = pageUrl(e);
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE + "/" },
    { "@type": "ListItem", position: 2, name: "تعلّم العربية", item: SITE + DASH },
    { "@type": "ListItem", position: 3, name: c.crumb, item: canonical }] };
  const related = `<nav class="lx-intro lx-related" aria-labelledby="lxRel"><h2 id="lxRel">Related lessons and resources</h2><div class="lx-tools">${c.related.map((r) => link(r.href, esc(r.text), "lx-chip")).join("")}${link(DASH, "← Learn Arabic dashboard", "lx-chip")}</div></nav>`;
  const mount = MAIN_BLOCK.replace(/<div id="learnApp"([^>]*)>[\s\S]*?<\/div>/, (m, attrs) =>
    `<div id="learnApp"${attrs.replace(' aria-live="off"', ' aria-live="off" data-route="' + e.route + '"')}>${c.staticHtml}</div>`);
  if (!mount.includes(`data-route="${e.route}"`)) throw new Error("could not mount lesson into #learnApp for " + e.route);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/icons/icon-512.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.description)}">
<meta name="twitter:image" content="${SITE}/assets/icons/icon-512.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${HEAD_TAIL}</head>
${BODY_TOP}<nav class="breadcrumbs wrap lang-en" aria-label="Breadcrumb"><a href="../../../">الرئيسية</a><span class="sep" aria-hidden="true">/</span><a href="../../../learn-arabic/">تعلّم العربية</a><span class="sep" aria-hidden="true">/</span><span class="current" aria-current="page">${esc(c.crumb)}</span></nav>
<main id="main">
  <div class="wrap">
<section class="hero compact">
  <span class="eyebrow lang-en">${esc(c.eyebrow)}</span>
  <h1 class="lang-en" lang="en" dir="ltr" data-i18n-skip>${esc(c.h1)}</h1>
  <p class="lead lang-en" lang="en" dir="ltr" data-i18n-skip>${esc(c.intro)}</p>
</section>

${mount}<div class="lx lx-after" lang="en" dir="ltr" data-i18n-skip>
${c.extra ? c.extra + "\n" : ""}${related}
</div>

  </div>
${REST}`;
}

/* ---------- dashboard: static, crawlable index of every lesson page (between markers, regenerated each run) ---------- */
const GROUPS = [["letters", "Alphabet letters"], ["harakat", "Harakat (short vowel marks)"], ["vocabulary", "Vocabulary by topic"], ["conversations", "Conversations"], ["reading", "Reading comprehension"]];
const labelOf = (e) => ({
  letter: () => { const l = byLetter[e.key]; return `${l.letter} ${l.nameEn}`; },
  harakat: () => D.HARAKAT_LESSONS.find((x) => x.id === e.key).title,
  vocab: () => V.TOPICS.find((x) => x.id === e.key).title,
  conversation: () => C.UNITS.find((x) => x.short === e.key).title,
  reading: () => RD.PASSAGES.find((x) => x.id === e.key).title
}[e.kind]());
const INDEX_START = "<!-- lesson-index:start (generated by scripts/build-learn-pages.mjs; do not edit by hand) -->", INDEX_END = "<!-- lesson-index:end -->";
const indexRegion = () => `${INDEX_START}
  <section class="lx-intro lx-lesson-index" aria-labelledby="lxAllLessons">
    <h2 id="lxAllLessons">Browse all lessons</h2>
    <details>
      <summary>All ${lessonList.length} lesson pages: letters, harakat, vocabulary, conversations and reading</summary>
${GROUPS.map(([cat, name]) => { const es = lessonList.filter((x) => x.category === cat); return `      <h3 class="lx-h3">${name} (${es.length})</h3>\n      <div class="lx-tools">${es.map((x) => link(x.path, esc(labelOf(x)), "lx-chip")).join("")}</div>`; }).join("\n")}
    </details>
  </section>
  ${INDEX_END}`;
function updateDashboard(src) {
  const eol = eolOf(src), s = lf(src), region = indexRegion();
  let out;
  if (s.includes(INDEX_START)) out = s.replace(new RegExp(INDEX_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + INDEX_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), () => region);
  else {
    const anchor = "  </section>\n</div>\n\n  </div>\n</main>";
    if (!s.includes(anchor)) throw new Error("dashboard end-of-content anchor not found; cannot place the lesson index");
    out = s.replace(anchor, `  </section>\n  ${region}\n</div>\n\n  </div>\n</main>`);
  }
  return out.replace(/\n/g, eol);
}

/* ---------- sitemap ---------- */
function updateSitemap(src) {
  const eol = eolOf(src), s = lf(src);
  const stripped = s.split("\n").filter((l) => !/<loc>[^<]*\/learn-arabic\/[^<\/]+\/[^<\/]+\/<\/loc>/.test(l)).join("\n");
  const marker = `  <url><loc>${SITE}${DASH}</loc></url>`;
  if (!stripped.includes(marker)) throw new Error("sitemap.xml has no /learn-arabic/ entry to insert after");
  const lines = lessonList.map((e) => `  <url><loc>${pageUrl(e)}</loc></url>`).join("\n");
  return stripped.replace(marker, marker + "\n" + lines).replace(/\n/g, eol);
}

/* ---------- run ---------- */
const stale = [];
const write = (rel, content) => {
  const abs = path.join(ROOT, rel);
  const cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (cur === content) return;
  if (CHECK) { stale.push(rel); return; }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};
const seenTitles = new Set(), seenDesc = new Set();
for (const e of lessonList) {
  const html = buildPage(e);
  write(`learn-arabic/${e.path}index.html`, html);
  const t = /<title>([^<]*)<\/title>/.exec(html)[1], d = /name="description" content="([^"]*)"/.exec(html)[1];
  if (seenTitles.has(t) || seenDesc.has(d)) throw new Error("duplicate title/description for " + e.url);
  seenTitles.add(t); seenDesc.add(d);
}
write("learn-arabic/index.html", updateDashboard(readText("learn-arabic/index.html")));
if (SITEMAP) write("sitemap.xml", updateSitemap(readText("sitemap.xml")));
if (CHECK) {
  if (stale.length) { console.error("OUT OF DATE:\n  " + stale.join("\n  ")); process.exit(1); }
  console.log(`up to date: ${lessonList.length} lesson pages + dashboard index${SITEMAP ? " + sitemap" : ""}`);
} else console.log(`wrote ${lessonList.length} lesson pages, the dashboard lesson index${SITEMAP ? " and sitemap.xml" : ""}`);
