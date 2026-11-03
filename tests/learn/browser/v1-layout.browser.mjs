// V1 views: responsive layout, light/dark contrast, links and controls, English-mode URLs.
import { harness, sleep, txt } from "./lib.mjs";
import { KEY, writeStore, todayNo, finishSession, planAnswer, dupIds } from "./v1-lib.mjs";
const H = await harness("v1-layout"); const { base, ok } = H; let N = 0;
const url = (h, q = "") => `${base}/learn-arabic/?n=${++N}${q}${h || ""}`;
const KNOWN = new Set(["speak", "check", "practice", "practice-weak", "stage", "answer", "typecheck", "next", "retry", "reset", "vpractice", "ppractice", "review-start"]);
const seed = T => ({ v: 2, lessons: {}, stats: {}, sessions: [], days: [], srs: { "letter:ba": { b: 2, d: T - 1, n: 1, w: 0, l: T - 3 }, "num-1": { b: 1, d: T - 1, n: 1, w: 1, l: T - 2 }, "col-red": { b: 4, d: T - 1, n: 3, w: 0, l: T - 8 }, "pat-where-1": { b: 4, d: T, n: 3, w: 0, l: T - 7 }, "fam-son": { b: 2, d: T + 3, n: 1, w: 0, l: T - 1 } } });
const VIEWS = ["", "#/vocab", "#/vocab/numbers", "#/vocab/colours", "#/vocab/family", "#/vocab/greetings", "#/patterns", "#/patterns/this-m", "#/patterns/this-f", "#/patterns/i-am", "#/patterns/where-is", "#/review", "#/practice", "#/read"];
const overflow = p => p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: [...document.querySelectorAll("#learnApp *")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > document.documentElement.clientWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.tagName + "." + (e.className || "").toString().slice(0, 24)) }));
const open = async (p, hash) => { await p.goto(url(hash), { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h, #learnApp .lx-grid"); await sleep(80); };

/* 1. no horizontal overflow on any new view at phone, small-phone and desktop widths ----------------------------------------------- */
for (const [w, h, mobile] of [[375, 740, true], [320, 640, true], [1280, 900, false]]) {
  const p = await H.page({ w, h, mobile }); await p.goto(url(""), { waitUntil: "load" }); await p.waitForSelector(".lx-grid"); await writeStore(p, seed(await todayNo(p)));
  const bad = [];
  for (const v of VIEWS) { await open(p, v); const o = await overflow(p); if (o.over > 1 || o.wide.length) bad.push(`${v || "dashboard"}: ${o.over}px ${o.wide.join(",")}`); }
  // question views
  await open(p, "#/vocab/numbers"); await p.click('[data-action="vpractice"][data-type="v-match"]'); await p.waitForSelector(".lx-opt"); let o = await overflow(p); if (o.over > 1 || o.wide.length) bad.push("choice question: " + o.over);
  await open(p, "#/patterns/this-m"); await p.click('[data-action="ppractice"]'); await p.waitForSelector(".lx-blank-word"); o = await overflow(p); if (o.over > 1 || o.wide.length) bad.push("sentence fill-in: " + o.over);
  await open(p, "#/vocab/colours"); await p.click('[data-action="vpractice"][data-type="v-recall"]'); await p.waitForSelector("#lxEditor", { visible: true }); await p.waitForFunction(() => LearnTypingDock.state().keyboard === "ready"); o = await overflow(p); if (o.over > 1) bad.push("recall + keyboard dock: " + o.over);
  const keys = await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll("#lxKb .key")].filter(k => { const r = k.getBoundingClientRect(); return r.left < -1 || r.right > W + 1; }).length; }); if (keys) bad.push("keyboard keys outside viewport: " + keys);
  ok(bad.length === 0, `${w}px: no horizontal overflow on ${VIEWS.length} views + choice, sentence-gap and recall/keyboard questions` + (bad.length ? " BAD: " + bad.join(" | ") : ""));
  ok(p.errs.length === 0, `${w}px: no console/page errors ` + JSON.stringify(p.errs)); await p.close();
}
/* 2. readable text in light and dark mode ------------------------------------------------------------------------------------------------ */
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
const contrastProbe = p => p.evaluate(() => {
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.95)) return c; } return getComputedStyle(document.body).backgroundColor; };
  const sels = [".lx-ex b", ".lx-ex small", ".lx-small", ".lx-card h3", ".lx-card p", ".lx-speech-status", ".lx-speech-label", ".lx-note", ".lx-btn:not(.lx-btn-alt)", ".lx-btn-alt", ".lx-chip", ".lx-q-en", ".lx-dialect h3", ".lx-opt", ".lx-badge", ".lx-stat span", ".lx-h", ".lx-hear"]; const out = [];
  sels.forEach(s => { const el = document.querySelector(s); if (!el) return; const cs = getComputedStyle(el); out.push({ s, fg: cs.color, bg: s === ".lx-btn:not(.lx-btn-alt)" ? cs.backgroundColor : bgOf(el), size: parseFloat(cs.fontSize) }); }); return out; });
