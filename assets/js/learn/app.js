/* Learn Arabic — UI. Hash-routed single page: #/ (dashboard), #/letter/<id>, #/harakat/<id>, #/practice, #/read, #/vocab, #/patterns, #/review, #/journey, #/conversations, #/conversation/<unit>, #/reading, #/reading/<passage> */
(function () {
  "use strict";
  const D = window.LearnData, E = window.LearnEngine, A = window.LearnAudio, V = window.LearnVocab, S = window.LearnSRS, R = window.LearnReview, C = window.LearnConversations, RD = window.LearnReading, J = window.LearnJourney;
  const root = document.getElementById("learnApp");
  if (!root || !D || !E || !V || !S || !R || !C || !RD || !J) return;
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
  // Sentence with ONE missing WORD (word-level gap: spaces separate words, so no letter joining is involved).
  const blankSentence = function (b) { return '<span class="lx-ar lx-show-ar" lang="ar" dir="rtl" role="img" aria-label="Arabic sentence with one missing word">' + esc(b.before ? b.before + " " : "") + '<span class="lx-blank lx-blank-word" aria-hidden="true"></span>' + esc((b.after ? " " + b.after : "") + (b.punct || "")) + "</span>"; };
  const blankWord = function (b) { return '<span class="lx-ar lx-show-ar" lang="ar" dir="rtl" role="img" aria-label="Arabic word with one missing letter">' + esc(b.before + (b.before ? ZWJ : "")) + '<span class="lx-blank" aria-hidden="true"></span>' + esc((b.joinAfter && b.after ? ZWJ : "") + b.after) + "</span>"; };
  const hear = function (text, key, label) { return '<button type="button" class="lx-hear" data-action="speak" data-text="' + esc(text) + '" data-key="' + esc(key || "") + '" aria-label="' + esc(label || "Hear pronunciation") + '">🔊 Hear</button>'; };
  const href = function (h) { return "#/" + h; };
  const nextLesson = function () { return ORDER.find(function (id) { return !store.isDone(id); }) || null; };
  const lessonHref = function (id) { return id.indexOf("letter-") === 0 ? href("letter/" + id.slice(7)) : href("harakat/" + id); };
  const lessonTitle = function (id) { if (id.indexOf("letter-") === 0) { const l = byId[id.slice(7)]; return "Letter " + l.nameEn + " " + l.letter; } return D.HARAKAT_LESSONS.find(function (h) { return h.id === id; }).title; };

  function set(html) { if (dock) dock.close(); root.innerHTML = html; if (!first) { const h = root.querySelector("[data-focus]"); if (h) { h.focus({ preventScroll: false }); } } first = false; }

  /* ---------- dashboard ---------- */
  function home() {
    const s = store.summary(), jn = journey(), pct = Math.round(s.completed / s.total * 100), rv = store.srsSummary(CATALOG);
    const weak = s.review.map(function (id) { return byId[id]; });
    const grid = L.map(function (l) {
      const done = store.isDone("letter-" + l.id);
      return '<a class="lx-tile' + (done ? " is-done" : "") + '" href="' + href("letter/" + l.id) + '">' + ar(l.letter, "lx-tile-ar") + '<span class="lx-tile-n">' + esc(l.nameEn) + '</span><span class="lx-badge lx-d-' + l.difficulty.toLowerCase() + '">' + l.difficulty + "</span>" + (done ? '<span class="lx-tick" aria-label="Completed">✓</span>' : "") + "</a>";
    }).join("");
    const hk = D.HARAKAT_LESSONS.map(function (h) { return '<a class="lx-card" href="' + href("harakat/" + h.id) + '"><span class="lx-badge lx-d-medium">Beginner</span>' + (store.isDone(h.id) ? ' <span class="lx-tick-i" aria-label="Completed">✓ Done</span>' : "") + "<h3>" + esc(h.title) + "</h3><p>" + h.marks.map(function (m) { return esc(D.HARAKAT.find(function (x) { return x.id === m; }).nameEn); }).join(", ") + "</p></a>"; }).join("");
    set('<h2 class="lx-h" tabindex="-1" data-focus>Your learning dashboard</h2>' +
      (s.persistent ? "" : '<p class="lx-note" role="note">Progress cannot be saved in this browser (storage is blocked or unavailable). You can still learn, but it will be lost when you leave.</p>') +
      '<div class="lx-stats"><div class="lx-stat"><b>' + s.completed + " / " + s.total + '</b><span>lessons completed</span></div><div class="lx-stat"><b>' + s.level.n + ". " + esc(s.level.name) + '</b><span>current level</span></div><div class="lx-stat"><b>' + s.streak + (s.streak === 1 ? " day" : " days") + '</b><span>practice streak</span></div><div class="lx-stat"><b>' + (s.accuracy === null ? "—" : s.accuracy + "%") + '</b><span>' + (s.accuracy === null ? "no answers yet" : s.correct + " correct, " + s.wrong + " incorrect") + "</span></div>" + '<div class="lx-stat"><b>' + rv.due + '</b><span>reviews due</span></div></div>' +
      '<div class="lx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + s.total + '" aria-valuenow="' + s.completed + '" aria-label="Lessons completed"><i style="width:' + pct + '%"></i></div>' +
      '<div class="lx-row"><div class="lx-panel" id="lxNextStep"><h3>' + (jn.next ? "Continue learning" : "Course complete") + "</h3><p>" + (jn.next ? "Next up: <b>" + esc(stageTitle(jn.next.stage)) + "</b> · " + esc(jn.next.title) + "." : "You have completed every step of the learning path. Keep your skills sharp with review and practice.") + '</p>' + (jn.next ? '<a class="lx-btn" href="' + jn.next.href + '">' + (s.completed || jn.done ? "Continue" : "Start the alphabet") + " →</a>" : '<a class="lx-btn" href="' + href("review") + '">Review →</a>') + '<p class="lx-small">' + jn.done + " of " + jn.total + " path steps complete.</p></div>" +
      '<div class="lx-panel"><h3>Daily practice</h3><p>' + (s.practicedToday ? "✓ You practiced today. Another round keeps letters fresh." : "You have not practiced today yet. One 10-question round counts.") + '</p><a class="lx-btn lx-btn-alt" href="' + href("practice") + '">Start practice →</a></div>' +
      '<div class="lx-panel" id="lxDailyReview"><h3>Daily review</h3>' + (!rv.learning ? "<p>Nothing is scheduled yet. Answer an alphabet check or practise a vocabulary topic and your reviews will appear here.</p>" + '<a class="lx-btn lx-btn-alt" href="' + href("vocab") + '">Start vocabulary →</a>' : rv.due ? "<p><b>" + rv.due + "</b> item" + (rv.due === 1 ? " is" : "s are") + " due now.</p>" + '<a class="lx-btn" href="' + href("review") + '">Start review →</a>' : "<p>✓ All caught up. Next review: " + whenText(rv.nextInDays) + ".</p>" + '<a class="lx-btn lx-btn-alt" href="' + href("review") + '">Review page →</a>') + (rv.learning ? '<p class="lx-small">' + rv.reviewedToday + " reviewed today · " + rv.learning + " in your schedule · " + rv.mastered + " mastered</p>" : "") + "</div>" +
      '<div class="lx-panel"><h3>Needs review</h3>' + (weak.length ? "<p>Letters you often miss:</p><p>" + weak.map(function (l) { return '<a class="lx-chip" href="' + href("letter/" + l.id) + '">' + ar(l.letter) + " " + esc(l.nameEn) + "</a>"; }).join(" ") + '</p><button type="button" class="lx-btn lx-btn-alt" data-action="practice-weak">Practice these →</button>' : "<p>Nothing to review yet. Letters you miss repeatedly will appear here after a few answers.</p>") + "</div></div>" +
      journeyStrip(jn) +
      '<h3 class="lx-h3">Alphabet course · 28 lessons</h3><div class="lx-grid">' + grid + "</div>" +
      '<h3 class="lx-h3">Harakat and pronunciation</h3><div class="lx-cards">' + hk + "</div>" +
      '<h3 class="lx-h3">Vocabulary · <a href="' + href("vocab") + '">all topics</a></h3><div class="lx-cards">' + V.TOPICS.map(function (t) { const p = topicProgress(t.id); return '<a class="lx-card" href="' + href("vocab/" + t.id) + '"><span class="lx-badge lx-d-easy">Beginner</span><h3>' + esc(t.title) + "</h3><p>" + esc(t.blurb) + '</p><p class="lx-small">' + p.seen + " of " + p.total + " practised · " + p.mastered + " mastered</p></a>"; }).join("") + "</div>" +
      '<h3 class="lx-h3">Practice and reading</h3><div class="lx-cards"><a class="lx-card" href="' + href("practice") + '"><span class="lx-badge lx-d-easy">All levels</span><h3>Letter practice</h3><p>Six exercise types with instant feedback and explanations.</p></a><a class="lx-card" href="' + href("read") + '"><span class="lx-badge lx-d-medium">Beginner</span><h3>Reading and typing</h3><p>Six stages from single letters to short sentences, answered by typing.</p></a><a class="lx-card" href="#/patterns"><span class="lx-badge lx-d-medium">Beginner</span><h3>Sentence patterns</h3><p>Build simple sentences: “This is a …”, “I am a …”, “Where is …?”.</p></a><a class="lx-card" href="#/conversations"><span class="lx-badge lx-d-medium">Beginner</span><h3>Conversations</h3><p>Eight short dialogues: introductions, greetings, ordering, shopping and directions.</p></a><a class="lx-card" href="#/reading"><span class="lx-badge lx-d-medium">Beginner</span><h3>Reading comprehension</h3><p>Sentences, paragraphs, stories and dialogues with questions.</p></a></div>' +
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
    set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small" aria-hidden="true">Question ' + (session.i + 1) + " of " + n + '</p><p class="lx-q" tabindex="-1" data-focus><span class="lx-sr">Question ' + (session.i + 1) + " of " + n + ". </span>" + esc(q.prompt) + "</p>" + (q.audio ? '<div class="lx-show">' + hear(q.audio.text, q.audio.key, "Hear the word") + "</div>" : "") + (q.blank ? '<div class="lx-show">' + blankWord(q.blank) + "</div>" : q.blankWords ? '<div class="lx-show">' + blankSentence(q.blankWords) + "</div>" : q.show ? '<div class="lx-show">' + ar(q.show, "lx-show-ar") + "</div>" : "") +
      '<div class="lx-opts" role="group" aria-label="Answer choices">' + q.options.map(function (o) { return '<button type="button" class="lx-opt" data-action="answer" data-v="' + esc(o.value) + '">' + (o.ar ? ar(o.label, "lx-opt-ar") : esc(o.label)) + "</button>"; }).join("") + '</div><div id="lxFb" class="lx-fb" role="status" aria-live="polite"></div><div id="lxNext"></div>');
  }
  // Legacy native <input> renderer: used only if the typing dock is missing from the page.
  function drawTypingLegacy(q, n) {
      set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small">Item ' + (session.i + 1) + " of " + n + '</p><p>Type what you see in Arabic. The check compares letters only, so harakat are optional.</p><div class="lx-show">' + (q.recall ? '<span class="lx-q-en">“' + esc(q.en) + "”</span>" : ar(q.ar, "lx-show-ar")) + '</div><p>' + hear(q.ar, "", "Hear this text") + ' <a href="../arabic-keyboard/" target="_blank" rel="noopener">Need the Arabic keyboard?</a></p><label class="lx-label" for="lxType">Your answer</label><input id="lxType" data-focus class="lx-input" lang="ar" dir="rtl" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="lx-actions"><button type="button" class="lx-btn" data-action="typecheck">Check</button></div><div id="lxFb" class="lx-fb" role="status" aria-live="polite"></div><div id="lxNext"></div>');
  }
  const usingDock = function () { return !!(dock && document.getElementById("lxTypePanel") && document.getElementById("lxEditor")); };
  const isTypingQ = function () { return !!(session && session.qs[session.i] && session.qs[session.i].typing); };
  function typingPrompt(q, n, exact) {
    const head = '<p class="lx-sr">Item ' + (session.i + 1) + " of " + n + ". </p>";
    if (q.recall) return head + "<p>Type this in Arabic. The check compares letters only, so harakat are optional.</p><div class=\"lx-show\"><span class=\"lx-q-en\">“" + esc(q.en) + "”</span></div><p class=\"lx-small\">Hint (transliteration): " + esc(q.hint || q.translit) + "</p>";
    return head + "<p>Type what you see in Arabic. " + (exact ? "<b>Include the harakat</b> (use the mark keys on the Arabic keyboard); the letters and marks must both match." : "The check compares letters only, so harakat are optional.") + '</p><div class="lx-show">' + ar(q.ar, "lx-show-ar") + "</div><p>" + hear(q.ar, "", "Hear this text") + "</p>";
  }
  function drawTyping(q, n) {
    if (!usingDock()) return drawTypingLegacy(q, n);
    const exact = q.mode === "exact";
    set('<h2 class="lx-h">' + esc(session.title) + '</h2><div class="lx-bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + n + '" aria-valuenow="' + (session.i + 1) + '" aria-label="Question progress"><i style="width:' + Math.round((session.i + 1) / n * 100) + '%"></i></div><p class="lx-small">Item ' + (session.i + 1) + " of " + n + "</p>");
    dock.open(); dock.lock(false); dock.clear();
    dock.setPrompt(typingPrompt(q, n, exact));
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
    session.answered = true; session.results.push({ letterId: null, correct: g.correct, q: { prompt: q.recall ? q.en : q.ar, explanation: q.translit + " — " + q.en, itemId: q.itemId } });
    if (d) dock.lock(true); else inp.disabled = true;
    const why = g.reason === "marks" ? "The letters are right, but the harakat do not match. " : "";
    fb.innerHTML = '<p class="' + (g.correct ? "lx-ok" : "lx-bad") + '"><b>' + (g.correct ? "Correct!" : "Not quite.") + "</b> " + why + (g.correct ? "" : "Expected: " + ar(q.ar) + ". ") + "<span>" + esc(q.translit) + " — " + esc(q.en) + "</span> " + hear(q.ar, "", "Hear the answer") + "</p>"; nextBtn();
  }
  function advance() { if (!session.answered) return; session.answered = false; if (session.i < session.qs.length - 1) { session.i++; drawQ(); } else finish(); }
  function finish() {
    const sc = E.scoreSession(session.results); store.recordSession(session.kind, session.results.map(function (r) { return { letterId: r.letterId, correct: r.correct }; }));
    // Spaced repetition: every answer that belongs to an item (a letter, a word, a sentence) is scheduled from what the learner REALLY answered.
    store.reviewAnswers(session.results.map(function (r) { return { id: r.q.itemId || (r.letterId ? R.letterId(r.letterId) : null), correct: r.correct }; }).filter(function (a) { return a.id && R.kindOf(a.id); }));
    const rv = store.srsSummary(CATALOG), tracked = session.kind === "vocab" || session.kind === "review" || session.kind === "pattern" || session.kind === "sentence";
    const sched = tracked ? '<p class="lx-small">' + (rv.due ? rv.due + " item" + (rv.due === 1 ? " is" : "s are") + " due for review now." : rv.nextInDays === null ? "" : "Next review: " + whenText(rv.nextInDays) + ".") + "</p>" : "";
    const again = session.kind === "review" ? (rv.due ? '<button type="button" class="lx-btn" data-action="review-start">Review more (' + rv.due + " due)</button>" : "") : '<button type="button" class="lx-btn" data-action="retry">Try again</button>';
    const backLabel = session.kind === "vocab" ? (session.ret === href("vocab") ? "Back to vocabulary" : "Back to topic") : session.kind === "pattern" ? "Back to pattern" : session.kind === "sentence" ? "Back to conversation" : session.kind === "review" ? "Review page" : session.kind === "conversation" ? "Back to conversation" : session.kind === "reading-comp" ? "Back to the text" : "Back to lesson";
    let msg = "";
    if (session.lessonId) { const pass = sc.correct >= 2; if (pass) store.completeLesson(session.lessonId, sc.percent); msg = pass ? '<p class="lx-ok"><b>Lesson complete!</b> ✓ Your progress was saved.</p>' : '<p class="lx-bad"><b>Not yet.</b> You need at least 2 of 3. Review the lesson and try again.</p>'; }
    let unitNext = "";
    if (session.unitId) {
      const ur = store.recordUnit(session.unitId, sc.percent), need = (store.unit(session.unitId) || {}).pass || 70;
      msg = ur && ur.passed ? '<p class="lx-ok"><b>' + (session.kind === "conversation" ? "Unit complete!" : session.kind === "read" ? "Stage complete!" : "Text complete!") + "</b> ✓ You scored " + sc.percent + "%. Your best score is " + ur.best + "%.</p>" : '<p class="lx-bad"><b>Not yet.</b> You scored ' + sc.percent + "%; you need at least " + need + "% to complete this. Read it again and retry.</p>";
      if (ur && ur.passed && session.nextHref) unitNext = '<a class="lx-btn lx-btn-alt" href="' + session.nextHref + '">' + esc(session.nextLabel || "Next") + " →</a>";
    }
    const wrong = session.results.filter(function (r) { return !r.correct; });
    const review = wrong.length ? "<h3 class=\"lx-h3\">To review</h3><ul class=\"lx-wrong\">" + wrong.map(function (r) { return "<li>" + esc(r.q.prompt) + "<br><small>" + esc(r.q.explanation) + "</small></li>"; }).join("") + "</ul>" : "<p>No mistakes. Excellent!</p>";
    const nxt = session.lessonId && sc.correct >= 2 ? nextLesson() : null;
    set('<h2 class="lx-h" tabindex="-1" data-focus>Results</h2><div class="lx-score"><b>' + sc.correct + " / " + sc.total + "</b><span>" + sc.percent + "% correct</span></div>" + msg + review + sched + '<div class="lx-actions">' + again + (nxt ? '<a class="lx-btn lx-btn-alt" href="' + lessonHref(nxt) + '">Next lesson →</a>' : "") + unitNext + '<a class="lx-btn lx-btn-alt" href="' + (session.ret || href("")) + '">' + (session.ret ? backLabel : "Dashboard") + "</a></div>");
  }

  /* ---------- reading & typing ---------- */
  function read() {
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Reading and typing</h2><p>Work up from single letters to sentences. Read the Arabic, then type it. An on-screen Arabic keyboard (including harakat keys) opens when you start typing, and your own keyboard works too. The vocabulary is Modern Standard Arabic.</p><div class="lx-cards">' +
      D.READING_STAGES.map(function (s) { return '<button type="button" class="lx-card lx-cardbtn" data-action="stage" data-id="' + s.id + '"><h3>' + esc(s.title) + "</h3><p>" + s.items.length + (s.id === "marked" ? " items: read each mark and choose its sound." : s.check === "exact" ? " items to type with harakat (letters and marks must match)." : " items to read and type (harakat optional).") + "</p></button>"; }).join("") + "</div>");
  }
  function startStage(id) {
    const s = D.READING_STAGES.find(function (x) { return x.id === id; });
    startSession({ kind: "read", title: s.title, stage: id, unitId: "stage-" + id, qs: id === "marked" ? E.readingChoice(s.items) : s.items.map(function (it) { return { typing: true, ar: it[0], translit: it[1], en: it[2], mode: s.check }; }), ret: href("read") });
  }
  function notFound() { set('<h2 class="lx-h" tabindex="-1" data-focus>Page not found</h2><p>That lesson does not exist. <a href="' + href("") + '">Back to the dashboard</a>.</p>'); }

  /* ---------- routing & events ---------- */
  /* ---------- vocabulary, sentence patterns and daily review (V1) ---------- */
  const CATALOG = R.ALL_IDS, MAX_REVIEW = 15;
  const topicById = {}; V.TOPICS.forEach(function (t) { topicById[t.id] = t; });
  const patternById = {}; V.PATTERNS.forEach(function (x) { patternById[x.id] = x; });
  const VTYPE = { mixed: "Mixed practice", "v-recognize": "Recognise the word", "v-match": "Match the meaning", "v-spelling": "Choose the spelling", "v-recall": "Recall: type the word", "v-listen": "Listening: choose the word you hear" };
  const vocabIds = function (topic) { return V.ITEMS.filter(function (i) { return i.topic === topic; }).map(function (i) { return i.id; }); };
  const whenText = function (n) { return n <= 0 ? "now" : n === 1 ? "tomorrow" : "in " + n + " days"; };
  function topicProgress(topic) { const ids = vocabIds(topic); let seen = 0, mastered = 0; ids.forEach(function (id) { const e = store.srsEntry(id); if (e) { seen++; if (e.b >= S.MASTERED_BOX) mastered++; } }); return { total: ids.length, seen: seen, mastered: mastered }; }
  const itemRow = function (i) { return '<li class="lx-ex">' + ar(i.ar + (i.punct || ""), "lx-ex-ar") + "<div><b>" + esc(i.translit) + "</b> — " + esc(i.en) + "<br><small>" + (i.kind === "phrase" ? "phrase" : "word") + " · Modern Standard Arabic" + (i.difficulty ? " · " + i.difficulty : "") + " · plain spelling " + ar(i.plain) + "</small>" + (i.note ? "<br><small>" + esc(i.note) + "</small>" : "") + "</div>" + hear(i.ar, "vocab-" + i.id, "Hear " + i.translit) + "</li>"; };

  const topicCard = function (t) { const p = topicProgress(t.id); return '<a class="lx-card" href="' + href("vocab/" + t.id) + '"><span class="lx-badge lx-d-easy">' + (t.group === "starter" ? "Starter" : "Everyday") + "</span><h3>" + esc(t.title) + "</h3><p>" + esc(t.blurb) + '</p><p class="lx-small">' + p.total + " items · " + p.seen + " practised · " + p.mastered + " mastered</p></a>"; };
  function vocabHome() {
    const grp = function (g) { return V.TOPICS.filter(function (t) { return t.group === g; }).map(topicCard).join(""); }, seenAny = V.TOPICS.some(function (t) { return topicProgress(t.id).seen > 0; });
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Vocabulary</h2><p>Learn words by topic, practise them with five kinds of exercise, and let the daily review bring each word back at the right time. All vocabulary is Modern Standard Arabic unless a card says otherwise.</p>' +
      '<div class="lx-panel" id="lxMixedPanel"><h3>Mixed-topic review</h3><p>Twelve questions that mix several topics, starting with words that are due.</p><div class="lx-actions"><button type="button" class="lx-btn" data-action="mixed" data-scope="all">All topics</button><button type="button" class="lx-btn lx-btn-alt" data-action="mixed" data-scope="seen"' + (seenAny ? "" : " disabled") + ">Topics I have practised</button></div>" + (seenAny ? "" : '<p class="lx-small">The second option unlocks as soon as you practise a topic.</p>') + "</div>" +
      '<h3 class="lx-h3">Starter vocabulary</h3><div class="lx-cards">' + grp("starter") + '</div><h3 class="lx-h3">Everyday vocabulary</h3><div class="lx-cards">' + grp("everyday") + '</div><p class="lx-actions"><a class="lx-btn lx-btn-alt" href="' + href("review") + '">Daily review →</a><a class="lx-btn lx-btn-alt" href="' + href("patterns") + '">Sentence patterns →</a><a class="lx-btn lx-btn-alt" href="' + href("conversations") + '">Conversations →</a></p>');
  }
  function topicPage(id) {
    const t = topicById[id]; if (!t) return notFound();
    const items = V.ITEMS.filter(function (i) { return i.topic === id; }), p = topicProgress(id), dia = V.DIALECT.filter(function (d) { return d.topic === id; }), vars = V.VARIANTS.filter(function (d) { return d.topic === id; }), listen = A.canListen();
    const dialect = dia.length ? '<div class="lx-panel lx-dialect"><h3>Regional variants (not Modern Standard Arabic)</h3><p>“How are you?” sounds different across the Arab world. These are shown so you can recognise them; they are not quizzed.</p><ul class="lx-exs">' + dia.map(function (d) { return '<li class="lx-ex">' + ar(d.ar + d.punct, "lx-ex-ar") + "<div><b>" + esc(d.translit) + "</b> — " + esc(d.en) + "<br><small>" + esc(d.region) + " · dialect</small></div>" + hear(d.ar, "vocab-" + d.id, "Hear " + d.translit) + "</li>"; }).join("") + "</ul></div>" : "";
    const variants = vars.length ? '<div class="lx-panel lx-dialect"><h3>Regional words and usage (not quizzed)</h3><p>These are shown so you can recognise them. Each is labelled with its region and whether it is spoken dialect or standard Arabic used in only some countries. The Modern Standard Arabic word it relates to is named in each note. A device voice reads Arabic with a standard pronunciation, so it may not sound like speech in that region.</p><ul class="lx-exs">' + vars.map(function (d) { return '<li class="lx-ex">' + ar(d.ar, "lx-ex-ar") + "<div><b>" + esc(d.translit) + "</b> — " + esc(d.en) + "<br><small>" + esc(d.region) + " · " + (d.reg === "dialect" ? "dialect" : "standard Arabic, regional usage") + "</small>" + (d.note ? "<br><small>" + esc(d.note) + "</small>" : "") + "</div>" + hear(d.ar, "", "Hear " + d.translit) + "</li>"; }).join("") + "</ul></div>" : "";
    set('<nav class="lx-back"><a href="' + href("vocab") + '">← Vocabulary</a></nav><h2 class="lx-h" tabindex="-1" data-focus>' + esc(t.title) + "</h2><p>" + esc(t.note) + '</p><p class="lx-small">' + p.seen + " of " + p.total + " practised · " + p.mastered + ' mastered</p><ul class="lx-exs">' + items.map(itemRow).join("") + "</ul>" + dialect + variants +
      '<div class="lx-panel"><h3>Practise this topic</h3><p>Each round has 10 questions. Your answers schedule each word for review.</p><div class="lx-cards">' + Object.keys(VTYPE).filter(function (k) { return k !== "v-listen" || listen; }).map(function (k) { return '<button type="button" class="lx-card lx-cardbtn" data-action="vpractice" data-topic="' + id + '" data-type="' + k + '"><h3>' + VTYPE[k] + "</h3></button>"; }).join("") + "</div>" + (listen ? "" : '<p class="lx-small">Listening practice is hidden because this device has no Arabic voice for speech. Install one in your system settings to enable it.</p>') + "</div>");
  }
  function startVocab(topic, type) {
    const t = topicById[topic]; if (!t || !VTYPE[type]) return notFound();
    startSession({ kind: "vocab", title: t.title + ": " + VTYPE[type], qs: R.buildVocabSession({ ids: vocabIds(topic), type: type, count: 10, listen: A.canListen() }), ret: href("vocab/" + topic), vtopic: topic, vtype: type });
  }
  function patternsHome() {
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Sentence patterns</h2><p>Short, reusable sentence frames. Learn the pattern, hear the examples, then complete and type sentences. You can use the on-screen Arabic keyboard.</p><div class="lx-cards">' + V.PATTERNS.map(function (x) { return '<a class="lx-card" href="' + href("patterns/" + x.id) + '"><span class="lx-badge lx-d-medium">Beginner</span><h3>' + ar(x.template) + "</h3><p>" + esc(x.examples[0].en) + "</p></a>"; }).join("") + "</div>");
  }
  function patternPage(id) {
    const x = patternById[id]; if (!x) return notFound();
    set('<nav class="lx-back"><a href="' + href("patterns") + '">← Sentence patterns</a></nav><h2 class="lx-h" tabindex="-1" data-focus>' + esc(x.title) + "</h2><p>" + esc(x.explain) + '</p><ul class="lx-exs">' + x.examples.map(function (e) { return '<li class="lx-ex">' + ar(e.ar + (e.punct || ""), "lx-ex-ar") + "<div><b>" + esc(e.translit) + "</b> — " + esc(e.en) + "<br><small>Modern Standard Arabic</small></div>" + hear(e.ar, "pat-" + e.id, "Hear " + e.translit) + "</li>"; }).join("") + '</ul><div class="lx-panel"><h3>Practise this pattern</h3><p>Complete each sentence, then type each one from its English meaning. Your answers schedule these sentences for review.</p><button type="button" class="lx-btn" data-action="ppractice" data-id="' + id + '">Start practice</button></div>');
  }
  function startPattern(id) {
    const x = patternById[id]; if (!x) return notFound();
    startSession({ kind: "pattern", title: "Pattern practice", qs: R.buildPatternSession({ ids: x.examples.map(function (e) { return e.id; }) }), ret: href("patterns/" + id), pid: id });
  }
  function reviewPage() {
    const rv = store.srsSummary(CATALOG), due = store.dueIds(CATALOG), kinds = {};
    due.forEach(function (id) { const k = R.kindOf(id); kinds[k] = (kinds[k] || 0) + 1; });
    const mix = [kinds.letter && kinds.letter + " letter" + (kinds.letter === 1 ? "" : "s"), kinds.vocab && kinds.vocab + " word" + (kinds.vocab === 1 ? "" : "s"), (kinds.pattern || kinds.sentence) && ((kinds.pattern || 0) + (kinds.sentence || 0)) + " sentence" + ((kinds.pattern || 0) + (kinds.sentence || 0) === 1 ? "" : "s")].filter(Boolean).join(", ");
    let body;
    if (!rv.learning) body = '<p>Nothing is scheduled yet. Items join your schedule when you answer them in a quiz: complete an alphabet check or practise a vocabulary topic.</p><p class="lx-actions"><a class="lx-btn" href="' + href("vocab") + '">Start with vocabulary →</a><a class="lx-btn lx-btn-alt" href="' + href("") + '">Alphabet course</a></p>';
    else if (!due.length) body = '<p><b>You are all caught up.</b> Nothing is due. Next review: ' + whenText(rv.nextInDays) + '.</p><p class="lx-actions"><a class="lx-btn lx-btn-alt" href="' + href("vocab") + '">Practise vocabulary</a><a class="lx-btn lx-btn-alt" href="' + href("practice") + '">Practise letters</a></p>';
    else body = "<p><b>" + due.length + "</b> item" + (due.length === 1 ? " is" : "s are") + " due now (" + esc(mix) + ")" + (due.length > MAX_REVIEW ? ". Each session covers the " + MAX_REVIEW + " most overdue." : ".") + ' The questions get harder as you learn an item.</p><button type="button" class="lx-btn" data-action="review-start">Start review (' + Math.min(due.length, MAX_REVIEW) + ")</button>";
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Daily review</h2>' + body + '<p class="lx-small">' + rv.reviewedToday + " reviewed today · " + rv.learning + " items in your schedule · " + rv.mastered + " mastered. A correct answer moves an item to a longer interval; a miss brings it back tomorrow.</p>");
  }
  function startReview() {
    const due = store.dueIds(CATALOG); if (!due.length) return reviewPage();
    startSession({ kind: "review", title: "Daily review", qs: R.buildReviewSession(due, store.data.srs, Math.random, MAX_REVIEW), ret: href("review") });
  }

  /* ---------- Phase 3: learning journey, conversations, reading comprehension, mixed-topic review ---------- */
  const journey = function () { return J.build({ lessonDone: store.isDone, unitDone: store.unitDone, unit: store.unit, srsEntry: store.srsEntry }); };
  const STATUS_TEXT = { done: "✓ Completed", current: "● Current step", upcoming: "Upcoming" };
  const stageById = {}; J.STAGES.forEach(function (s) { stageById[s.id] = s; });
  const stageTitle = function (id) { return stageById[id] ? stageById[id].title : id; };

  // Compact strip of the eight stages, used on the dashboard. Status is spelled out in words, never by colour alone.
  function journeyStrip(jn) {
    return '<h3 class="lx-h3">Your learning path · <a href="#/journey">full path</a></h3><ol class="lx-path" aria-label="Learning path">' + jn.stages.map(function (s) {
      return '<li class="lx-path-i is-' + s.status + '"><a href="#/journey"><b>' + esc(s.title) + '</b><span class="lx-path-s">' + (s.status === "done" ? "✓ Completed" : s.status === "current" ? "● Current · " + s.done + " of " + s.total : "Upcoming · " + s.done + " of " + s.total) + "</span></a></li>";
    }).join("") + "</ol>";
  }
  function journeyPage() {
    const jn = journey();
    const stages = jn.stages.map(function (s, i) {
      return '<section class="lx-stage is-' + s.status + '" aria-labelledby="lxSt' + i + '"><h3 id="lxSt' + i + '">' + (i + 1) + ". " + esc(s.title) + ' <span class="lx-st-badge lx-st-' + s.status + '">' + STATUS_TEXT[s.status] + "</span></h3><p class=\"lx-small\">" + esc(s.blurb) + " " + s.done + " of " + s.total + " step" + (s.total === 1 ? "" : "s") + " complete.</p><ul class=\"lx-steps\">" + s.steps.map(function (t) {
        const prog = t.total > 1 || t.count ? " · " + t.count + " of " + t.total + " " + t.unitName : "", best = t.best ? " · best score " + t.best + "%" : "";
        return '<li class="lx-step is-' + t.status + '"><a href="' + t.href + '">' + esc(t.title) + '</a><span class="lx-small"> ' + STATUS_TEXT[t.status] + esc(prog + best) + "</span></li>";
      }).join("") + "</ul></section>";
    }).join("");
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Learning path</h2><p>The path runs Alphabet → Harakat → Reading → Starter vocabulary → Everyday vocabulary → Sentences → Conversations → Reading comprehension. A step is marked complete only when you have really passed it: a quiz score, or most of its words answered correctly. Nothing is locked, so you may open any step at any time, but the current step is the best place to continue.</p><div class="lx-panel"><h3>' + (jn.next ? "Your next step" : "Journey complete") + "</h3><p>" + (jn.next ? "<b>" + esc(stageTitle(jn.next.stage)) + "</b>: " + esc(jn.next.title) + "." : "Every step is complete. Keep reviewing to remember it.") + "</p>" + (jn.next ? '<a class="lx-btn" href="' + jn.next.href + '">Go to this step →</a>' : '<a class="lx-btn" href="' + href("review") + '">Daily review →</a>') + '<p class="lx-small">' + jn.done + " of " + jn.total + " steps complete (" + jn.percent + '%).</p><div class="lx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + jn.total + '" aria-valuenow="' + jn.done + '" aria-label="Journey steps completed"><i style="width:' + jn.percent + '%"></i></div></div>' + stages);
  }

  const unitBadge = function (rec) { return rec && rec.complete ? '<span class="lx-tick-i">✓ Passed · best ' + rec.best + "%</span>" : rec && rec.tries ? '<span class="lx-small">Best so far ' + rec.best + "%, not yet passed</span>" : '<span class="lx-small">Not started</span>'; };
  function conversationsHome() {
    const cards = C.UNITS.map(function (u, i) { const rec = store.unit(u.id); return '<a class="lx-card" href="' + href("conversation/" + u.short) + '"><span class="lx-badge lx-d-easy">Unit ' + (i + 1) + "</span><h3>" + esc(u.title) + "</h3><p>" + esc(u.scenario) + "</p><p>" + unitBadge(rec) + "</p></a>"; }).join("");
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Conversations</h2><p>Eight short dialogues for real situations. Each has the Arabic with harakat, transliteration, an English translation, key vocabulary, sentence practice, comprehension questions and a speaking activity. The dialogues are Modern Standard Arabic; spoken dialect forms appear only in labelled notes and are never quizzed.</p><div class="lx-cards">' + cards + "</div>");
  }
  function conversationPage(short) {
    const u = C.UNITS.find(function (x) { return x.short === short; }); if (!u) return notFound();
    const i = C.UNITS.indexOf(u), prev = C.UNITS[i - 1], next = C.UNITS[i + 1], rec = store.unit(u.id), a = A.status();
    const lines = u.lines.map(function (l) { return '<li class="lx-dl"><span class="lx-dl-who">' + esc(u.speakers[l.speaker]) + "</span>" + ar(l.ar, "lx-ex-ar") + '<div><b>' + esc(l.translit) + '</b><br><span class="lx-dl-en">' + esc(l.en) + "</span></div>" + hear(l.ar, l.audioKey, "Hear line " + l.n) + "</li>"; }).join("");
    const vocab = u.vocab.map(function (id) { return R.BY_ID[id]; }).filter(Boolean).map(itemRow).join("");
    const dia = u.dialect.length ? '<div class="lx-panel lx-dialect"><h3>Spoken variants (not Modern Standard Arabic)</h3><p>People often say it differently in speech. These are shown for recognition only and are not quizzed. The device voice reads Arabic with a standard pronunciation, so it may not sound like speech in that region.</p><ul class="lx-exs">' + u.dialect.map(function (d) { return '<li class="lx-ex">' + ar(d.ar, "lx-ex-ar") + "<div><b>" + esc(d.translit) + "</b> — " + esc(d.en) + "<br><small>" + esc(d.region) + " · dialect</small>" + (d.note ? "<br><small>" + esc(d.note) + "</small>" : "") + "</div>" + hear(d.ar, "", "Hear " + d.translit) + "</li>"; }).join("") + "</ul></div>" : "";
    const speak = u.speak.map(function (t) { const l = u.lines[t.line - 1]; return '<li class="lx-ex">' + ar(l.ar, "lx-ex-ar") + "<div><b>Line " + l.n + ":</b> " + esc(t.tip) + "</div>" + hear(l.ar, l.audioKey, "Hear line " + l.n) + "</li>"; }).join("");
    const ids = u.sentenceIds;
    set('<nav class="lx-back"><a href="' + href("conversations") + '">← Conversations</a></nav><article><h2 class="lx-h" tabindex="-1" data-focus>Unit ' + (i + 1) + ": " + esc(u.title) + "</h2><p>" + unitBadge(rec) + "</p><p>" + esc(u.scenario) + '</p><p class="lx-note" role="note"><b>Register:</b> Modern Standard Arabic. ' + esc(u.registerNote) + " " + esc(a.msg) + '</p>' +
      '<h3 class="lx-h3">Dialogue</h3><ol class="lx-dlg">' + lines + '</ol><h3 class="lx-h3">Key vocabulary</h3><ul class="lx-exs">' + vocab + '</ul><div class="lx-panel"><h3>Practise this vocabulary</h3><p>Ten questions on the words from this conversation. Your answers schedule each word for review.</p><button type="button" class="lx-btn lx-btn-alt" data-action="cvocab" data-id="' + u.id + '">Practise key vocabulary</button></div>' + dia +
      '<h3 class="lx-h3">Sentence completion</h3><div class="lx-panel"><p>Complete and type ' + ids.length + " sentence" + (ids.length === 1 ? "" : "s") + ' from this dialogue. Your answers schedule these sentences for review.</p><button type="button" class="lx-btn lx-btn-alt" data-action="csent" data-id="' + u.id + '">Practise the sentences</button></div>' +
      '<h3 class="lx-h3">Speaking practice</h3><p>Listen to each line, then say it aloud two or three times. Turn on “Slow speech” at the top of the page for a slower voice. This course cannot hear you, so this activity is self-checked, and it does not count toward completing the unit.</p><ul class="lx-exs">' + speak + '</ul><p><button type="button" class="lx-btn lx-btn-alt" data-action="spoke" data-id="' + u.id + '"' + (rec && rec.spoke ? " disabled" : "") + ">" + (rec && rec.spoke ? "✓ Marked as practised aloud" : "I practised these lines aloud") + "</button></p>" +
      '<div class="lx-panel"><h3>Comprehension check</h3><p>Answer ' + u.questions.length + " questions about the dialogue. Score at least " + C.PASS_PERCENT + '% to complete this unit.</p><button type="button" class="lx-btn" data-action="ccheck" data-id="' + u.id + '">' + (rec && rec.tries ? "Try the check again" : "Start the check") + '</button></div>' +
      '<div class="lx-pager">' + (prev ? '<a class="lx-btn lx-btn-alt" href="' + href("conversation/" + prev.short) + '">← ' + esc(prev.title) + "</a>" : "<span></span>") + (next ? '<a class="lx-btn lx-btn-alt" href="' + href("conversation/" + next.short) + '">' + esc(next.title) + " →</a>" : '<a class="lx-btn lx-btn-alt" href="' + href("reading") + '">Reading comprehension →</a>') + "</div></article>");
  }
  function readingHome() {
    const sections = RD.LEVELS.map(function (lv) {
      const ps = RD.PASSAGES.filter(function (p) { return p.level === lv.n; });
      return '<h3 class="lx-h3">Level ' + lv.n + ": " + esc(lv.title) + '</h3><p class="lx-small">' + esc(lv.blurb) + '</p><div class="lx-cards">' + ps.map(function (p) { const rec = store.unit(p.id); return '<a class="lx-card" href="' + href("reading/" + p.id) + '"><span class="lx-badge lx-d-' + (lv.n === 1 ? "easy" : lv.n === 4 ? "hard" : "medium") + '">Level ' + lv.n + (p.marks ? "" : " · no harakat at first") + "</span><h3>" + esc(p.title) + "</h3><p>" + p.lines.length + " lines · " + p.questions.length + " questions</p><p>" + unitBadge(rec) + "</p></a>"; }).join("") + "</div>";
    }).join("");
    set('<nav class="lx-back"><a href="' + href("") + '">← Dashboard</a></nav><h2 class="lx-h" tabindex="-1" data-focus>Reading comprehension</h2><p>Read short Modern Standard Arabic texts, then answer questions to show you understood. The texts get a little harder at each level: levels 1–3 are fully vowelled, and level 4 starts without harakat (you can switch them on). Your best score for each text is saved; a text counts as read when you score at least ' + RD.PASS_PERCENT + '%.</p>' + sections);
  }
  let rdView = { marks: true, tr: false, en: false };
  function readingPage(id) {
    const p = RD.PASSAGES.find(function (x) { return x.id === id; }); if (!p) return notFound();
    const i = RD.PASSAGES.indexOf(p), prev = RD.PASSAGES[i - 1], next = RD.PASSAGES[i + 1], rec = store.unit(p.id), lv = RD.LEVELS[p.level - 1];
    rdView = { marks: p.marks, tr: false, en: false };
    const lines = p.lines.map(function (l) { return '<li class="lx-rd-l">' + (l.speaker ? '<span class="lx-dl-who">' + esc(l.speaker) + "</span>" : "") + '<span class="rd-v">' + ar(l.ar, "lx-rd-ar") + '</span><span class="rd-p">' + ar(l.plain, "lx-rd-ar") + '</span><div class="rd-tr"><b>' + esc(l.translit) + '</b></div><div class="rd-en">' + esc(l.en) + "</div>" + hear(l.ar, l.audioKey, "Hear line " + l.n) + "</li>"; }).join("");
    const gl = p.glossary.map(function (g) { return '<li class="lx-ex">' + ar(g.ar, "lx-ex-ar") + "<div><b>" + esc(g.translit) + "</b> — " + esc(g.en) + "</div></li>"; }).join("");
    set('<nav class="lx-back"><a href="' + href("reading") + '">← Reading comprehension</a></nav><article><h2 class="lx-h" tabindex="-1" data-focus>' + esc(p.title) + '</h2><p><span class="lx-badge lx-d-' + (p.level === 1 ? "easy" : p.level === 4 ? "hard" : "medium") + '">Level ' + p.level + ": " + esc(lv.title) + "</span> " + unitBadge(rec) + "</p><p>" + esc(p.intro) + ' All texts are Modern Standard Arabic.</p>' +
      '<div class="lx-toggles" role="group" aria-label="Reading aids"><button type="button" class="lx-hear" data-action="rd-toggle" data-what="marks" aria-pressed="' + p.marks + '">Harakat: ' + (p.marks ? "on" : "off") + '</button><button type="button" class="lx-hear" data-action="rd-toggle" data-what="tr" aria-pressed="false">Transliteration: off</button><button type="button" class="lx-hear" data-action="rd-toggle" data-what="en" aria-pressed="false">English: off</button></div>' +
      '<ol class="lx-rd' + (p.marks ? " is-marks" : "") + '" id="lxRd">' + lines + '</ol><p class="lx-note" role="note">' + esc(A.status().msg) + '</p><h3 class="lx-h3">Vocabulary explained</h3><ul class="lx-exs">' + gl + '</ul><div class="lx-panel"><h3>Comprehension questions</h3><p>Answer ' + p.questions.length + " questions about the text. Score at least " + RD.PASS_PERCENT + '% to count it as read. Try reading first, then switch on English only if you need it.</p><button type="button" class="lx-btn" data-action="rcheck" data-id="' + p.id + '">' + (rec && rec.tries ? "Try the questions again" : "Start the questions") + '</button></div>' +
      '<div class="lx-pager">' + (prev ? '<a class="lx-btn lx-btn-alt" href="' + href("reading/" + prev.id) + '">← ' + esc(prev.title) + "</a>" : "<span></span>") + (next ? '<a class="lx-btn lx-btn-alt" href="' + href("reading/" + next.id) + '">' + esc(next.title) + " →</a>" : "<span></span>") + "</div></article>");
    const ol = document.getElementById("lxRd"); if (ol) { ol.classList.toggle("is-marks", rdView.marks); }
  }
  function toggleReading(what, btn) {
    const ol = document.getElementById("lxRd"); if (!ol || !(what in rdView)) return;
    rdView[what] = !rdView[what]; ol.classList.toggle(what === "marks" ? "is-marks" : what === "tr" ? "show-tr" : "show-en", rdView[what]);
    btn.setAttribute("aria-pressed", String(rdView[what])); btn.textContent = { marks: "Harakat", tr: "Transliteration", en: "English" }[what] + ": " + (rdView[what] ? "on" : "off");
  }

  function startComprehension(kind, unit, ret, nextHref, nextLabel) {
    const again = function () { startComprehension(kind, unit, ret, nextHref, nextLabel); };
    startSession({ kind: kind, title: "Check: " + unit.title, unitId: unit.id, qs: R.buildComprehension(unit.questions), ret: ret, again: again, nextHref: nextHref, nextLabel: nextLabel });
  }
  function startUnitVocab(u) {
    const run = function () { startSession({ kind: "vocab", title: u.title + ": key vocabulary", qs: R.buildVocabSession({ ids: u.vocab, type: "mixed", count: 10, listen: A.canListen() }), ret: href("conversation/" + u.short), again: run }); }; run();
  }
  function startUnitSentences(u) {
    const run = function () { startSession({ kind: "sentence", title: u.title + ": sentences", qs: R.sentenceSession(u.sentenceIds), ret: href("conversation/" + u.short), again: run }); }; run();
  }
  function startMixedTopics(scope) {
    const topics = scope === "seen" ? V.TOPICS.filter(function (t) { return topicProgress(t.id).seen > 0; }).map(function (t) { return t.id; }) : V.TOPICS.map(function (t) { return t.id; });
    if (!topics.length) return vocabHome();
    const run = function () { startSession({ kind: "vocab", title: "Mixed-topic review", qs: R.buildMixedTopicSession({ topics: topics, count: 12, entries: store.data.srs, dueIds: store.dueIds(CATALOG), listen: A.canListen() }), ret: href("vocab"), again: run }); }; run();
  }

  function route() {
    session = null; store.load(); const p = (location.hash || "").replace(/^#\/?/, "").split("/");
    if (p[0] === "letter" && p[1]) letter(p[1]); else if (p[0] === "harakat" && p[1]) harakat(p[1]); else if (p[0] === "practice") practice(); else if (p[0] === "read") read(); else if (p[0] === "vocab") (p[1] ? topicPage(p[1]) : vocabHome()); else if (p[0] === "patterns") (p[1] ? patternPage(p[1]) : patternsHome()); else if (p[0] === "review") reviewPage(); else if (p[0] === "journey") journeyPage(); else if (p[0] === "conversations") conversationsHome(); else if (p[0] === "conversation" && p[1]) conversationPage(p[1]); else if (p[0] === "reading") (p[1] ? readingPage(p[1]) : readingHome()); else home();
  }
  function onAction(e) {
    const b = e.target.closest("[data-action]"); if (!b || b.disabled) return; const a = b.dataset.action;
    if (a === "speak") A.speak(b.dataset.text, b.dataset.key);   // success/failure is reported through the "learn-audio" events (status line + live region)
    else if (a === "check") { const id = b.dataset.id; if (id.indexOf("letter-") === 0) startSession({ kind: "check", title: "Quick check: " + byId[id.slice(7)].nameEn, lessonId: id, qs: E.quickCheck(id.slice(7)), ret: lessonHref(id) }); else { const h = D.HARAKAT_LESSONS.find(function (x) { return x.id === id; }); startSession({ kind: "check", title: "Quick check: " + h.title, lessonId: id, qs: E.harakatCheck(h), ret: lessonHref(id) }); } }
    else if (a === "practice") startSession({ kind: "practice", title: b.dataset.type === "mixed" ? "Mixed practice" : TYPE_LABELS[b.dataset.type], qs: E.buildSession({ count: 10, types: b.dataset.type === "mixed" ? null : [b.dataset.type] }), ret: href("practice"), type: b.dataset.type });
    else if (a === "practice-weak") { const w = store.summary().review; if (w.length) startSession({ kind: "practice", title: "Weak letters", qs: E.buildSession({ count: 10, weakIds: w }), ret: href("practice"), type: "weak" }); }
    else if (a === "stage") startStage(b.dataset.id);
    else if (a === "vpractice") startVocab(b.dataset.topic, b.dataset.type);
    else if (a === "ppractice") startPattern(b.dataset.id);
    else if (a === "review-start") startReview();
    else if (a === "mixed") startMixedTopics(b.dataset.scope);
    else if (a === "cvocab") { const u = C.UNITS.find(function (x) { return x.id === b.dataset.id; }); if (u) startUnitVocab(u); }
    else if (a === "csent") { const u = C.UNITS.find(function (x) { return x.id === b.dataset.id; }); if (u) startUnitSentences(u); }
    else if (a === "ccheck") { const u = C.UNITS.find(function (x) { return x.id === b.dataset.id; }); if (u) { const nx = C.UNITS[C.UNITS.indexOf(u) + 1]; startComprehension("conversation", u, href("conversation/" + u.short), nx ? href("conversation/" + nx.short) : href("reading"), nx ? "Next: " + nx.title : "Reading comprehension"); } }
    else if (a === "rcheck") { const p = RD.PASSAGES.find(function (x) { return x.id === b.dataset.id; }); if (p) { const nx = RD.PASSAGES[RD.PASSAGES.indexOf(p) + 1]; startComprehension("reading-comp", p, href("reading/" + p.id), nx ? href("reading/" + nx.id) : href("journey"), nx ? "Next: " + nx.title : "Learning path"); } }
    else if (a === "rd-toggle") toggleReading(b.dataset.what, b);
    else if (a === "spoke") { if (store.markSpoke(b.dataset.id)) { b.disabled = true; b.textContent = "✓ Marked as practised aloud"; } }
    else if (a === "answer") answer(b.dataset.v);
    else if (a === "typecheck") typeCheck();
    else if (a === "next") advance();
    else if (a === "retry") { const s = session; if (s.again) { s.again(); return; } if (s.vtopic) startVocab(s.vtopic, s.vtype); else if (s.pid) startPattern(s.pid); else if (s.lessonId) { const id = s.lessonId; if (id.indexOf("letter-") === 0) startSession({ kind: "check", title: s.title, lessonId: id, qs: E.quickCheck(id.slice(7)), ret: s.ret }); else startSession({ kind: "check", title: s.title, lessonId: id, qs: E.harakatCheck(D.HARAKAT_LESSONS.find(function (x) { return x.id === id; })), ret: s.ret }); } else if (s.stage) startStage(s.stage); else if (s.type === "weak") { const w = store.summary().review; startSession({ kind: "practice", title: s.title, qs: E.buildSession({ count: 10, weakIds: w.length ? w : null }), ret: s.ret, type: "weak" }); } else startSession({ kind: "practice", title: s.title, qs: E.buildSession({ count: 10, types: s.type === "mixed" ? null : [s.type] }), ret: s.ret, type: s.type }); }
    else if (a === "reset") { if (window.confirm("Reset all Learn Arabic progress on this device? Completed lessons, scores, your review schedule and your streak will be erased. This cannot be undone.")) { store.reset(); home(); } }
  }
  root.addEventListener("click", onAction);
  const typePanel = document.getElementById("lxTypePanel"); if (typePanel) typePanel.addEventListener("click", onAction);
  if (dock) dock.onSubmit(function () { if (!session || !isTypingQ() || !usingDock()) return; if (!session.answered) typeCheck(); else advance(); });
  root.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "lxType") { e.preventDefault(); if (session && !session.answered) typeCheck(); else if (session) advance(); } });
  const speedBtn = document.getElementById("lxSpeedBtn"), speechStatus = document.getElementById("lxSpeechStatus"), speechMsg = document.getElementById("lxSpeechMsg");
  function renderSpeech() {
    if (!speechStatus) return; const a = A.status(), slow = A.getSpeed() === "slow";
    speechStatus.classList.remove("is-error"); speechStatus.textContent = a.msg;
    if (speedBtn) { speedBtn.hidden = !a.supported; speedBtn.setAttribute("aria-pressed", String(slow)); speedBtn.textContent = "Slow speech: " + (slow ? "on" : "off"); }
  }
  if (speedBtn) speedBtn.addEventListener("click", function () { A.toggleSpeed(); renderSpeech(); });
  document.addEventListener("learn-voices", renderSpeech);
  document.addEventListener("learn-audio", function (e) {
    const d = e.detail || {}; if (!speechStatus) return;
    if (d.type === "error") { speechStatus.classList.add("is-error"); speechStatus.textContent = d.message; if (speechMsg) speechMsg.textContent = d.message; }
    else if (d.type === "start") { renderSpeech(); if (speechMsg) speechMsg.textContent = ""; }
  });
  renderSpeech();
  window.addEventListener("hashchange", route);
  route();
})();
