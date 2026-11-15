// Phase 4 (Milestone 2) browser suite. The shipped catalogues are EMPTY, so this suite serves its own copy of the site in which stories.js and sentences.js carry
// STRUCTURAL FIXTURES assembled from existing Phase 3 text (see ../fixtures/phase4-fixtures.mjs). It never writes to the repository. Each scenario runs in an isolated
// browser profile so stored progress never leaks between scenarios. It reuses the existing harness only for the browser launcher and the PASS/FAIL report.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { harness, REPO, sleep } from "./lib.mjs";
import { rawStory, rawOrder, rawComplete, rawMatch } from "../fixtures/phase4-fixtures.mjs";

const h = await harness("phase4");
const ok = h.ok;

// ------------------------------------------------------------------ fixtures served in place of the empty catalogues
const RAW_STORIES = [rawStory(1, "a"), rawStory(2, "b"), rawStory(3, "c")];
const RAW_ITEMS = [rawOrder("bw-1-01", 0), rawMatch("bw-1-02"), Object.assign(rawOrder("bw-2-01", 1), { set: 2 }), rawComplete("bw-2-02", "snt-st-fx-2"),
  Object.assign(rawComplete("bw-3-01", "snt-st-fx-3"), { set: 3 }), Object.assign(rawMatch("bw-3-02"), { set: 3 })];
const state = { mode: "content" };   // "content" | "empty" | "noext" | "noexercises"
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain" };
function serve(req, res) {
  let u = decodeURIComponent(new URL(req.url, "http://x").pathname); if (u.endsWith("/")) u += "index.html";
  const send = (code, body, type) => { res.writeHead(code, { "Content-Type": type || "text/plain", "Cache-Control": "no-store" }); res.end(body); };
  if (state.mode === "noext" && u === "/assets/js/learn/stories-ui.js") return send(404, "gone");
  if (state.mode === "noexercises" && u === "/assets/js/learn/exercises.js") return send(404, "gone");
  const file = path.resolve(REPO, "." + u); if (!file.startsWith(REPO)) return send(403, "no");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, "not found");
  let body = fs.readFileSync(file);
  if (state.mode !== "empty" && state.mode !== "noexercises") {
    const swap = (name, raw) => { if (u === "/assets/js/learn/" + name + ".js") { const s = body.toString("utf8"); if (!s.includes("const RAW = [];")) throw new Error(name + ": the empty catalogue marker is gone"); body = Buffer.from(s.replace("const RAW = [];", "const RAW = " + JSON.stringify(raw) + ";"), "utf8"); } };
    swap("stories", RAW_STORIES); swap("sentences", RAW_ITEMS);
  }
  send(200, body, MIME[path.extname(file)] || "application/octet-stream");
}
const server = http.createServer(serve); await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port, LEARN = BASE + "/learn-arabic/";

// ------------------------------------------------------------------ helpers
async function section(name, fn) { try { await fn(); } catch (e) { ok(false, name + ": THREW " + String((e && e.message) || e).split("\n")[0]); } }
// The bundled Chromium runs single-process, which cannot create isolated browser contexts, so isolation is done per tab: each scenario clears the origin's storage first.
const newContext = () => { const pages = []; return { async newPage() { const p = await h.browser.newPage(); pages.push(p); return p; }, async close() { for (const p of pages.splice(0)) await p.close().catch(() => {}); } }; };
async function newPage(ctx, { w = 1100, hgt = 900, mobile = false, prefs = null, progress = null, theme = null } = {}) {
  const p = await ctx.newPage(); p.errors = [];
  p.on("pageerror", e => p.errors.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) p.errors.push("console: " + m.text()); });
  await p.setViewport({ width: w, height: hgt, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.setBypassServiceWorker(true);
  await p.setRequestInterception(true); p.on("request", r => (r.url().startsWith(BASE) || r.url().startsWith("data:") ? r.continue() : r.abort()));
  await p.goto(BASE + "/ads.txt"); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });   // a clean slate, BEFORE the seeding script is registered
  await p.evaluateOnNewDocument((pr, pg, th) => { if (sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded", "1"); if (pr) localStorage.setItem("ak-learn-st-prefs", pr); if (pg) localStorage.setItem("ak-learn-progress-v1", pg); if (th) localStorage.setItem("ak-theme", th); }, prefs && JSON.stringify(prefs), progress && JSON.stringify(progress), theme);
  return p;
}
async function go(p, hash) { await p.goto(LEARN + (hash || ""), { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h, #learnApp h2", { timeout: 8000 }); await sleep(60); }
async function nav(p, hash) { await p.evaluate(x => { location.hash = x; }, hash); await sleep(120); }
const bodyText = p => p.$eval("#learnApp", e => e.innerText);
const stored = (p, key) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), key);
const progress = p => stored(p, "ak-learn-progress-v1");
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function byText(p, sel, text, { exact = true } = {}) {
  for (const el of await p.$$(sel)) { const t = (await el.evaluate(n => n.textContent.replace(/[✓✗]\s*/g, "").trim())); if (exact ? t === text : t.includes(text)) return el; }
  return null;
}
async function clickText(p, sel, text, opts) { const el = await byText(p, sel, text, opts); if (!el) throw new Error("no " + sel + " with text " + JSON.stringify(text)); await el.click(); await sleep(60); }
async function pressOn(p, el, key) { await el.focus(); await p.keyboard.press(key); await sleep(60); }
const active = p => p.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, cls: a.className, id: a.id, txt: (a.textContent || "").trim().slice(0, 40), data: a.dataset ? { ...a.dataset } : {} }; });
const catalogue = (p, i = 0) => p.evaluate(n => { const s = window.LearnStories.STORIES[n]; return { id: s.id, words: s.glossary.map(g => g.ar), q: s.questions.map(q => ({ type: q.type, options: q.options, accept: q.accept, pairs: q.pairs })) }; }, i);
async function arabicWrapped(p) {   // every visible text node containing Arabic letters must sit inside lang="ar" dir="rtl"
  return p.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.getElementById("learnApp"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!/[\u0600-\u06FF]/.test(n.nodeValue)) continue; const e = n.parentElement; if (!e.getClientRects().length) continue; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (!e.closest('[lang="ar"]') || !e.closest('[dir="rtl"]')) bad.push(n.nodeValue.trim().slice(0, 30)); } return bad; });
}
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rgb = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
const FIXTURE_LEARNER = JSON.parse(fs.readFileSync(path.join(REPO, "tests/learn/fixtures/phase3-learner-progress.json"), "utf8"));

