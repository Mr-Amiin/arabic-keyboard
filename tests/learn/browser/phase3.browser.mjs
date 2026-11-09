// Phase 3 in real Chromium: conversations, reading comprehension, mixed-topic review, journey, audio fallback, layout, dark mode, offline.
import { harness, sleep } from "./lib.mjs";
import { writeStore, readStore, todayNo, answerOne, planAnswer, dupIds } from "./v1-lib.mjs";
const H = await harness("phase3"); const { base, ok } = H; let N = 0;
const url = (h, q = "") => `${base}/learn-arabic/?n=${++N}${q}${h || ""}`;
const open = async (p, hash) => { await p.goto(url(hash), { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h, #learnApp .lx-grid"); await sleep(80); };
const fresh = async p => { await p.goto(url(""), { waitUntil: "load" }); await p.waitForSelector(".lx-grid"); await p.evaluate(() => localStorage.clear()); };
const seed = { v: 2, lessons: {}, stats: {}, sessions: [], days: [], srs: {} };

// Answers a comprehension check using the course's own data. wrongCount questions are deliberately answered wrongly.
async function runCheck(p, wrongCount = 0) {
  let wrong = 0;
  for (let i = 0; i < 20; i++) {
    await p.waitForFunction(() => document.querySelector(".lx-score") || document.querySelector(".lx-opt"), { timeout: 10000 });
    if (await p.$(".lx-score")) break;
    const idx = await p.evaluate(w => {
      const prompt = document.querySelector(".lx-q").textContent.trim(), all = [...LearnConversations.UNITS.flatMap(u => u.questions), ...LearnReading.PASSAGES.flatMap(r => r.questions)];
      const q = all.find(x => prompt.includes(x.prompt)), right = q.options[q.answer], opts = [...document.querySelectorAll(".lx-opt")].map(o => o.textContent.trim());
      const r = opts.indexOf(right); return w ? opts.findIndex((_, i) => i !== r) : r;
    }, wrong < wrongCount);
    if (wrong < wrongCount) wrong++;
    await (await p.$$(".lx-opt"))[idx].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn");
  }
  return p.$eval(".lx-score", e => e.textContent.replace(/\s+/g, " ").trim());
}

/* 1. journey: first step is obvious, nothing locked, no inflated progress -------------------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/journey");
  const j = await p.evaluate(() => ({ stages: [...document.querySelectorAll(".lx-stage")].map(s => s.className), locked: document.querySelectorAll(".is-locked").length, h: document.querySelector(".lx-h").textContent, text: document.getElementById("learnApp").innerText }));
  ok(j.stages.length === 8, "journey shows the eight stages in order (" + j.stages.length + ")");
  ok(j.stages.filter(s => /is-current/.test(s)).length === 1 && j.stages.filter(s => /is-done/.test(s)).length === 0 && j.locked === 0, "a new learner has one current stage, none done and nothing locked");
  await open(p, "#/");
  ok(await p.evaluate(() => /Learning path/i.test(document.getElementById("learnApp").innerText) && !!document.querySelector(".lx-path")), "dashboard shows the learning path with the next action");
  ok(p.errs.length === 0, "journey views: no console errors " + JSON.stringify(p.errs)); await p.close();
}

/* 2. conversation unit: content shown, audio buttons, comprehension scored and recorded honestly ---------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/conversations");
  ok(await p.$$eval('a.lx-card[href^="#/conversation/"]', a => a.length) === 8, "conversations list shows eight units");
  await open(p, "#/conversation/order");
  const d = await p.evaluate(() => ({ lines: document.querySelectorAll(".lx-dl").length, hears: document.querySelectorAll(".lx-dl .lx-hear").length, ar: [...document.querySelectorAll(".lx-dl .lx-ex-ar")].every(e => e.lang === "ar" && e.dir === "rtl"), tr: [...document.querySelectorAll(".lx-dl b")].every(b => b.textContent.trim()), reg: !!document.querySelector(".lx-note")?.textContent.match(/Modern Standard Arabic/), dia: !!document.querySelector(".lx-dialect h3")?.textContent.match(/not Modern Standard Arabic/), speak: /Speaking practice/.test(document.body.innerText) }));
  ok(d.lines >= 5 && d.hears === d.lines && d.ar && d.tr, "dialogue shows Arabic (lang=ar, rtl), transliteration, translation and one Hear button per line");
  ok(d.reg && d.dia && d.speak, "register is labelled MSA, dialect variants are labelled as not-MSA, and a speaking activity is present");
  // fail first: 1 wrong of 4 = 75% would pass, so miss enough to fail
  await p.click('[data-action="ccheck"]'); const bad = await runCheck(p, 4);
  let rec = (await readStore(p)).units["conv-order"];
  ok(/0 \//.test(bad) && rec && rec.best === 0 && rec.tries === 1 && !(await p.evaluate(() => LearnProgress && false)), "a failed check records the real score (0%), counts a try and does not complete the unit: " + bad);
  await open(p, "#/journey"); ok(await p.evaluate(() => !document.querySelector('a[href="#/conversation/order"]')?.closest("li")?.className.includes("is-done")), "journey does not mark a failed unit as done");
  await open(p, "#/conversation/order"); await p.click('[data-action="ccheck"]'); const good = await runCheck(p, 0);
  rec = (await readStore(p)).units["conv-order"];
  ok(/100%/.test(good) && rec.best === 100 && rec.tries === 2 && rec.at > 0, "a perfect check records 100% and completes the unit: " + good);
  await open(p, "#/conversation/order"); ok(await p.evaluate(() => /Passed/.test(document.querySelector("article").innerText)), "unit page now shows 'Passed' with the best score");
  await p.click('[data-action="spoke"]'); rec = (await readStore(p)).units["conv-order"]; ok(rec.spoke === true && rec.best === 100, "speaking practice is recorded separately from the score");
  ok(p.errs.length === 0, "conversation views: no console errors " + JSON.stringify(p.errs)); await p.close();
}

/* 3. conversation vocabulary + sentence practice feed the spaced-repetition schedule -------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/conversation/shop");
  await p.click('[data-action="csent"]');
  for (let i = 0; i < 12; i++) { await p.waitForFunction(() => document.querySelector(".lx-score") || document.querySelector(".lx-opt") || (document.getElementById("lxTypePanel") && !document.getElementById("lxTypePanel").hidden), { timeout: 15000 }); if (await p.$(".lx-score")) break; await answerOne(p, false); }
  const srs = (await readStore(p)).srs; const ids = Object.keys(srs);
  ok(ids.length >= 1 && ids.every(id => id.startsWith("snt-shop")) && ids.every(id => srs[id].b >= 1), "sentence practice created review cards only for that unit's sentences: " + ids.join(","));
  await p.close();
}

/* 4. reading: level 4 opens without harakat, toggles work, score recorded ------------------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/reading");
  ok(await p.$$eval('a.lx-card[href^="#/reading/"]', a => a.length) === 8, "reading list shows eight passages in four levels");
  await open(p, "#/reading/read-d1");
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, sel);
  ok(!(await vis(".rd-v")) && (await vis(".rd-p")), "level-4 dialogue starts WITHOUT harakat");
  await p.click('[data-what="marks"]'); ok((await vis(".rd-v")) && !(await vis(".rd-p")) && await p.$eval('[data-what="marks"]', b => b.getAttribute("aria-pressed") === "true"), "Harakat toggle shows the vowelled text and updates aria-pressed");
  ok(!(await vis(".rd-en")), "English translation is hidden until requested"); await p.click('[data-what="en"]'); ok(await vis(".rd-en"), "English toggle reveals the translation");
  await open(p, "#/reading/read-s1"); ok(await vis(".rd-v"), "level-1 sentences open fully vowelled");
  await p.click('[data-action="rcheck"]'); const sc = await runCheck(p, 1);
  const rec = (await readStore(p)).units["read-s1"]; ok(rec && rec.best === 75 && rec.tries === 1 && rec.at > 0, "1 miss of 4 = 75% is recorded and passes (pass mark 70%): " + sc);
  ok(p.errs.length === 0, "reading views: no console errors " + JSON.stringify(p.errs)); await p.close();
}

/* 5. mixed-topic review ---------------------------------------------------------------------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/vocab");
  await p.click('[data-action="mixed"]'); const topics = new Set(); let n = 0;
  for (let i = 0; i < 14; i++) {
    await p.waitForFunction(() => document.querySelector(".lx-score") || document.querySelector(".lx-opt") || (document.getElementById("lxTypePanel") && !document.getElementById("lxTypePanel").hidden), { timeout: 15000 });
    if (await p.$(".lx-score")) break; await answerOne(p, false); n++;
  }
  const srs = (await readStore(p)).srs, ids = Object.keys(srs);
  const tp = await p.evaluate(ids => ids.map(id => (LearnReview.BY_ID[id] || {}).topic), ids);
  ok(n === 12 && ids.length >= 10, "mixed-topic review asks 12 questions and schedules the words it asked (" + n + " questions, " + ids.length + " cards)");
  ok(new Set(tp).size >= 5, "mixed-topic review spans several topics: " + [...new Set(tp)].join(",")); await p.close();
}

/* 6. no inflated progress: opening pages and failing does not change the journey; real progress shows -------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await fresh(p); await open(p, "#/conversation/intro"); await open(p, "#/reading/read-p1"); await open(p, "#/vocab/food");
  await open(p, "#/journey"); const pct = await p.evaluate(() => (document.querySelector(".lx-journey-pct, .lx-prog, progress")?.textContent || document.getElementById("learnApp").innerText).match(/(\d+)%/)?.[1]);
  ok(pct === undefined || pct === "0", "opening lessons without completing them leaves the journey at 0% (" + pct + ")"); await p.close();
}

/* 7. audio fallback: no speech support, and no Arabic voice ----------------------------------------------------------------------------- */
for (const mode of ["no-synth", "no-arabic-voice"]) {
  const p = await H.page({ w: 1100 });
  await p.evaluateOnNewDocument(m => { if (m === "no-synth") { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; } else { Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [{ name: "English", lang: "en-US" }], cancel() {}, speak() {}, addEventListener() {} } }); } }, mode);
  await open(p, "#/conversation/greet");
  const note = await p.$eval(".lx-note", e => e.textContent);
  ok(mode === "no-synth" ? /cannot play speech/.test(note) : /No Arabic voice/.test(note), mode + ": the page says plainly that audio is unavailable or unreliable");
  ok(!/native recording/i.test(note) || /not a native recording/i.test(note), mode + ": no claim of native recordings");
  await p.click(".lx-dl .lx-hear"); await sleep(200); ok(p.errs.length === 0, mode + ": pressing Hear does not throw " + JSON.stringify(p.errs));
  await p.close();
}
{
  const p = await H.page({ w: 1100 });
  await p.evaluateOnNewDocument(() => { Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => [{ name: "Test Arabic", lang: "ar-SA", localService: true }], cancel() {}, speak() {}, addEventListener() {} } }); window.SpeechSynthesisUtterance = function (t) { this.text = t; }; });
  await open(p, "#/conversation/greet"); const t = await p.$eval(".lx-note", e => e.textContent);
  ok(/device-generated speech, not a native recording/.test(t), "with an Arabic voice the page identifies it as device-generated speech"); await p.close();
}

