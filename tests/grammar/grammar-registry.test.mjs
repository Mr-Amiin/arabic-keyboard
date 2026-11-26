import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, G, learn, lesson } from "./fixtures.mjs";

const URLS_SRC = fs.readFileSync(path.join(ROOT, "assets/js/learn/urls.js"), "utf8");
// Runs the REAL urls.js the way the browser does (globals, no module system) with an injected grammar module.
const loadUrls = (grammar) => {
  const self = { LearnData: learn("data.js"), LearnVocab: learn("vocab-data.js"), LearnConversations: learn("conversations.js"), LearnReading: learn("reading.js"), LearnGrammar: grammar };
  vm.runInNewContext(URLS_SRC, { self });
  return self.LearnUrls;
};
// Values created inside the vm context belong to another realm; round-trip them so deepStrictEqual compares data, not prototypes.
const plain = (v) => JSON.parse(JSON.stringify(v));
const grammarOf = (records) => ({ ERRORS: G.validateCatalogue(records).errors, LESSONS: records });

const U = learn("urls.js");
const EXPECTED = { letters: 28, harakat: 2, vocabulary: 16, conversations: 8, reading: 8 };

test("the six categories are recognised and grammar is the sixth", () => {
  assert.deepEqual(U.CATEGORIES, ["letters", "harakat", "vocabulary", "conversations", "reading", "grammar"]);
});

test("an empty grammar catalogue contributes zero URLs; the existing five categories are unchanged", () => {
  assert.equal(U.entries.length, 62);
  assert.equal(U.entries.filter((e) => e.category === "grammar").length, 0);
  for (const [cat, n] of Object.entries(EXPECTED)) {
    const es = U.entries.filter((e) => e.category === cat);
    assert.equal(es.length, n, cat);
    for (const e of es) assert.match(e.url, new RegExp(`^/learn-arabic/${cat}/[a-z0-9]+(?:-[a-z0-9]+)*/$`));
  }
  // the exact lesson URLs are the ones already published in the sitemap
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const published = [...sitemap.matchAll(/<loc>https:\/\/www\.arabic-keyboard\.live(\/learn-arabic\/[^/<]+\/[^/<]+\/)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(U.entries.map((e) => e.url).sort(), published);
  // the same registry built with an explicitly empty grammar module is identical to the default one
  assert.deepEqual(plain(loadUrls(grammarOf([])).entries.map((e) => e.url)), U.entries.map((e) => e.url));
});

test("grammar lessons get /learn-arabic/grammar/{slug}/ from validated catalogue data", () => {
  const R = loadUrls(grammarOf([lesson(), lesson({ id: "gram-fixture-two", slug: "fixture-two" })]));
  assert.equal(R.entries.length, 64);
  const g = R.entries.filter((e) => e.category === "grammar");
  assert.deepEqual(plain(g.map((e) => e.url)), ["/learn-arabic/grammar/fixture-one/", "/learn-arabic/grammar/fixture-two/"]);
  assert.deepEqual(plain(g[0]), { kind: "grammar", key: "gram-fixture-one", route: "grammar/gram-fixture-one", category: "grammar", slug: "fixture-one", path: "grammar/fixture-one/", url: "/learn-arabic/grammar/fixture-one/" });
  assert.equal(R.pathFor("grammar/gram-fixture-two"), "/learn-arabic/grammar/fixture-two/");
  assert.equal(R.byUrl["/learn-arabic/grammar/fixture-one/"].key, "gram-fixture-one");
  // existing URLs are untouched by adding grammar
  assert.deepEqual(plain(R.entries.filter((e) => e.category !== "grammar").map((e) => e.url)), U.entries.map((e) => e.url));
});

test("unknown grammar IDs and slugs do not resolve to a lesson page", () => {
  const R = loadUrls(grammarOf([lesson()]));
  for (const route of ["grammar/gram-ghost", "grammar/fixture-one", "grammar/", "grammar", "grammar/__proto__", "grammar/constructor", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(R.pathFor(route), null, route);
  }
  assert.equal(R.byUrl["/learn-arabic/grammar/ghost/"], undefined);
  for (const route of ["grammar/gram-ghost", "grammar/gram-fixture-one"]) assert.equal(U.pathFor(route), null, "not in the shipped (empty) registry: " + route);
});

test("a grammar slug equal to an existing lesson slug does not collide (different category)", () => {
  const R = loadUrls(grammarOf([lesson({ slug: "alif" })]));
  assert.equal(R.pathFor("letter/alif"), "/learn-arabic/letters/alif/");
  assert.equal(R.pathFor("grammar/gram-fixture-one"), "/learn-arabic/grammar/alif/");
});

test("duplicate grammar routes or URLs are rejected at build time", () => {
  // duplicate id (route) and duplicate slug (URL), forced past the catalogue validator to prove the registry guards itself
  assert.throws(() => loadUrls({ ERRORS: [], LESSONS: [lesson(), lesson({ slug: "other" })] }), /Duplicate lesson route or URL: grammar\/gram-fixture-one/);
  assert.throws(() => loadUrls({ ERRORS: [], LESSONS: [lesson(), lesson({ id: "gram-fixture-two" })] }), /Duplicate lesson route or URL: grammar\/gram-fixture-two/);
  // and the validator itself reports the same duplicates, so a real catalogue fails earlier with a readable error
  assert.throws(() => loadUrls(grammarOf([lesson(), lesson()])), /Grammar catalogue is invalid.*duplicate lesson ID/);
});

test("an invalid grammar catalogue stops the build instead of silently dropping lessons", () => {
  assert.throws(() => loadUrls(grammarOf([lesson({ slug: "Bad Slug" })])), /Grammar catalogue is invalid.*slug/);
  assert.throws(() => loadUrls(grammarOf([lesson({ vocabRefs: ["nope"] })])), /Grammar catalogue is invalid.*vocabulary item ID/);
});

test("when grammar.js is not loaded (browser pages today) the registry still works with no grammar URLs", () => {
  const R = loadUrls(undefined);
  assert.equal(R.entries.length, 62);
  assert.equal(R.pathFor("letter/alif"), "/learn-arabic/letters/alif/");
});

test("registry-level guarantee: the real grammar module's validated lessons are the only grammar source", () => {
  assert.deepEqual(U.entries.filter((e) => e.kind === "grammar").map((e) => e.key), G.LESSONS.map((x) => x.id));
});