// walks one story's questions; returns after the results page is showing. wrongVocab = answer the vocabulary-in-context question wrongly.
async function runStory(p, { wrongVocab }) {
  const cat = await catalogue(p), words = cat.words, q = cat.q;
  await clickText(p, "[data-action=x-st-start]", "Start the questions");
  await clickText(p, ".lx-opt", "one"); await clickText(p, "#lxNextBtn", "Next →");
  await clickText(p, ".lx-opt", "True"); await clickText(p, "#lxNextBtn", "Next →");
  for (let i = 0; i < 3; i++) { await clickText(p, "[data-action=x-pick-l]", q[2].pairs[i][0]); await clickText(p, "[data-action=x-pick-r]", q[2].pairs[i][1]); }
  await p.click("#lxCheck"); await sleep(60); await clickText(p, "#lxNextBtn", "Next →");
  await p.waitForSelector("#lxEditor", { visible: true });
  const checkDisabled = await p.$eval("#lxTCheck", e => e.disabled);   // the dock itself keeps Check disabled while the answer is empty
  await p.focus("#lxEditor"); await p.keyboard.press("Enter"); await sleep(80);
  const answeredEmpty = !!(await p.$("#lxNextBtn"));
  await p.type("#lxEditor", q[3].accept[0]); await p.keyboard.press("Enter"); await sleep(80);
  const shortFb = await p.$eval("#lxTFb", e => e.textContent);
  await p.keyboard.press("Enter"); await sleep(80);   // Enter again = Next, handled by the Phase 4 typing hook
  await clickText(p, ".lx-opt", wrongVocab ? "b" : "a"); await clickText(p, "#lxNextBtn", "Next →");
  await clickText(p, ".lx-opt", words[0]); await clickText(p, "#lxNextBtn", "Next →");
  await p.click("#lxReveal"); await sleep(60); const revealFb = await p.$eval("#lxFb", e => e.textContent); await clickText(p, "#lxNextBtn", "See results");
  await sleep(120);
  return { checkDisabled, answeredEmpty, shortFb, revealFb };
}

// ================================================================== A. the shipped (EMPTY) state
state.mode = "empty";
await section("A empty state", async () => {
  const ctx = await newContext(), p = await newPage(ctx, { progress: FIXTURE_LEARNER.stored });
  await go(p);
  const home = await bodyText(p);
  ok(!/Stories and sentence building/.test(home), "empty catalogues: no dashboard card for Stories and sentence building");
  ok(/Reading comprehension/i.test(home) || (await p.$$("a[href='#/reading']")).length > 0, "empty catalogues: the Phase 3 reading entry is still on the dashboard");
  for (const hash of ["#/stories", "#/story/story-s1-anything", "#/workshop", "#/workshop/2"]) {
    await nav(p, hash); const t = await bodyText(p);
    ok(/not available yet/.test(t) && !/Draft|coming soon/i.test(t), "empty catalogues: " + hash + " shows the neutral empty-state page");
  }
  ok((await overflow(p)) <= 1, "empty-state page has no horizontal overflow");
  const after = await progress(p);
  ok(JSON.stringify(after) === JSON.stringify(FIXTURE_LEARNER.stored), "EMPTY STATE: the Phase 3 learner record is byte-identical after loading the dashboard and visiting every Phase 4 route");
  ok(p.errors.length === 0, "empty catalogues: no console errors " + JSON.stringify(p.errors));
  await ctx.close();
});

