/* Learn Arabic — progress store. localStorage with safe fallbacks; no accounts, no network. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./srs.js"));
  else root.LearnProgress = factory(root.LearnData, root.LearnSRS);
})(typeof self !== "undefined" ? self : this, function (D, S) {
  "use strict";
  // The storage KEY keeps its original name so existing learners keep their data; the schema version lives inside the data (v: 2).
  const KEY = "ak-learn-progress-v1", VERSION = 2, MAX_SESSIONS = 60, MAX_DAYS = 400, MAX_SRS = 2000;
  const SRS_ID = /^[a-z0-9:_-]{1,40}$/;
  const LESSON_IDS = D.LETTERS.map(function (l) { return "letter-" + l.id; }).concat(D.HARAKAT_LESSONS.map(function (h) { return h.id; }));

  function empty() { return { v: VERSION, lessons: {}, stats: {}, sessions: [], days: [], srs: {} }; }
  const isObj = function (x) { return x && typeof x === "object" && !Array.isArray(x); };
  const nn = function (x) { return typeof x === "number" && isFinite(x) && x >= 0 ? Math.floor(x) : 0; };
  function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  // Accept only well-formed pieces of stored data; drop everything else.
  // nowMs is only used to date migration seeds when a v1 lesson has no usable completion time.
  function sanitize(raw, nowMs) {
    const out = empty();
    if (!isObj(raw)) return out;
    if (isObj(raw.lessons)) LESSON_IDS.forEach(function (id) { if (isObj(raw.lessons[id])) out.lessons[id] = { at: nn(raw.lessons[id].at), best: Math.min(100, nn(raw.lessons[id].best)) }; });
    if (isObj(raw.stats)) D.LETTERS.forEach(function (l) { const s = raw.stats[l.id]; if (isObj(s) && (nn(s.c) || nn(s.w))) out.stats[l.id] = { c: nn(s.c), w: nn(s.w) }; });
    if (Array.isArray(raw.sessions)) out.sessions = raw.sessions.filter(isObj).slice(-MAX_SESSIONS).map(function (s) { return { at: nn(s.at), kind: String(s.kind || "practice").slice(0, 20), correct: nn(s.correct), total: nn(s.total) }; });
    if (Array.isArray(raw.days)) out.days = raw.days.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).slice(-MAX_DAYS);
    // Review schedule (schema v2): keep only well-formed entries.
    if (isObj(raw.srs)) Object.keys(raw.srs).slice(0, MAX_SRS).forEach(function (id) {
      const e = raw.srs[id]; if (!SRS_ID.test(id) || !isObj(e)) return;
      const b = nn(e.b), d = nn(e.d), l = nn(e.l);
      if (b < 1 || b > S.MAX_BOX || d > 100000 || l > 100000) return;
      out.srs[id] = { b: b, d: d, n: nn(e.n), w: nn(e.w), l: l };
    });
    // MIGRATION v1 -> v2: lessons the learner really passed become review items (box 2) so their progress is not wasted.
    if (!raw.v || raw.v < 2) Object.keys(out.lessons).forEach(function (id) {
      if (id.indexOf("letter-") !== 0 || out.srs["letter:" + id.slice(7)]) return;
      const day = S.dayNumber(out.lessons[id].at > 0 ? out.lessons[id].at : (nowMs || Date.now()));
      out.srs["letter:" + id.slice(7)] = { b: 2, d: day + S.INTERVALS[2], n: 1, w: 0, l: day };
    });
    return out;
  }

  function createStore(storage, now) {
    now = now || Date.now;
    let persistent = false, data = empty();
    function probe() { try { if (!storage) return false; storage.setItem(KEY + ".t", "1"); storage.removeItem(KEY + ".t"); return true; } catch (e) { return false; } }
    function load() {
      persistent = probe();
      if (persistent) { try { const s = storage.getItem(KEY); data = s ? sanitize(JSON.parse(s), now()) : empty(); } catch (e) { data = empty(); } }
      heal();
      return data;
    }
    // Re-read storage before every change so a second open tab cannot overwrite this tab's progress (and vice versa).
    function refresh() { if (!persistent) return; try { const s = storage.getItem(KEY); data = s ? sanitize(JSON.parse(s), now()) : empty(); heal(); } catch (e) { /* keep in-memory data */ } }
    function save() { if (!persistent) return false; try { storage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { persistent = false; return false; } }
    function touchDay() { const k = dayKey(now()); if (data.days.indexOf(k) === -1) { data.days.push(k); data.days = data.days.slice(-MAX_DAYS); } }

    // answers: [{letterId|null, correct}]
    function recordSession(kind, answers) {
      refresh();
      const correct = answers.filter(function (a) { return a.correct; }).length;
      answers.forEach(function (a) { if (!a.letterId || !D.LETTERS.some(function (l) { return l.id === a.letterId; })) return; const s = data.stats[a.letterId] || (data.stats[a.letterId] = { c: 0, w: 0 }); if (a.correct) s.c++; else s.w++; });
      data.sessions.push({ at: now(), kind: kind, correct: correct, total: answers.length });
      data.sessions = data.sessions.slice(-MAX_SESSIONS);
      touchDay(); save();
      return { correct: correct, total: answers.length };
    }
    // A lesson counts as complete only when its check is passed (>= 2 of 3 correct).
    function completeLesson(id, percent) {
      if (LESSON_IDS.indexOf(id) === -1) return false;
      refresh();
      const prev = data.lessons[id];
      data.lessons[id] = { at: prev ? prev.at : now(), best: Math.max(prev ? prev.best : 0, Math.min(100, nn(percent))) };
      touchDay(); save(); return true;
    }
    // Calendar-day arithmetic (not "minus 24h"), so a 23/25-hour daylight-saving day cannot skip or repeat a date.
    function prevDay(k) { const p = k.split("-").map(Number); return dayKey(new Date(p[0], p[1] - 1, p[2] - 1).getTime()); }
    function streak() {
      const set = {}; data.days.forEach(function (d) { set[d] = true; });
      let k = dayKey(now()); if (!set[k]) k = prevDay(k);
      let n = 0; while (set[k]) { n++; k = prevDay(k); }
      return n;
    }
    function needsReview() {
      return D.LETTERS.filter(function (l) { const s = data.stats[l.id]; return s && s.c + s.w >= 2 && s.c / (s.c + s.w) < 0.7; })
        .sort(function (a, b) { const sa = data.stats[a.id], sb = data.stats[b.id]; return sa.c / (sa.c + sa.w) - sb.c / (sb.c + sb.w); }).map(function (l) { return l.id; });
    }
    function level() {
      const letters = D.LETTERS.filter(function (l) { return data.lessons["letter-" + l.id]; }).length;
      const harakat = D.HARAKAT_LESSONS.filter(function (h) { return data.lessons[h.id]; }).length;
      if (letters === 28 && harakat === D.HARAKAT_LESSONS.length) return { n: 4, name: "Reading ready" };
      if (letters === 28) return { n: 3, name: "Alphabet complete" };
      if (letters >= 10) return { n: 2, name: "Letter learner" };
      return { n: 1, name: "Getting started" };
    }
    function summary() {
      const done = LESSON_IDS.filter(function (id) { return data.lessons[id]; });
      let c = 0, w = 0; Object.keys(data.stats).forEach(function (k) { c += data.stats[k].c; w += data.stats[k].w; });
      return { completed: done.length, total: LESSON_IDS.length, correct: c, wrong: w, accuracy: c + w ? Math.round(c / (c + w) * 100) : null,
        streak: streak(), practicedToday: data.days.indexOf(dayKey(now())) !== -1, review: needsReview(), level: level(), sessions: data.sessions.length, persistent: persistent };
    }
    function isDone(id) { return !!data.lessons[id]; }
    /* ---- spaced repetition: results are recorded per ITEM from real answers; the schedule is derived by LearnSRS ---- */
    const today = function () { return S.dayNumber(now()); };
    function reviewAnswers(list) {
      refresh(); heal(); const t = today(); let n = 0;
      list.forEach(function (a) { if (!a || !SRS_ID.test(String(a.id))) return; data.srs[a.id] = S.grade(data.srs[a.id], !!a.correct, t); n++; });
      if (n) { touchDay(); save(); }
      return n;
    }
    // CLOCK DAMAGE: a due date impossibly far ahead (the clock was set forward and later corrected) is repaired ONCE and the repair is
    // saved, so the item returns after its normal interval. (Repairing on every read would push it forward again each day, forever.)
    function heal() {
      const t = today(); let changed = false;
      Object.keys(data.srs).forEach(function (id) { const r = S.repair(data.srs[id], t); if (r !== data.srs[id]) { data.srs[id] = r; changed = true; } });
      if (changed) save();
    }
    const srsSummary = function (catalog) { heal(); return Object.assign({ today: today() }, S.summary(data.srs, today(), catalog)); };
    const dueIds = function (catalog) { heal(); return S.dueIds(data.srs, today(), catalog); };
    function reset() { data = empty(); if (persistent) { try { storage.removeItem(KEY); } catch (e) { /* ignore */ } } }
    return { load: load, save: save, reviewAnswers: reviewAnswers, srsSummary: srsSummary, dueIds: dueIds, srsEntry: function (id) { return data.srs[id] ? Object.assign({}, data.srs[id]) : null; }, today: today, recordSession: recordSession, completeLesson: completeLesson, summary: summary, isDone: isDone, reset: reset, get data() { return data; }, get persistent() { return persistent; } };
  }
  return { KEY, LESSON_IDS, createStore, sanitize, dayKey };
});