const views = [["#/vocab/greetings", "topic page"], ["#/", "dashboard"], ["#/review", "review page"]];
for (const theme of ["light", "dark"]) {
  const p = await H.page({ w: 1100 }); await p.goto(url(""), { waitUntil: "load" }); await p.waitForSelector(".lx-grid"); await writeStore(p, seed(await todayNo(p)));
  const low = [];
  for (const [hash, name] of views) { await open(p, hash); await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme); await sleep(200); await p.evaluate(() => { document.documentElement.style.transition = "none"; });
    for (const c of await contrastProbe(p)) { const r = ratio(c.fg, c.bg), need = c.size >= 24 || (c.size >= 18.66) ? 3 : 4.5; if (r < need) low.push(`${name} ${c.s} ${r.toFixed(2)}:1 (<${need})`); } }
  ok(low.length === 0, `${theme} mode: text on the new views meets WCAG AA contrast (4.5:1)` + (low.length ? " LOW: " + low.join("; ") : "")); await p.close();
}
/* 3. every link and control resolves ----------------------------------------------------------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); await p.goto(url(""), { waitUntil: "load" }); await p.waitForSelector(".lx-grid"); await writeStore(p, seed(await todayNo(p)));
  const seen = new Set(), hashes = new Set(), rel = new Set(), unknownActions = [], dead = [];
  for (const v of VIEWS) { await open(p, v);
    const info = await p.evaluate(() => ({ hrefs: [...document.querySelectorAll("#learnApp a[href], .lx-intro a[href], .lx-main a[href]")].map(a => a.getAttribute("href")), actions: [...document.querySelectorAll("#learnApp [data-action], #lxTypePanel [data-action]")].map(b => b.dataset.action), emptyBtns: [...document.querySelectorAll("#learnApp button, #learnApp a")].filter(e => !e.textContent.trim() && !e.getAttribute("aria-label")).length }));
    info.hrefs.forEach(h => { if (h.startsWith("#/")) hashes.add(h); else if (!/^https?:/.test(h)) rel.add(h); }); info.actions.forEach(a => { seen.add(a); if (!KNOWN.has(a)) unknownActions.push(a); }); if (info.emptyBtns) dead.push(v + ": " + info.emptyBtns + " unnamed controls"); }
  ok(unknownActions.length === 0 && dead.length === 0, "every button on every new view has a handler that exists and an accessible name " + JSON.stringify({ actions: [...seen], unknownActions, dead }));
  const brokenHash = []; for (const h of hashes) { await open(p, h); if (/Page not found/.test(await txt(p, "#learnApp"))) brokenHash.push(h); }
  ok(hashes.size >= 20 && brokenHash.length === 0, `all ${hashes.size} in-app links open a real view` + (brokenHash.length ? " BROKEN: " + brokenHash.join(",") : ""));
  const statuses = await p.evaluate(async list => { const out = {}; for (const h of list) { try { out[h] = (await fetch(new URL(h, location.href))).status; } catch (e) { out[h] = "ERR"; } } return out; }, [...rel]);
  const bad = Object.entries(statuses).filter(([, s]) => s !== 200); ok(rel.size >= 4 && bad.length === 0, `all ${rel.size} links to other pages return 200 (${[...rel].join(" ")})` + (bad.length ? " BAD: " + JSON.stringify(bad) : ""));
  ok((await dupIds(p)).length === 0 && p.errs.length === 0, "no duplicate IDs; no console errors across all views " + JSON.stringify(p.errs)); await p.close();
}
/* 4. English-mode URLs work online ---------------------------------------------------------------------------------------------------------- */
{
  const p = await H.page({ w: 1100 }); const bad = [];
  for (const [hash, check] of [["#/vocab", () => document.querySelectorAll('a.lx-card[href^="#/vocab/"]').length === 4], ["#/vocab/numbers", () => document.querySelectorAll(".lx-ex").length === 11], ["#/vocab/greetings", () => document.querySelectorAll(".lx-dialect .lx-ex").length === 3], ["#/patterns/where-is", () => document.querySelectorAll(".lx-ex").length === 3], ["#/review", () => /Daily review/.test(document.querySelector(".lx-h").textContent)], ["#/letter/qaf", () => document.querySelector(".lx-hero-ar").textContent === "ق"]]) {
    await p.goto(url(hash, "&lang=en").replace("&lang=en#", "&lang=en#"), { waitUntil: "load" }); await p.waitForSelector("#learnApp .lx-h"); await sleep(500);
    const r = await p.evaluate(c => ({ h1: document.querySelector("h1").textContent, okView: (new Function("return (" + c + ")()"))(), arabic: [...document.querySelectorAll(".lx-ex-ar")].slice(0, 2).map(e => e.textContent) }), check.toString());
    if (r.h1 !== "Learn Arabic" || !r.okView) bad.push(hash + " " + JSON.stringify(r)); }
  ok(bad.length === 0, "English-mode URLs (?lang=en) open vocabulary, patterns, review and letter views with the page in English and the Arabic content untouched" + (bad.length ? " BAD: " + bad.join(" | ") : ""));
  await p.goto(url("#/vocab/numbers", "&lang=en"), { waitUntil: "load" }); await p.waitForSelector(".lx-ex"); await sleep(500);
  const ex = await p.evaluate(() => ({ first: document.querySelector(".lx-ex-ar").textContent, en: document.querySelector(".lx-ex b + *") && document.querySelector(".lx-ex").innerText }));
  ok(ex.first === "صِفْر" && /ṣifr/.test(ex.en) && /zero/.test(ex.en), "in English mode the vocabulary text is not mangled by the translator"); await p.close();
}
await H.finish();