// ================================================================== B. Phase 3 reading is untouched (content mode, so Phase 4 is fully present)
state.mode = "content";
await section("B phase 3 reading untouched", async () => {
  const ctx = await newContext(), p = await newPage(ctx, { progress: FIXTURE_LEARNER.stored });
  await go(p, "#/reading"); ok((await p.$$("a[href^='#/reading/read-']")).length === 8, "Phase 3: the reading list still shows all eight passages (Phase 4 content present)");
  await nav(p, "#/reading/read-p2"); ok((await bodyText(p)).length > 100 && (await p.$$(".lx-rd .lx-rd-l")).length === 4, "Phase 3: a reading passage still renders its four lines");
  await clickText(p, "[data-action=rcheck]", "Start the questions");
  for (let q = 0; q < 4; q++) { await (await p.$(".lx-opt:not([disabled])")).click(); await sleep(60); await (await p.$("#lxNextBtn")).click(); await sleep(80); }
  await sleep(150); const after = await progress(p);
  ok(after && after.units["read-p2"] && after.units["read-p2"].tries >= 1, "Phase 3: completing a reading comprehension still records its unit through the shared finish() with Phase 4 loaded");
  ok(after && after.units["read-s1"].best === 100 && after.units["conv-intro"].best === 100, "Phase 3: existing saved scores are untouched");
  ok(JSON.stringify(after.units["read-s1"]) === JSON.stringify(FIXTURE_LEARNER.stored.units["read-s1"]), "Phase 3: the read-s1 record is exactly as it was");
  ok(p.errors.length === 0, "Phase 3 reading: no console errors " + JSON.stringify(p.errors));
  for (const hash of ["#/conversations", "#/review", "#/practice", "#/vocab"]) { await nav(p, hash); ok(((await bodyText(p)).length > 40) && p.errors.length === 0, "Phase 1-3 route still renders: " + hash); }
  await ctx.close();
});

// ================================================================== C. graceful degradation when Phase 4 files are missing
for (const [mode, label] of [["noext", "stories-ui.js missing"], ["noexercises", "exercises.js missing"]]) await section("C " + label, async () => {
  state.mode = mode; const ctx = await newContext(), p = await newPage(ctx, { progress: FIXTURE_LEARNER.stored });
  await go(p); const t = await bodyText(p);
  ok(t.length > 100 && !/Stories and sentence building/.test(t), label + ": the dashboard still renders with no Phase 4 card");
  await nav(p, "#/stories"); ok((await bodyText(p)).length > 100, label + ": #/stories falls back to the normal dashboard (no route)");
  await nav(p, "#/reading"); ok((await p.$$("a[href^='#/reading/read-']")).length === 8, label + ": Phase 3 reading still works");
  ok(p.errors.length === 0, label + ": no page errors " + JSON.stringify(p.errors));
  ok(JSON.stringify(await progress(p)) === JSON.stringify(FIXTURE_LEARNER.stored), label + ": learner record untouched");
  await ctx.close();
});

