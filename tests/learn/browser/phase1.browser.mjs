import { harness, sleep, txt, LearnUrls, lessonPath } from "./lib.mjs";
const H = await harness("phase1"); const base = H.base; const ok = H.ok;
const newPage = (w = 1280, h = 900) => H.page({ w, h });
// Lessons now have individual URLs (assets/js/learn/urls.js). url("#/letter/ba") opens the real lesson page; a route that is
// intentionally still a dashboard hash route (practice, read, ...) or unknown stays "/learn-arabic/#/...".
const url = h => base + (lessonPath(h) || "/learn-arabic/" + (h || ""));
const lp = route => LearnUrls.pathFor(route);
const p = await newPage();
await p.goto(base + "/learn-arabic/", { waitUntil: "load" });
await p.waitForSelector(".lx-grid .lx-tile");
ok((await p.$$(".lx-tile")).length === 28, "dashboard shows 28 letter tiles");
ok((await txt(p, ".lx-stats")).includes("0 / 30"), "fresh progress is 0 / 30 (no fake numbers)");
ok((await p.title()).includes("Learn Arabic"), "title updated: " + (await p.title()));
// open lesson Ba
ok((await p.$$eval("a.lx-tile", a => a.map(x => x.getAttribute("href")))).join() === LearnUrls.entries.filter(e => e.kind === "letter").map(e => e.url).join(), "the 28 dashboard tiles link to the 28 individual letter URLs, in order");
await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(`a[href="${lp("letter/ba")}"]`)]); await p.waitForSelector(".lx-hero-ar");
ok(new URL(p.url()).pathname === lp("letter/ba"), "clicking the Ba tile opens its own URL " + lp("letter/ba"));
ok((await txt(p, ".lx-forms")).includes("بـ") && (await p.$$(".lx-form")).length === 4, "Ba lesson shows 4 forms");
ok((await p.$$(".lx-ex")).length === 2, "Ba lesson shows example words");
// A lesson is now a real page load: the browser resets focus and announces the new page, so the accessible equivalent is that the
// page itself is labelled (title + H1) and nothing steals focus. The in-page focus move still applies to the hash routes that stay in-page (below).
ok(/Arabic letter Ba/.test(await txt(p, "h1")) && (await p.title()).includes("Ba") && await p.evaluate(() => !document.activeElement || !document.activeElement.hasAttribute("data-focus") || document.activeElement === document.body), "lesson page is labelled by its title and H1 (Ba), focus is not stolen on load");
await p.goBack({ waitUntil: "load" }); await p.waitForSelector(".lx-grid .lx-tile"); ok(new URL(p.url()).pathname === "/learn-arabic/", "browser Back from a lesson returns to the dashboard");
await p.goForward({ waitUntil: "load" }); await p.waitForSelector(".lx-hero-ar"); ok(new URL(p.url()).pathname === lp("letter/ba"), "browser Forward returns to the lesson");
{ const nxt = await p.$eval(".lx-pager a:last-child", a => a.getAttribute("href")); await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(".lx-pager a:last-child")]); await p.waitForSelector(".lx-hero-ar");
  ok(nxt === lp("letter/ta") && new URL(p.url()).pathname === lp("letter/ta") && (await txt(p, ".lx-h")).includes("Letter 3 of 28"), "Next lesson link is the real URL of the next letter (Ta) and opens it");
  await p.goBack({ waitUntil: "load" }); await p.waitForSelector(".lx-hero-ar"); ok(new URL(p.url()).pathname === lp("letter/ba"), "browser Back goes from Ta to Ba (history is lesson-to-lesson)");
  await p.click(".lx-back a"); await p.waitForSelector(".lx-grid .lx-tile"); ok(new URL(p.url()).pathname === "/learn-arabic/", "'Dashboard' link returns to /learn-arabic/"); }
