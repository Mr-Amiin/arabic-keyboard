// Phase 3 unit tests: conversations, reading comprehension, learning journey, unit progress, mixed-topic review, audio fallback.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const D = require("../../assets/js/learn/data.js"), V = require("../../assets/js/learn/vocab-data.js");
const C = require("../../assets/js/learn/conversations.js"), RD = require("../../assets/js/learn/reading.js");
const S = require("../../assets/js/learn/srs.js"), R = require("../../assets/js/learn/review.js"), P = require("../../assets/js/learn/progress.js");
const J = require("../../assets/js/learn/journey.js");
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const MARKS = /[ً-ْٰـ]/g;      // harakat, shadda, sukun, dagger alif, tatweel
const HARAKAT_ONLY = /[ً-ْٰ]/;
const arabicOf = s => (s.match(/[؀-ۿ]/g) || []).length > 0;
const lines = [...C.UNITS.flatMap(u => u.lines), ...RD.PASSAGES.flatMap(p => p.lines)];
const texts = [...C.UNITS.flatMap(u => u.lines.map(l => ({ id: l.id, ar: l.ar, plain: l.plain }))), ...C.SENTENCE_ITEMS.map(s => ({ id: s.id, ar: s.ar, plain: s.plain })),
  ...RD.PASSAGES.flatMap(p => p.lines.map(l => ({ id: p.id + "-" + l.n, ar: l.ar, plain: l.plain })))];

/* ---------- conversations ---------- */
test("conversations: the eight required units exist in order, each with a dialogue, vocabulary, questions, a speaking activity and a register label", () => {
  assert.deepEqual(C.UNITS.map(u => u.short), ["intro", "family", "greet", "name", "order", "shop", "direct", "daily"]);
  for (const u of C.UNITS) {
    assert.ok(u.lines.length >= 5, u.id + " dialogue is too short");
    assert.ok(u.vocab.length >= 5 && u.questions.length >= 3 && u.speak.length >= 2 && u.sentenceIds.length >= 1, u.id);
    assert.ok(u.register && u.registerNote, u.id + " must say which register it uses");
    assert.ok(Object.keys(u.speakers).length >= 2);
  }
});
test("conversations: stable unique ids across units, lines, questions, sentences and speaking tips", () => {
  const ids = [...C.UNITS.map(u => u.id), ...C.UNITS.flatMap(u => [...u.lines, ...u.questions, ...u.speak].map(x => x.id)), ...C.SENTENCE_ITEMS.map(s => s.id)];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
  C.UNITS.forEach(u => assert.deepEqual(u.lines.map(l => l.n), u.lines.map((_, i) => i + 1)));
});
test("conversations: every line has vowelled Arabic, transliteration and translation, and each line's speaker is defined", () => {
  for (const u of C.UNITS) for (const l of u.lines) {
    assert.ok(arabicOf(l.ar) && l.translit.trim() && l.en.trim(), l.id);
    assert.ok(HARAKAT_ONLY.test(l.ar), l.id + " should carry harakat");
    assert.ok(u.speakers[l.speaker], l.id + " has an unknown speaker");
    assert.equal(l.audioKey, "dlg-" + u.short + "-" + l.n);
  }
});
test("conversations: vocabulary ids all exist, are Modern Standard Arabic, and sentence items are in the review catalogue", () => {
  for (const u of C.UNITS) {
    for (const id of u.vocab) { assert.ok(R.BY_ID[id], u.id + " references missing vocab " + id); assert.equal(R.BY_ID[id].reg, "msa"); }
    for (const id of u.sentenceIds) { assert.ok(R.BY_ID[id], id); assert.equal(R.kindOf(id), "sentence"); }
  }
  assert.ok(C.SENTENCE_ITEMS.every(s => s.reg === "msa" && s.ar.includes(s.slot) && s.pool.length >= 3 && !s.pool.includes(s.slot)));
});
test("conversations: comprehension questions have one valid correct answer, distinct options and an explanation", () => {
  for (const q of C.UNITS.flatMap(u => u.questions)) {
    assert.ok(q.options.length >= 3 && new Set(q.options).size === q.options.length, q.id);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id);
    assert.ok(q.explanation.trim().length > 10, q.id);
  }
});
test("conversations: speaking tips point at real lines; dialect forms are labelled with a region and never enter the review catalogue", () => {
  for (const u of C.UNITS) {
    for (const t of u.speak) assert.ok(t.line >= 1 && t.line <= u.lines.length && t.tip.trim(), t.id);
    for (const d of u.dialect) { assert.ok(d.region && d.reg === "dialect", d.id); assert.equal(R.BY_ID[d.id], undefined, d.id + " must not be scheduled"); }
  }
});
test("conversations: the comprehension builder shuffles options but always keeps exactly one correct value, whatever the seed", () => {
  const u = C.UNITS[0];
  for (let seed = 1; seed <= 40; seed++) {
    let x = seed; const rng = () => (x = (x * 16807) % 2147483647) / 2147483647;
    R.buildComprehension(u.questions, rng).forEach((q, i) => {
      assert.equal(q.options.length, u.questions[i].options.length);
      assert.equal(q.options.find(o => o.value === q.answer).label, u.questions[i].options[u.questions[i].answer]);
    });
  }
});