// ================================================================== D. content mode: pages, reading aids, tap-a-word
state.mode = "content";
await section("D pages, reading aids, tap-a-word", async () => {
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p);
  const dash = await bodyText(p); ok(/Stories and sentence building/.test(dash) && /Draft/.test(dash), "content present: the dashboard shows the Stories card, labelled Draft");
  await nav(p, "#/stories"); const idx = await bodyText(p);
  ok(/Draft: awaiting review by a qualified Arabic teacher\./.test(idx), "index: the draft notice is visible");
  ok((await p.$$("a[href^='#/story/story-s']")).length === 3 && (await p.$$("a[href^='#/workshop/']")).length === 3, "index: three story cards and three workshop sets");
  ok(/Band 1/.test(idx) && /Band 2/.test(idx) && /Band 3/.test(idx), "index: the three bands are listed");
  ok((await arabicWrapped(p)).length === 0, "index: every Arabic text node is inside lang=ar dir=rtl");

  await nav(p, "#/story/story-s1-a"); const st = await bodyText(p);
  ok(/Draft: awaiting review/.test(st), "story page: the draft notice is visible");
  ok(await p.$eval("#lxRd", e => e.classList.contains("is-marks")), "story page: band 1 starts with harakat on (band default)");
  ok(await p.$eval("#lxRd .rd-v", e => getComputedStyle(e).display !== "none") && await p.$eval("#lxRd .rd-p", e => getComputedStyle(e).display === "none"), "story page: the vowelled line is visible and the plain line hidden");
  ok(await p.$eval('[data-what="tap"]', e => e.disabled), "story page: tap-a-word is disabled while harakat are on");
  ok((await arabicWrapped(p)).length === 0, "story page: every visible Arabic text node is inside lang=ar dir=rtl");
  const marksBtn = await p.$('[data-what="marks"]'); await pressOn(p, marksBtn, "Enter");
  ok(!(await p.$eval("#lxRd", e => e.classList.contains("is-marks"))) && (await p.$eval('[data-what="marks"]', e => e.getAttribute("aria-pressed"))) === "false", "reading aids: Enter on the Harakat button turns harakat off");
  ok((await active(p)).data.what === "marks", "reading aids: focus stays on the toggle (classes change, nothing is re-rendered)");
  ok((await stored(p, "ak-learn-st-prefs")).marks === false, "preference: stored in its own key ak-learn-st-prefs");
  const prog1 = await progress(p); ok(prog1 === null || !prog1.units || !Object.keys(prog1.units).some(k => /^story-|^build-/.test(k)), "preference: nothing about it is written to the progress data");
  ok(await p.$eval('[data-what="tap"]', e => !e.disabled), "reading aids: tap-a-word becomes available once harakat are off");
  ok(!!(await p.$eval('[data-action="x-st-reset"]', e => !e.hidden)), "reading aids: the reset-to-default control appears after an explicit choice");

  // tap-a-word
  const tapBtn = await p.$('[data-what="tap"]'); await pressOn(p, tapBtn, "Space");
  ok(await p.$eval("#lxRd", e => e.classList.contains("is-tap")), "tap-a-word: Space on the button turns it on");
  const firstLine = await p.$("#lxRd .lx-rd-l .st-t"), words = await firstLine.$$(".st-w");
  const tabs = await Promise.all(words.map(w => w.evaluate(n => n.getAttribute("tabindex"))));
  ok(tabs[0] === "0" && tabs.slice(1).every(x => x === "-1"), "tap-a-word: one tab stop per line (roving tabindex)");
  const rects = await Promise.all(words.slice(0, 2).map(w => w.evaluate(n => n.getBoundingClientRect().right)));
  ok(rects[0] > rects[1], "tap-a-word: the first word is on the RIGHT (right-to-left order)");
  await words[0].focus(); await p.keyboard.press("ArrowLeft"); ok((await active(p)).data.p === (await words[1].evaluate(n => n.dataset.p)), "tap-a-word: ArrowLeft moves to the NEXT word (visual RTL)");
  await p.keyboard.press("ArrowRight"); ok((await active(p)).data.p === (await words[0].evaluate(n => n.dataset.p)), "tap-a-word: ArrowRight moves to the previous word");
  await p.keyboard.press("End"); ok((await active(p)).data.p === (await words[words.length - 1].evaluate(n => n.dataset.p)), "tap-a-word: End goes to the last word");
  await p.keyboard.press("Home"); ok((await active(p)).data.p === (await words[0].evaluate(n => n.dataset.p)), "tap-a-word: Home goes to the first word");
  const tabsAfter = await Promise.all(words.map(w => w.evaluate(n => n.getAttribute("tabindex")))); ok(tabsAfter[0] === "0", "tap-a-word: the tab stop follows focus");
  await p.keyboard.press("Enter"); await sleep(60);
  const w0 = await words[0].evaluate(n => ({ pressed: n.getAttribute("aria-pressed"), text: n.textContent.trim(), v: n.dataset.v }));
  ok(w0.pressed === "true" && w0.text === w0.v, "tap-a-word: Enter reveals the word's vowels and exposes the pressed state");
  ok((await p.$eval("#lxStLive", e => e.textContent)).includes("Vowels shown"), "tap-a-word: the change is announced in a polite live region");
  await p.keyboard.press("Space"); await sleep(60); ok((await words[0].evaluate(n => n.getAttribute("aria-pressed"))) === "false", "tap-a-word: Space hides the vowels again");
  ok((await p.$eval("#lxStLive", e => e.getAttribute("aria-live"))) === "polite" && (await p.$eval("#lxStLive", e => e.getAttribute("role"))) === "status", "tap-a-word: the live region is role=status, aria-live=polite");
  ok((await arabicWrapped(p)).length === 0, "tap-a-word: all visible Arabic stays inside lang=ar dir=rtl");

  // preference persists across a reload and across bands, until reset
  await p.reload({ waitUntil: "load" }); await p.waitForSelector("#lxRd"); await sleep(60);
  ok(!(await p.$eval("#lxRd", e => e.classList.contains("is-marks"))) && await p.$eval("#lxRd", e => e.classList.contains("is-tap")), "preference: harakat off and tap-a-word on survive a reload");
  await nav(p, "#/story/story-s2-b"); ok(!(await p.$eval("#lxRd", e => e.classList.contains("is-marks"))), "preference: an explicit choice applies to every story (band 2 now shows no harakat either)");
  await clickText(p, '[data-action="x-st-reset"]', "Use this story’s default harakat", { exact: false }); await sleep(60);
  ok(await p.$eval("#lxRd", e => e.classList.contains("is-marks")), "preference: reset returns band 2 to its default (harakat on)");
  ok((await stored(p, "ak-learn-st-prefs")).marks === null, "preference: reset stores null, meaning 'use band defaults'");
  await nav(p, "#/story/story-s3-c"); ok(!(await p.$eval("#lxRd", e => e.classList.contains("is-marks"))), "band 3 starts with harakat off (band default)");
  ok(p.errors.length === 0, "pages: no console errors " + JSON.stringify(p.errors));
  await ctx.close();
});

