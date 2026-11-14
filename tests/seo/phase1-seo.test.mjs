// Phase-1 SEO regression tests (no dependencies): node --test tests/seo/phase1-seo.test.mjs
// Guards: well-formed <head> tags, self-canonicals, sitemap consistency, the typing-test consolidation (static redirect page),
// social metadata, truthful JSON-LD, preserved homepage/Learn/typing-test metadata, and internal-link integrity.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.AK_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://www.arabic-keyboard.live";
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const one = (s, re) => (s.match(re) || [])[1];
const decode = (v) => v.replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const ldBlocks = (s) => [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const types = (s) => ldBlocks(s).map((b) => b["@type"]);
const bodyOf = (s) => s.split("</head>")[1].replace(/<script[\s\S]*?<\/script>/g, "");

const PAGES = {
  "index.html": { url: "/", schema: [], faq: true },
  "arabic-keyboard/index.html": { url: "/arabic-keyboard/", schema: ["BreadcrumbList", "WebApplication"], faq: true },
  "typing-test/index.html": { url: "/typing-test/", schema: ["BreadcrumbList", "WebApplication"], faq: false },
  "tashkeel/index.html": { url: "/tashkeel/", schema: ["BreadcrumbList", "WebApplication"], faq: true },
  "arabic-alphabet/index.html": { url: "/arabic-alphabet/", schema: ["BreadcrumbList"], faq: true },
  "learn-arabic/index.html": { url: "/learn-arabic/", schema: ["BreadcrumbList", "WebApplication"], faq: false },
  "editor/index.html": { url: "/editor/", schema: ["BreadcrumbList", "WebApplication"], faq: true },
  "calligraphy-editor/index.html": { url: "/calligraphy-editor/", schema: ["WebApplication"], faq: false },
};
const ROOT_PAGES = ["index.html", ...fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !["site", "tests", "docs", "assets", "workers", "node_modules", ".git"].includes(d.name) && fs.existsSync(path.join(ROOT, d.name, "index.html")))
  .map((d) => d.name + "/index.html")];
const sitemap = read("sitemap.xml");
const TT_DESC = '<meta name="description" content="اختبر سرعة طباعتك بالعربية ودقّتك مع مؤقت قابل للتخصيص (15، 30، 60 ثانية) ونتائج فورية لعدد الكلمات في الدقيقة والأخطاء.">';

