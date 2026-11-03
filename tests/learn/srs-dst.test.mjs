// Run in a daylight-saving timezone: review due dates must follow calendar days across 23- and 25-hour days.
process.env.TZ = "America/New_York";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../../assets/js/learn/progress.js"), S = require("../../assets/js/learn/srs.js"), R = require("../../assets/js/learn/review.js");
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
test("day numbers advance by exactly 1 across spring-forward and fall-back", () => {
  assert.equal(S.dayNumber(new Date(2026, 2, 9, 0, 30).getTime()) - S.dayNumber(new Date(2026, 2, 8, 23, 30).getTime()), 1);
  assert.equal(S.dayNumber(new Date(2026, 10, 2, 0, 30).getTime()) - S.dayNumber(new Date(2026, 10, 1, 23, 30).getTime()), 1);
  assert.equal(S.dayNumber(new Date(2026, 2, 9, 12).getTime()) - S.dayNumber(new Date(2026, 2, 7, 12).getTime()), 2);
});
test("REGRESSION a 2-day review set on 7 March is due exactly on 9 March (not an hour early or late) across the 23-hour day", () => {
  let t = new Date(2026, 2, 7, 12).getTime(); const s = P.createStore(mem(), () => t); s.load(); s.reviewAnswers([{ id: "num-1", correct: true }]);
  t = new Date(2026, 2, 8, 23, 59).getTime(); assert.deepEqual(s.dueIds(R.ALL_IDS), [], "still not due late on 8 March");
  t = new Date(2026, 2, 9, 0, 1).getTime(); assert.deepEqual(s.dueIds(R.ALL_IDS), ["num-1"], "due as soon as 9 March begins");
});
test("REGRESSION a review set on 31 October is due on 2 November across the 25-hour day, and 4-day intervals land on the right date", () => {
  let t = new Date(2026, 9, 31, 12).getTime(); const s = P.createStore(mem(), () => t); s.load(); s.reviewAnswers([{ id: "col-red", correct: true }]);
  t = new Date(2026, 10, 1, 23, 59).getTime(); assert.equal(s.dueIds(R.ALL_IDS).length, 0);
  t = new Date(2026, 10, 2, 0, 1).getTime(); assert.deepEqual(s.dueIds(R.ALL_IDS), ["col-red"]);
  s.reviewAnswers([{ id: "col-red", correct: true }]);        // box 3: +4 days from 2 Nov = 6 Nov
  t = new Date(2026, 10, 5, 23, 59).getTime(); assert.equal(s.dueIds(R.ALL_IDS).length, 0); t = new Date(2026, 10, 6, 0, 1).getTime(); assert.equal(s.dueIds(R.ALL_IDS).length, 1);
});