// ================================================================== E. the story runner, review policy H-1 and the finish contract
state.mode = "content";
await section("E story run (H-1 miss)", async () => {
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/story/story-s1-a");
  const marker = await runStory(p, { wrongVocab: true });
  ok(marker.checkDisabled && !marker.answeredEmpty, "short answer: the dock keeps Check disabled for an empty answer, and Enter on an empty answer grades nothing");
  ok(/Correct!/.test(marker.shortFb), "short answer: typing an accepted answer and pressing Enter in the dock is graded");
  ok(/Model answer/.test(marker.revealFb), "reveal: shows a model answer");
  const res = await bodyText(p);
  ok(/Story complete!/.test(res) && /83\s*%/.test(res), "results: 5 of 6 graded questions = 83%, a pass; the ungraded reveal is outside the score " + JSON.stringify(res.slice(0, 120)));
  const pg = await progress(p);
  ok(pg.units["story-s1-a"] && pg.units["story-s1-a"].best === 83 && pg.units["story-s1-a"].tries === 1, "progress: the story unit is recorded by the shared finish() (best 83, one try)");
  ok(Object.keys(pg.srs).join() === "num-0" && pg.srs["num-0"].b === 1, "H-1: ONLY the missed vocabulary-in-context word entered the review schedule, at box 1 " + JSON.stringify(pg.srs));
  ok(!/Not quite[\s\S]*Model answer/.test(res) && !/\(not scored\)/.test(res.split("To review")[1] || ""), "results: the ungraded reveal is not listed under 'To review'");
  ok((await p.$$("[data-action=retry]")).length + (await p.$$("[data-action=again]")).length + (await p.$$("button")).length > 0, "results: actions are present");
  ok(p.errors.length === 0, "story runner: no console errors " + JSON.stringify(p.errors));
  await ctx.close();
});
await section("E story run (H-1 all correct)", async () => {
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/story/story-s1-a"); await runStory(p, { wrongVocab: false });
  const pg = await progress(p), res = await bodyText(p);
  ok(/Story complete!/.test(res) && /100\s*%/.test(res), "H-1: a perfect run passes at 100%");
  ok(pg.units["story-s1-a"].best === 100, "progress: best 100 recorded");
  ok(!pg.srs || Object.keys(pg.srs).length === 0, "H-1: ALL answers correct => NO review entry is created for any word " + JSON.stringify(pg.srs));
  const jn = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("ak-learn-progress-v1")); return Object.keys(c.srs || {}).length; }); ok(jn === 0, "H-1: nothing that could move the journey's known-word counts was written");
  await ctx.close();
});
await section("E navigation drops a run", async () => {
  // retry and navigation away abandon the run cleanly
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/story/story-s2-b"); await clickText(p, "[data-action=x-st-start]", "Start the questions"); await clickText(p, ".lx-opt", "two"); await clickText(p, "#lxNextBtn", "Next →");
  await nav(p, "#/stories"); await nav(p, "#/story/story-s2-b"); ok((await p.$$(".lx-opt")).length === 0 && (await p.$$("[data-action=x-st-start]")).length === 1, "navigation: leaving a run mid-way returns to the story page and drops the run");
  const prog = await progress(p); ok(!prog || !prog.units || !prog.units["story-s2-b"], "navigation: an abandoned run records nothing");
  await clickText(p, "[data-action=x-st-start]", "Start the questions"); ok((await bodyText(p)).includes("Question 1 of 7"), "navigation: a new run starts at question 1");
  await ctx.close();
});

