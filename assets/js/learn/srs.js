/* Learn Arabic — spaced-repetition scheduler (pure logic, no DOM, no storage).
   A Leitner-box scheme driven by REAL answers. Days are calendar-day numbers (days since 1970-01-01 in the learner's LOCAL calendar),
   so a 23- or 25-hour daylight-saving day can never skip or repeat a due date. Every function takes `today` explicitly: inject any clock. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LearnSRS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MAX_BOX = 6;
  const INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14, 6: 30 };   // days until the next review, by the box the item is NOW in
  const MASTERED_BOX = 5;
  const MAX_FUTURE_DAYS = 60;                                    // a due date further away than this is treated as clock damage

  // Local calendar day number: built from the local Y/M/D fields, then converted via UTC, so it is DST-proof.
  function dayNumber(ms) { const d = new Date(ms); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function dayKey(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }

  /* entry: { b: box 1..6, d: due day, n: answers, w: wrong answers, l: last day answered } or undefined for a never-seen item.
     Returns a NEW entry; never mutates its input. */
  function grade(entry, correct, today) {
    const first = !entry;
    const e = entry ? { b: entry.b, d: entry.d, n: entry.n, w: entry.w, l: entry.l } : { b: 0, d: today, n: 0, w: 0, l: -1 };
    e.n++;
    if (!correct) { e.w++; e.b = 1; e.d = today + INTERVALS[1]; e.l = today; return e; }            // a miss always drops to box 1, due tomorrow
    if (!first && e.l === today) { return e; }                                                      // repeat answers on the same day never inflate the box
    e.b = first ? 2 : Math.min(MAX_BOX, e.b + 1); e.d = today + INTERVALS[e.b]; e.l = today;
    return e;
  }
  // Repairs a due date that is impossibly far in the future (for example the clock was set ahead, then corrected).
  function repair(entry, today) {
    if (!entry) return entry;
    return entry.d > today + MAX_FUTURE_DAYS ? Object.assign({}, entry, { d: today + INTERVALS[entry.b] }) : entry;
  }
  const isDue = (entry, today) => !!entry && repair(entry, today).d <= today;

  // Due ids, most overdue first, then lowest box first; only ids present in `catalog` (so retired items never appear).
  function dueIds(entries, today, catalog) {
    const allow = catalog ? new Set(catalog) : null;
    return Object.keys(entries).filter(id => (!allow || allow.has(id)) && isDue(entries[id], today))
      .sort((a, b) => repair(entries[a], today).d - repair(entries[b], today).d || entries[a].b - entries[b].b || (a < b ? -1 : 1));
  }
  function summary(entries, today, catalog) {
    const allow = catalog ? new Set(catalog) : null, ids = Object.keys(entries).filter(id => !allow || allow.has(id));
    let mastered = 0, reviewedToday = 0, next = null;
    ids.forEach(id => { const e = repair(entries[id], today); if (e.b >= MASTERED_BOX) mastered++; if (e.l === today) reviewedToday++; if (e.d > today && (next === null || e.d < next)) next = e.d; });
    const due = dueIds(entries, today, catalog).length;
    return { learning: ids.length, due, mastered, reviewedToday, nextDueDay: due ? today : next, nextInDays: due ? 0 : next === null ? null : next - today };
  }
  return { MAX_BOX, INTERVALS, MASTERED_BOX, MAX_FUTURE_DAYS, dayNumber, dayKey, grade, repair, isDue, dueIds, summary };
});