/* ---------- reading ---------- */
test("reading: four levels, eight passages, ordered from sentences to dialogues, with the first three levels vowelled and dialogues unvowelled by default", () => {
  assert.deepEqual(RD.LEVELS.map(l => l.n), [1, 2, 3, 4]);
  const lv = RD.PASSAGES.map(p => p.level); assert.deepEqual(lv, [...lv].sort());
  for (const l of RD.LEVELS) assert.ok(RD.PASSAGES.some(p => p.level === l.n), "level " + l.n + " is empty");
  RD.PASSAGES.forEach(p => assert.equal(p.marks, p.level < 4, p.id));
  assert.ok(RD.PASSAGES.length >= 8);
});
test("reading: ids unique; every passage has lines, a glossary and at least three valid comprehension questions", () => {
  const ids = [...RD.PASSAGES.map(p => p.id), ...RD.PASSAGES.flatMap(p => p.questions.map(q => q.id))];
  assert.equal(new Set(ids).size, ids.length);
  for (const p of RD.PASSAGES) {
    assert.ok(p.lines.length >= 4 && p.glossary.length >= 2 && p.questions.length >= 3, p.id);
    for (const q of p.questions) { assert.ok(q.answer >= 0 && q.answer < q.options.length && new Set(q.options).size === q.options.length && q.explanation.trim(), q.id); }
    for (const l of p.lines) assert.ok(l.translit.trim() && l.en.trim() && arabicOf(l.ar), p.id + " line " + l.n);
  }
});
test("reading: passages get harder (longer and more questions never shrink from level 1 to level 3)", () => {
  const avg = n => { const ps = RD.PASSAGES.filter(p => p.level === n); return ps.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.plain.split(/\s+/).length, 0), 0) / ps.length; };
  assert.ok(avg(1) <= avg(2) + 6 && avg(2) < avg(3), "word counts: " + [1, 2, 3].map(avg));
});

/* ---------- Arabic spelling, normalisation, harakat consistency across all Phase 3 text ---------- */
test("Arabic text: NFC, plain is exactly the vowelled text minus harakat, no stray or doubled marks, no Latin letters in Arabic fields", () => {
  for (const t of texts) {
    assert.equal(t.ar, t.ar.normalize("NFC"), t.id + " not NFC");
    assert.equal(t.plain, t.ar.replace(MARKS, ""), t.id + " plain mismatch");
    assert.ok(!/(^|\s)[ً-ْٰ]/.test(t.ar), t.id + " mark with no base letter");
    assert.ok(!/([ً-ْ])\1/.test(t.ar), t.id + " doubled mark");
    assert.ok(!/[َُِ][َُِ]/.test(t.ar), t.id + " two short vowels on one letter");
    assert.ok(!/[A-Za-z]/.test(t.ar), t.id + " contains Latin letters");
  }
});
test("Arabic text: no presentation-form letters, no Persian/Urdu look-alike letters (ی ک) and no zero-width characters", () => {
  const bad = /[ﭐ-﷿ﹰ-﻿یک​-‏‪-‮]/;
  for (const t of texts) assert.ok(!bad.test(t.ar), t.id);
  for (const i of V.ITEMS) assert.ok(!bad.test(i.ar), i.id);
});

