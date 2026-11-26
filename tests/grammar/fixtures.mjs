// Shared fixtures for the grammar foundation tests. The lesson below is TEST DATA ONLY: it is never written to the real catalogue
// (assets/js/learn/grammar.js stays empty) and it makes no claim about teacher review.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
export const learn = (f) => require(path.join(ROOT, "assets/js/learn", f));
export const G = learn("grammar.js");
export const V = learn("vocab-data.js");

export const vocabIds = V.ITEMS.slice(0, 3).map((i) => i.id);

export const lesson = (over = {}) => ({
  id: "gram-fixture-one",
  slug: "fixture-one",
  title: "Fixture lesson one",
  summary: "A fixture used only by the automated tests.",
  explanation: [{ heading: "Idea", text: "Explanatory fixture text." }],
  examples: [{ ar: "\u0643\u0650\u062A\u064E\u0627\u0628", translit: "kitab", en: "book", vocabRefs: [vocabIds[0]] }],
  mistakes: [{ text: "A fixture mistake.", ar: "\u0628\u064E\u064A\u0652\u062A" }],
  check: [{ prompt: "Fixture question?", choices: ["yes", "no"], answerIndex: 0, explain: "Because it is a fixture." }],
  vocabRefs: [vocabIds[1]],
  ...over
});

export const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === "object") deepFreeze(v); }); return Object.freeze(o); };