/* 8. layout: no horizontal overflow on every new view at phone / small phone / desktop ------------------------------------------------------- */
const VIEWS = ["#/journey", "#/conversations", ...["intro", "family", "greet", "name", "order", "shop", "direct", "daily"].map(s => "#/conversation/" + s), "#/reading", ...["read-s1", "read-s2", "read-p1", "read-p2", "read-t1", "read-t2", "read-d1", "read-d2"].map(s => "#/reading/" + s), "#/vocab", "#/vocab/food", "#/vocab/routine", "#/vocab/time", "#/vocab/shopping"];
for (const [w, h, mobile] of [[375, 740, true], [320, 640, true], [1280, 900, false]]) {
  const p = await H.page({ w, h, mobile }); await fresh(p); const bad = [];
  for (const v of VIEWS) { await open(p, v); const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll("#learnApp *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1) && !e.closest(".lx-opts,.lx-scroll"); }).slice(0, 3).map(e => e.className || e.tagName) })); if (o.over > 1 || o.wide.length) bad.push(`${v}: ${o.over}px ${o.wide.join(",")}`); }
  await open(p, "#/reading/read-d1"); await p.click('[data-what="tr"]'); await p.click('[data-what="en"]'); await p.click('[data-what="marks"]');
  const o2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o2 > 1) bad.push("reading with all aids on: " + o2 + "px");
  await open(p, "#/conversation/intro"); await p.click('[data-action="ccheck"]'); await p.waitForSelector(".lx-opt");
  const o3 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o3 > 1) bad.push("comprehension question: " + o3 + "px");
  ok(bad.length === 0, `${w}px: no horizontal overflow on ${VIEWS.length} Phase 3 views + comprehension/reading aids` + (bad.length ? " BAD: " + bad.join(" | ") : ""));
  ok(p.errs.length === 0, `${w}px: no console errors ` + JSON.stringify(p.errs)); await p.close();
}