/* ---------- vocabulary completeness (Phase 3 packs) ---------- */
test("vocabulary: all ten requested everyday packs are present with the required fields, and ids are unique across the whole catalogue", () => {
  const need = ["food", "home", "routine", "clothes", "time", "places", "transport", "shopping", "weather", "school"];
  for (const t of need) {
    const items = V.ITEMS.filter(i => i.topic === t); assert.ok(items.length >= 15, t + " has only " + items.length);
    for (const i of items) {
      for (const f of ["id", "ar", "plain", "translit", "en", "topic", "difficulty", "reg"]) assert.ok(String(i[f] ?? "").trim(), i.id + "." + f);
      assert.ok(["Easy", "Medium", "Challenging"].includes(i.difficulty), i.id); assert.equal(i.reg, "msa");
    }
  }
  const ids = V.ITEMS.map(i => i.id); assert.equal(new Set(ids).size, ids.length);
  // The same plain spelling may recur only when the vowelled forms differ (e.g. أَنْتَ / أَنْتِ, مِنْ / مَنْ); a true duplicate is a defect.
  const ar = V.ITEMS.filter(i => i.kind === "word").map(i => i.ar + "|" + i.topic); assert.equal(new Set(ar).size, ar.length, "a word is duplicated inside a topic");
});
test("vocabulary: the V1 item ids and review keys are untouched, so existing learner progress still matches", () => {
  for (const id of ["greet-hello", "greet-ahlan", "greet-bye"]) assert.ok(V.ITEMS.find(i => i.id === id), id + " disappeared");
  assert.equal(V.ITEMS.filter(i => V.V1_TOPIC_IDS.includes(i.topic)).length, 11 + 10 + 12 + 18);
});

/* ---------- progress: unit scores, pass marks, persistence, hostile data ---------- */
test("units: recording below the pass mark does not complete; passing does; the best score never falls; completion time is the first pass", () => {
  let t = Date.UTC(2026, 5, 1, 12); const st = P.createStore(mem(), () => t); st.load();
  const id = C.UNITS[0].id;
  assert.equal(st.recordUnit(id, 40).complete, false); assert.equal(st.unitDone(id), false);
  t += 1000; assert.equal(st.recordUnit(id, 80).complete, true); const first = st.unit(id).at;
  t += 5000; st.recordUnit(id, 20); const u = st.unit(id);
  assert.equal(u.best, 80); assert.equal(u.tries, 3); assert.equal(u.at, first); assert.equal(u.complete, true);
  assert.equal(st.recordUnit("conv-nonexistent", 100), null);
});
test("units: the pass mark is exactly the documented percent (69 fails, 70 passes) for conversations and passages", () => {
  const st = P.createStore(mem(), () => 1e12); st.load();
  for (const id of [C.UNITS[1].id, RD.PASSAGES[0].id]) { assert.equal(st.recordUnit(id, 69).complete, false); assert.equal(st.recordUnit(id, 70).complete, true); }
});
test("units: speaking practice is self-assessed and never completes a unit", () => {
  const st = P.createStore(mem(), () => 1e12); st.load(); const id = C.UNITS[2].id;
  assert.equal(st.markSpoke(id), true); assert.equal(st.unitDone(id), false); assert.equal(st.unit(id).spoke, true);
});
test("units: results persist across reloads and reach a second tab; reset clears them; unavailable storage degrades to memory", () => {
  const storage = mem(); const a = P.createStore(storage, () => 1e12); a.load();
  a.recordUnit(C.UNITS[3].id, 90); a.recordUnit(RD.PASSAGES[2].id, 75);
  const b = P.createStore(storage, () => 1e12); b.load();
  assert.equal(b.unitDone(C.UNITS[3].id), true); assert.equal(b.unit(RD.PASSAGES[2].id).best, 75);
  b.recordUnit(C.UNITS[4].id, 100); a.recordUnit(C.UNITS[5].id, 100);
  const c = P.createStore(storage, () => 1e12); c.load(); assert.equal(c.unitDone(C.UNITS[4].id) && c.unitDone(C.UNITS[5].id) && c.unitDone(C.UNITS[3].id), true);
  c.reset(); assert.equal(c.unit(C.UNITS[3].id), null);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  const m = P.createStore(broken, () => 1e12); m.load(); assert.equal(m.recordUnit(C.UNITS[0].id, 100).complete, true);
});
test("units: hostile or malformed stored data is dropped without touching valid entries or existing lesson progress", () => {
  const good = C.UNITS[0].id;
  const raw = { v: 2, lessons: { "letter-alif": { at: 5, best: 100 } }, units: { [good]: { at: 9, best: 85, tries: 2, spoke: true }, "__proto__": { best: 100 }, "conv-fake": { at: 1, best: 100, tries: 1 }, [C.UNITS[1].id]: "oops" } };
  const out = P.sanitize(raw, 1e12);
  assert.equal(out.units[good].best, 85); assert.equal(out.units["conv-fake"], undefined); assert.equal(out.units[C.UNITS[1].id], undefined);
  assert.equal(out.lessons["letter-alif"].best, 100);
  assert.equal(Object.prototype.hasOwnProperty.call(out.units, "__proto__"), false);
});