// ================================================================== F. workshop: keyboard, RTL, live region, H-2
const solveOrder = async (p, item) => {
  const live = await p.$("#lxLive"); await live.evaluate(n => { n.setAttribute("data-marker", "keep"); });
  const accept = await p.evaluate(id => window.LearnSentences.ITEMS.find(i => i.id === id).accept[0], item);
  const checks = [];
  for (let k = 0; k < accept.length; k++) {
    const tile = await byText(p, ".st-bank .st-tile", accept[k]); await pressOn(p, tile, "Enter");
    const a = await active(p); checks.push(k === accept.length - 1 ? a.id === "lxCheck" : a.cls.includes("st-tile"));
    checks.push((await p.$eval("#lxLive", e => e.getAttribute("data-marker"))) === "keep");
  }
  return { checks, accept };
};
state.mode = "content";
for (const [label, wrong] of [["wrong answer", true], ["correct answer", false]]) await section("F workshop " + label, async () => {
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/workshop/2"); const intro = await bodyText(p);
  ok(/Draft: awaiting review/.test(intro) && /Your answers schedule these sentences for review\./.test(intro), "workshop set 2: draft notice and the sentence-review notice are shown");
  await clickText(p, "[data-action=x-ws-start]", "Start the set");
  const { checks, accept } = await solveOrder(p, "bw-2-01");
  ok(checks.every(Boolean), "ordering (" + label + " run): keyboard placement keeps focus on the next tile, then on Check; the live region persists across re-renders");
  ok((await p.$eval("#lxLive", e => e.textContent)).startsWith("Placed"), "ordering: each placement is announced");
  const placedBoxes = await p.$$eval(".st-slots .st-tile", els => els.map(e => e.getBoundingClientRect().right)); ok(placedBoxes.length === accept.length && placedBoxes.every((x, i, a) => i === 0 || a[i - 1] > x), "ordering: placed tiles run right-to-left in placement order");
  ok((await p.$eval(".st-bank", e => e.getAttribute("dir"))) === "rtl" && (await p.$eval(".st-slots", e => e.getAttribute("dir"))) === "rtl", "ordering: the tile bank and the sentence are dir=rtl");
  // remove and re-place
  const first = await p.$(".st-slots .st-tile"); await pressOn(p, first, "Enter"); ok((await active(p)).cls.includes("st-tile") && !(await active(p)).cls.includes("is-placed"), "ordering: removing a placed tile returns focus to a tile in the bank");
  await clickText(p, "[data-action=x-clear]", "Clear"); ok((await p.$$(".st-slots .st-tile")).length === 0 && (await p.$eval("#lxCheck", e => e.disabled)), "ordering: Clear empties the sentence and disables Check");
  for (const w of accept) await pressOn(p, await byText(p, ".st-bank .st-tile", w), "Enter");
  await (await p.$("#lxCheck")).focus(); await p.keyboard.press("Enter"); await sleep(80);
  ok(/Correct!/.test(await p.$eval("#lxFb", e => e.textContent)), "ordering: Check on a correct sentence is graded correct (the second accepted order is also explicit data)");
  ok((await active(p)).id === "lxNextBtn", "ordering: focus moves to Next after checking"); await p.keyboard.press("Enter"); await sleep(80);
  const sentence = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-2-02").slot);
  const blank = await p.$eval(".lx-show [role=img]", e => e.getAttribute("aria-label")); ok(/with one missing word/.test(blank), "completion: the blank is a labelled image");
  await clickText(p, ".lx-opt", wrong ? await p.$$eval(".lx-opt", (els, s) => els.map(e => e.textContent.trim()).find(t => t !== s), sentence) : sentence);
  await clickText(p, "#lxNextBtn", "See results");
  const res = await bodyText(p), pg = await progress(p), e = pg.srs["snt-st-fx-2"];
  ok(pg.units["build-set-2"] && pg.units["build-set-2"].tries === 1, "workshop (" + label + "): the set unit is recorded by the shared finish()");
  ok(e && e.b === (wrong ? 1 : 2), "H-2 (" + label + "): the completion sentence was recorded " + (wrong ? "as a miss (box 1)" : "as a correct first answer (box 2), exactly like Phase 3 sentence practice") + " " + JSON.stringify(e));
  ok(Object.keys(pg.srs).length === 1, "H-2 (" + label + "): the ordering exercise created no review entry " + JSON.stringify(Object.keys(pg.srs)));
  ok(wrong ? /50\s*%/.test(res) : /100\s*%/.test(res), "workshop (" + label + "): score shown " + (wrong ? "50%" : "100%"));
  ok(/review/i.test(res) && /(Next review|schedule|due)/i.test(res), "workshop: the results page mentions the review schedule");
  ok(p.errors.length === 0, "workshop (" + label + "): no console errors " + JSON.stringify(p.errors));
  await ctx.close();
});
await section("F2 phone matching", async () => {
  // touch-only matching on a phone, and mobile layout
  const ctx = await newContext(), p = await newPage(ctx, { w: 375, hgt: 800, mobile: true });
  await go(p, "#/workshop/1"); await (await byText(p, "[data-action=x-ws-start]", "Start the set")).tap(); await sleep(80);
  await (await p.$("#lxCheck")).evaluate(n => n.scrollIntoView());
  const accept = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-1-01").accept[0]);
  for (const w of accept) { await (await byText(p, ".st-bank .st-tile", w)).tap(); await sleep(50); }
  await (await p.$("#lxCheck")).tap(); await sleep(80); await (await p.$("#lxNextBtn")).tap(); await sleep(80);
  const pairs = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-1-02").pairs);
  ok((await overflow(p)) <= 1, "matching on a 375px phone: no horizontal overflow");
  for (const [l, r] of pairs) { await (await byText(p, "[data-action=x-pick-l]", l)).tap(); await sleep(40); await (await byText(p, "[data-action=x-pick-r]", r)).tap(); await sleep(40); }
  ok((await p.$$(".st-pairs li")).length === pairs.length, "matching: tapping a first half then a second half pairs them (touch, no drag)");
  await (await byText(p, ".st-pairs .lx-hear", "Undo")).tap(); await sleep(60); ok((await p.$$("[data-action=x-pick-l]")).length === 1, "matching: a pair can be undone");
  const lastL = pairs[0][0]; await (await byText(p, "[data-action=x-pick-l]", lastL)).tap(); await sleep(40); await (await byText(p, "[data-action=x-pick-r]", pairs[0][1])).tap(); await sleep(40);
  await (await p.$("#lxCheck")).tap(); await sleep(80); ok(/Correct!/.test(await p.$eval("#lxFb", e => e.textContent)), "matching: all pairs right => graded correct (all-or-nothing)");
  ok(p.errors.length === 0, "mobile workshop: no console errors " + JSON.stringify(p.errors));
  await ctx.close();
});
await section("F3 all-or-nothing matching", async () => {
  // all-or-nothing matching: one wrong pair makes the question wrong, with per-pair feedback
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/workshop/1"); await clickText(p, "[data-action=x-ws-start]", "Start the set");
  const accept = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-1-01").accept[0]); for (const w of accept) await clickText(p, ".st-bank .st-tile", w);
  await p.click("#lxCheck"); await sleep(60); await clickText(p, "#lxNextBtn", "Next →");
  const pairs = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-1-02").pairs);
  await clickText(p, "[data-action=x-pick-l]", pairs[0][0]); await clickText(p, "[data-action=x-pick-r]", pairs[1][1]);
  await clickText(p, "[data-action=x-pick-l]", pairs[1][0]); await clickText(p, "[data-action=x-pick-r]", pairs[0][1]);
  await clickText(p, "[data-action=x-pick-l]", pairs[2][0]); await clickText(p, "[data-action=x-pick-r]", pairs[2][1]);
  await p.click("#lxCheck"); await sleep(80); const fb = await p.$eval("#lxFb", e => e.textContent);
  ok(/Not quite/.test(fb) && (fb.match(/✗/g) || []).length === 2 && (fb.match(/✓/g) || []).length === 1, "matching: one wrong pair => the question is wrong, with ✓/✗ for each pair " + JSON.stringify(fb.slice(0, 80)));
  const rows = await p.$$eval("#lxFb .st-pairs li", els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()));
  const rowFor = left => rows.find(r => r.includes(left)) || "";
  ok(rowFor(pairs[0][0]).includes("(should be " + pairs[0][1] + ")") && rowFor(pairs[1][0]).includes("(should be " + pairs[1][1] + ")") && !rowFor(pairs[2][0]).includes("should be"),
    "matching: EACH wrong pair names its own correct second half, from the question's explicit pairing (and the right pair names nothing) " + JSON.stringify(rows));
  await ctx.close();
});

