/* Learn Arabic — Phase 4 UI: Stories and Sentence Workshop. UNREVIEWED by a qualified Arabic teacher.
   Loaded BEFORE app.js, it registers window.LearnExt; app.js calls it through a few guarded hooks (routes, "x-" actions, typing submit, dashboard) and hands
   it a narrow UI object. If this file or any of its dependencies is missing, LearnExt is simply not defined and the rest of Learn Arabic behaves exactly as before.

   RULES THIS MODULE FOLLOWS (checked by tests):
   • It never touches the progress store. The UI object it receives has NO store handle: only read-only unit lookups and finish().
   • Every session ends with ui.finish(session) where session.ext = X.finishPackage(...): graded results only, review rows only from X.reviewRowsFor.
     Nothing here calls store.reviewAnswers, and nothing here scores, passes or records anything itself; the shared finish() does that.
   • Every story and exercise page shows the draft notice: the content is awaiting review by a qualified Arabic teacher.
   • The harakat preference lives in its own storage key (ak-learn-st-prefs), never in the progress data. Band defaults apply until the learner changes it. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./exercises.js"), require("./stories.js"), require("./sentences.js"), require("./review.js"), null);
  else { const api = factory(root.LearnExercises, root.LearnStories, root.LearnSentences, root.LearnReview, root); if (api) root.LearnExt = api.ext; }
})(typeof self !== "undefined" ? self : this, function (X, ST, SW, R, win) {
  "use strict";
  if (!X || !ST || !SW || !R) return null;

  const PREF_KEY = "ak-learn-st-prefs";
  const BADGE = { 1: "easy", 2: "medium", 3: "hard" };
  const BAND_BLURB = { 1: "Short present-tense texts, fully vowelled.", 2: "A little longer, with simple negation and connectors. Fully vowelled.", 3: "Longer texts with reasons and contrasts. Harakat start off, and you can switch them on." };
  const SET_BLURB = { 1: "Build and match simple sentences.", 2: "Build and complete sentences with verbs.", 3: "Complete and connect sentences." };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------------------------------------------------------------- the harakat preference (separate key, safe when storage is blocked)
  function createPrefs(storage) {
    let mem = { marks: null, tap: false };
    const read = () => { try { const r = JSON.parse(storage.getItem(PREF_KEY)); if (r && typeof r === "object") return { marks: typeof r.marks === "boolean" ? r.marks : null, tap: r.tap === true }; } catch (e) { /* blocked or corrupt: use the defaults */ } return null; };
    const write = p => { mem = { marks: p.marks, tap: p.tap }; try { storage.setItem(PREF_KEY, JSON.stringify({ v: 1, marks: p.marks, tap: p.tap })); } catch (e) { /* kept for this visit only */ } };
    return { get() { return read() || { marks: mem.marks, tap: mem.tap }; }, setMarks(v) { const p = this.get(); p.marks = v === null ? null : !!v; write(p); }, setTap(v) { const p = this.get(); p.tap = !!v; write(p); } };
  }
  const effectiveMarks = (story, prefs) => (prefs.marks === null ? story.marks : prefs.marks);

  // ---------------------------------------------------------------- pure HTML builders (take the UI helper object, so Node tests can run them)
  const cell = (ui, text, isAr, cls) => (isAr ? ui.ar(text, cls || "") : ui.esc(text));
  const draftNote = ui => '<p class="lx-note" role="note">' + ui.esc(X.DRAFT_NOTICE) + "</p>";
  const back = (ui, h, label) => '<nav class="lx-back"><a href="' + ui.href(h) + '">← ' + ui.esc(label) + "</a></nav>";
  const gradedCount = qs => qs.filter(q => q.type !== "reveal").length;

  function emptyPage(ui) {
    return back(ui, "", "Dashboard") + '<h2 class="lx-h" tabindex="-1" data-focus>Stories and sentence building</h2>' +
      "<p>Stories and sentence-building exercises are not available yet.</p>" +
      '<p><a class="lx-btn lx-btn-alt" href="' + ui.href("reading") + '">Reading comprehension →</a></p>';
  }
  function storyCard(ui, s, rec) {
    return '<a class="lx-card" href="' + ui.href("story/" + s.id) + '"><span class="lx-badge lx-d-' + BADGE[s.band] + '">Band ' + s.band + (s.marks ? "" : " · no harakat at first") + '</span> <span class="lx-badge">Draft</span> ' + ui.unitBadge(rec) +
      "<h3>" + ui.esc(s.title) + "</h3><p>" + ui.esc(s.theme) + "</p></a>";
  }
  function setCard(ui, set, n, rec) {
    return '<a class="lx-card" href="' + ui.href("workshop/" + set.n) + '"><span class="lx-badge lx-d-medium">Set ' + set.n + '</span> <span class="lx-badge">Draft</span> ' + ui.unitBadge(rec) +
      "<h3>" + ui.esc(set.title) + "</h3><p>" + n + " exercises · " + ui.esc(SET_BLURB[set.n] || "") + "</p></a>";
  }
  // d = { stories, sets: [{ set, count }], rec(id) }
  function indexPage(ui, d) {
    const bands = ST.BANDS.map(b => {
      const list = d.stories.filter(s => s.band === b.band); if (!list.length) return "";
      return '<h3 class="lx-h3">Band ' + b.band + ": " + ui.esc(b.title) + '</h3><p class="lx-small">' + ui.esc(BAND_BLURB[b.band]) + '</p><div class="lx-cards">' + list.map(s => storyCard(ui, s, d.rec(s.id))).join("") + "</div>";
    }).join("");
    const ws = d.sets.length ? '<h3 class="lx-h3">Sentence workshop</h3><p class="lx-small">Short exercises that build sentences. Score at least ' + X.PASS_PERCENT + '% on a set to complete it.</p><div class="lx-cards">' + d.sets.map(x => setCard(ui, x.set, x.count, d.rec(x.set.id))).join("") + "</div>" : "";
    return back(ui, "", "Dashboard") + '<h2 class="lx-h" tabindex="-1" data-focus>Stories and sentence building</h2>' + draftNote(ui) +
      "<p>" + (d.stories.length ? "Read short stories in Modern Standard Arabic, then answer questions" + (d.sets.length ? ", and practise building sentences" : "") : "Practise building sentences in Modern Standard Arabic") + ". Your best score for each " + (d.stories.length ? "story or set" : "set") + " is saved; one counts as complete at " + X.PASS_PERCENT + "% or more.</p>" + bands + ws;
  }
  function dashboardHtml(ui, d) {
    if (!d.stories.length && !d.sets.length) return "";
    const parts = []; if (d.stories.length) parts.push(d.stories.length + " short stories"); if (d.sets.length) parts.push(d.sets.length + " sentence-building sets");
    return '<h3 class="lx-h3">Stories and sentence building · <a href="' + ui.href("stories") + '">open</a></h3><div class="lx-cards"><a class="lx-card" href="' + ui.href("stories") + '"><span class="lx-badge lx-d-easy">Beginner to intermediate</span> <span class="lx-badge">Draft</span>' +
      "<h3>Stories and sentence building</h3><p>" + ui.esc(parts.join(" and ")) + ". Read, answer questions and build sentences.</p></a></div>";
  }

  const toggleBtn = (what, on, label, extra) => '<button type="button" class="lx-hear" data-action="x-st-toggle" data-what="' + what + '" aria-pressed="' + on + '"' + (extra || "") + ">" + label + ": " + (on ? "on" : "off") + "</button>";
  const TOGGLE_LABEL = { marks: "Harakat", tr: "Transliteration", en: "English", tap: "Tap a word for its vowels" };
  function lineHtml(ui, story, l) {
    const words = l.tokens.map((t, i) => '<button type="button" class="st-w" data-action="x-tw" data-p="' + ui.esc(t.plain) + '" data-v="' + ui.esc(t.ar) + '" aria-pressed="false" tabindex="' + (i === 0 ? 0 : -1) + '">' + ui.ar(t.plain, "st-w-ar") + "</button>").join(" ");
    return '<li class="lx-rd-l">' + (l.speaker ? '<span class="lx-dl-who">' + ui.esc(l.speaker) + "</span>" : "") +
      '<span class="rd-v">' + ui.ar(l.ar, "lx-rd-ar") + '</span><span class="rd-p">' + ui.ar(l.plain, "lx-rd-ar") + "</span>" +
      '<span class="st-t" role="group" aria-label="Line ' + l.n + ': activate a word to show or hide its vowels">' + words + "</span>" +
      '<div class="rd-tr"><b>' + ui.esc(l.translit) + '</b></div><div class="rd-en">' + ui.esc(l.en) + "</div>" + ui.hear(l.ar, l.audioKey, "Hear line " + l.n) + "</li>";
  }
  // The classes on the list decide which rendering of each line is visible; toggling only changes classes, so focus is never lost.
  const rdClass = (marks, tap) => "lx-rd st-rd" + (marks ? " is-marks" : "") + (tap && !marks ? " is-tap" : "");
  function storyPage(ui, story, prefs, rec, prev, next) {
    const marks = effectiveMarks(story, prefs), band = ST.BANDS[story.band - 1];
    const hasVc = story.questions.some(q => q.type === "vocab-context" && q.reviewItemId);
    const gl = story.glossary.map(g => '<li class="lx-ex">' + ui.ar(g.ar, "lx-ex-ar") + "<div><b>" + ui.esc(g.translit) + "</b> — " + ui.esc(g.en) + (g.isNew ? ' <span class="lx-badge">New word</span>' : "") + "</div></li>").join("");
    return back(ui, "stories", "Stories and sentence building") + '<article><h2 class="lx-h" tabindex="-1" data-focus>' + ui.esc(story.title) + '</h2><p><span class="lx-badge lx-d-' + BADGE[story.band] + '">Band ' + story.band + ": " + ui.esc(band.title) + "</span> " + ui.unitBadge(rec) + "</p>" + draftNote(ui) +
      "<p>" + ui.esc(story.intro) + " All texts are Modern Standard Arabic.</p>" +
      '<div class="lx-toggles st-aids" role="group" aria-label="Reading aids">' + toggleBtn("marks", marks, TOGGLE_LABEL.marks) + toggleBtn("tr", false, TOGGLE_LABEL.tr) + toggleBtn("en", false, TOGGLE_LABEL.en) +
      toggleBtn("tap", prefs.tap && !marks, TOGGLE_LABEL.tap, marks ? " disabled" : "") + '<button type="button" class="lx-hear" data-action="x-st-reset"' + (prefs.marks === null ? " hidden" : "") + ">Use this story’s default harakat</button></div>" +
      '<p class="lx-small" id="lxStHint">' + (marks ? "Switch harakat off to practise reading without them, then use “Tap a word for its vowels” to check a word." : "Harakat are off. Turn on “Tap a word for its vowels” to check one word at a time.") + "</p>" +
      '<div id="lxStLive" class="lx-sr" role="status" aria-live="polite"></div>' +
      '<ol class="' + rdClass(marks, prefs.tap) + '" id="lxRd">' + story.lines.map(l => lineHtml(ui, story, l)).join("") + "</ol>" +
      '<h3 class="lx-h3">Vocabulary explained</h3><ul class="lx-exs">' + gl + "</ul>" +
      '<div class="lx-panel"><h3>Comprehension questions</h3><p>Answer ' + story.questions.length + " questions about the story" + (gradedCount(story.questions) < story.questions.length ? " (some are not scored)" : "") + ". Score at least " + X.PASS_PERCENT + "% to complete it. Try reading first, then answer.</p>" +
      (hasVc ? '<p class="lx-small">' + ui.esc(X.REVIEW_NOTICE.vocabularyInContext) + "</p>" : "") +
      '<button type="button" class="lx-btn" data-action="x-st-start" data-id="' + ui.esc(story.id) + '">Start the questions</button></div>' +
      '<div class="lx-pager">' + (prev ? '<a class="lx-btn lx-btn-alt" href="' + ui.href("story/" + prev.id) + '">← ' + ui.esc(prev.title) + "</a>" : "<span></span>") + (next ? '<a class="lx-btn lx-btn-alt" href="' + ui.href("story/" + next.id) + '">' + ui.esc(next.title) + " →</a>" : "<span></span>") + "</div></article>";
  }
  function setPage(ui, set, items, rec) {
    const hasComplete = items.some(i => i.kind === "complete");
    return back(ui, "stories", "Stories and sentence building") + '<article><h2 class="lx-h" tabindex="-1" data-focus>Sentence workshop · ' + ui.esc(set.title) + '</h2><p><span class="lx-badge lx-d-medium">Set ' + set.n + "</span> " + ui.unitBadge(rec) + "</p>" + draftNote(ui) +
      "<p>" + ui.esc(SET_BLURB[set.n] || "") + " This set has " + items.length + " exercises. Score at least " + X.PASS_PERCENT + "% to complete it. Every exercise can be done with the keyboard or by tapping.</p>" +
      (hasComplete ? '<p class="lx-small">' + ui.esc(X.REVIEW_NOTICE.workshopSentences) + "</p>" : "") +
      '<div class="lx-panel"><button type="button" class="lx-btn" data-action="x-ws-start" data-set="' + set.n + '">Start the set</button></div></article>';
  }

  // ---- question bodies
  function runHeader(ui, run) {
    const n = run.qs.length, i = run.i;
    return '<h2 class="lx-h">' + ui.esc(run.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((i + 1) / n * 100) + '%"></i></div><p class="lx-small" aria-hidden="true">Question ' + (i + 1) + " of " + n + "</p>";
  }
  const promptHtml = (ui, run, q) => '<p class="st-q" tabindex="-1" data-focus><span class="lx-sr">Question ' + (run.i + 1) + " of " + run.qs.length + ". </span>" + ui.esc(q.prompt) + (q.type === "reveal" ? ' <span class="lx-small">(not scored)</span>' : "") + "</p>";
  const FB = '<div id="lxFb" class="lx-fb" role="status" aria-live="polite"></div><div id="lxNext"></div>';
  // The live region sits OUTSIDE the question body (drawn once per question) so screen readers announce changes made while the body is re-rendered.
  const LIVE = '<div id="lxLive" class="lx-sr" role="status" aria-live="polite"></div>';
  const bodyWrap = inner => '<div id="lxQ">' + inner + "</div>";
  function blankSentence(ui, b) {
    const label = "Arabic sentence with one missing word: " + (b.before ? b.before + " " : "") + "(blank) " + (b.after || "");
    return '<span class="lx-ar lx-show-ar" lang="ar" dir="rtl" role="img" aria-label="' + ui.esc(label) + '">' + ui.esc((b.before ? b.before + " " : "") + "＿＿＿" + (b.after ? " " + b.after : "") + (b.punct || "")) + "</span>";
  }
  function choiceBody(ui, run, q) {
    let ctx = "";
    if (q.type === "vocab-context") { const ln = run.lines && run.lines[q.line - 1]; ctx = ln ? '<div class="lx-show">' + ui.ar(ln.ar, "lx-show-ar") + '</div><p class="lx-small">Line ' + q.line + ", the word " + ui.ar(q.word) + "</p>" : ""; }
    if (q.type === "complete") ctx = '<div class="lx-show">' + blankSentence(ui, q.blankWords) + "</div>";
    return ctx + '<div class="lx-opts" role="group" aria-label="Answer choices">' + q.options.map(o => '<button type="button" class="lx-opt" data-action="x-answer" data-v="' + ui.esc(o.value) + '">' + (o.ar ? ui.ar(o.label, "lx-opt-ar") : ui.esc(o.label)) + "</button>").join("") + "</div>" + FB;
  }
  function orderBody(ui, run, q) {
    const st = run.order, placed = st.placed.map(tid => q.tiles.find(t => t.tid === tid)), left = q.tiles.filter(t => st.placed.indexOf(t.tid) < 0), n = q.tiles.length;
    const bank = left.map(t => '<button type="button" class="st-tile" data-action="x-tile" data-tid="' + t.tid + '"><span lang="ar" dir="rtl">' + ui.esc(t.text) + "</span></button>").join("");
    const slots = placed.length ? placed.map((t, k) => '<li><button type="button" class="st-tile is-placed" data-action="x-untile" data-tid="' + t.tid + '"><span lang="ar" dir="rtl">' + ui.esc(t.text) + '</span><span class="lx-sr"> position ' + (k + 1) + " of " + n + ", activate to remove</span></button></li>").join("") : '<li class="st-ph">Your sentence appears here</li>';
    return '<p class="lx-small">Activate the words in order. The first word goes on the right, because Arabic reads right to left.</p>' +
      '<div class="st-bank" dir="rtl" role="group" aria-label="Words to place (' + left.length + " left)" + '">' + bank + "</div>" +
      '<ol class="st-slots" dir="rtl" aria-label="Your sentence, in reading order">' + slots + "</ol>" +
      '<div class="lx-actions"><button type="button" class="lx-btn" data-action="x-check" id="lxCheck"' + (placed.length === n ? "" : " disabled") + '>Check</button><button type="button" class="lx-btn lx-btn-alt" data-action="x-clear"' + (placed.length ? "" : " disabled") + ">Clear</button></div>" + FB;
  }
  function matchBody(ui, run, q) {
    const st = run.match, paired = Object.keys(st.pairs);
    const col = (items, side, isAr, picked) => items.map(it => '<button type="button" class="st-item" data-action="x-pick-' + side + '" data-id="' + it[side === "l" ? "lid" : "rid"] + '" aria-pressed="' + !!(st.sel && st.sel.side === side && st.sel.id === it[side === "l" ? "lid" : "rid"]) + '">' + cell(ui, it.text, isAr) + "</button>").join("");
    const left = q.left.filter(l => !hasOwn(st.pairs, l.lid)), usedR = paired.map(k => st.pairs[k]), right = q.right.filter(r => usedR.indexOf(r.rid) < 0);
    const textOf = (arr, id, k) => arr.find(x => x[k] === id).text;
    const pairs = paired.length ? paired.map(lid => '<li>' + cell(ui, textOf(q.left, lid, "lid"), q.arLeft) + " + " + cell(ui, textOf(q.right, st.pairs[lid], "rid"), q.arRight) + ' <button type="button" class="lx-hear" data-action="x-unpair" data-id="' + lid + '">Undo</button></li>').join("") : '<li class="st-ph">No pairs yet</li>';
    return '<p class="lx-small">Pick one item from each list to pair them. You can undo a pair.</p><div class="st-match">' +
      '<div class="st-col" role="group" aria-label="First halves (' + left.length + ' left)">' + col(left, "l", q.arLeft) + "</div>" +
      '<div class="st-col" role="group" aria-label="Second halves (' + right.length + ' left)">' + col(right, "r", q.arRight) + "</div></div>" +
      '<h3 class="lx-h3">Your pairs</h3><ul class="st-pairs">' + pairs + '</ul><div class="lx-actions"><button type="button" class="lx-btn" data-action="x-check" id="lxCheck"' + (paired.length === q.left.length ? "" : " disabled") + ">Check</button></div>" + FB;
  }
  function shortPrompt(ui, run, q) {
    return '<p class="lx-sr">Question ' + (run.i + 1) + " of " + run.qs.length + ".</p>" + "<p>" + ui.esc(q.prompt) + "</p><p>Type your answer in Arabic. The check compares letters only, so harakat are optional.</p>" + (q.hint ? '<p class="lx-small">Hint: ' + ui.esc(q.hint) + "</p>" : "");
  }
  function questionHtml(ui, run, q) {
    if (q.type === "mcq" || q.type === "vocab-context" || q.type === "tf" || q.type === "complete") return promptHtml(ui, run, q) + choiceBody(ui, run, q);
    if (q.type === "order") return promptHtml(ui, run, q) + orderBody(ui, run, q);
    if (q.type === "match") return promptHtml(ui, run, q) + matchBody(ui, run, q);
    if (q.type === "reveal") return promptHtml(ui, run, q) + '<div class="lx-actions"><button type="button" class="lx-btn" data-action="x-reveal" id="lxReveal">Show a model answer</button></div>' + FB;
    throw new Error("Unknown question type " + q.type);
  }

  // ---------------------------------------------------------------- the runner (state lives here; progress is recorded only by the shared finish())
  let run = null;
  const isKnownId = id => !!R.kindOf(id);
  const nextBtnHtml = last => '<button type="button" class="lx-btn" data-action="x-next" id="lxNextBtn">' + (last ? "See results" : "Next →") + "</button>";
  const live = (text) => { const el = win && win.document && win.document.getElementById("lxLive"); if (el) el.textContent = text; };

  function startRun(ui, spec) {
    run = Object.assign({ i: 0, results: [], answered: false, order: { placed: [] }, match: { sel: null, pairs: {} } }, spec);
    draw(ui);
  }
  function draw(ui) {
    const q = run.qs[run.i];
    run.answered = false; run.order = { placed: [] }; run.match = { sel: null, pairs: {} };
    if (q.type === "short") { drawShort(ui, q); return; }
    ui.set(runHeader(ui, run) + LIVE + bodyWrap(questionHtml(ui, run, q)));
  }
  function drawShort(ui, q) {
    const head = runHeader(ui, run) + LIVE + '<p class="st-q" tabindex="-1" data-focus><span class="lx-sr">Question ' + (run.i + 1) + " of " + run.qs.length + "</span></p>";
    if (ui.typing.available()) { ui.set(head); ui.typing.open(shortPrompt(ui, run, q)); }
    else ui.set(head + shortPrompt(ui, run, q) + '<label class="lx-label" for="lxType">Your answer in Arabic</label><input id="lxType" class="lx-input" type="text" lang="ar" dir="rtl" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200"> <button type="button" class="lx-btn" data-action="x-shortcheck">Check</button>' + FB);
  }
  function redrawBody(ui, focusSel) {   // re-render the current question after an ordering/matching change, then put focus back somewhere sensible
    const q = run.qs[run.i], doc = win.document;
    doc.getElementById("lxQ").innerHTML = questionHtml(ui, run, q);   // only the body changes; the progress bar and the live region stay in place
    const el = (focusSel && doc.querySelector(focusSel)) || doc.getElementById("lxCheck") || doc.querySelector(".st-tile, .st-item");
    if (el) el.focus();
  }
  function record(ui, q, grade) { run.results.push(X.makeResult(q, grade)); run.answered = true; }
  function showFeedback(ui, ok, html, last) {
    const fb = win.document.getElementById("lxFb");
    fb.innerHTML = '<p class="' + (ok === null ? "" : ok ? "lx-ok" : "lx-bad") + '"><b>' + (ok === null ? "Model answer." : ok ? "Correct!" : "Not quite.") + "</b> " + html + "</p>";
    const slot = win.document.getElementById("lxNext"); slot.innerHTML = nextBtnHtml(last); win.document.getElementById("lxNextBtn").focus();
  }
  const isLast = () => run.i === run.qs.length - 1;

  function answerChoice(ui, v) {
    const q = run.qs[run.i], g = X.gradeAnswer(q, v); record(ui, q, g);
    win.document.querySelectorAll(".lx-opt").forEach(b => {
      b.disabled = true;
      if (b.dataset.v === String(q.answer)) { b.classList.add("is-right"); b.insertAdjacentHTML("afterbegin", '<span class="lx-mk" aria-hidden="true">✓ </span>'); }
      else if (b.dataset.v === String(v)) { b.classList.add("is-wrong"); b.insertAdjacentHTML("afterbegin", '<span class="lx-mk" aria-hidden="true">✗ </span>'); }
    });
    showFeedback(ui, g.correct, ui.esc(g.explanation || ""), isLast());
  }
  function checkOrder(ui) {
    const q = run.qs[run.i], g = X.gradeOrder(q, run.order.placed); if (!g.complete) return;
    record(ui, q, g);
    win.document.querySelectorAll(".st-tile, .lx-actions .lx-btn").forEach(b => { b.disabled = true; });
    showFeedback(ui, g.correct, (g.correct ? "" : "Expected: ") + ui.ar(g.expected, "lx-ex-ar") + (q.translit ? " <span>" + ui.esc(q.translit) + (q.en ? " — " + ui.esc(q.en) : "") + "</span>" : "") + (q.explanation ? " " + ui.esc(q.explanation) : ""), isLast());
  }
  function checkMatch(ui) {
    const q = run.qs[run.i], g = X.gradeMatch(q, run.match.pairs); if (!g.complete) return;
    record(ui, q, g);
    const textOf = (arr, id, k) => arr.find(x => x[k] === id).text;
    const rows = g.pairResults.map(p => "<li>" + (p.correct ? "✓ " : "✗ ") + cell(ui, textOf(q.left, p.lid, "lid"), q.arLeft) + " + " + cell(ui, textOf(q.right, p.rid, "rid"), q.arRight) + (p.correct ? "" : " (should be " + cell(ui, textOf(q.right, p.expected, "rid"), q.arRight) + ")") + "</li>").join("");
    win.document.querySelectorAll(".st-item, .lx-actions .lx-btn, .st-pairs .lx-hear").forEach(b => { b.disabled = true; });
    showFeedback(ui, g.correct, (q.explanation ? ui.esc(q.explanation) : "") + '<ul class="st-pairs">' + rows + "</ul>", isLast());
  }
  function checkShort(ui) {
    const q = run.qs[run.i]; if (run.answered) return;
    const dock = ui.typing.available(), val = dock ? ui.typing.value() : (win.document.getElementById("lxType") || {}).value, g = X.gradeAnswer(q, val);
    if (g.reason === "empty") { const msg = '<p class="lx-bad">Type your answer first.</p>'; if (dock) ui.typing.feedback(msg); else win.document.getElementById("lxFb").innerHTML = msg; return; }
    record(ui, q, g);
    const html = '<p class="' + (g.correct ? "lx-ok" : "lx-bad") + '"><b>' + (g.correct ? "Correct!" : "Not quite.") + "</b> " + (g.correct ? "" : "Expected: " + ui.ar(g.expected) + ". ") + ui.esc(g.explanation || "") + "</p>";
    if (dock) { ui.typing.lock(); ui.typing.feedback(html); ui.typing.next(nextBtnHtml(isLast()), "lxNextBtn"); }
    else { const inp = win.document.getElementById("lxType"); inp.disabled = true; win.document.getElementById("lxFb").innerHTML = html; win.document.getElementById("lxNext").innerHTML = nextBtnHtml(isLast()); win.document.getElementById("lxNextBtn").focus(); }
  }
  function revealModel(ui) {
    const q = run.qs[run.i]; if (run.answered) return;
    record(ui, q, X.gradeAnswer(q, null));   // ungraded: marked graded:false, so it is never scored, recorded or reviewed
    win.document.getElementById("lxReveal").disabled = true;
    showFeedback(ui, null, ui.esc(q.model) + (q.explanation ? " " + ui.esc(q.explanation) : ""), isLast());
  }
  function advance(ui) {
    if (!run || !run.answered) return;
    if (run.i < run.qs.length - 1) { run.i++; draw(ui); } else completeRun(ui);
  }
  function completeRun(ui) {
    const r = run, pkg = X.finishPackage(r.results, { isKnownId });
    run = null;
    ui.finish({ kind: r.kind, title: "Check: " + r.title, unitId: r.unit.id, ret: r.ret, again: r.again, nextHref: r.nextHref, nextLabel: r.nextLabel, backLabel: r.backLabel, doneLabel: r.doneLabel, showSchedule: r.kind === "workshop" || pkg.reviewRows.length > 0, ext: pkg });
  }

  // ---------------------------------------------------------------- starting a story or a set
  const storyList = () => ST.STORIES;
  const setsWithItems = () => SW.SETS.filter(s => SW.itemsOf(SW.ITEMS, s.n).length > 0);
  function startStory(ui, story) {
    const list = storyList(), nx = list[list.indexOf(story) + 1], go = () => startStory(ui, story);
    startRun(ui, { kind: "story", unit: story, title: story.title, lines: story.lines, qs: story.questions.map(q => X.buildQuestion(q)), ret: ui.href("story/" + story.id), again: go,
      nextHref: nx ? ui.href("story/" + nx.id) : ui.href("stories"), nextLabel: nx ? "Next: " + nx.title : "All stories", backLabel: "Back to the story", doneLabel: "Story complete!" });
  }
  function startSet(ui, set) {
    const sets = setsWithItems(), nx = sets[sets.indexOf(set) + 1], go = () => startSet(ui, set);
    startRun(ui, { kind: "workshop", unit: set, title: "Sentence workshop · " + set.title, qs: SW.itemsOf(SW.ITEMS, set.n).map(it => SW.buildExercise(it)), ret: ui.href("workshop/" + set.n), again: go,
      nextHref: nx ? ui.href("workshop/" + nx.n) : ui.href("stories"), nextLabel: nx ? "Next: " + nx.title : "All stories and sets", backLabel: "Back to the set", doneLabel: "Set complete!" });
  }

  // ---------------------------------------------------------------- routes
  function pageData(ui) { return { stories: storyList(), sets: setsWithItems().map(s => ({ set: s, count: SW.itemsOf(SW.ITEMS, s.n).length })), rec: id => ui.unit(id) }; }
  function prefsFor() { let ls = null; try { ls = win && win.localStorage; } catch (e) { ls = null; } return createPrefs(ls || { getItem() { return null; }, setItem() {} }); }
  const sharedPrefs = prefsFor;   // one reader per call, so the latest stored value always wins
  const routes = {
    stories(ui) { run = null; const d = pageData(ui); ui.set(!d.stories.length && !d.sets.length ? emptyPage(ui) : indexPage(ui, d)); },
    story(ui, p) {
      run = null; const list = storyList(), s = list.find(x => x.id === p[1]);
      if (!s) { if (!list.length && !setsWithItems().length) ui.set(emptyPage(ui)); else ui.notFound(); return; }
      const i = list.indexOf(s); ui.set(storyPage(ui, s, sharedPrefs().get(), ui.unit(s.id), list[i - 1], list[i + 1]));
    },
    workshop(ui, p) {
      run = null; const sets = setsWithItems();
      if (!sets.length) { ui.set(emptyPage(ui)); return; }
      if (!p[1]) { const d = pageData(ui); ui.set(indexPage(ui, { stories: [], sets: d.sets, rec: d.rec })); return; }
      const set = sets.find(s => String(s.n) === p[1]); if (!set) { ui.notFound(); return; }
      ui.set(setPage(ui, set, SW.itemsOf(SW.ITEMS, set.n), ui.unit(set.id)));
    }
  };

  // ---------------------------------------------------------------- reading aids (classes only, so focus is never lost)
  function toggleAid(ui, btn) {
    const what = btn.dataset.what, ol = win.document.getElementById("lxRd"); if (!ol || !hasOwn(TOGGLE_LABEL, what)) return;
    const prefs = sharedPrefs(), id = (win.location.hash || "").replace(/^#\/?story\//, ""), story = storyList().find(s => s.id === id); if (!story) return;
    const on = btn.getAttribute("aria-pressed") !== "true";
    if (what === "marks") prefs.setMarks(on); else if (what === "tap") prefs.setTap(on);
    else ol.classList.toggle(what === "tr" ? "show-tr" : "show-en", on);
    btn.setAttribute("aria-pressed", String(on)); btn.textContent = TOGGLE_LABEL[what] + ": " + (on ? "on" : "off");
    syncAids(ui, story);
    const L = win.document.getElementById("lxStLive"); if (L) L.textContent = TOGGLE_LABEL[what] + (on ? " is on." : " is off.");
  }
  function syncAids(ui, story) {
    const d = win.document, prefs = sharedPrefs().get(), marks = effectiveMarks(story, prefs), ol = d.getElementById("lxRd");
    ol.classList.toggle("is-marks", marks); ol.classList.toggle("is-tap", prefs.tap && !marks);
    const m = d.querySelector('[data-what="marks"]'), t = d.querySelector('[data-what="tap"]'), r = d.querySelector('[data-action="x-st-reset"]'), h = d.getElementById("lxStHint");
    m.setAttribute("aria-pressed", String(marks)); m.textContent = TOGGLE_LABEL.marks + ": " + (marks ? "on" : "off");
    t.disabled = marks; t.setAttribute("aria-pressed", String(prefs.tap && !marks)); t.textContent = TOGGLE_LABEL.tap + ": " + (prefs.tap && !marks ? "on" : "off");
    r.hidden = prefs.marks === null;
    h.textContent = marks ? "Switch harakat off to practise reading without them, then use “Tap a word for its vowels” to check a word." : "Harakat are off. Turn on “Tap a word for its vowels” to check one word at a time.";
  }
  function resetMarks(ui) {
    const id = (win.location.hash || "").replace(/^#\/?story\//, ""), story = storyList().find(s => s.id === id); if (!story) return;
    sharedPrefs().setMarks(null); syncAids(ui, story);
    const L = win.document.getElementById("lxStLive"); if (L) L.textContent = "Harakat now follow this story’s default.";
    const m = win.document.querySelector('[data-what="marks"]'); if (m) m.focus();
  }
  function toggleWord(btn) {
    const on = btn.getAttribute("aria-pressed") !== "true", span = btn.querySelector("[lang]");
    btn.setAttribute("aria-pressed", String(on)); span.textContent = on ? btn.dataset.v : btn.dataset.p;
    const L = win.document.getElementById("lxStLive"); if (L) L.textContent = on ? "Vowels shown: " + btn.dataset.v : "Vowels hidden.";
  }
  function moveWord(e) {   // one tab stop per line; arrows move inside the line in visual RTL order (Left = next word, Right = previous)
    const w = e.target && e.target.closest ? e.target.closest(".st-w") : null; if (!w) return;
    const ws = Array.prototype.slice.call(w.parentNode.querySelectorAll(".st-w")), i = ws.indexOf(w); let n = i;
    if (e.key === "ArrowLeft") n = Math.min(ws.length - 1, i + 1); else if (e.key === "ArrowRight") n = Math.max(0, i - 1); else if (e.key === "Home") n = 0; else if (e.key === "End") n = ws.length - 1; else return;
    e.preventDefault(); ws.forEach((x, k) => x.setAttribute("tabindex", k === n ? "0" : "-1")); ws[n].focus();
  }

  // ---------------------------------------------------------------- actions ("x-…" actions are forwarded here by app.js)
  function action(ui, a, b) {
    if (a === "x-st-toggle") toggleAid(ui, b);
    else if (a === "x-st-reset") resetMarks(ui);
    else if (a === "x-tw") toggleWord(b);
    else if (a === "x-st-start") { const s = storyList().find(x => x.id === b.dataset.id); if (s) startStory(ui, s); }
    else if (a === "x-ws-start") { const s = setsWithItems().find(x => String(x.n) === b.dataset.set); if (s) startSet(ui, s); }
    else if (!run) return;
    else if (a === "x-answer") { if (!run.answered) answerChoice(ui, b.dataset.v); }
    else if (a === "x-next") advance(ui);
    else if (a === "x-reveal") revealModel(ui);
    else if (a === "x-shortcheck") checkShort(ui);
    else if (run.answered) return;
    else if (a === "x-tile") { const q = run.qs[run.i], t = q.tiles.find(x => x.tid === b.dataset.tid); if (!t || run.order.placed.indexOf(t.tid) >= 0) return; run.order.placed.push(t.tid); const n = run.order.placed.length;
      redrawBody(ui, n === q.tiles.length ? "#lxCheck" : ".st-bank .st-tile"); live("Placed " + t.text + ", position " + n + " of " + q.tiles.length + "."); }
    else if (a === "x-untile") { const q = run.qs[run.i], t = q.tiles.find(x => x.tid === b.dataset.tid), at = run.order.placed.indexOf(b.dataset.tid); if (at < 0) return; run.order.placed.splice(at, 1);
      redrawBody(ui, '.st-bank .st-tile[data-tid="' + b.dataset.tid + '"]'); live("Removed " + (t ? t.text : "word") + "."); }
    else if (a === "x-clear") { const q = run.qs[run.i]; if (!run.order.placed.length) return; run.order.placed = []; redrawBody(ui, ".st-bank .st-tile"); live("Cleared. " + q.tiles.length + " words to place."); }
    else if (a === "x-check") { const q = run.qs[run.i]; if (q.type === "order") checkOrder(ui); else if (q.type === "match") checkMatch(ui); }
    else if (a === "x-pick-l" || a === "x-pick-r") {
      const q = run.qs[run.i], side = a === "x-pick-l" ? "l" : "r", id = b.dataset.id, sel = run.match.sel;
      if (!sel || sel.side === side) { run.match.sel = (sel && sel.side === side && sel.id === id) ? null : { side, id }; redrawBody(ui, '[data-action="' + a + '"][data-id="' + id + '"]'); return; }
      const lid = side === "l" ? id : sel.id, rid = side === "r" ? id : sel.id; run.match.pairs[lid] = rid; run.match.sel = null;
      const tx = (arr, i, k) => arr.find(x => x[k] === i).text; redrawBody(ui, ".st-item"); live("Paired " + tx(q.left, lid, "lid") + " with " + tx(q.right, rid, "rid") + ".");
    }
    else if (a === "x-unpair") { const q = run.qs[run.i], lid = b.dataset.id; if (!hasOwn(run.match.pairs, lid)) return; delete run.match.pairs[lid]; redrawBody(ui, '[data-action="x-pick-l"][data-id="' + lid + '"]'); live("Pair removed."); }
  }
  // Called by app.js for the typing dock's Enter / Check. Returns true when a Phase 4 short answer handled it, so the app's own typing code is skipped.
  function typingSubmit() {
    if (!run || run.qs[run.i].type !== "short") return false;
    if (!run.answered) checkShort(lastUI); else advance(lastUI);
    return true;
  }
  let lastUI = null;
  const wrap = fn => function (ui) { lastUI = ui; return fn.apply(null, arguments); };
  const ext = {
    routes: { stories: wrap(routes.stories), story: wrap(routes.story), workshop: wrap(routes.workshop) },
    action: function (ui, a, b, e) { lastUI = ui; return action(ui, a, b, e); },
    typingSubmit: typingSubmit,
    dashboard: function (ui) { return dashboardHtml(ui, pageData(ui)); },
    hasContent: function () { return storyList().length > 0 || setsWithItems().length > 0; }
  };
  if (win && win.document) {
    win.addEventListener("hashchange", function () { run = null; });
    const rootEl = win.document.getElementById("learnApp");
    if (rootEl) rootEl.addEventListener("keydown", moveWord);
  }
  return { ext, PREF_KEY, createPrefs, effectiveMarks, html: { emptyPage, indexPage, dashboardHtml, storyPage, setPage, questionHtml, runHeader, lineHtml, shortPrompt } };
});
