/* Learn Arabic — the learning journey (pure logic, no DOM, no storage).
   Alphabet → Harakat → Reading → Starter vocabulary → Everyday vocabulary → Sentences → Conversations → Reading comprehension.
   Status is DERIVED from genuine records only, so progress cannot be inflated by merely opening a page:
     - a letter / harakat lesson counts when its quick check was passed;
     - a Reading-and-typing stage, a conversation unit and a reading passage count when the learner's best score reached the pass mark;
     - a vocabulary topic counts when at least 80% of its words were last answered CORRECTLY (spaced-repetition box 2 or higher);
     - a sentence pattern counts when every one of its sentences was last answered correctly.
   Nothing is hard-locked: every step can be opened at any time. The "current" step is simply the first unfinished one, the "upcoming" steps
   follow it, and the course never blocks a learner from skipping ahead (no step genuinely depends on another to function). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./vocab-data.js"), require("./conversations.js"), require("./reading.js"));
  else root.LearnJourney = factory(root.LearnData, root.LearnVocab, root.LearnConversations, root.LearnReading);
})(typeof self !== "undefined" ? self : this, function (D, V, C, RD) {
  "use strict";
  const KNOWN_RATIO = 0.8, KNOWN_BOX = 2;
  const STAGES = [
    { id: "alphabet", title: "Alphabet", blurb: "The 28 letters, their names, sounds and shapes." },
    { id: "harakat", title: "Harakat", blurb: "The short-vowel marks, sukun, shadda and tanween." },
    { id: "reading", title: "Reading", blurb: "Reading and typing from single letters up to short sentences." },
    { id: "starter", title: "Starter vocabulary", blurb: "Numbers, colours, family and greetings." },
    { id: "everyday", title: "Everyday vocabulary", blurb: "Food, home, daily life, travel, shopping and more." },
    { id: "sentences", title: "Sentences", blurb: "Reusable sentence patterns." },
    { id: "conversations", title: "Conversations", blurb: "Eight short dialogues for real situations." },
    { id: "comprehension", title: "Reading comprehension", blurb: "Sentences, paragraphs, stories and dialogues, with questions." }
  ];
  const topicWords = id => V.ITEMS.filter(i => i.topic === id && i.reg === "msa").map(i => i.id);
  const known = (ctx, id) => { const e = ctx.srsEntry(id); return !!e && e.b >= KNOWN_BOX; };

  // ctx: { lessonDone(id) -> bool, unitDone(id) -> bool, unit(id) -> {best,...}|null, srsEntry(id) -> {b,...}|null }
  function build(ctx) {
    const stages = STAGES.map(s => Object.assign({ steps: [] }, s)), by = {}; stages.forEach(s => { by[s.id] = s; });
    const push = (stage, step) => by[stage].steps.push(Object.assign({ stage: stage }, step));

    const letters = D.LETTERS.map(l => "letter-" + l.id), lettersDone = letters.filter(id => ctx.lessonDone(id)).length, firstLetter = letters.find(id => !ctx.lessonDone(id));
    push("alphabet", { id: "alphabet-letters", title: "The 28 letters", href: "#/letter/" + (firstLetter ? firstLetter.slice(7) : D.LETTERS[0].id), done: lettersDone === letters.length, count: lettersDone, total: letters.length, unitName: "lessons passed" });
    D.HARAKAT_LESSONS.forEach(h => push("harakat", { id: h.id, title: h.title, href: "#/harakat/" + h.id, done: !!ctx.lessonDone(h.id), count: ctx.lessonDone(h.id) ? 1 : 0, total: 1, unitName: "lesson passed" }));
    D.READING_STAGES.forEach(s => { const u = ctx.unit("stage-" + s.id); push("reading", { id: "stage-" + s.id, title: s.title.replace(/^\d+\.\s*/, ""), href: "#/read", done: !!ctx.unitDone("stage-" + s.id), count: ctx.unitDone("stage-" + s.id) ? 1 : 0, total: 1, unitName: "stage passed", best: u ? u.best : null }); });
    V.TOPICS.forEach(t => {
      const ids = topicWords(t.id), n = ids.filter(id => known(ctx, id)).length, stage = t.group === "starter" ? "starter" : "everyday";
      push(stage, { id: "vocab-" + t.id, title: t.title, href: "#/vocab/" + t.id, done: ids.length > 0 && n / ids.length >= KNOWN_RATIO, count: n, total: ids.length, unitName: "words answered correctly" });
    });
    V.PATTERNS.forEach(p => {
      const ids = p.examples.map(e => e.id), n = ids.filter(id => known(ctx, id)).length;
      push("sentences", { id: "pattern-" + p.id, title: "Pattern: " + (p.title.split(/[:؟]/)[0].trim() || p.title), href: "#/patterns/" + p.id, done: n === ids.length, count: n, total: ids.length, unitName: "sentences answered correctly" });
    });
    C.UNITS.forEach(u => { const x = ctx.unit(u.id); push("conversations", { id: u.id, title: u.title, href: "#/conversation/" + u.short, done: !!ctx.unitDone(u.id), count: ctx.unitDone(u.id) ? 1 : 0, total: 1, unitName: "unit passed", best: x ? x.best : null }); });
    RD.PASSAGES.forEach(p => { const x = ctx.unit(p.id); push("comprehension", { id: p.id, title: p.title, href: "#/reading/" + p.id, done: !!ctx.unitDone(p.id), count: ctx.unitDone(p.id) ? 1 : 0, total: 1, unitName: "passage passed", best: x ? x.best : null, level: p.level }); });

    // Status: done / current (the first unfinished step) / upcoming. Nothing is ever "locked".
    let next = null, doneSteps = 0, totalSteps = 0;
    stages.forEach(s => s.steps.forEach(st => {
      totalSteps++;
      if (st.done) { st.status = "done"; doneSteps++; }
      else if (!next) { st.status = "current"; next = st; }
      else st.status = "upcoming";
      st.locked = false;
    }));
    stages.forEach(s => {
      const d = s.steps.filter(x => x.done).length; s.done = d; s.total = s.steps.length;
      s.status = d === s.total ? "done" : s.steps.some(x => x.status === "current") ? "current" : "upcoming";
    });
    return { stages, next, done: doneSteps, total: totalSteps, percent: totalSteps ? Math.floor(doneSteps / totalSteps * 100) : 0, complete: doneSteps === totalSteps };
  }
  return { STAGES, KNOWN_RATIO, KNOWN_BOX, build, topicWords };
});
