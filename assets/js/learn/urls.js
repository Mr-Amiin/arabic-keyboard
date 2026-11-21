/* Learn Arabic — lesson URL map (pure data, no DOM).

   ONE source of truth for the individual lesson URLs. It is derived entirely from the existing course data modules, so it
   cannot drift from the course:  - the browser app (learn/app.js) uses it to turn a route such as "letter/alif" into the
   crawlable page URL "/learn-arabic/letters/alif/";  - tools/build-learn-pages.mjs uses the very same module (via require)
   to decide which static pages to generate and where to write them.

   Only routes that are real lessons with substantial content get a URL. Practice menus, the daily review, the learning
   path and the typing drills depend on the learner's own progress (or are short drills) and stay inside the dashboard. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./vocab-data.js"), require("./conversations.js"), require("./reading.js"));
  else root.LearnUrls = factory(root.LearnData, root.LearnVocab, root.LearnConversations, root.LearnReading);
})(typeof self !== "undefined" ? self : this, function (D, V, C, RD) {
  "use strict";
  const PREFIX = "/learn-arabic/";

  // Lower-case ASCII slug: accents are folded (“café” -> cafe), apostrophes are dropped (“Yusuf’s” -> yusufs),
  // everything else non-alphanumeric becomes one hyphen.
  const slug = function (s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };
  // The two harakat lessons each teach three marks, so their URLs name the marks they cover.
  const HARAKAT_SLUGS = { "harakat-1": "fatha-kasra-damma", "harakat-2": "sukun-shadda-tanween" };

  const entries = [];
  const add = function (kind, key, category, seg) {
    entries.push({ kind: kind, key: key, route: kind + "/" + key, category: category, slug: seg, path: category + "/" + seg + "/", url: PREFIX + category + "/" + seg + "/" });
  };

  D.LETTERS.forEach(function (l) { add("letter", l.id, "letters", l.id); });
  D.HARAKAT_LESSONS.forEach(function (h) { add("harakat", h.id, "harakat", HARAKAT_SLUGS[h.id] || slug(h.title)); });
  V.TOPICS.forEach(function (t) { add("vocab", t.id, "vocabulary", t.id); });
  C.UNITS.forEach(function (u) { add("conversation", u.short, "conversations", slug(u.title)); });
  RD.PASSAGES.forEach(function (p) { add("reading", p.id, "reading", slug(p.title)); });

  const byRoute = {}, byUrl = {};
  entries.forEach(function (e) { byRoute[e.route] = e; byUrl[e.url] = e; });

  return {
    PREFIX: PREFIX,
    slug: slug,
    entries: entries,
    byRoute: byRoute,
    byUrl: byUrl,
    // "letter/alif" -> "/learn-arabic/letters/alif/"; null for any route that has no individual page.
    pathFor: function (route) { const e = byRoute[route]; return e ? e.url : null; }
  };
});