test("1. every <meta>/<link> in every root page's <head> is a well-formed single tag, and there is exactly one description per page", () => {
  const tag = /^\s*<(?:meta|link)(?:\s+[\w:-]+(?:="[^"]*")?)+\s*\/?>\s*$/;
  for (const f of ROOT_PAGES) {
    const head = read(f).split("</head>")[0];
    for (const [i, line] of head.split("\n").entries()) if (/^\s*<(meta|link)\b/.test(line)) assert.match(line, tag, `${f}:${i + 1} malformed head tag: ${line.slice(0, 90)}`);
    // the legacy redirect page is deliberately minimal (no description); every real page has exactly one
    assert.equal((head.match(/<meta name="description"/g) || []).length, f === "arabic-typing-test/index.html" ? 0 : 1, `${f} description count`);
    assert.ok((head.match(/<meta name="keywords"/g) || []).length <= 1, `${f} keywords count`);
  }
});

test("2. typing-test: the description is exactly the approved tag and the separate keywords tag is preserved (also on the homepage and Tashkeel)", () => {
  const tt = read("typing-test/index.html");
  assert.ok(tt.split(/\r?\n/).includes(TT_DESC), "approved description tag, byte for byte");
  assert.match(tt, /<meta name="keywords" content="اختبار الطباعة, سرعة الطباعة, العربية, WPM, arabic typing test/);
  for (const f of ["index.html", "tashkeel/index.html"]) assert.match(read(f).split("</head>")[0], /<meta name="keywords" content="[^"]+">/, `${f} keywords preserved`);
});

test("3. every page: self-referencing canonical, og:url equals canonical, listed in the sitemap exactly once", () => {
  for (const [f, p] of Object.entries(PAGES)) {
    const s = read(f);
    assert.equal(one(s, /<link rel="canonical" href="([^"]+)"/), BASE + p.url, f);
    assert.equal(one(s, /<meta property="og:url" content="([^"]+)"/), BASE + p.url, f);
    assert.equal((s.match(/rel="canonical"/g) || []).length, 1, `${f} single canonical`);
    assert.equal(sitemap.split(`<loc>${BASE + p.url}</loc>`).length - 1, 1, `${f} sitemap`);
  }
});

test("4. homepage keeps its existing Arabic-first targeting: title, description, keywords and Arabic H1 are unchanged", () => {
  const home = read("index.html");
  assert.equal(decode(one(home, /<title>(.*?)<\/title>/)), "Arabic Keyboard Online – Type Arabic Free | لوحة المفاتيح العربية");
  assert.match(decode(one(home, /<meta name="description" content="([^"]+)"/)), /^Type Arabic online for free with our virtual Arabic keyboard/);
  const h1 = one(home, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<br>/g, " ");
  assert.match(h1, /اكتب بالعربية/); assert.doesNotMatch(h1, /[A-Za-z]/, "no English H1 on the Arabic page");
  assert.match(home, /<html lang="ar" dir="rtl">/);
  assert.match(home, /<article[^>]*lang="en" dir="ltr"[^>]*>\s*<h2>Free Arabic Keyboard Online/, "existing English block kept");
});

test("5. titles and descriptions are unique and non-empty; each page has one H1", () => {
  const titles = new Set(), descs = new Set();
  for (const f of Object.keys(PAGES)) {
    const s = read(f);
    assert.equal((bodyOf(s).match(/<h1[\s>]/g) || []).length, 1, `${f} H1 count`);
    const t = decode(one(s, /<title>(.*?)<\/title>/)), d = decode(one(s, /<meta name="description" content="([^"]*)"/));
    assert.ok(t.length > 10 && t.length <= 90, `${f} title length ${t.length}`);
    assert.ok(d.length > 40, `${f} description present`);
    assert.ok(!titles.has(t) && !descs.has(d), `${f} duplicate title/description`);
    titles.add(t); descs.add(d);
  }
});

test("6. Learn Arabic keeps its detailed description (not shortened) and the Learn V1/Phase 3 app is intact", () => {
  const learn = read("learn-arabic/index.html");
  const d = decode(one(learn, /<meta name="description" content="([^"]*)"/));
  for (const w of ["28 letters", "harakat", "over 300 words", "sentence patterns", "conversations", "reading comprehension", "spaced-repetition", "saved progress"]) assert.ok(d.includes(w), `description keeps "${w}"`);
  assert.match(read("assets/js/learn/app.js"), /href="\.\.\/typing-test\/">Typing test<\/a>/, "the app's related-tools link targets the canonical typing-test URL");
});

test("7. Calligraphy Editor: the existing single visible H1 is kept outside the editor toolbar; no toolbar H1 was introduced", () => {
  const cal = read("calligraphy-editor/index.html"), body = cal.split("</head>")[1];
  assert.equal((body.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(body, /<h1 class="page-h1">محرر الخط العربي – صمّم نصوصًا وزخارف عربية أونلاين<\/h1>/);
  assert.ok(body.indexOf('<h1 class="page-h1"') < body.indexOf('id="app"'), "H1 is outside #app");
  assert.doesNotMatch(cal, /id="app-title"/);
  assert.doesNotMatch(body, /bar-center[^>]*>\s*<h1/);
  assert.doesNotMatch(body, /clip:\s*rect\(0|width:1px;height:1px/, "no visually-hidden SEO block");
});

test("8. legacy /arabic-typing-test/ is a static redirect page (canonical, meta refresh, JS replace, visible link; no ads/analytics/noindex) and is not a normal sitemap page", () => {
  const s = read("arabic-typing-test/index.html");
  assert.equal(one(s, /<link rel="canonical" href="([^"]+)"/), BASE + "/typing-test/");
  assert.match(s, /<meta http-equiv="refresh" content="0; url=\/typing-test\/">/);
  assert.ok(s.includes('location.replace("/typing-test/")'));
  assert.match(s, /<body>\s*<p>[^<]*<a href="\/typing-test\/">[^<]+<\/a>/, "visible fallback link");
  assert.doesNotMatch(s, /adsbygoogle|googletagmanager|gtag\(|noindex/i);
  assert.equal(sitemap.includes("arabic-typing-test"), false);
  assert.ok(read("GENERATED_FILES.txt").includes("arabic-typing-test/index.html"), "the redirect page stays listed as a deployed file");
});

test("9. no unintended internal links to /arabic-typing-test/ anywhere in the deployed site (root pages, shared scripts, manifest, service worker)", () => {
  const files = [...ROOT_PAGES.filter((f) => f !== "arabic-typing-test/index.html"), "sw.js", "manifest.json",
    ...fs.readdirSync(path.join(ROOT, "assets/js")).filter((f) => f.endsWith(".js")).map((f) => "assets/js/" + f),
    ...fs.readdirSync(path.join(ROOT, "assets/js/learn")).filter((f) => f.endsWith(".js")).map((f) => "assets/js/learn/" + f)];
  const hits = files.filter((f) => /arabic-typing-test/.test(read(f)));
  assert.deepEqual(hits, [], "files still referencing the legacy URL: " + hits.join(", "));
});

test("10. typing-test keeps the real on-screen keyboard and its functionality", () => {
  const tt = read("typing-test/index.html");
  for (const k of ['id="typingKbPanel"', "tt-input", "keyboard-tool.js", 'id="typing-input"', "typing-test.js"]) assert.ok(tt.includes(k), k);
  assert.match(read("assets/js/typing-test-init.js"), /setAttribute\("inputmode", "none"\)/);
  assert.match(tt, /<h2>اختبار طباعة مخصّص للعربية الفصحى<\/h2>/);
  assert.doesNotMatch(tt.replace(/<script[\s\S]*?<\/script>/g, ""), /متنوعة/, "must not claim varied texts");
});

test("11. social metadata: og:*/twitter:* complete and consistent; og:image served with HTTP 200 as a real PNG of the declared size", async () => {
  const http = await import("node:http");
  for (const f of Object.keys(PAGES)) {
    const s = read(f);
    const get = (re) => one(s, re);
    const title = get(/<title>(.*?)<\/title>/), desc = get(/<meta name="description" content="([^"]*)"/), img = get(/<meta property="og:image" content="([^"]+)"/);
    assert.equal(get(/<meta property="og:title" content="([^"]*)"/), title, `${f} og:title`);
    assert.equal(get(/<meta property="og:description" content="([^"]*)"/), desc, `${f} og:description`);
    assert.equal(get(/<meta property="og:locale" content="([^"]+)"/), "ar_AR");
    assert.equal(get(/<meta name="twitter:card" content="([^"]+)"/), "summary");
    assert.equal(get(/<meta name="twitter:title" content="([^"]*)"/), title, `${f} twitter:title`);
    assert.equal(get(/<meta name="twitter:description" content="([^"]*)"/), desc, `${f} twitter:description`);
    assert.equal(get(/<meta name="twitter:image" content="([^"]+)"/), img);
    assert.ok(img.startsWith(BASE + "/") && fs.existsSync(path.join(ROOT, img.slice(BASE.length))), `${f} og:image file`);
  }
  const urls = new Set(Object.keys(PAGES).map((f) => one(read(f), /<meta property="og:image" content="([^"]+)"/)));
  const server = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": "image/png" }); fs.createReadStream(p).pipe(r); });
  await new Promise((ok) => server.listen(0, ok));
  try {
    for (const u of urls) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${new URL(u).pathname}`); assert.equal(res.status, 200, u);
      const buf = Buffer.from(await res.arrayBuffer()); assert.ok(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "valid PNG");
      assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [512, 512]);
    }
  } finally { server.close(); }
});

test("12. structured data: parses; no duplicate types or identical blocks; FAQPage kept exactly once where it existed (never added elsewhere); no invented ratings/reviews", () => {
  for (const [f, p] of Object.entries(PAGES)) {
    const s = read(f), t = types(s), raw = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const want of p.schema) assert.ok(t.includes(want), `${f} missing ${want}`);
    assert.equal(new Set(t).size, t.length, `${f}: duplicate JSON-LD @type`);
    assert.equal(new Set(raw).size, raw.length, `${f}: identical JSON-LD blocks`);
    assert.equal(t.filter((x) => x === "FAQPage").length, p.faq ? 1 : 0, `${f} FAQPage`);
    for (const b of ldBlocks(s)) assert.ok(!("aggregateRating" in b) && !("review" in b) && !("priceRange" in b), `${f} must not carry invented ratings`);
  }
});

test("13. BreadcrumbList mirrors the visible breadcrumb exactly; no BreadcrumbList where no breadcrumb is visible", () => {
  for (const [f, p] of Object.entries(PAGES)) {
    const s = read(f), bc = ldBlocks(s).find((b) => b["@type"] === "BreadcrumbList");
    if (!p.schema.includes("BreadcrumbList")) { assert.equal(bc, undefined, `${f}: no visible breadcrumb, so no BreadcrumbList`); assert.doesNotMatch(s, /<nav class="breadcrumbs/); continue; }
    const nav = one(s, /(<nav class="breadcrumbs[^>]*>[\s\S]*?<\/nav>)/);
    const visible = [...nav.matchAll(/<a href="[^"]+">([^<]+)<\/a>|<span class="current"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1] || m[2]);
    assert.deepEqual(bc.itemListElement.map((e) => e.name), visible, f);
    bc.itemListElement.forEach((e, i) => { assert.equal(e.position, i + 1); assert.ok(e.item.startsWith(BASE + "/")); });
    assert.equal(bc.itemListElement.at(-1).item, BASE + p.url, `${f} last crumb is the page`);
  }
});

test("14. WebApplication is truthful: url = canonical, description = the page's meta description, free, valid category, only supported properties", () => {
  const cats = new Set(["UtilitiesApplication", "EducationalApplication", "DesignApplication"]);
  for (const [f, p] of Object.entries(PAGES)) {
    if (!p.schema.includes("WebApplication")) continue;
    const s = read(f), w = ldBlocks(s).find((b) => b["@type"] === "WebApplication");
    assert.equal(w.url, BASE + p.url);
    assert.equal(w.description, decode(one(s, /<meta name="description" content="([^"]*)"/)));
    assert.ok(cats.has(w.applicationCategory), f);
    assert.equal(w.isAccessibleForFree, true);
    assert.deepEqual(w.offers, { "@type": "Offer", "price": "0", "priceCurrency": "USD" });
    assert.deepEqual(Object.keys(w).sort(), ["@context", "@type", "applicationCategory", "browserRequirements", "description", "inLanguage", "isAccessibleForFree", "name", "offers", "operatingSystem", "url"].sort());
  }
});

test("15. internal links on the 8 pages resolve to existing pages/files", () => {
  for (const f of Object.keys(PAGES)) {
    for (const m of bodyOf(read(f)).matchAll(/href="([^"#?]+)"/g)) {
      const h = m[1]; if (/^(https?:|mailto:|tel:|javascript:|data:|\/\/)/.test(h)) continue;
      const target = h.startsWith("/") ? path.join(ROOT, h) : path.normalize(path.join(path.dirname(path.join(ROOT, f)), h));
      assert.ok(fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, "index.html"))), `${f}: broken link ${h}`);
    }
  }
});

test("16. i18n dictionary: no duplicate keys; every data-i18n-html key used by the pages has an English entry", () => {
  const src = read("assets/js/i18n-en.js"); const seen = new Set(), dups = [];
  for (const line of src.split("\n")) { const m = line.match(/^ ("(?:[^"\\]|\\.)*"):\s*"(?:[^"\\]|\\.)*",?\s*$/); if (m) { if (seen.has(m[1])) dups.push(m[1]); seen.add(m[1]); } }
  assert.deepEqual(dups, []);
  const used = new Set(ROOT_PAGES.flatMap((f) => [...read(f).matchAll(/data-i18n-html="([^"]+)"/g)].map((m) => m[1])));
  for (const k of used) assert.ok(src.includes(`"${k}":`), `missing English HTML entry for ${k}`);
});

test("17. service worker: shell cache bumped to v20 so returning visitors receive the changed HTML; the separate vendor cache name is unchanged", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE_NAME = "arabic-keyboard-shell-v20";/);
  assert.match(sw, /const VENDOR_CACHE = "arabic-keyboard-vendor-v1";/);
  assert.ok(sw.includes('"/typing-test/"'));
  assert.equal(/CORE_ASSETS[\s\S]{0,4000}arabic-typing-test/.test(sw), false, "the redirect page is not precached");
});
