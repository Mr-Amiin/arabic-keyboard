// Run in a daylight-saving timezone so the date arithmetic is exercised deterministically.
process.env.TZ = "America/New_York";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const P = createRequire(import.meta.url)("../../assets/js/learn/progress.js");
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const practiceOn = (s, setNow, ...dates) => dates.forEach(d => { setNow(new Date(...d).getTime()); s.recordSession("practice", [{ letterId: "ba", correct: true }]); });

test("REGRESSION streak survives the spring-forward (23-hour) day", () => {
  let t = 0; const s = P.createStore(mem(), () => t); s.load();
  practiceOn(s, v => (t = v), [2026, 2, 7, 12], [2026, 2, 8, 12]);       // Sat + Sun (DST starts Sun 8 Mar 2026)
  t = new Date(2026, 2, 9, 0, 30).getTime();                              // Mon 00:30, not practiced yet
  assert.equal(s.summary().streak, 2);
});
test("REGRESSION streak survives the fall-back (25-hour) day", () => {
  let t = 0; const s = P.createStore(mem(), () => t); s.load();
  practiceOn(s, v => (t = v), [2026, 9, 31, 12], [2026, 10, 1, 12]);      // Sat + Sun (DST ends Sun 1 Nov 2026)
  t = new Date(2026, 10, 2, 23, 30).getTime();
  assert.equal(s.summary().streak, 2);
  t = new Date(2026, 10, 4, 12).getTime(); assert.equal(s.summary().streak, 0, "a missed day breaks the streak");
});
test("streak counts a long consecutive run across a DST change", () => {
  let t = 0; const s = P.createStore(mem(), () => t); s.load();
  for (let d = 1; d <= 12; d++) practiceOn(s, v => (t = v), [2026, 2, d, 9]);
  t = new Date(2026, 2, 12, 22).getTime(); assert.equal(s.summary().streak, 12);
});