/* 9. dark mode: contrast on Phase 3 views --------------------------------------------------------------------------------------------------- */
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
for (const theme of ["light", "dark"]) {
  const p = await H.page({ w: 1100 }); await fresh(p); const low = [];
  for (const v of ["#/journey", "#/conversations", "#/conversation/order", "#/reading", "#/reading/read-t1"]) {
    await open(p, v); await p.evaluate(t => { document.documentElement.setAttribute("data-theme", t); document.documentElement.style.transition = "none"; }, theme); await sleep(150);
    const rows = await p.evaluate(() => {
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.95)) return c; } return getComputedStyle(document.body).backgroundColor; };
      const out = []; ["#learnApp p", "#learnApp h3", ".lx-dl-en", ".lx-dl-who", ".lx-small", ".lx-badge", ".lx-stage h3", ".lx-card h3", ".lx-card p", ".lx-note", ".lx-btn:not(.lx-btn-alt)", ".lx-btn-alt", ".lx-hear", ".lx-ex b", ".rd-en", ".lx-tick-i"].forEach(s => { document.querySelectorAll(s).forEach((el, i) => { if (i > 2 || !el.offsetParent) return; const cs = getComputedStyle(el); out.push({ s, fg: cs.color, bg: s === ".lx-btn:not(.lx-btn-alt)" ? cs.backgroundColor : bgOf(el), size: parseFloat(cs.fontSize) }); }); }); return out; });
    for (const c of rows) { const r = ratio(c.fg, c.bg), need = c.size >= 18.66 ? 3 : 4.5; if (r < need) low.push(`${v} ${c.s} ${r.toFixed(2)}:1`); }
  }
  ok(low.length === 0, `${theme} mode: Phase 3 text meets WCAG AA contrast` + (low.length ? " LOW: " + [...new Set(low)].join("; ") : "")); await p.close();
}

