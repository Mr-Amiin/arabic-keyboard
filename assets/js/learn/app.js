/* Learn Arabic — UI. Hash-routed single page: #/ (dashboard), #/letter/<id>, #/harakat/<id>, #/practice, #/read */
(function () {
  "use strict";
  const D = window.LearnData, E = window.LearnEngine, A = window.LearnAudio;
  const root = document.getElementById("learnApp");
  if (!root || !D || !E) return;
  const dock = window.LearnTypingDock || null;
  let ls = null; try { ls = window.localStorage; } catch (e) { ls = null; }
  const store = window.LearnProgress.createStore(ls); store.load();
  let session = null, first = true;
  const L = D.LETTERS, byId = {}; L.forEach(function (l) { byId[l.id] = l; });
  const ORDER = L.map(function (l) { return "letter-" + l.id; }).concat(D.HARAKAT_LESSONS.map(function (h) { return h.id; }));
  const TYPE_LABELS = { name: "Name the letter", letter: "Find the letter by name", sound: "Match the sound", form: "Letter forms in words", missing: "Missing letter", similar: "Look-alike letters" };

  const esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  const ar = function (t, cls) { return '<span class="lx-ar ' + (cls || "") + '" lang="ar" dir="rtl">' + esc(t) + "</span>"; };
  const ZWJ = "\u200D";
  // Draws a word with one missing letter as: text run + real blank element + text run (no placeholder glyph inside the text).
  // ZWJ keeps the join on each side where the real letter would join; the next letter joins the blank only if the missing letter joins forward.
  const blankWord = function (b) { return '<span class="lx-ar lx-show-ar" lang="ar" dir="rtl" role="img" aria-label="Arabic word with one missing letter">' + esc(b.before + (b.before ? ZWJ : "")) + '<span class="lx-blank" aria-hidden="true"></span>' + esc((b.joinAfter && b.after ? ZWJ : "") + b.after) + "</span>"; };
  const hear = function (text, key, label) { return '<button type="button" class="lx-hear" data-action="speak" data-text="' + esc(text) + '" data-key="' + esc(key || "") + '" aria-label="' + esc(label || "Hear pronunciation") + '">🔊 Hear</button>'; };
  const href = function (h) { return "#/" + h; };
  const nextLesson = function () { return ORDER.find(function (id) { return !store.isDone(id); }) || null; };
  const lessonHref = function (id) { return id.indexOf("letter-") === 0 ? href("letter/" + id.slice(7)) : href("harakat/" + id); };
  const lessonTitle = function (id) { if (id.indexOf("letter-") === 0) { const l = byId[id.slice(7)]; return "Letter " + l.nameEn + " " + l.letter; } return D.HARAKAT_LESSONS.find(function (h) { return h.id === id; }).title; };

  function set(html) { if (dock) dock.close(); root.innerHTML = html; if (!first) { const h = root.querySelector("[data-focus]"); if (h) { h.focus({ preventScroll: false }); } } first = false; }

  /* ---------- dashboard ---------- */
  function home() {
    const s = store.summary(), nxt = nextLesson(), pct = Math.round(s.completed / s.total * 100);
    const weak = s.review.map(function (id) { return byId[id]; });
    const grid = L.map(function (l) {
      const done = store.isDone("letter-" + l.id);
      return '<a class="lx-tile' + (done ? " is-done" : "") + '" href="' + href("letter/" + l.id) + '">' + ar(l.letter, "lx-tile-ar") + '<span class="lx-tile-n">' + esc(l.nameEn) + '</span><span class="lx-badge lx-d-' + l.difficulty.toLowerCase() + '">' + l.difficulty + "</span>" + (done ? '<span class="lx-tick" aria-label="Completed">✓</span>' : "") + "</a>";
    }).join("");
    const hk = D.HARAKAT_LESSONS.map(function (h) { return '<a class="lx-card" href="' + href("harakat/" + h.id) + '"><span class="lx-badge lx-d-medium">Beginner</span>' + (store.isDone(h.id) ? ' <span class="lx-tick-i" aria-label="Completed">✓ Done</span>' : "") + "<h3>" + esc(h.title) + "</h3><p>" + h.marks.map(function (m) { return esc(D.HARAKAT.find(function (x) { return x.id === m; }).nameEn); }).join(", ") + "</p></a>"; }).join("");
    set('<h2 class="lx-h" tabindex="-1" data-focus>Your learning dashboard</h2>' +
      (s.persistent ? "" : '<p class="lx-note" role="note">Progress cannot be saved in this browser (storage is blocked or unavailable). You can still learn, but it will be lost when you leave.</p>') +
      '<div class="lx-stats"><div class="lx-stat"><b>' + s.completed + " / " + s.total + '</b><span>lessons completed</span></div><div class="lx-stat"><b>' + s.level.n + ". " + esc(s.level.name) + '</b><span>current level</span></div><div class="lx-stat"><b>' + s.streak + (s.streak === 1 ? " day" : " days") + '</b><span>practice streak</span></div><div class="lx-stat"><b>' + (s.accuracy === null ? "—" : s.accuracy + "%") + '</b><span>' + (s.accuracy === null ? "no answers yet" : s.correct + " correct, " + s.wrong + " incorrect") + "</span></div></div>" +
      '<div class="lx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.completed + '" aria-label="Lessons completed"><i style="width:' + pct + '%"></i></div>' +
      '<div class="lx-row"><div class="lx-panel"><h3>' + (nxt ? "Continue learning" : "Course complete") + "</h3><p>" + (nxt ? "Next up: " + esc(lessonTitle(nxt)) + "." : "You have completed every lesson. Keep your skills sharp with practice.") + '</p>' + (nxt ? '<a class="lx-btn" href="' + lessonHref(nxt) + '">' + (s.completed ? "Continue" : "Start the alphabet") + " →</a>" : '<a class="lx-btn" href="' + href("practice") + '">Practice →</a>') + "</div>" +
      '<div class="lx-panel"><h3>Daily practice</h3><p>' + (s.practicedToday ? "✓ You practiced today. Another round keeps letters fresh." : "You have not practiced today yet. One 10-question round counts.") + '</p><a class="lx-btn lx-btn-alt" href="' + href("practice") + '">Start practice →</a></div>' +
      '<div class="lx-panel"><h3>Needs review</h3>' + (weak.length ? "<p>Letters you often miss:</p><p>" + weak.map(function (l) { return '<a class="lx-chip" href="' + href("letter/" + l.id) + '">' + ar(l.letter) + " " + esc(l.nameEn) + "</a>"; }).join(" ") + '</p><button type="button" class="lx-btn lx-btn-alt" data-action="practice-weak">Practice these →</button>' : "<p>Nothing to review yet. Letters you miss repeatedly will appear here after a few answers.</p>") + "</div></div>" +
      '<h3 class="lx-h3">Alphabet course · 28 lessons</h3><div class="lx-grid">' + grid + "</div>" +
      '<h3 class="lx-h3">Harakat and pronunciation</h3><div class="lx-cards">' + hk + "</div>" +
      '<h3 class="lx-h3">Practice and reading</h3><div class="lx-cards"><a class="lx-card" href="' + href("practice") + '"><span class="lx-badge lx-d-easy">All levels</span><h3>Letter practice</h3><p>Six exercise types with instant feedback and explanations.</p></a><a class="lx-card" href="' + href("read") + '"><span class="lx-badge lx-d-medium">Beginner</span><h3>Reading and typing</h3><p>Six stages from single letters to short sentences, answered by typing.</p></a></div>' +
      '<h3 class="lx-h3">Related tools</h3><div class="lx-tools"><a href="../arabic-keyboard/">Arabic keyboard</a><a href="../tashkeel/">Tashkeel (add harakat)</a><a href="../arabic-typing-test/">Typing test</a><a href="../transliteration/">Transliteration</a><a href="../arabic-alphabet/">Alphabet reference</a></div>' +
      '<p class="lx-reset"><button type="button" class="lx-link" data-action="reset">Reset all progress…</button></p>');
  }

  /* ---------- letter lesson ---------- */
  function letter(id) {
    const l = byId[id]; if (!l) return notFound();
    const i = l.order - 1, prev = L[i - 1], next = L[i + 1], done = store.isDone("letter-" + id);
    const f = l.forms, cell = function (k, cap) { const alt = k === "initial" ? f.isolated : f.final, same = k === "initial" ? "same as Alone" : "same as End"; return '<div class="lx-form' + (f[k] ? "" : " is-na") + '">' + ar(f[k] || alt) + "<small>" + cap + (f[k] ? "" : " · " + same) + "</small></div>"; };
    const conn = l.connects ? esc(l.letter) + " joins to the letter after it, so it has four shapes depending on where it sits in a word." : esc(l.letter) + " never joins to the letter after it. It has only two shapes: the isolated form (also used at the start of a word) and the final form (used after a letter that joins). The next letter always starts fresh.";
    const exs = l.examples.map(function (e) { return '<li class="lx-ex">' + ar(e.vowelled, "lx-ex-ar") + '<div><b>' + esc(e.translit) + "</b> — " + esc(e.meaning) + '<br><small>' + esc(e.position) + " position · written " + ar(e.plain) + "</small></div>" + hear(e.vowelled, "word-" + e.plain, "Hear " + e.translit) + "</li>"; }).join("");
    const syl = l.syllables.map(function (s) { return '<div class="lx-syl">' + ar(s[0], "lx-syl-ar") + "<small>" + esc(s[1]) + "</small></div>"; }).join("");
    const a = A.status();
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><article><h2 class="lx-h" tabindex="-1" data-focus>Letter ' + l.order + " of 28: " + esc(l.nameEn) + "</h2>" +
      '<div class="lx-hero">' + ar(l.letter, "lx-hero-ar") + '<div><p class="lx-name">' + ar(l.nameAr) + " · " + esc(l.nameEn) + '</p><p><span class="lx-badge lx-d-' + l.difficulty.toLowerCase() + '">' + l.difficulty + "</span> " + (done ? '<span class="lx-tick-i">✓ Lesson complete</span>' : "") + "</p><p>Sound: <b>" + esc(l.sound) + "</b></p>" + hear(l.letter + " " + l.nameAr, "letter-" + l.id, "Hear the letter " + l.nameEn) + "</div></div>" +
      '<h3 class="lx-h3">How to say it</h3><p>' + esc(l.say) + '</p><p class="lx-note" role="note">Transliteration is only a rough guide. ' + esc(a.msg) + "</p>" +
      '<h3 class="lx-h3">Letter shapes</h3><div class="lx-forms">' + cell("isolated", "Alone") + cell("initial", "Beginning") + cell("medial", "Middle") + cell("final", "End") + "</div><p>" + conn + "</p><p>How to tell it apart: <b>" + esc(l.dots) + "</b>.</p>" +
      '<h3 class="lx-h3">Example words</h3><ul class="lx-exs">' + exs + '</ul><h3 class="lx-h3">With harakat</h3><p>Short vowel marks change how the letter is read. Marks are shown on ' + esc(l.letter) + ":</p><div class=\"lx-syls\">" + syl + "</div>" +
      '<div class="lx-panel"><h3>Quick check</h3><p>Answer 3 questions about ' + esc(l.nameEn) + '. Get at least 2 right to complete this lesson.</p><button type="button" class="lx-btn" data-action="check" data-id="letter-' + l.id + '">' + (done ? "Retake the check" : "Start the check") + '</button></div>' +
      '<div class="lx-pager">' + (prev ? '<a class="lx-btn lx-btn-alt" href="' + href("letter/" + prev.id) + '">← ' + esc(prev.nameEn) + " " + prev.letter + "</a>" : "<span></span>") + (next ? '<a class="lx-btn lx-btn-alt" href="' + href("letter/" + next.id) + '">' + esc(next.nameEn) + " " + next.letter + " →</a>" : '<a class="lx-btn lx-btn-alt" href="' + href("harakat/harakat-1") + '">Harakat →</a>') + "</div></article>");
  }

  /* ---------- harakat lesson ---------- */
  function harakat(id) {
    const h = D.HARAKAT_LESSONS.find(function (x) { return x.id === id; }); if (!h) return notFound();
    const idx = D.HARAKAT_LESSONS.indexOf(h), done = store.isDone(id);
    const marks = h.marks.map(function (m) { const x = D.HARAKAT.find(function (k) { return k.id === m; }); return '<li class="lx-mark"><div class="lx-mark-h">' + ar(x.example[0], "lx-syl-ar") + "<div><b>" + esc(x.nameEn) + "</b> · " + ar(x.nameAr) + "<br>Sound: <b>" + esc(x.sound) + "</b></div></div><p>" + esc(x.note) + '</p><p class="lx-ex">' + ar(x.word[0], "lx-ex-ar") + "<span><b>" + esc(x.word[1]) + "</b> — " + esc(x.word[2]) + "</span>" + hear(x.word[0], "", "Hear " + x.word[1]) + "</p></li>"; }).join("");
    const nxt = idx === 0 ? '<a class="lx-btn lx-btn-alt" href="' + href("harakat/harakat-2") + '">Sukun, shadda, tanween →</a>' : '<a class="lx-btn lx-btn-alt" href="' + href("read") + '">Reading practice →</a>';
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><article><h2 class="lx-h" tabindex="-1" data-focus>' + esc(h.title) + "</h2>" + (done ? '<p><span class="lx-tick-i">✓ Lesson complete</span></p>' : "") + "<p>" + esc(h.intro) + '</p><ul class="lx-marks">' + marks + '</ul><p class="lx-note" role="note">' + esc(A.status().msg) + '</p><div class="lx-panel"><h3>Quick check</h3><p>Answer 3 questions. Get at least 2 right to complete this lesson.</p><button type="button" class="lx-btn" data-action="check" data-id="' + id + '">' + (done ? "Retake the check" : "Start the check") + '</button></div><div class="lx-pager">' + (idx === 0 ? '<a class="lx-btn lx-btn-alt" href="' + href("letter/ya") + '">← Letter Ya</a>' : '<a class="lx-btn lx-btn-alt" href="' + href("harakat/harakat-1") + '">← Short vowels</a>') + nxt + "</div></article>");
  }

  /* ---------- practice menu ---------- */
  function practice() {
    const weak = store.summary().review;
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Letter practice</h2><p>Each round has 10 questions with instant feedback. Start as many rounds as you like; every answer updates your progress.</p><div class="lx-cards"><button type="button" class="lx-card lx-cardbtn" data-action="practice" data-type="mixed"><h3>Mixed round</h3><p>All six exercise types across the whole alphabet.</p></button>' +
      '<button type="button" class="lx-card lx-cardbtn" data-action="practice-weak"' + (weak.length ? "" : " disabled") + "><h3>Weak letters</h3><p>" + (weak.length ? "Focus on " + weak.length + " letter(s) you miss often." : "Available once you have missed a letter at least twice.") + "</p></button>" +
      E.TYPES.map(function (t) { return '<button type="button" class="lx-card lx-cardbtn" data-action="practice" data-type="' + t + '"><h3>' + TYPE_LABELS[t] + "</h3><p>10 questions of this type.</p></button>"; }).join("") + "</div>");
  }

  /* ---------- questions ---------- */
  function startSession(s) { session = Object.assign({ i: 0, results: [], answered: false }, s); drawQ(); }
  function drawQ() {
    const q = session.qs[session.i], n = session.qs.length;
    if (q.typing) { drawTyping(q, n); return; }
    set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small" aria-hidden="true">Question ' + (session.i + 1) + " of " + n + '</p><p class="lx-q" tabindex="-1" data-focus><span class="lx-sr">Question ' + (session.i + 1) + " of " + n + ". </span>" + esc(q.prompt) + "</p>" + (q.blank ? '<div class="lx-show">' + blankWord(q.blank) + "</div>" : q.show ? '<div class="lx-show">' + ar(q.show, "lx-show-ar") + "</div>" : "") +
      '<div class="lx-opts" role="group" aria-label="Answer choices">' + q.options.map(function (o) { return '<button type="button" class="lx-opt" data-action="answer" data-v="' + esc(o.value) + '">' + (o.ar ? ar(o.label, "lx-opt-ar") : esc(o.label)) + "</button>"; }).join("") + '</div><div id="lxFb" class="lx-fb" role="status" aria-live="polite"></div><div id="lxNext"></div>');
  }
  // Legacy native <input> renderer: used only if the typing dock is missing from the page.
  function drawTypingLegacy(q, n) {
      set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small">Item ' + (session.i + 1) + " of " + n + '</p><p>Type what you see in Arabic. The check compares letters only, so harakat are optional.</p><div class="lx-show">' + ar(q.ar, "lx-show-ar") + '</div><p>' + hear(q.ar, "", "Hear this text") + ' <a href="../arabic-keyboard/" target="_blank" rel="noopener">Need the Arabic keyboard?</a></p><label class="lx-label" for="lxType">Your answer</label><input id="lxType" data-focus class="lx-input" lang="ar" dir="rtl" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="lx-actions"><button type="button" class="lx-btn" data-action="typecheck">Check</button></div><div id="lxFb" class="lx-fb" role="status" aria-live="polite"></div><div id="lxNext"></div>');
  }
  const usingDock = function () { return !!(dock && document.getElementById("lxTypePanel") && document.getElementById("lxEditor")); };
  const isTypingQ = function () { return !!(session && session.qs[session.i] && session.qs[session.i].typing); };
  function drawTyping(q, n) {
    if (!usingDock()) return drawTypingLegacy(q, n);
    const exact = q.mode === "exact";
    set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small">Item ' + (session.i + 1) + " of " + n + "</p>");
    dock.open(); dock.lock(false); dock.clear();
    dock.setPrompt('<p class="lx-sr">Item ' + (session.i + 1) + " of " + n + ". </p><p>Type what you see in Arabic. " + (exact ? "<b>Include the harakat</b> (use the mark keys on the Arabic keyboard); the letters and marks must both match." : "The check compares letters only, so harakat are optional.") + '</p><div class="lx-show">' + ar(q.ar, "lx-show-ar") + "</div><p>" + hear(q.ar, "", "Hear this text") + "</p>");
    document.getElementById("lxTFb").innerHTML = ""; document.getElementById("lxTNext").innerHTML = "";
    dock.focus();
  }
  function nextBtn() {
    const last = session.i === session.qs.length - 1, d = isTypingQ() && usingDock(), bid = d ? "lxTNextBtn" : "lxNextBtn";
    document.getElementById(d ? "lxTNext" : "lxNext").innerHTML = '<button type="button" class="lx-btn" data-action="next" id="' + bid + '">' + (last ? "See results" : "Next →") + "</button>";
    document.getElementById(bid).focus();
  }
  function answer(v) {
    if (session.answered) return; const q = session.qs[session.i], r = E.checkAnswer(q, v); session.answered = true;
    session.results.push({ letterId: q.letterId, correct: r.correct, q: q });
    root.querySelectorAll(".lx-opt").forEach(function (b) { b.disabled = true; if (b.dataset.v === String(q.answer)) { b.classList.add("is-right"); b.insertAdjacentHTML("afterbegin", '<span class="lx-mk" aria-hidden="true">✓ </span>'); } else if (b.dataset.v === String(v)) { b.classList.add("is-wrong"); b.insertAdjacentHTML("afterbegin", '<span class="lx-mk" aria-hidden="true">✗ </span>'); } });
    document.getElementById("lxFb").innerHTML = '<p class="' + (r.correct ? "lx-ok" : "lx-bad") + '"><b>' + (r.correct ? "Correct!" : "Not quite.") + "</b> " + esc(r.explanation) + "</p>"; nextBtn();
  }
  function typeCheck() {
    if (session.answered) return; const q = session.qs[session.i], d = usingDock(), fb = document.getElementById(d ? "lxTFb" : "lxFb");
    const inp = d ? document.getElementById("lxEditor") : document.getElementById("lxType"), val = inp.value;
    const g = E.gradeTyped(q.mode, q.ar, val);
    if (g.reason === "empty") { fb.innerHTML = '<p class="lx-bad">Type your answer first.</p>'; inp.focus(); return; }
    session.answered = true; session.results.push({ letterId: null, correct: g.correct, q: { prompt: q.ar, explanation: q.translit + " — " + q.en } });
    if (d) dock.lock(true); else inp.disabled = true;
    const why = g.reason === "marks" ? "The letters are right, but the harakat do not match. " : "";
    fb.innerHTML = '<p class="' + (g.correct ? "lx-ok" : "lx-bad") + '"><b>' + (g.correct ? "Correct!" : "Not quite.") + "</b> " + why + (g.correct ? "" : "Expected: " + ar(q.ar) + ". ") + "<span>" + esc(q.translit) + " — " + esc(q.en) + "</span></p>"; nextBtn();
  }
  function advance() { if (!session.answered) return; session.answered = false; if (session.i < session.qs.length - 1) { session.i++; drawQ(); } else finish(); }
  function finish() {
    const sc = E.scoreSession(session.results); store.recordSession(session.kind, session.results.map(function (r) { return { letterId: r.letterId, correct: r.correct }; }));
    let msg = "";
    if (session.lessonId) { const pass = sc.correct >= 2; if (pass) store.completeLesson(session.lessonId, sc.percent); msg = pass ? '<p class="lx-ok"><b>Lesson complete!</b> ✓ Your progress was saved.</p>' : '<p class="lx-bad"><b>Not yet.</b> You need at least 2 of 3. Review the lesson and try again.</p>'; }
    const wrong = session.results.filter(function (r) { return !r.correct; });
    const review = wrong.length ? "<h3 class=\"lx-h3\">To review</h3><ul class=\"lx-wrong\">" + wrong.map(function (r) { return "<li>" + esc(r.q.prompt) + "<br><small>" + esc(r.q.explanation) + "</small></li>"; }).join("") + "</ul>" : "<p>No mistakes. Excellent!</p>";
    const nxt = session.lessonId && sc.correct >= 2 ? nextLesson() : null;
    set('<h2 class="lx-h" tabindex="-1" data-focus>Results</h2><div class="lx-score"><b>' + sc.correct + " / " + sc.total + "</b><span>" + sc.percent + "% correct</span></div>" + msg + review + '<div class="lx-actions"><button type="button" class="lx-btn" data-action="retry">Try again</button>' + (nxt ? '<a class="lx-btn lx-btn-alt" href="' + lessonHref(nxt) + '">Next lesson →</a>' : "") + '<a class="lx-btn lx-btn-alt" href="' + (session.ret || href("")) + '">' + (session.ret ? "Back to lesson" : "Dashboard") + "</a></div>");
  }

  /* ---------- reading & typing ---------- */
  function read() {
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Reading and typing</h2><p>Work up from single letters to sentences. Read the Arabic, then type it. An on-screen Arabic keyboard (including harakat keys) opens when you start typing, and your own keyboard works too. The vocabulary is Modern Standard Arabic.</p><div class="lx-cards">' +
      D.READING_STAGES.map(function (s) { return '<button type="button" class="lx-card lx-cardbtn" data-action="stage" data-id="' + s.id + '"><h3>' + esc(s.title) + "</h3><p>" + s.items.length + (s.id === "marked" ? " items: read each mark and choose its sound." : s.check === "exact" ? " items to type with harakat (letters and marks must match)." : " items to read and type (harakat optional).") + "</p></button>"; }).join("") + "</div>");
  }
  function startStage(id) {
    const s = D.READING_STAGES.find(function (x) { return x.id === id; });
    startSession({ kind: "read", title: s.title, stage: id, qs: id === "marked" ? E.readingChoice(s.items) : s.items.map(function (it) { return { typing: true, ar: it[0], translit: it[1], en: it[2], mode: s.check }; }), ret: href("read") });
  }
  function notFound() { set('<h2 class="lx-h" tabindex="-1" data-focus>Page not found</h2><p>That lesson does not exist. <a href="' + href("") + '">Back to the dashboard</a>.</p>'); }

  /* ---------- routing & events ---------- */
  function route() {
    session = null; store.load(); const p = (location.hash || "").replace(/^#\/?/, "").split("/");
    if (p[0] === "letter" && p[1]) letter(p[1]); else if (p[0] === "harakat" && p[1]) harakat(p[1]); else if (p[0] === "practice") practice(); else if (p[0] === "read") read(); else home();
  }
  function onAction(e) {
    const b = e.target.closest("[data-action]"); if (!b || b.disabled) return; const a = b.dataset.action;
    if (a === "speak") { const ok = A.speak(b.dataset.text, b.dataset.key); if (!ok) b.textContent = "Audio unavailable"; }
    else if (a === "check") { const id = b.dataset.id; if (id.indexOf("letter-") === 0) startSession({ kind: "check", title: "Quick check: " + byId[id.slice(7)].nameEn, lessonId: id, qs: E.quickCheck(id.slice(7)), ret: lessonHref(id) }); else { const h = D.HARAKAT_LESSONS.find(function (x) { return x.id === id; }); startSession({ kind: "check", title: "Quick check: " + h.title, lessonId: id, qs: E.harakatCheck(h), ret: lessonHref(id) }); } }
    else if (a === "practice") startSession({ kind: "practice", title: b.dataset.type === "mixed" ? "Mixed practice" : TYPE_LABELS[b.dataset.type], qs: E.buildSession({ count: 10, types: b.dataset.type === "mixed" ? null : [b.dataset.type] }), ret: href("practice"), type: b.dataset.type });
    else if (a === "practice-weak") { const w = store.summary().review; if (w.length) startSession({ kind: "practice", title: "Weak letters", qs: E.buildSession({ count: 10, weakIds: w }), ret: href("practice"), type: "weak" }); }
    else if (a === "stage") startStage(b.dataset.id);
    else if (a === "answer") answer(b.dataset.v);
    else if (a === "typecheck") typeCheck();
    else if (a === "next") advance();
    else if (a === "retry") { const s = session; if (s.lessonId) { const id = s.lessonId; if (id.indexOf("letter-") === 0) startSession({ kind: "check", title: s.title, lessonId: id, qs: E.quickCheck(id.slice(7)), ret: s.ret }); else startSession({ kind: "check", title: s.title, lessonId: id, qs: E.harakatCheck(D.HARAKAT_LESSONS.find(function (x) { return x.id === id; })), ret: s.ret }); } else if (s.stage) startStage(s.stage); else if (s.type === "weak") { const w = store.summary().review; startSession({ kind: "practice", title: s.title, qs: E.buildSession({ count: 10, weakIds: w.length ? w : null }), ret: s.ret, type: "weak" }); } else startSession({ kind: "practice", title: s.title, qs: E.buildSession({ count: 10, types: s.type === "mixed" ? null : [s.type] }), ret: s.ret, type: s.type }); }
    else if (a === "reset") { if (window.confirm("Reset all Learn Arabic progress on this device? Completed lessons, scores and your streak will be erased. This cannot be undone.")) { store.reset(); home(); } }
  }
  root.addEventListener("click", onAction);
  const typePanel = document.getElementById("lxTypePanel"); if (typePanel) typePanel.addEventListener("click", onAction);
  if (dock) dock.onSubmit(function () { if (!session || !isTypingQ() || !usingDock()) return; if (!session.answered) typeCheck(); else advance(); });
  root.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "lxType") { e.preventDefault(); if (session && !session.answered) typeCheck(); else if (session) advance(); } });
  window.addEventListener("hashchange", route);
  route();
})();