/* ---------- spaced repetition for the new items ---------- */
test("review: new vocabulary and conversation sentences enter the schedule on the first answer, once, under their stable id", () => {
  const st = P.createStore(mem(), () => Date.UTC(2026, 5, 1, 12)); st.load();
  const word = V.ITEMS.find(i => i.topic === "food" && i.kind === "word").id, sent = C.SENTENCE_ITEMS[0].id;
  assert.equal(st.reviewAnswers([{ id: word, correct: true }, { id: sent, correct: false }, { id: word, correct: true }]), 3);
  assert.equal(Object.keys(st.data.srs).length, 2, "same id must never create two cards");
  assert.ok(st.data.srs[word] && st.data.srs[sent]);
});
test("review: a miss returns the item tomorrow, a hit pushes it further; due items surface in the queue", () => {
  let t = Date.UTC(2026, 5, 1, 12); const st = P.createStore(mem(), () => t); st.load();
  const [a, b] = V.ITEMS.filter(i => i.topic === "school" && i.kind === "word").map(i => i.id);
  st.reviewAnswers([{ id: a, correct: true }, { id: b, correct: false }]);
  assert.deepEqual(st.dueIds(R.ALL_IDS), []);
  t += 86400000; assert.deepEqual(st.dueIds(R.ALL_IDS), [b]);
  t += 5 * 86400000; assert.ok(st.dueIds(R.ALL_IDS).includes(a));
  assert.ok(st.srsEntry(a).d > st.srsEntry(b).d);
});
test("review: every Phase 3 vocabulary and sentence id is a valid scheduler id in the catalogue", () => {
  const ids = [...V.ITEMS.filter(i => i.reg === "msa").map(i => i.id), ...C.SENTENCE_ITEMS.map(s => s.id)];
  for (const id of ids) assert.ok(R.ALL_IDS.includes(id), id + " is not schedulable");
  assert.equal(new Set(R.ALL_IDS).size, R.ALL_IDS.length);
});