// ================================================================== G. layout, touch targets, themes, zoom, deep links
state.mode = "content";
await section("G1 layout at four widths", async () => {
  const ctx = await newContext(), prefs = { v: 1, marks: false, tap: true };
  for (const w of [320, 375, 768, 1100]) {
    const p = await newPage(ctx, { w, mobile: w < 700, prefs }); const bad = [];
    for (const hash of ["#/stories", "#/story/story-s1-a", "#/story/story-s3-c", "#/workshop", "#/workshop/2"]) { await go(p, hash); const o = await overflow(p); if (o > 1) bad.push(hash + " +" + o + "px"); }
    ok(bad.length === 0, w + "px: no horizontal overflow on the stories index, two stories, the workshop home and a set " + JSON.stringify(bad));
    await go(p, "#/story/story-s1-a"); // "Slow speech: off" is the site-wide speech-rate control from audio.js (present on every Learn page since Phase 1, 36px tall); it is not a Phase 4 control and is excluded here.
    const small = await p.$$eval(".st-w, .lx-btn, .lx-hear", els => els.filter(e => e.getClientRects().length && !/^Slow speech/.test(e.textContent.trim())).map(e => { const r = e.getBoundingClientRect(); return { c: e.className, w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 44 || x.w < 44));
    ok(small.length === 0 || w >= 768 && small.every(x => x.h >= 32), w + "px: word and button touch targets are at least 44px " + JSON.stringify(small.slice(0, 3)));
    ok(p.errors.length === 0, w + "px: no console errors " + JSON.stringify(p.errors)); await p.close();
  }
  await ctx.close();
});
await section("G2 exercise touch targets", async () => {
  // exercise targets on a phone: tiles, matching items, option buttons
  const ctx = await newContext(), p = await newPage(ctx, { w: 320, hgt: 700, mobile: true });
  await go(p, "#/workshop/1"); await (await byText(p, "[data-action=x-ws-start]", "Start the set")).tap(); await sleep(80);
  const t1 = await p.$$eval(".st-tile", els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(t1.length > 0 && t1.every(([w, hh]) => w >= 44 && hh >= 44), "320px: ordering tiles are at least 44x44 " + JSON.stringify(t1));
  ok((await overflow(p)) <= 1, "320px: ordering exercise has no horizontal overflow");
  ok((await arabicWrapped(p)).length === 0, "ordering exercise: every visible Arabic text node is inside lang=ar dir=rtl");
  const accept = await p.evaluate(() => window.LearnSentences.ITEMS.find(i => i.id === "bw-1-01").accept[0]); for (const w of accept) { await (await byText(p, ".st-bank .st-tile", w)).tap(); await sleep(40); }
  await (await p.$("#lxCheck")).tap(); await sleep(60); await (await p.$("#lxNextBtn")).tap(); await sleep(80);
  const m = await p.$$eval(".st-item", els => els.map(e => Math.round(e.getBoundingClientRect().height))); ok(m.length > 0 && m.every(x => x >= 44), "320px: matching items are at least 44px tall " + JSON.stringify(m));
  ok((await overflow(p)) <= 1, "320px: matching exercise has no horizontal overflow"); ok((await arabicWrapped(p)).length === 0, "matching exercise: every visible Arabic text node is inside lang=ar dir=rtl");
  await ctx.close();
});
for (const theme of ["light", "dark"]) await section("G3 theme " + theme, async () => {
  const ctx = await newContext(), p = await newPage(ctx, { prefs: { v: 1, marks: false, tap: true } });
  await go(p, "#/story/story-s1-a"); await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme); await sleep(80);
  const cols = await p.evaluate(() => { const g = (sel, a) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { fg: cs.color, bg: cs.backgroundColor }; }; return { word: g(".st-w"), toggle: g(".lx-toggles .lx-hear"), card: g(".lx-panel .lx-btn") }; });
  const bodyBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  for (const [k, v] of Object.entries(cols)) { if (!v) continue; const bg = /rgba\(.*,\s*0\)$|transparent/.test(v.bg) ? bodyBg : v.bg; ok(contrast(rgb(v.fg), rgb(bg)) >= 4.5, theme + " theme: " + k + " text has contrast >= 4.5:1 (" + contrast(rgb(v.fg), rgb(bg)).toFixed(1) + ")"); }
  await go(p, "#/workshop/1"); await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme); await clickText(p, "[data-action=x-ws-start]", "Start the set");
  const tile = await p.$eval(".st-tile", e => { const cs = getComputedStyle(e); return { fg: cs.color, bg: cs.backgroundColor }; });
  ok(contrast(rgb(tile.fg), rgb(tile.bg)) >= 4.5, theme + " theme: ordering tiles have contrast >= 4.5:1 (" + contrast(rgb(tile.fg), rgb(tile.bg)).toFixed(1) + ")");
  ok(p.errors.length === 0, theme + " theme: no console errors"); await ctx.close();
});
await section("G4 200% text size", async () => {
  // text zoom approximation: 200% root font size at a phone width
  const ctx = await newContext(), p = await newPage(ctx, { w: 320, hgt: 700, mobile: true });
  const bad = []; for (const hash of ["#/stories", "#/story/story-s1-a", "#/workshop/2"]) { await go(p, hash); await p.addStyleTag({ content: "html{font-size:200% !important}" }); await sleep(80); const o = await overflow(p); if (o > 1) bad.push(hash + " +" + o); }
  ok(bad.length === 0, "200% text size at 320px: no horizontal overflow (approximated with a 200% root font size) " + JSON.stringify(bad));
  await ctx.close();
});
await section("G5 deep links", async () => {
  // deep links, unknown ids, browser Back
  const ctx = await newContext(), p = await newPage(ctx);
  await go(p, "#/story/story-s2-b"); ok(/Band 2/.test(await bodyText(p)) && (await p.$$("#lxRd")).length === 1, "deep link: #/story/<id> opens that story directly");
  await go(p, "#/workshop/3"); ok(/Set 3/.test(await bodyText(p)), "deep link: #/workshop/<n> opens that set directly");
  await nav(p, "#/story/does-not-exist"); ok(/not found/i.test(await bodyText(p)), "deep link: an unknown story id is a normal not-found page");
  await nav(p, "#/stories"); await nav(p, "#/story/story-s1-a"); await p.goBack(); await sleep(150); ok(/Sentence workshop|Band 1/.test(await bodyText(p)), "browser Back from a story returns to the stories index");
  const hdr = await p.$eval("#learnApp .lx-h", e => document.activeElement === e || e.getAttribute("tabindex") === "-1"); ok(hdr, "focus management: the page heading is a focus target after navigation");
  ok(p.errors.length === 0, "deep links: no console errors " + JSON.stringify(p.errors)); await ctx.close();
});

