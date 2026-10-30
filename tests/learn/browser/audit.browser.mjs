import { harness, sleep, txt } from "./lib.mjs";
const H = await harness("audit"); const base = H.base; const ok = H.ok;
const mk = (w = 1000, h = 900) => H.page({ w, h });
let N = 0; const p = await mk();
// 1. focus lands on the new question prompt after Next (was: static title)
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/practice"); await p.waitForSelector('[data-action="practice"]');
await p.click('[data-action="practice"][data-type="mixed"]'); await p.waitForSelector(".lx-opt");
ok(await p.evaluate(() => document.activeElement.classList.contains("lx-q")), "focus is on the question prompt at Q1");
await (await p.$$(".lx-opt"))[0].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); await p.waitForSelector(".lx-opt");
ok(await p.evaluate(() => document.activeElement.classList.contains("lx-q") && /Question 2 of 10/.test(document.activeElement.textContent)), "after Next, focus moves to Q2 prompt and announces 'Question 2 of 10'");
// 2. every missing-letter question in a 10-round has a blank; collect ZWJ structure
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/practice"); await p.waitForSelector('[data-action="practice"]');
await p.click('[data-action="practice"][data-type="missing"]');
let blanks = 0, bad = 0;
for (let i = 0; i < 10; i++) { await p.waitForSelector(".lx-opt");
  const r = await p.evaluate(() => { const w = document.querySelector(".lx-show .lx-ar"); return { blank: !!w.querySelector(".lx-blank"), txt: w.textContent, labelled: w.getAttribute("role") === "img" }; });
  if (r.blank && !/[＿_]/.test(r.txt) && r.labelled) blanks++; else bad++;
  await (await p.$$(".lx-opt"))[0].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); }
