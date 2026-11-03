// V1 learner journeys in real Chromium: vocabulary, spelling/recall (keyboard dock), patterns, spaced-repetition review, migration, reset.
import { harness, sleep, txt } from "./lib.mjs";
import { KEY, DAY, withClock, readStore, writeStore, todayNo, finishSession, answerOne, planAnswer, score, dupIds } from "./v1-lib.mjs";
const H = await harness("v1"); const { base, ok } = H; let N = 0;
const url = h => `${base}/learn-arabic/?n=${++N}${h || ""}`;
const fresh = async (hash, opts = {}) => { const p = await H.page(opts); p.kbReqs = 0; p.on("request", r => { if (/keyboard-tool\.js/.test(r.url())) p.kbReqs++; }); return p; };
const go = async (p, hash) => { await p.goto(url(hash), { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h, #learnApp .lx-grid"); };
const reset = p => p.evaluate(k => localStorage.removeItem(k), KEY);
const catalogOf = p => p.evaluate(() => LearnReview.ALL_IDS.length);

/* 1. fresh dashboard ---------------------------------------------------------------------------------------------- */
let p = await fresh(); await go(p, ""); await reset(p); await go(p, "");
const dash = await p.evaluate(() => ({ stats: document.querySelector(".lx-stats").innerText.replace(/\s+/g, " "), review: document.getElementById("lxDailyReview").innerText.replace(/\s+/g, " "), topics: [...document.querySelectorAll('a[href^="#/vocab/"]')].map(a => a.getAttribute("href")), patterns: !!document.querySelector('a[href="#/patterns"]'), tiles: document.querySelectorAll(".lx-tile").length }));
ok(dash.tiles === 28 && dash.stats.includes("0 / 30") && /0\s*reviews due/.test(dash.stats), "fresh dashboard: 28 letter tiles, 0 / 30 lessons, 0 reviews due: " + dash.stats.slice(0, 80));
ok(/Nothing is scheduled yet/.test(dash.review), "fresh dashboard: Daily review explains that nothing is scheduled (empty state)");
ok(JSON.stringify(dash.topics) === JSON.stringify(["#/vocab/numbers", "#/vocab/colours", "#/vocab/family", "#/vocab/greetings"]) && dash.patterns, "dashboard links to the four vocabulary topics and the sentence patterns");
ok(/Beta/.test(await txt(p, ".lx-intro")) && /not yet been reviewed by a qualified Arabic teacher/.test(await txt(p, ".lx-intro")), "page states plainly that the Arabic content is not yet teacher-reviewed (beta notice)");
/* 2. alphabet still complete ----------------------------------------------------------------------------------------- */
const letters = await p.evaluate(() => LearnData.LETTERS.map(l => [l.id, l.letter]));
let alphabetOk = 0; for (const [id, ch] of letters) { await p.evaluate(h => { location.hash = h; }, "#/letter/" + id); await p.waitForFunction(c => (document.querySelector(".lx-hero-ar") || {}).textContent === c, {}, ch); alphabetOk++; }
ok(alphabetOk === 28, "all 28 alphabet lessons still open and show the right letter");
/* 3. vocabulary topic pages ------------------------------------------------------------------------------------------ */
await go(p, "#/vocab"); ok((await p.$$('#learnApp a.lx-card[href^="#/vocab/"]')).length === 4, "vocabulary home lists the 4 topics");
const topicChecks = await p.evaluate(() => LearnVocab.TOPICS.map(t => ({ id: t.id, n: LearnVocab.ITEMS.filter(i => i.topic === t.id).length })));
for (const t of topicChecks) {
  await p.evaluate(h => { location.hash = h; }, "#/vocab/" + t.id); await p.waitForSelector(".lx-exs");
  const info = await p.evaluate(id => { const items = LearnVocab.ITEMS.filter(i => i.topic === id), rows = [...document.querySelectorAll("#learnApp > .lx-exs:first-of-type .lx-ex, #learnApp ul.lx-exs:not(.lx-dialect ul) .lx-ex")]; const shown = new Set([...document.querySelectorAll(".lx-ex-ar")].map(e => e.textContent)); return { n: items.length, allShown: items.every(i => shown.has(i.ar + (i.punct || ""))), hear: document.querySelectorAll(".lx-ex .lx-hear").length, practice: document.querySelectorAll('[data-action="vpractice"]').length }; }, t.id);
  ok(info.allShown && info.practice === 5 && info.hear >= info.n, `topic ${t.id}: all ${info.n} items shown exactly as in the data, each with a Hear button, 5 practice modes`);
}
await p.evaluate(() => { location.hash = "#/vocab/greetings"; }); await p.waitForSelector(".lx-dialect");
const dia = await p.evaluate(() => ({ text: document.querySelector(".lx-dialect").innerText, n: document.querySelectorAll(".lx-dialect .lx-ex").length }));
ok(dia.n === 3 && /not Modern Standard Arabic/i.test(dia.text) && /not quizzed/.test(dia.text) && /Egyptian/.test(dia.text) && /Levantine/.test(dia.text) && /Gulf/.test(dia.text), "greetings page: 3 regional variants clearly labelled 'not Modern Standard Arabic' and 'not quizzed'");
/* 4. correct answers -> scheduled (box 2, +2 days); all items recorded; results correct -------------------------------- */
await go(p, "#/vocab/numbers"); await reset(p); await go(p, "#/vocab/numbers"); const T0 = await todayNo(p);
await p.click('[data-action="vpractice"][data-type="mixed"]'); const kinds = await finishSession(p);
ok((await score(p)).startsWith("10 / 10"), "numbers, mixed practice, every answer correct: " + await score(p));
const st = await readStore(p), ids = Object.keys(st.srs);
ok(st.v === 2 && ids.length === 10 && ids.every(i => i.startsWith("num-")), `progress saved as schema v2 with ${ids.length} distinct numbers scheduled`);
ok(ids.every(i => st.srs[i].b === 2 && st.srs[i].d === T0 + 2 && st.srs[i].n === 1 && st.srs[i].w === 0 && st.srs[i].l === T0), "each item: first correct answer => box 2, due in exactly 2 days, 1 answer, 0 wrong");
ok(kinds.includes("type") && kinds.includes("click"), "a mixed round contains both choice and typed-recall questions");
ok(/Next review: in 2 days/.test(await txt(p, "#learnApp")), "results screen tells the learner when the next review is: " + (await txt(p, "#learnApp")).match(/Next review:[^.]*\./));
ok(p.kbReqs === 1, "the keyboard script was requested once, only when a recall question needed it");
/* 5. wrong answers -> box 1, due tomorrow, counted ------------------------------------------------------------------------ */
await go(p, "#/vocab/colours"); await p.click('[data-action="vpractice"][data-type="v-match"]'); await finishSession(p, () => true);
ok((await score(p)).startsWith("0 / 10"), "colours, match the meaning, every answer wrong: " + await score(p));
const st2 = await readStore(p), col = Object.keys(st2.srs).filter(i => i.startsWith("col-"));
ok(col.length === 10 && col.every(i => st2.srs[i].b === 1 && st2.srs[i].d === T0 + 1 && st2.srs[i].w === 1), "a miss => box 1, due tomorrow, 1 wrong recorded for each of the 10 colours");
await go(p, "#/vocab/colours");   // a real navigation: setting the same hash again would (correctly) not leave the results screen
ok(/10 of 10 practised · 0 mastered/.test(await txt(p, "#learnApp")), "topic page reflects real activity: 10 of 10 practised, 0 mastered");
/* 6. spelling: exactly one correct option; recall never shows the answer ---------------------------------------------- */
await go(p, "#/vocab/family"); await p.click('[data-action="vpractice"][data-type="v-spelling"]');
let spellingOk = 0;
for (let i = 0; i < 10; i++) { await p.waitForSelector(".lx-opt"); const r = await p.evaluate(() => { const q = document.querySelector(".lx-q").textContent, opts = [...document.querySelectorAll(".lx-opt")].map(o => o.textContent.trim()), it = LearnVocab.ITEMS.find(x => q.includes("“" + x.en + "”")); return { opts, right: it.plain, translitInPrompt: q.includes(it.translit), distinct: new Set(opts).size, hasBase: opts.filter(o => o === it.plain).length }; }); if (r.opts.length === 4 && r.distinct === 4 && r.hasBase === 1 && r.translitInPrompt) spellingOk++; await answerOne(p); }
ok(spellingOk === 10, "10/10 spelling questions: 4 distinct options, exactly one equals the real spelling, transliteration given in the prompt");
await go(p, "#/vocab/greetings"); await p.click('[data-action="vpractice"][data-type="v-recall"]'); await p.waitForSelector("#lxEditor", { visible: true });
const leak = await p.evaluate(() => ({ prompt: document.getElementById("lxTPrompt").innerText, arabicInPrompt: /[\u0600-\u06FF]/.test(document.getElementById("lxTPrompt").innerText), focus: document.activeElement.id }));
ok(!leak.arabicInPrompt && /Hint \(transliteration\)/.test(leak.prompt) && leak.focus === "lxEditor", "recall question: English meaning + transliteration hint only (no Arabic shown), focus is in the answer box");
const plan = await planAnswer(p, false); await p.type("#lxEditor", plan.text); await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn");
ok(/Correct/.test(await txt(p, "#lxTFb")), "recall: the plain spelling (no harakat) is accepted");
await p.click("#lxTNextBtn"); await p.waitForSelector("#lxEditor", { visible: true }); await p.type("#lxEditor", "ظظ"); await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn");
ok(/Not quite/.test(await txt(p, "#lxTFb")) && /Expected/.test(await txt(p, "#lxTFb")) && (await p.$$("#lxTFb .lx-hear")).length === 1, "recall: a wrong answer fails, shows the expected Arabic, and offers to hear it");
ok((await p.$$("#lxKb .key")).length === 74 && p.kbReqs === 2 && (await p.$$('script[src*="keyboard-tool"]')).length === 1, "the on-screen keyboard (74 keys) is reused; one script element, loaded lazily");
/* 7. dialect items are never quizzed ------------------------------------------------------------------------------------- */
await go(p, "#/vocab/greetings"); let sawDialect = false;
for (let round = 0; round < 3; round++) { await p.click('[data-action="vpractice"][data-type="mixed"]'); await finishSession(p, () => true); sawDialect = sawDialect || /إِزَّيَّك|كِيفَك|شْلُونَك/.test(await txt(p, "#learnApp")); await go(p, "#/vocab/greetings"); }
ok(!sawDialect, "three full greetings rounds never showed a dialect expression");
ok((await dupIds(p)).length === 0 && p.errs.length === 0, "no duplicate IDs and no console/page errors through vocabulary practice " + JSON.stringify(p.errs));
await p.close();

/* 8. sentence patterns ---------------------------------------------------------------------------------------------------- */
p = await fresh(); await go(p, ""); await reset(p); await go(p, "#/patterns");
ok((await p.$$('#learnApp a.lx-card[href^="#/patterns/"]')).length === 4, "patterns home lists the 4 patterns");
await p.evaluate(() => { location.hash = "#/patterns/this-m"; }); await p.waitForSelector(".lx-exs");
const pat = await p.evaluate(() => ({ rows: [...document.querySelectorAll(".lx-ex-ar")].map(e => e.textContent), want: LearnVocab.PATTERNS.find(x => x.id === "this-m").examples.map(e => e.ar), hear: document.querySelectorAll(".lx-ex .lx-hear").length, explain: document.querySelector("#learnApp p").textContent }));
ok(JSON.stringify(pat.rows) === JSON.stringify(pat.want) && pat.hear === 3 && /no word for “is”/.test(pat.explain), "pattern page shows its 3 examples exactly as in the data with Hear buttons and the explanation");
const T1 = await todayNo(p); await p.click('[data-action="ppractice"]'); await p.waitForSelector(".lx-opt");
const gap = await p.evaluate(() => ({ blank: !!document.querySelector(".lx-show .lx-blank-word"), label: document.querySelector(".lx-show [role=img]").getAttribute("aria-label"), opts: [...document.querySelectorAll(".lx-opt")].length, arOpts: document.querySelectorAll(".lx-opt .lx-opt-ar").length }));
ok(gap.blank && /missing word/.test(gap.label) && gap.opts === 4 && gap.arOpts === 4, "fill-in question: a real, labelled blank between the words and 4 Arabic options");
const pk = await finishSession(p); ok((await score(p)).startsWith("6 / 6") && pk.filter(k => k === "type").length === 3, "pattern practice = 3 fill-ins + 3 typed sentences, all correct: " + await score(p));
const ps = await readStore(p); ok(["pat-this-m-1", "pat-this-m-2", "pat-this-m-3"].every(i => ps.srs[i] && ps.srs[i].b === 2 && ps.srs[i].d === T1 + 2), "each pattern sentence is scheduled (box 2, +2 days)");
ok(p.errs.length === 0, "no errors in pattern practice " + JSON.stringify(p.errs)); await p.close();

/* 9. review queue: due exactly when expected, correct answers promote, misses lapse -------------------------------------------- */
const seed = T => ({ v: 2, lessons: {}, stats: {}, sessions: [], days: [], srs: {
  "letter:ba": { b: 2, d: T - 1, n: 1, w: 0, l: T - 3 }, "num-1": { b: 1, d: T - 1, n: 1, w: 1, l: T - 2 }, "num-2": { b: 3, d: T - 2, n: 2, w: 0, l: T - 6 }, "col-red": { b: 4, d: T - 1, n: 3, w: 0, l: T - 8 },
  "pat-this-m-1": { b: 1, d: T, n: 1, w: 1, l: T - 1 }, "pat-where-1": { b: 4, d: T, n: 3, w: 0, l: T - 7 },
  "fam-son": { b: 2, d: T + 3, n: 1, w: 0, l: T - 1 }, "fam-wife": { b: 5, d: T + 10, n: 4, w: 0, l: T - 4 } } });
p = await fresh(); await go(p, ""); const T = await todayNo(p); await writeStore(p, seed(T)); await go(p, "");
const rv = await p.evaluate(() => ({ stat: document.querySelector(".lx-stats").innerText.replace(/\s+/g, " "), panel: document.getElementById("lxDailyReview").innerText.replace(/\s+/g, " ") }));
ok(/6\s*reviews due/.test(rv.stat) && /6 item/.test(rv.panel) && /2 in your schedule|8 in your schedule/.test(rv.panel), "dashboard shows exactly the 6 due items (the 2 future items are excluded): " + rv.panel.slice(0, 90));
await p.click('#lxDailyReview a.lx-btn'); await p.waitForSelector(".lx-h");
const page = await txt(p, "#learnApp");
ok(/6 items are due now \(1 letter, 3 words, 2 sentences\)/.test(page), "review page summarises what is due by kind: " + (page.match(/\d+ items are due now \([^)]*\)/) || [""])[0]);
// The six due items are: letter ba, num-1 (one), num-2 (two), col-red (red), pat-this-m-1 and pat-where-1. None of their answers may appear (whole words only).
const leaked = (page.match(/\b(one|two|red|zero|Ba|book)\b|واحد|اثنان|أحمر|احمر|هَٰذَا|كِتَاب|الْكِتَابُ|ب\b/g) || []);
ok(leaked.length === 0, "the review page does not reveal the due items' answers before the test" + (leaked.length ? " LEAKED: " + JSON.stringify(leaked) + " in: " + page.slice(0, 300) : ""));
await p.click('[data-action="review-start"]'); const rk = await finishSession(p);
ok((await score(p)).startsWith("6 / 6") && rk.filter(k => k === "type").length === 2, "review of 6 due items (4 choice + 2 typed recall as the boxes dictate), all correct: " + await score(p));
const after = await readStore(p).then(s => s.srs), ex = { "letter:ba": [3, 4], "num-1": [2, 2], "num-2": [4, 7], "col-red": [5, 14], "pat-this-m-1": [2, 2], "pat-where-1": [5, 14] };
ok(Object.keys(ex).every(id => after[id].b === ex[id][0] && after[id].d === T + ex[id][1] && after[id].l === T), "promotions follow the ladder: ba 2->3 (+4d), num-1 1->2 (+2d), num-2 3->4 (+7d), col-red 4->5 (+14d), pat-this-m-1 1->2, pat-where-1 4->5 (+14d)");
ok(JSON.stringify(after["fam-son"]) === JSON.stringify({ b: 2, d: T + 3, n: 1, w: 0, l: T - 1 }) && JSON.stringify(after["fam-wife"]) === JSON.stringify({ b: 5, d: T + 10, n: 4, w: 0, l: T - 4 }), "items that were NOT due are untouched, field for field");
ok(/Next review: in 2 days/.test(await txt(p, "#learnApp")) && !(await p.$('[data-action="review-start"]')), "after the review nothing is due: no 'Review more' button, and the next review is announced for exactly 2 days ahead");
await p.evaluate(() => { location.hash = "#/"; }); await p.waitForSelector("#lxDailyReview");
ok(/0\s*reviews due/.test(await p.$eval(".lx-stats", e => e.innerText.replace(/\s+/g, " "))) && /All caught up\. Next review: tomorrow|Next review: (tomorrow|in 2 days)/.test(await txt(p, "#lxDailyReview")), "dashboard: 0 due, next review time shown");
await p.close();
/* ... the SAME stored schedule on later days (browser clock injected): items become due at the expected times --------------- */
const dueAt = async days => { const q = await fresh(); await withClock(q, days * DAY); await q.goto(url(""), { waitUntil: "load" }); await q.waitForSelector("#lxDailyReview"); const n = await q.evaluate(() => Number((document.querySelector(".lx-stats").innerText.match(/(\d+)\s*reviews due/) || [])[1])); await q.close(); return n; };
// after the review: num-1 & pat-this-m-1 due +2d; letter:ba +4d; num-2 +7d; col-red & pat-where-1 +14d; fam-son (seeded) +3d; fam-wife +10d
const expect = { 1: 0, 2: 2, 3: 3, 4: 4, 7: 5, 10: 6, 14: 8 };
for (const [d, n] of Object.entries(expect)) ok(await dueAt(Number(d)) === n, `clock +${d} day(s): ${n} item(s) due (as scheduled)`);
/* 10. misses in a review lapse to box 1 ------------------------------------------------------------------------------------- */
p = await fresh(); await go(p, ""); await writeStore(p, seed(T)); await go(p, "#/review"); await p.click('[data-action="review-start"]'); await finishSession(p, i => i === 0 || i === 3);
const lap = await readStore(p).then(s => s.srs), lapsed = Object.values(lap).filter(e => e.b === 1 && e.d === T + 1 && e.l === T);
ok(lapsed.length >= 1 && lapsed.length <= 2 && Object.keys(lap).length === 8, `deliberate misses lapse to box 1 and come back tomorrow (${lapsed.length} lapsed); schedule still has 8 items`);
ok(/Next review: tomorrow/.test(await txt(p, "#learnApp")), "after misses, the results screen says the lapsed items come back tomorrow"); await p.close();
/* 11. letters feed the scheduler: a passed quick check schedules that letter -------------------------------------------- */
p = await fresh(); await go(p, ""); await reset(p); await go(p, "#/letter/ba"); const T2 = await todayNo(p); await p.click('[data-action="check"]'); await finishSession(p);
const ls = await readStore(p); ok(ls.lessons["letter-ba"] && ls.srs["letter:ba"] && ls.srs["letter:ba"].b === 2 && ls.srs["letter:ba"].d === T2 + 2 && ls.srs["letter:ba"].n === 3, "passing the quick check completes the lesson AND schedules the letter (3 answers in one day count once: box 2, due +2 days)");
await p.close();
/* 12. migration from the previous schema, corrupt storage, reset --------------------------------------------------------------- */
p = await fresh(); await go(p, ""); const T3 = await todayNo(p);
await writeStore(p, { v: 1, lessons: { "letter-ba": { at: Date.now() - 3 * DAY, best: 100 }, "harakat-1": { at: Date.now() - 3 * DAY, best: 67 } }, stats: { ba: { c: 5, w: 1 } }, sessions: [{ at: Date.now() - 3 * DAY, kind: "check", correct: 3, total: 3 }], days: [] });
await go(p, ""); const mig = await p.evaluate(() => ({ stats: document.querySelector(".lx-stats").innerText.replace(/\s+/g, " "), done: document.querySelectorAll(".lx-tile.is-done").length, panel: document.getElementById("lxDailyReview").innerText.replace(/\s+/g, " ") }));
ok(/2 \/ 30/.test(mig.stats) && mig.done === 1 && /1 item is due now/.test(mig.panel) && /83%/.test(mig.stats), "a learner from the previous release keeps their 2 completed lessons and 83% accuracy (5 of 6); the letter passed 3 days ago is now due for review: " + mig.stats.slice(0, 100));
await p.evaluate(k => localStorage.setItem(k, "{broken json"), KEY); await go(p, "");
ok((await p.$$(".lx-tile")).length === 28 && /0 \/ 30/.test(await txt(p, ".lx-stats")), "corrupt stored data: the course still loads (fresh progress), no crash");
await writeStore(p, seed(T3)); await go(p, ""); p.once("dialog", d => d.dismiss()); await p.click('[data-action="reset"]'); await sleep(150);
ok(Object.keys((await readStore(p)).srs).length === 8, "reset cancelled: the review schedule is kept");
p.once("dialog", d => { ok(/review schedule/.test(d.message()), "reset confirmation mentions the review schedule"); d.accept(); }); await p.click('[data-action="reset"]'); await sleep(200);
ok((await readStore(p)) === null && /0\s*reviews due/.test(await p.$eval(".lx-stats", e => e.innerText.replace(/\s+/g, " "))), "reset confirmed: schedule and progress removed from storage; dashboard shows 0 due");
await p.close();
// storage that throws on every write (private mode / quota): patched BEFORE the page's scripts run
p = await fresh(); await p.evaluateOnNewDocument(() => { Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); }; });
await p.goto(url(""), { waitUntil: "load" }); await p.waitForSelector(".lx-grid");
ok(/cannot be saved in this browser/.test(await txt(p, "#learnApp")), "blocked storage: the dashboard warns that progress cannot be saved");
await go(p, "#/vocab/numbers"); await p.click('[data-action="vpractice"][data-type="v-match"]'); await finishSession(p);
ok((await score(p)).startsWith("10 / 10") && /Next review: in 2 days/.test(await txt(p, "#learnApp")), "blocked storage: practice still works end to end and the in-memory schedule is applied: " + await score(p));
ok((await p.evaluate(k => { try { return localStorage.getItem(k); } catch (e) { return "x"; } }, KEY)) === null, "blocked storage: nothing was written");
ok(p.errs.length === 0, "no console/page errors through review, migration and reset " + JSON.stringify(p.errs)); await p.close();
await H.finish();