// In-page navigation that still exists: a hash route moves focus to its heading (original accessibility behaviour, preserved).
await p.evaluate(() => { location.hash = "#/practice"; }); await p.waitForSelector("#learnApp .lx-h"); await sleep(150);
ok(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute("data-focus")), "focus moves to the heading on in-page (hash route) navigation");
// Legacy bookmark compatibility: the old hash deep link to a lesson still renders that lesson in place.
await p.goto(base + "/learn-arabic/#/letter/ba"); await p.waitForSelector(".lx-hero-ar"); { const lg = { hash: new URL(p.url()).hash, h: await txt(p, ".lx-h"), forms: (await p.$$(".lx-form")).length }; ok(lg.hash === "#/letter/ba" && lg.h.includes("Letter 2 of 28") && lg.forms === 4, "legacy hash bookmark /learn-arabic/#/letter/ba still opens the Ba lesson in place " + JSON.stringify(lg)); }
await p.goto(base + "/learn-arabic/#/harakat/harakat-1"); await p.waitForSelector(".lx-mark"); ok((await p.$$(".lx-mark")).length === 3, "legacy hash bookmark for a harakat lesson still works");
await p.goto(url("#/letter/ba")); await p.waitForSelector(".lx-hero-ar");
// dal lesson: non-connecting explanation
await p.goto(url("#/letter/dal")); await p.waitForSelector(".lx-hero-ar");
ok((await txt(p, "article")).includes("never joins"), "Dal lesson explains non-connecting");
ok((await p.$$(".lx-form.is-na")).length === 2, "Dal has 2 unavailable forms (initial/medial)");
// quick check: answer all correctly using engine data exposed via DOM? answer by reading explanation: click correct by trial
async function runSession(p, wantAllRight) {
  const n = await p.evaluate(() => 0);
  for (let guard = 0; guard < 15; guard++) {
    if (await p.$(".lx-score")) break;
    await p.waitForSelector(".lx-opt");
    const opts = await p.$$(".lx-opt");
    // to answer correctly we peek at the answer via the app's closure-free trick: try options in order for wrong, correct handled by retry-less single click
    let idx = 0;
    if (wantAllRight) idx = await p.evaluate(() => { const q = window.__peek && window.__peek(); return q; });
    await opts[typeof idx === "number" && idx >= 0 ? idx : 0].click();
    await p.waitForSelector("#lxNextBtn"); 
    await p.click("#lxNextBtn");
  }
}
// Expose the correct answer for testing through the DOM: the feedback reveals it after answering, so pick option 0 and read results.
await p.goto(url("#/letter/ba")); await p.waitForSelector('[data-action="check"]');
await p.click('[data-action="check"]');
let correctCount = 0;
for (let i = 0; i < 3; i++) {
  await p.waitForSelector(".lx-opt");
  ok((await txt(p, "#learnApp .lx-small")).includes(`Question ${i + 1} of 3`), `check shows Question ${i + 1} of 3`);
  const labels = await p.$$eval(".lx-opt", els => els.map(e => e.textContent.trim()));
  await (await p.$$(".lx-opt"))[0].click();
  await p.waitForSelector("#lxNextBtn");
  const fb = await txt(p, "#lxFb"); ok(/Correct|Not quite/.test(fb) && fb.length > 25, "feedback + explanation shown after answer " + (i + 1));
  ok(await p.$$eval(".lx-opt", els => els.every(e => e.disabled)), "options locked after answering");
  ok(await p.$$eval(".lx-opt .lx-mk", els => els.length >= 1), "feedback not color-only (✓/✗ marker)");
  if (/Correct/.test(fb)) correctCount++;
  await p.click("#lxNextBtn");
}
await p.waitForSelector(".lx-score");
const score = await txt(p, ".lx-score");
ok(score.includes(`${correctCount} / 3`), `results score matches answers (${correctCount}/3)`);
const passed = correctCount >= 2;
const dash = async () => { await p.goto(base + "/learn-arabic/"); await p.waitForSelector(".lx-grid"); };
await dash();
const done = await txt(p, ".lx-stats");
ok(passed ? done.includes("1 / 30") : done.includes("0 / 30"), "completion count follows pass/fail: " + done.slice(0, 20));
// Pass the check DETERMINISTICALLY through the real UI: the correct option is derived from the course data the page itself loaded
// (random guessing passes a 3-question, 4-option check only ~16% of the time, which made this suite flaky).
async function answerCorrectly(page) {
  const idx = await page.evaluate(() => {
    const D = LearnData, q = document.querySelector(".lx-q").textContent, show = ((document.querySelector(".lx-show") || {}).textContent || "").trim();
    const opts = [...document.querySelectorAll(".lx-opt")].map(o => o.textContent.trim());
    if (/name of this letter/.test(q)) { const l = D.LETTERS.find(x => x.letter === show); return opts.indexOf(`${l.nameEn} (${l.nameAr})`); }
    if (/makes this sound/.test(q)) { const snd = q.split("makes this sound: ")[1].replace(/\?\s*$/, ""); const l = D.LETTERS.find(x => x.sound === snd); return opts.indexOf(l.letter); }
    if (/form of a letter/.test(q)) { const l = D.LETTERS.find(x => [x.forms.initial, x.forms.medial, x.forms.final].includes(show)); return opts.indexOf(l.letter); }
    return -1;
  });
  if (idx < 0) throw new Error("could not derive the correct option");
  await (await page.$$(".lx-opt"))[idx].click();
}
if (!(await txt(p, ".lx-stats")).includes("1 / 30")) {
  await p.goto(url("#/letter/ba")); await p.waitForSelector('[data-action="check"]'); await p.click('[data-action="check"]');
  for (let i = 0; i < 3; i++) { await p.waitForSelector(".lx-opt"); await answerCorrectly(p); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); }
  await p.waitForSelector(".lx-score"); ok((await txt(p, ".lx-score")).includes("3 / 3"), "answering every question correctly scores 3 / 3 (answers derived from the course data)");
  await dash();
}
ok((await txt(p, ".lx-stats")).includes("1 / 30"), "a passed check marks the lesson complete");
ok((await p.$$(".lx-tile.is-done")).length === 1, "completed tile is marked");
ok((await txt(p, ".lx-stats")).includes("1 day"), "streak reflects real practice (1 day)");
// persistence across reload
await p.reload({ waitUntil: "load" }); await p.waitForSelector(".lx-grid");
ok((await txt(p, ".lx-stats")).includes("1 / 30"), "progress persists after reload");
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("ak-learn-progress-v1")));
ok(stored && stored.lessons["letter-ba"], "localStorage record exists");
// corrupt storage should not break the page
await p.evaluate(() => localStorage.setItem("ak-learn-progress-v1", "{broken")); await p.reload({ waitUntil: "load" }); await p.waitForSelector(".lx-grid");
ok((await txt(p, ".lx-stats")).includes("0 / 30"), "corrupt storage is handled (page still works)");
// reset with confirmation
await p.evaluate(() => { const s = window.LearnProgress.createStore(localStorage); s.load(); s.completeLesson("letter-ba", 100); s.save(); }); await p.reload({ waitUntil: "load" }); await p.waitForSelector(".lx-grid");
ok((await txt(p, ".lx-stats")).includes("1 / 30"), "seeded progress visible");
p.once("dialog", d => d.dismiss()); await p.click('[data-action="reset"]'); await new Promise(r => setTimeout(r, 200));
ok((await txt(p, ".lx-stats")).includes("1 / 30"), "reset cancelled -> progress kept");
p.once("dialog", d => d.accept()); await p.click('[data-action="reset"]'); await new Promise(r => setTimeout(r, 200));
ok((await txt(p, ".lx-stats")).includes("0 / 30") && !(await p.evaluate(() => localStorage.getItem("ak-learn-progress-v1"))), "reset confirmed -> progress and storage cleared");
// practice flow: 10 questions, all 6 types selectable
await p.goto(base + "/learn-arabic/#/practice"); await p.waitForSelector('[data-action="practice"]');
ok((await p.$$('[data-action="practice"]')).length === 7, "practice menu: mixed + 6 types");
ok(await p.$eval('[data-action="practice-weak"]', e => e.disabled), "weak-letter practice disabled with no data (empty state)");
await p.click('[data-action="practice"][data-type="missing"]');
for (let i = 0; i < 10; i++) { await p.waitForSelector(".lx-opt"); ok(i > 0 || ((await p.$(".lx-show .lx-blank")) !== null && !(await txt(p, ".lx-show")).includes("＿")), i === 0 ? "missing-letter question shows a real blank element, no placeholder glyph" : "q" + i); await (await p.$$(".lx-opt"))[0].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); }
await p.waitForSelector(".lx-score"); ok(/\/ 10/.test(await txt(p, ".lx-score")), "practice round ends with /10 results");
await p.click('[data-action="retry"]'); await p.waitForSelector(".lx-opt"); ok((await txt(p, "#learnApp .lx-small")).includes("Question 1 of 10"), "Try again starts a new round");
// harakat lesson and check
await p.goto(url("#/harakat/harakat-2")); await p.waitForSelector(".lx-mark");
ok((await p.$$(".lx-mark")).length === 3, "harakat lesson 2 shows sukun/shadda/tanween");
await p.click('[data-action="check"]'); await p.waitForSelector(".lx-opt"); ok((await txt(p, ".lx-q")).length > 5, "harakat check question shown");
// reading/typing
await p.goto(base + "/learn-arabic/#/read"); await p.waitForSelector('[data-action="stage"]');
ok((await p.$$('[data-action="stage"]')).length === 6, "6 reading stages");
await p.click('[data-action="stage"][data-id="joined"]'); await p.waitForSelector("#lxEditor");
const target = await txt(p, ".lx-show-ar");
await p.type("#lxEditor", target.replace(/[\u064B-\u0652]/g, "")); await p.keyboard.press("Enter"); await p.waitForSelector("#lxTNextBtn");
ok((await txt(p, "#lxTFb")).includes("Correct"), "letters-mode stage: answer typed without harakat accepted");
// audio graceful degrade (headless has no voices)
await p.goto(url("#/letter/alif")); await p.waitForSelector(".lx-hear");
ok((await txt(p, ".lx-note")).length > 20, "audio status/notice shown");
await p.click(".lx-hear"); ok(p.errs.length === 0, "clicking Hear does not throw");
// non-existent lesson
await p.goto(base + "/learn-arabic/#/letter/zzz"); await p.waitForSelector(".lx-h"); ok((await txt(p, ".lx-h")).includes("not found"), "unknown lesson shows friendly error");
ok(p.errs.length === 0, "no console/page errors on desktop: " + JSON.stringify(p.errs));
// mobile layout: no horizontal overflow on key views
const m = await newPage(375, 740);
for (const h of ["", "#/letter/ayn", "#/practice", "#/harakat/harakat-1", "#/read"]) {
  await m.goto(url(h), { waitUntil: "load" }); await m.waitForSelector("#learnApp .lx-h");
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 1, `mobile 375px no horizontal overflow at '${h || "dashboard"}' (${ov}px)`);
}
ok(m.errs.length === 0, "no errors on mobile: " + JSON.stringify(m.errs));
await m.screenshot({ path: "/tmp/e2e/mobile-letter.png" });
await m.goto(url("#/letter/ba")); await m.waitForSelector(".lx-hero-ar"); await m.screenshot({ path: "/tmp/e2e/mobile-ba.png" });
// dark theme sanity + desktop shots
await p.goto(base + "/learn-arabic/"); await p.waitForSelector(".lx-grid"); await p.screenshot({ path: "/tmp/e2e/desktop-home.png" });
await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark")); await p.screenshot({ path: "/tmp/e2e/desktop-dark.png" });
// existing tools still load without errors
for (const path of ["/", "/arabic-keyboard/", "/tashkeel/", "/calligraphy-editor/", "/translation/", "/arabic-alphabet/", "/typing-test/", "/learn-arabic/"]) {
  const t = await newPage(); let st = 0; try { const res = await t.goto(base + path, { waitUntil: "load", timeout: 20000 }); st = res ? res.status() : -1; } catch (e) { st = "ERR " + e.message.slice(0, 60); }
  ok((st === 200 || st === 304) && t.errs.length === 0, `existing page ${path} loads ${st} errors=${JSON.stringify(t.errs).slice(0, 200)}`); await t.close().catch(() => {});
}
await H.finish();
