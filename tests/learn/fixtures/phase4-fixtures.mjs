// Shared structural fixtures for the Phase 4 tests. Every Arabic string here is taken from EXISTING Phase 3 text (the eight reading passages and the conversation
// sentences) and only re-assembled; nothing is new course content and nothing here claims to be correct Arabic prose or good grammar.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = n => require("../../../assets/js/learn/" + n + ".js");
const E = L("engine"), X = L("exercises"), S = L("stories"), RD = L("reading"), C = L("conversations");

export const POOL = RD.PASSAGES.flatMap(p => p.lines);
export function rawStory(band, slug) {
  const b = S.BANDS[band - 1], per = Math.ceil(b.words[0] / b.lines[0]) + 1;
  const lines = []; let k = 0;
  for (let i = 0; i < b.lines[0]; i++) {
    let ar = [], tr = [], en = [], words = 0;
    while (words < per) { const l = POOL[k++ % POOL.length]; ar.push(l.ar); tr.push(l.translit); en.push(l.en); words += X.tokens(l.ar).length; }
    lines.push([ar.join(" "), tr.join(" "), en.join(" ")]);
  }
  const first = X.tokens(lines[0][0]).map(X.cleanTyped).filter(t => X.hasArabic(t)), second = X.tokens(lines[1][0]).map(X.cleanTyped).filter(t => X.hasArabic(t));
  const words = []; for (const w of first.concat(second)) if (!words.some(x => E.normalizeAr(x) === E.normalizeAr(w))) words.push(w);
  return { id: "story-s" + band + "-" + slug, band, title: "Structural fixture", theme: "test", intro: "Structural fixture assembled from existing text.", status: X.STATUS,
    lines, glossary: [{ ar: words[0], translit: "w1", en: "word one", vocabId: "num-0" }, { ar: words[1], translit: "w2", en: "word two" }, { ar: words[2], translit: "w3", en: "word three" }],
    vocab: ["num-0", "num-1"],
    questions: [
      { type: "mcq", prompt: "Pick the first.", options: ["one", "two", "three", "four"], explanation: "Because." },
      { type: "tf", prompt: "A statement.", answer: true, explanation: "Because." },
      { type: "match", prompt: "Match.", pairs: [[words[0], "first"], [words[1], "second"], [words[2], "third"]], arLeft: true, explanation: "Because." },
      { type: "short", prompt: "Copy a word.", accept: [words[3]], explanation: "Because." },
      { type: "vocab-context", prompt: "What does it mean here?", line: 1, word: words[0], options: ["a", "b", "c"], reviewItemId: "num-0", explanation: "Because." },
      { type: "mcq", prompt: "Pick the Arabic.", options: [words[0], words[1], words[2]], arabicOptions: true, explanation: "Because." },
      { type: "reveal", prompt: "In your own words.", model: "A model answer." }
    ] };
}
export const cleanLines = POOL.filter(l => { const t = X.tokens(l.ar).map(X.cleanTyped); return t.length >= 3 && t.length <= 5 && t.every(w => X.hasArabic(w) && !X.hasLatin(w) && !/\s/.test(w)) && !X.hasArabic(l.en); });
export const orderTokens = i => X.tokens(cleanLines[i].ar).map(X.cleanTyped);
export function rawOrder(id = "bw-1-01", i = 0) { const t = orderTokens(i), alt = t.slice(); [alt[0], alt[1]] = [alt[1], alt[0]]; return { id, set: 1, kind: "order", status: X.STATUS, translit: "x", en: "A structural fixture.", accept: [t, alt] }; }
export function rawComplete(id = "bw-2-01", sid = "snt-st-fixture-1") { const s = C.SENTENCE_ITEMS[0]; return { id, set: 2, kind: "complete", status: X.STATUS, sentenceId: sid, ar: s.ar, slot: s.slot, pool: s.pool.slice(), punct: s.punct, translit: s.translit, en: s.en }; }
export function rawMatch(id = "bw-1-02") {
  const pairs = [], seenL = new Set(), seenR = new Set();
  for (const l of cleanLines) { const t = X.tokens(l.ar).map(X.cleanTyped), a = E.normalizeAr(t[0]), b = E.normalizeAr(t.slice(1).join(" ")); if (seenL.has(a) || seenR.has(b)) continue; seenL.add(a); seenR.add(b); pairs.push([t[0], t.slice(1).join(" "), l.en]); if (pairs.length === 3) break; }
  return { id, set: 1, kind: "match", status: X.STATUS, translit: "x", en: "A structural fixture.", pairs };
}