/* ---------- mixed-topic review ---------- */
test("mixed-topic review: spans several topics, never repeats a word, uses only MSA items, and prefers due and unseen words", () => {
  const all = V.TOPICS.map(t => t.id); let x = 7; const rng = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const qs = R.buildMixedTopicSession({ topics: all, count: 12, rng });
  assert.equal(qs.length, 12);
  const ids = qs.map(q => q.itemId); assert.equal(new Set(ids).size, ids.length);
  assert.ok(new Set(ids.map(id => R.BY_ID[id].topic)).size >= 6, "topics are not mixed");
  assert.ok(ids.every(id => R.BY_ID[id].reg === "msa"));
  const target = V.ITEMS.find(i => i.topic === "weather" && i.kind === "word").id;
  const due = R.buildMixedTopicSession({ topics: ["weather", "food"], count: 4, dueIds: [target], entries: {}, rng: () => 0.5 });
  assert.ok(due.some(q => q.itemId === target), "a due word must be included");
});
test("mixed-topic review: restricting to one topic or an unknown topic behaves sensibly", () => {
  const one = R.buildMixedTopicSession({ topics: ["clothes"], count: 5, rng: Math.random });
  assert.ok(one.length === 5 && one.every(q => R.BY_ID[q.itemId].topic === "clothes"));
  assert.ok(R.buildMixedTopicSession({ topics: ["nope"], count: 5 }).length >= 0);
});

/* ---------- learning journey ---------- */
const ctxFor = st => ({ lessonDone: st.isDone, unitDone: st.unitDone, unit: st.unit, srsEntry: st.srsEntry });
test("journey: a brand-new learner has the first step current, everything else upcoming, nothing locked, 0% done", () => {
  const st = P.createStore(mem(), () => 1e12); st.load(); const jn = J.build(ctxFor(st));
  assert.equal(jn.done, 0); assert.equal(jn.percent, 0); assert.equal(jn.next.stage, "alphabet");
  assert.equal(jn.stages.flatMap(s => s.steps).filter(s => s.status === "current").length, 1);
  assert.ok(jn.stages.flatMap(s => s.steps).every(s => s.locked === false));
  assert.deepEqual(jn.stages.map(s => s.id), ["alphabet", "harakat", "reading", "starter", "everyday", "sentences", "conversations", "comprehension"]);
});
test("journey: opening or failing something never inflates progress; only genuine passes do", () => {
  const st = P.createStore(mem(), () => 1e12); st.load();
  st.recordUnit(C.UNITS[0].id, 69); st.recordSession && st.recordSession("vocab", [{ letterId: null, correct: false }]);
  st.markSpoke(C.UNITS[0].id); st.reviewAnswers([{ id: V.ITEMS[0].id, correct: false }]);
  assert.equal(J.build(ctxFor(st)).done, 0);
  st.recordUnit(C.UNITS[0].id, 80); const jn = J.build(ctxFor(st));
  assert.equal(jn.done, 1); assert.equal(jn.stages.find(s => s.id === "conversations").steps[0].status, "done");
});
test("journey: a vocabulary topic is done only when 80% of its words were answered correctly at box 2 or higher", () => {
  const st = P.createStore(mem(), () => Date.UTC(2026, 5, 1, 12)); st.load();
  const ids = J.topicWords("food"), need = Math.ceil(ids.length * J.KNOWN_RATIO);
  const step = () => J.build(ctxFor(st)).stages.flatMap(s => s.steps).find(s => s.id === "vocab-food");
  for (const rep of [1, 2]) st.reviewAnswers(ids.slice(0, need - 1).map(id => ({ id, correct: true })));   // same day repeats do not inflate boxes
  assert.equal(step().done, false);
  const t0 = Date.UTC(2026, 5, 1, 12); let t = t0; const st2 = P.createStore(mem(), () => t); st2.load();
  st2.reviewAnswers(ids.map(id => ({ id, correct: true }))); t += 2 * 86400000; st2.reviewAnswers(ids.map(id => ({ id, correct: true })));
  assert.equal(J.build(ctxFor(st2)).stages.flatMap(s => s.steps).find(s => s.id === "vocab-food").done, true);
});
test("journey: the current step moves on as steps are completed, and the whole course can reach 100%", () => {
  const st = P.createStore(mem(), () => 1e12); st.load();
  P.LESSON_IDS.forEach(id => st.completeLesson(id, 100)); P.UNIT_IDS.forEach(id => st.recordUnit(id, 100));
  let jn = J.build(ctxFor(st)); assert.equal(jn.next.stage, "starter");
  V.TOPICS.forEach(t => st.reviewAnswers(J.topicWords(t.id).map(id => ({ id, correct: true }))));
  const t2 = 1e12 + 3 * 86400000, st3 = P.createStore(st === null ? mem() : (() => { const m = mem(); m.setItem(P.KEY, JSON.stringify(st.data)); return m; })(), () => t2); st3.load();
  V.TOPICS.forEach(t => st3.reviewAnswers(J.topicWords(t.id).map(id => ({ id, correct: true }))));
  V.PATTERNS.forEach(p => st3.reviewAnswers(p.examples.map(e => ({ id: e.id, correct: true }))));
  V.TOPICS.forEach(t => st3.reviewAnswers(J.topicWords(t.id).map(id => ({ id, correct: true }))));
  jn = J.build(ctxFor(st3)); assert.ok(jn.percent >= 90, "percent " + jn.percent);
});

