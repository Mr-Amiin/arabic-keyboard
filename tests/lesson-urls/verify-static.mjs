// No-browser verification of every generated lesson page + sitemap. Exit 1 on any failure.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const U = require(path.join(ROOT, "assets/js/learn/urls.js"));
const SITE = "https://www.arabic-keyboard.live";
const wantSitemap = process.argv.includes("--expect-sitemap");
let fails = 0; const bad = (m) => { fails++; console.log("FAIL", m); };
const exists = (url) => { const p = path.join(ROOT, url.split("#")[0].split("?")[0]); return fs.existsSync(p.endsWith("/") ? p + "index.html" : p) || fs.existsSync(p); };
const titles = new Map(), descs = new Map(), bodies = new Map();
let linkCount = 0, wordsMin = 1e9, wordsMinUrl = "";
for (const e of U.entries) {
  const f = path.join(ROOT, "learn-arabic", e.path, "index.html");
  if (!fs.existsSync(f)) { bad("missing file " + e.url); continue; }
  const h = fs.readFileSync(f, "utf8");
  const g = (re) => (re.exec(h) || [])[1];
  const title = g(/<title>([^<]*)<\/title>/), desc = g(/name="description" content="([^"]*)"/), canon = g(/rel="canonical" href="([^"]*)"/);
  if (!title) bad("no title " + e.url); else if (titles.has(title)) bad(`dup title ${e.url} = ${titles.get(title)}`); else titles.set(title, e.url);
  if (!desc || desc.length < 70 || desc.length > 160) bad(`description length ${desc && desc.length} ${e.url}`); else if (descs.has(desc)) bad("dup desc " + e.url); else descs.set(desc, e.url);
  if (canon !== SITE + e.url) bad(`canonical ${canon} != ${SITE + e.url}`);
  if (/noindex/i.test(h)) bad("noindex on " + e.url);
  const h1s = h.match(/<h1[\s>]/g) || []; if (h1s.length !== 1) bad(`h1 count ${h1s.length} ${e.url}`);
  if (!h.includes(`data-route="${e.route}"`)) bad("no data-route " + e.url);
  if (!h.includes('name="google-adsense-account" content="ca-pub-2057098005458261"')) bad("verification meta missing " + e.url);
  if (/\bdata-site-ad\b|class="site-ad|adsbygoogle"[^>]*data-ad-slot|<ins /.test(h)) bad("ad markup baked into static html " + e.url);
  if (!/Advertisement|Ad space/i.test(h) === false) bad("ad text in static html " + e.url);
  try { JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(h)[1]); } catch { bad("bad JSON-LD " + e.url); }
  // order: breadcrumb, h1, intro, lesson mount
  const o = ['class="breadcrumbs', "<h1", 'class="lead', 'id="learnApp"'].map((x) => h.indexOf(x)); if (o.includes(-1) || o.join() !== [...o].sort((a, b) => a - b).join()) bad("section order " + e.url);
  // links: every href/src that is local must resolve to a file
  for (const m of h.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
    let u = m[1]; if (/^(https?:|mailto:|data:|\/\/)/.test(u)) continue;
    if (!u.startsWith("/")) u = path.posix.normalize(path.posix.join(e.url, u));
    linkCount++; if (!exists(u)) bad(`broken link ${m[1]} in ${e.url}`);
  }
  const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  const main = /<main[\s\S]*<\/main>/.exec(h)[0].replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  if (main < wordsMin) { wordsMin = main; wordsMinUrl = e.url; }
  const bodyKey = /<div id="learnApp"[\s\S]*?<div class="lx lx-after"/.exec(h)[0]; if (bodies.has(bodyKey)) bad("duplicate body " + e.url); bodies.set(bodyKey, e.url);
}
// dashboard links to every lesson, crawlable without JS
const dash = fs.readFileSync(path.join(ROOT, "learn-arabic/index.html"), "utf8");
for (const e of U.entries) if (!dash.includes(`href="${e.path}"`)) bad("dashboard static index lacks " + e.url);
// sitemap
const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const inSm = U.entries.filter((e) => sm.includes(`<loc>${SITE}${e.url}</loc>`)).length;
if (wantSitemap && inSm !== U.entries.length) bad(`sitemap has ${inSm}/${U.entries.length} lesson URLs`);
if (!wantSitemap && inSm) console.log("note: sitemap already contains", inSm, "lesson URLs");
for (const old of ["/", "/about/", "/learn-arabic/", "/translation/"]) if (!sm.includes(`<loc>${SITE}${old}</loc>`)) bad("existing sitemap entry lost " + old);
console.log(`pages checked: ${U.entries.length}; local links resolved: ${linkCount}; sitemap lesson URLs: ${inSm}; thinnest page: ${wordsMin} words of main text (${wordsMinUrl}); failures: ${fails}`);
process.exit(fails ? 1 : 0);
