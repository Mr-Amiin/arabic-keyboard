// Individual lesson URLs (assets/js/learn/urls.js): every lesson opens directly, renders ITS content, links back to the dashboard,
// works with browser history and lesson-to-lesson links, and the old hash bookmarks still work. Expected content comes from the data modules.
import { createRequire } from "node:module"; import path from "node:path";
import { harness, sleep, txt, REPO, LearnUrls } from "./lib.mjs";
const req = createRequire(import.meta.url), data = f => req(path.join(REPO, "assets/js/learn", f));
const D = data("data.js"), V = data("vocab-data.js"), C = data("conversations.js"), R = data("reading.js");
const H = await harness("lessons"); const { base, ok } = H; let N = 0;
const open = async (p, u) => { const r = await p.goto(`${base}${u}?n=${++N}`, { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h"); await sleep(40); return r; };
const pathOf = p => new URL(p.url()).pathname;
const p = await H.page({ w: 1100 });

/* 1. every lesson URL opens directly and shows ITS lesson (counts come from the data, never hard-coded) */
const expected = { letter: 28, harakat: 2, vocab: 16, conversation: 8, reading: 8 };
for (const k of Object.keys(expected)) ok(LearnUrls.entries.filter(e => e.kind === k).length === expected[k], `the resolver defines ${expected[k]} ${k} lesson URLs`);
const bad = [];
for (const e of LearnUrls.entries) {
  const r = await open(p, e.url); let good = r.status() === 200 && pathOf(p) === e.url && (await p.evaluate(() => document.querySelectorAll("h1").length)) === 1;
  const n = sel => p.$$eval(sel, a => a.length);
  if (e.kind === "letter") { const l = D.LETTERS.find(x => x.id === e.key); good = good && (await txt(p, ".lx-hero-ar")) === l.letter && (await n(".lx-form")) === 4 && (await txt(p, ".lx-h")).includes(`Letter ${l.order} of 28`); }
  if (e.kind === "harakat") { const h = D.HARAKAT_LESSONS.find(x => x.id === e.key); good = good && (await n(".lx-mark")) === h.marks.length && (await txt(p, ".lx-h")) === h.title; }
  if (e.kind === "vocab") good = good && (await n(".lx-exs > .lx-ex")) >= V.ITEMS.filter(i => i.topic === e.key).length && (await n('[data-action="vpractice"]')) === 5;
  if (e.kind === "conversation") { const u = C.UNITS.find(x => x.short === e.key); good = good && (await n(".lx-dl")) === u.lines.length && (await p.$eval(".lx-dl .lx-ar", a => getComputedStyle(a).direction + a.lang)) === "rtlar"; }
  if (e.kind === "reading") { const q = R.PASSAGES.find(x => x.id === e.key); good = good && (await n(".lx-rd-l")) === q.lines.length; }
  if (!good) bad.push(e.url);
}
ok(bad.length === 0, `all ${LearnUrls.entries.length} lesson URLs open directly (200, own URL, one H1) and render their own lesson content/RTL Arabic as defined by the data` + (bad.length ? " BAD: " + bad.join(" ") : ""));
ok(p.errs.length === 0, "no console or page errors across all lesson pages " + JSON.stringify(p.errs.slice(0, 3)));

/* 2. back to the dashboard, history, lesson-to-lesson, for one lesson of every kind */
const hubs = { vocab: "#/vocab", conversation: "#/conversations", reading: "#/reading" };
for (const [route, hub] of [["vocab/colours", "#/vocab"], ["conversation/order", "#/conversations"], ["reading/read-p2", "#/reading"]]) {
  await p.goto(`${base}/learn-arabic/?n=${++N}${hub}`, { waitUntil: "load" }); await p.waitForSelector("#learnApp a.lx-card");
  const want = LearnUrls.pathFor(route); const href = await p.$$eval("#learnApp a.lx-card", (a, w) => a.map(x => x.getAttribute("href")).find(h => h === w), want);
  ok(href === want, `${hub} lists ${route} with its real URL ${want}`);
  await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(`#learnApp a.lx-card[href="${want}"]`)]); await p.waitForSelector("#learnApp .lx-h");
  ok(pathOf(p) === want, `clicking it opens ${want}`);
  await p.goBack({ waitUntil: "load" }); await p.waitForSelector("#learnApp a.lx-card"); ok(pathOf(p) === "/learn-arabic/" && new URL(p.url()).hash === hub, `browser Back returns to the ${hub} list`);
  await p.goForward({ waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h"); ok(pathOf(p) === want, "browser Forward returns to the lesson");
  await p.click("#learnApp .lx-back a"); await p.waitForSelector("#learnApp a.lx-card, #learnApp .lx-grid"); ok(pathOf(p) === "/learn-arabic/" && new URL(p.url()).hash === hub, `the lesson's back link returns to the ${hub} list`);
}
await open(p, LearnUrls.pathFor("harakat/harakat-1")); const nx = await p.$$eval(".lx-pager a", a => a.map(x => x.getAttribute("href")));
ok(nx.includes(LearnUrls.pathFor("harakat/harakat-2")), "harakat lesson 1 links to harakat lesson 2's real URL");
for (const [route, nextRoute] of [["conversation/intro", "conversation/family"], ["reading/read-s1", "reading/read-s2"], ["letter/qaf", "letter/kaf"]]) {
  await open(p, LearnUrls.pathFor(route)); const links = await p.$$eval(".lx-pager a", a => a.map(x => x.getAttribute("href")));
  ok(links.includes(LearnUrls.pathFor(nextRoute)), `${route}: the pager offers the real URL of ${nextRoute}`);
  await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(`.lx-pager a[href="${LearnUrls.pathFor(nextRoute)}"]`)]); await p.waitForSelector("#learnApp .lx-h");
  ok(pathOf(p) === LearnUrls.pathFor(nextRoute), `${route} -> ${nextRoute} opens the next lesson at its own URL`);
  await p.goBack({ waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h"); ok(pathOf(p) === LearnUrls.pathFor(route), "browser Back returns to the previous lesson");
}
/* 3. legacy hash bookmarks (dashboard routes) still render each lesson kind in place */
for (const [hash, sel] of [["#/letter/ba", ".lx-hero-ar"], ["#/harakat/harakat-2", ".lx-mark"], ["#/vocab/numbers", ".lx-exs"], ["#/conversation/greet", ".lx-dl"], ["#/reading/read-t1", ".lx-rd-l"]]) {
  await p.goto(`${base}/learn-arabic/?n=${++N}${hash}`, { waitUntil: "load" }); await p.waitForSelector(sel);
  ok(pathOf(p) === "/learn-arabic/" && new URL(p.url()).hash === hash, `legacy bookmark ${hash} still renders the lesson in place`);
}
/* 4. hash routes that are intentionally NOT lessons keep working and keep their hash URL */
for (const [hash, re] of [["#/practice", /practice/i], ["#/review", /review/i], ["#/read", /read/i], ["#/journey", /path|journey/i], ["#/patterns", /pattern/i]]) {
  await p.goto(`${base}/learn-arabic/?n=${++N}${hash}`, { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h");
  ok(LearnUrls.pathFor(hash.slice(2)) === null && new URL(p.url()).hash === hash && re.test(await txt(p, "#learnApp .lx-h")), `${hash} is still a dashboard hash route and renders`);
}
{ const r = await p.goto(`${base}/learn-arabic/letters/nope/`); ok(r.status() === 404 && !(await p.$("#learnApp")), "an unknown lesson URL is a real HTTP 404, not a dashboard or blank page"); }
await H.finish();