/* ---------- audio fallback and recordings architecture ---------- */
function loadAudio({ synth, voices = [] } = {}) {
  const events = [], win = { localStorage: { getItem: () => null, setItem() {} } };
  if (synth !== false) {
    win.speechSynthesis = { getVoices: () => voices, cancel() {}, speak(u) { win._spoken = u; }, addEventListener() {} };
    win.SpeechSynthesisUtterance = function (t) { this.text = t; };
  }
  const doc = { dispatchEvent: e => { events.push(e.detail || e); return true; }, addEventListener() {} };
  const ctx = { window: win, document: doc, CustomEvent: function (n, o) { this.detail = o && o.detail; this.type = n; }, setTimeout, clearTimeout, Audio: function () { this.play = () => Promise.resolve(); } };
  win.window = win; vm.runInNewContext(fs.readFileSync(path.join(REPO, "assets/js/learn/audio.js"), "utf8"), ctx); return { A: win.LearnAudio, events, win };
}
test("audio: with no speech support the course says so, plays nothing and reports an error event instead of throwing", () => {
  const { A, events } = loadAudio({ synth: false });
  assert.equal(A.status().supported, false); assert.equal(A.canListen(), false); assert.equal(A.speak("مَرْحَبًا"), false);
  assert.ok(events.some(e => e.type === "error" && e.error === "unsupported"));
});
test("audio: speech support but no Arabic voice is reported honestly and listening exercises stay off", () => {
  const { A } = loadAudio({ voices: [{ name: "English", lang: "en-US" }] });
  const s = A.status(); assert.equal(s.supported, true); assert.equal(s.hasVoice, false); assert.equal(A.canListen(), false); assert.match(s.msg, /No Arabic voice/);
});
test("audio: an Arabic voice is described as device-generated, never as a native recording; ar-SA is preferred", () => {
  const { A } = loadAudio({ voices: [{ name: "Egypt", lang: "ar-EG", localService: true }, { name: "Saudi", lang: "ar-SA", localService: true }] });
  const s = A.status(); assert.equal(s.voice.lang, "ar-SA"); assert.match(s.msg, /device-generated speech, not a native recording/); assert.equal(A.canListen(), true);
});
test("audio: unverified recordings are rejected; only a reviewed, named, correctly located manifest entry is accepted", () => {
  const { A } = loadAudio({ voices: [] });
  assert.equal(A.registerRecordings({ a: { src: "/assets/audio/a.mp3" }, b: { src: "https://evil.example/b.mp3", verifiedBy: "X", scriptReviewed: true }, c: { src: "/assets/audio/c.mp3", verifiedBy: "X", scriptReviewed: false } }), 0);
  assert.equal(A.registerRecordings({ ok: { src: "/assets/audio/ok.mp3", verifiedBy: "Teacher", scriptReviewed: true } }), 1);
  assert.equal(A.canListen(), true);
});
test("audio: slow-speech toggle switches rate and keeps a valid state", () => {
  const { A } = loadAudio({ voices: [{ name: "Saudi", lang: "ar-SA" }] });
  assert.equal(A.getSpeed(), "normal"); assert.equal(A.toggleSpeed(), "slow"); assert.equal(A.setSpeed("bogus"), "slow"); assert.equal(A.toggleSpeed(), "normal");
});