/* 10. page integrity ------------------------------------------------------------------------------------------------------------------------ */
{
  const p = await H.page({ w: 1100 }); await fresh(p); let dup = [], dead = [];
  for (const v of VIEWS) { await open(p, v); dup.push(...await dupIds(p)); const hs = await p.$$eval('#learnApp a[href^="#/"]', a => a.map(x => x.getAttribute("href"))); for (const h of new Set(hs)) if (!(await p.evaluate(h2 => { const parts = h2.slice(2).split("/"); return true; }, h))) dead.push(h); }
  ok(dup.length === 0, "no duplicate element ids on any Phase 3 view " + JSON.stringify(dup));
  const hrefs = new Set(); for (const v of ["#/journey", "#/conversations", "#/reading"]) { await open(p, v); (await p.$$eval('#learnApp a[href^="#/"]', a => a.map(x => x.getAttribute("href")))).forEach(h => hrefs.add(h)); }
  const broken = []; for (const h of hrefs) { await open(p, h); if (await p.evaluate(() => /Page not found/.test(document.getElementById("learnApp").innerText))) broken.push(h); }
  ok(broken.length === 0, `all ${hrefs.size} links on the journey, conversations and reading pages open a real view ` + JSON.stringify(broken)); await p.close();
}
await H.finish();