ok(blanks === 10 && bad === 0, `10/10 missing-letter questions render a real, labelled blank (${blanks} ok, ${bad} bad)`);
// 3. look-alike round: all 10 questions are look-alike prompts
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/practice"); await p.waitForSelector('[data-action="practice"]');
await p.click('[data-action="practice"][data-type="similar"]'); let sim = 0;
for (let i = 0; i < 10; i++) { await p.waitForSelector(".lx-opt"); if ((await p.$eval(".lx-q", e => e.textContent)).includes("look alike")) sim++; await (await p.$$(".lx-opt"))[0].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); }
ok(sim === 10, `look-alike round: ${sim}/10 are look-alike questions`);
// 4. Ya look-alike: answer always among options (UI level, 40 renders via engine in page)
const yaOk = await p.evaluate(() => { let bad = 0; for (let s = 1; s <= 300; s++) { const q = LearnEngine.makeQuestion("similar", "ya", LearnEngine.mulberry32(s)); if (!q.options.some(o => o.value === "ya")) bad++; } return bad; });
ok(yaOk === 0, "Ya look-alike question always contains Ya (300 seeds)");
// 5. non-joining lesson shows the shapes actually used, not dashes
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/letter/dal"); await p.waitForSelector(".lx-forms");
const caps = await p.$$eval(".lx-form", els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()));
ok(caps[1].includes("same as Alone") && caps[2].includes("same as End") && !caps.join("").includes("—"), "Dal: Beginning/Middle show real shapes: " + JSON.stringify(caps));
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/letter/ba"); await p.waitForSelector(".lx-forms");
ok((await p.$$(".lx-form.is-na")).length === 0, "Ba (connecting) has no 'same as' cells");
// 6. harakat reading stage = choice questions that really test the mark
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/read"); await p.waitForSelector('[data-action="stage"][data-id="marked"]');
ok((await p.$eval('[data-id="marked"]', e => e.textContent)).includes("choose its sound"), "stage 2 card describes reading, not typing");
await p.click('[data-action="stage"][data-id="marked"]'); await p.waitForSelector(".lx-opt"); ok(!(await p.$("#lxType")) && (await p.$eval("#lxTypePanel", e => e.hidden)), "stage 2 (choice) shows no typing box or dock");
const opts = await p.$$eval(".lx-opt", e => e.map(x => x.textContent.trim()).sort().join(","));
ok(/^b,ba,bi,bu$|^[a-z]+,[a-z]+a,[a-z]+i,[a-z]+u$/.test(opts), "stage 2 options are consonant + a/i/u + bare consonant: " + opts);
// typing stage focuses the input
await p.goto(base + "/learn-arabic/?n=" + (++N) + "#/read"); await p.waitForSelector('[data-action="stage"][data-id="sentences"]'); await p.click('[data-action="stage"][data-id="sentences"]'); await p.waitForSelector("#lxEditor");
ok(await p.evaluate(() => document.activeElement.id === "lxEditor"), "typing item: focus is in the answer box");
const sent = await p.$eval(".lx-show-ar", e => e.textContent); await p.type("#lxEditor", sent.replace(/[\u064B-\u0652\u0670]/g, "")); await p.keyboard.press("Enter"); await p.waitForSelector("#lxTNextBtn");
ok((await p.$eval("#lxTFb", e => e.textContent)).includes("Correct"), "sentence with dagger alif accepted when typed plainly: " + sent);
// 7. visual proof page for blank shaping, using the app's exact markup/CSS
await p.goto(base + "/learn-arabic/?n=" + (++N) + ""); await p.waitForSelector(".lx-grid");
await p.evaluate(() => { const E = LearnEngine, D = LearnData, ZWJ = "\u200D"; const cases = [["sin", 1], ["ba", 0], ["dal", 0], ["ra", 0], ["alif", 1], ["shin", 1], ["waw", 1], ["ya", 1]];
  const box = document.createElement("div"); box.id = "proof"; box.style.cssText = "position:fixed;inset:0;z-index:9999;background:#fff;padding:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;overflow:auto"; box.className = "lx";
  cases.forEach(([id, ei]) => { const l = D.LETTERS.find(x => x.id === id), ex = l.examples[ei], chars = Array.from(ex.plain); let idx = chars.findIndex(c => E.normalizeAr(c) === E.normalizeAr(l.letter)); if (ex.position === "final") idx = chars.length - 1; if (ex.position === "initial") idx = 0;
    const before = chars.slice(0, idx).join(""), after = chars.slice(idx + 1).join("");
    box.insertAdjacentHTML("beforeend", `<div style="border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center"><div class="lx-ar" style="font-size:3rem" lang="ar" dir="rtl">${ex.plain}</div><div class="lx-ar" style="font-size:3rem" lang="ar" dir="rtl">${before}${before ? ZWJ : ""}<span class="lx-blank"></span>${l.connects && after ? ZWJ : ""}${after}</div><small>${l.nameEn} · ${ex.translit} (${l.connects ? "joins forward" : "no forward join"})</small></div>`); });
  document.body.appendChild(box); });
await sleep(300);
ok(p.errs.length === 0, "no page errors: " + JSON.stringify(p.errs));
// 8. 320px + mobile menu still works on the Learn page
const m = await mk(320, 640);
for (const h of ["", "#/letter/dal", "#/practice", "#/read"]) { await m.goto(base + "/learn-arabic/" + h); await m.waitForSelector("#learnApp .lx-h"); const ov = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ov <= 1, `320px: no horizontal overflow at '${h || "dashboard"}' (${ov}px)`); }
await m.goto(base + "/learn-arabic/"); await m.waitForSelector(".lx-grid"); await m.click("#menuToggle"); await new Promise(r => setTimeout(r, 400));
ok(await m.evaluate(() => { const n = document.getElementById("mobileNav"); return n && getComputedStyle(n).visibility !== "hidden" && n.getBoundingClientRect().width > 100; }), "site mobile menu opens on the Learn page");
ok(m.errs.length === 0, "no errors at 320px: " + JSON.stringify(m.errs));
await H.finish();