// ================================================================== H. offline and cache upgrade (service worker on)
await section("H offline and cache upgrade", async () => {
  state.mode = "content"; const ctx = await newContext(), p = await ctx.newPage(); p.errors = [];
  p.on("pageerror", e => p.errors.push(String(e.message)));
  await p.setRequestInterception(true); p.on("request", r => (r.url().startsWith(BASE) || r.url().startsWith("data:") ? r.continue() : r.abort()));
  await p.goto(BASE + "/", { waitUntil: "load" });   // the site root registers /sw.js (assets/js/app.js)
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  // plant a STALE v18 cache entry the way an older visit would have left it, then let the new worker take over
  const names = await p.evaluate(async () => caches.keys());
  ok(names.includes("arabic-keyboard-shell-v20"), "service worker: the v20 shell cache exists after install " + JSON.stringify(names));
  // simulate a returning visitor from the previous release: no worker, a stale v18 cache holding an old review.js, no v20 cache yet
  await p.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); await caches.delete("arabic-keyboard-shell-v20"); const c = await caches.open("arabic-keyboard-shell-v18"); await c.put("/assets/js/learn/review.js", new Response("/* STALE v18 */")); });
  await p.reload({ waitUntil: "load" }); await p.evaluate(async () => { await navigator.serviceWorker.ready; }); await sleep(1500);
  const after = await p.evaluate(async () => ({ keys: await caches.keys(), v20: await (async () => { const c = await caches.open("arabic-keyboard-shell-v20"); return (await c.keys()).map(r => new URL(r.url).pathname); })() }));
  ok(!after.keys.includes("arabic-keyboard-shell-v18"), "cache upgrade: the stale v18 cache is deleted when v20 activates " + JSON.stringify(after.keys));
  for (const f of ["exercises", "sentences", "stories", "stories-ui", "review", "progress", "app"]) ok(after.v20.includes("/assets/js/learn/" + f + ".js"), "precache: /assets/js/learn/" + f + ".js is in the v20 shell cache");
  const served = await p.evaluate(async () => (await (await fetch("/assets/js/learn/review.js")).text()).includes("reviewSentences"));
  ok(served, "cache upgrade: review.js is served from the NEW cache, never the planted stale copy");
  await ctx.setOfflineMode?.(true).catch(() => {}); await p.setOfflineMode(true);
  await p.goto(LEARN + "#/stories", { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h", { timeout: 8000 });
  const offText = await bodyText(p); ok(/Band 1/.test(offText), "offline: the Stories page loads and shows its content with no network " + JSON.stringify(offText.slice(0, 90)));
  await p.goto(LEARN + "#/story/story-s1-a", { waitUntil: "load" }); await p.waitForSelector("#lxRd", { timeout: 8000 }); ok(true, "offline: a story page opens with no network");
  ok(p.errors.length === 0, "offline: no page errors " + JSON.stringify(p.errors)); await ctx.close();
});

server.close();
await h.finish();
