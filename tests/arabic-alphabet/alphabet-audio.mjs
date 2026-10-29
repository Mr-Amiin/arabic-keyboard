// Real-browser regression test: letter pronunciation on /arabic-alphabet/ (real Chromium + local static server; site code is NOT mocked).
// Only window.speechSynthesis / SpeechSynthesisUtterance are replaced by a recording fake in most scenarios, because headless
// Chromium has no speech voices at all. One scenario runs against the real, unstubbed engine.
// Run:  cd tests/arabic-alphabet && npm install && npm test
// Browser: Linux uses the bundled @sparticuz/chromium; elsewhere set CHROME_PATH (or PUPPETEER_EXECUTABLE_PATH) to Chrome/Chromium.
// NOTE: this does not replace a manual check on a physical desktop with real OS voices.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { KnownDevices } from "puppeteer-core";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url))), PORT = 8174, O = `http://localhost:${PORT}`;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(new URL(q.url, O).pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const bad = []; let total = 0; const ck = (n, ok, d = "") => { total++; if (!ok) bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };

async function launch() {
  const explicit = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) return puppeteer.launch({ executablePath: explicit, headless: true, args: ["--no-sandbox"] });
  if (process.platform !== "linux") throw new Error("Set CHROME_PATH to an installed Chrome/Chromium (the bundled build is Linux-only).");
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: [...chromium.args.filter((a) => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
}
const browser = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Independent expectations (deliberately NOT read from the code under test) ----------
// Intended spoken Arabic name for each displayed letter. Reviewed by a human; changing the site's table must change this one too.
const EXPECTED_SPOKEN = {
  "ا": "أَلِف",
  "ب": "بَاء",
  "ت": "تَاء",
  "ث": "ثَاء",
  "ج": "جِيم",
  "ح": "حَاء",
  "خ": "خَاء",
  "د": "دَال",
  "ذ": "ذَال",
  "ر": "رَاء",
  "ز": "زَاي",
  "س": "سِين",
  "ش": "شِين",
  "ص": "صَاد",
  "ض": "ضَاد",
  "ط": "طَاء",
  "ظ": "ظَاء",
  "ع": "عَيْن",
  "غ": "غَيْن",
  "ف": "فَاء",
  "ق": "قَاف",
  "ك": "كَاف",
  "ل": "لَام",
  "م": "مِيم",
  "ن": "نُون",
  "ه": "هَاء",
  "و": "وَاو",
  "ي": "يَاء"
};
// What the page displayed BEFORE the pronunciation change (taken from the original alphabet.js): must stay identical.
const EXPECTED_DISPLAY = {"ا":{"name":"ألف","translit":"Alif","initial":"ا","medial":"ـا","final":"ـا","example":"أَسَد — أسد"},"ب":{"name":"باء","translit":"Ba","initial":"بـ","medial":"ـبـ","final":"ـب","example":"بَيْت — بيت"},"ت":{"name":"تاء","translit":"Ta","initial":"تـ","medial":"ـتـ","final":"ـت","example":"تُفَّاح — تفاح"},"ث":{"name":"ثاء","translit":"Tha","initial":"ثـ","medial":"ـثـ","final":"ـث","example":"ثَعْلَب — ثعلب"},"ج":{"name":"جيم","translit":"Jim","initial":"جـ","medial":"ـجـ","final":"ـج","example":"جَمَل — جمل"},"ح":{"name":"حاء","translit":"Ha (7)","initial":"حـ","medial":"ـحـ","final":"ـح","example":"حِصَان — حصان"},"خ":{"name":"خاء","translit":"Kha (5)","initial":"خـ","medial":"ـخـ","final":"ـخ","example":"خُبْز — خبز"},"د":{"name":"دال","translit":"Dal","initial":"د","medial":"ـد","final":"ـد","example":"دَار — دار"},"ذ":{"name":"ذال","translit":"Dhal","initial":"ذ","medial":"ـذ","final":"ـذ","example":"ذَهَب — ذهب"},"ر":{"name":"راء","translit":"Ra","initial":"ر","medial":"ـر","final":"ـر","example":"رَجُل — رجل"},"ز":{"name":"زاي","translit":"Zay","initial":"ز","medial":"ـز","final":"ـز","example":"زَهْرَة — زهرة"},"س":{"name":"سين","translit":"Sin","initial":"سـ","medial":"ـسـ","final":"ـس","example":"سَمَك — سمك"},"ش":{"name":"شين","translit":"Shin","initial":"شـ","medial":"ـشـ","final":"ـش","example":"شَمْس — شمس"},"ص":{"name":"صاد","translit":"Sad (9)","initial":"صـ","medial":"ـصـ","final":"ـص","example":"صَبَاح — صباح"},"ض":{"name":"ضاد","translit":"Dad","initial":"ضـ","medial":"ـضـ","final":"ـض","example":"ضَوْء — ضوء"},"ط":{"name":"طاء","translit":"Ta (6)","initial":"طـ","medial":"ـطـ","final":"ـط","example":"طَائِر — طائر"},"ظ":{"name":"ظاء","translit":"Za","initial":"ظـ","medial":"ـظـ","final":"ـظ","example":"ظِل — ظل"},"ع":{"name":"عين","translit":"Ayn (3)","initial":"عـ","medial":"ـعـ","final":"ـع","example":"عَيْن — عين"},"غ":{"name":"غين","translit":"Ghayn","initial":"غـ","medial":"ـغـ","final":"ـغ","example":"غَابَة — غابة"},"ف":{"name":"فاء","translit":"Fa","initial":"فـ","medial":"ـفـ","final":"ـف","example":"فِيل — فيل"},"ق":{"name":"قاف","translit":"Qaf","initial":"قـ","medial":"ـقـ","final":"ـق","example":"قَمَر — قمر"},"ك":{"name":"كاف","translit":"Kaf","initial":"كـ","medial":"ـكـ","final":"ـك","example":"كِتَاب — كتاب"},"ل":{"name":"لام","translit":"Lam","initial":"لـ","medial":"ـلـ","final":"ـل","example":"لَيْل — ليل"},"م":{"name":"ميم","translit":"Mim","initial":"مـ","medial":"ـمـ","final":"ـم","example":"مَاء — ماء"},"ن":{"name":"نون","translit":"Nun","initial":"نـ","medial":"ـنـ","final":"ـن","example":"نَجْمَة — نجمة"},"ه":{"name":"هاء","translit":"Ha","initial":"هـ","medial":"ـهـ","final":"ـه","example":"هِلَال — هلال"},"و":{"name":"واو","translit":"Waw","initial":"و","medial":"ـو","final":"ـو","example":"وَرْد — ورد"},"ي":{"name":"ياء","translit":"Ya","initial":"يـ","medial":"ـيـ","final":"ـي","example":"يَد — يد"}};
const nm = (ch) => EXPECTED_SPOKEN[ch];

// Recording fake of the Web Speech API, installed before any page script runs.
// cfg: voices [{name,lang}], voicesLoaded (false => getVoices() is empty until __tts.loadVoices()), throwOnSpeak,
//      never (utterance never starts), failWith (error code delivered to onerror), unsupported (no speechSynthesis at all).
function installFake(cfg) {
  if (cfg.unsupported) { try { delete window.speechSynthesis; } catch (e) { } Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); delete window.SpeechSynthesisUtterance; return; }
  const calls = [], listeners = {}; let loaded = cfg.voicesLoaded !== false, cancels = 0, active = [];
  class U { constructor(t) { this.text = t; this.lang = ""; this.voice = null; this.onstart = this.onend = this.onerror = null; } }
  const voiceObjs = () => (cfg.voices || []).map((v) => ({ name: v.name, lang: v.lang, default: false, localService: true, voiceURI: v.name }));
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => (loaded ? voiceObjs() : []),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() { },
    speak(u) {
      if (cfg.throwOnSpeak) throw new Error("synthetic speak failure");
      calls.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, userActivated: navigator.userActivation ? navigator.userActivation.isActive : null });
      active.push(u); fake.pending = true;
      setTimeout(() => {
        if (!active.includes(u)) return; fake.pending = false;
        if (cfg.failWith) { active = active.filter((x) => x !== u); u.onerror && u.onerror({ error: cfg.failWith }); return; }
        if (cfg.never) return;
        fake.speaking = true; u.onstart && u.onstart({});
        setTimeout(() => { if (!active.includes(u)) return; active = active.filter((x) => x !== u); fake.speaking = false; u.onend && u.onend({}); }, 15);
      }, 5);
    },
    cancel() { cancels++; const a = active; active = []; fake.speaking = fake.pending = false; a.forEach((u) => u.onerror && u.onerror({ error: "canceled" })); },
    resume() { fake.paused = false; }, pause() { fake.paused = true; },
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = U;
  window.__tts = { calls, get cancels() { return cancels; }, loadVoices() { loaded = true; (listeners.voiceschanged || []).forEach((f) => f({})); } };
}

const VOICES = [{ name: "Fake English", lang: "en-US" }, { name: "Fake Arabic Egypt", lang: "ar-EG" }, { name: "Fake Arabic Saudi", lang: "ar-SA" }];

async function open(cfg, { device = null, lang = null, url = "/arabic-alphabet/" } = {}) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  pg.errs = [];
  pg.on("pageerror", (e) => pg.errs.push("pageerror: " + e.message));
  pg.on("console", (m) => { if (m.type() === "error" && (m.location().url || "").startsWith(O)) pg.errs.push("console.error: " + m.text()); });
  await pg.setRequestInterception(true); pg.on("request", (r) => r.url().startsWith(O) ? r.continue() : r.abort());   // no Google Fonts / AdSense / GA
  if (device) await pg.emulate(KnownDevices[device]); else await pg.setViewport({ width: 1280, height: 900 });
  if (cfg) await pg.evaluateOnNewDocument(installFake, cfg);
  if (lang) await pg.evaluateOnNewDocument((l) => { try { localStorage.setItem("ak-lang", l); } catch (e) { } }, lang);
  pg.ctx = ctx; await pg.goto(O + url, { waitUntil: "load" });
  if (url === "/arabic-alphabet/") await pg.waitForFunction(() => !document.documentElement.classList.contains("i18n-pending") && document.querySelectorAll(".letter-card").length === 28, { timeout: 8000 }).catch(() => { });
  await pg.addStyleTag({ content: "html{scroll-behavior:auto !important}" });   // test-only: smooth scrolling makes Puppeteer click where an element WAS
  await wait(200); return pg;
}
const card = async (pg, i) => { const els = await pg.$$(".letter-card"); await els[i].evaluate((e) => e.scrollIntoView({ block: "center" })); return els[i]; };
const calls = (pg) => pg.evaluate(() => window.__tts.calls.slice());
const toast = (pg) => pg.evaluate(() => { const t = document.getElementById("toast"); return { shown: t.classList.contains("show"), text: t.textContent }; });
const letters = (pg) => pg.evaluate(() => window.ArabicAlphabet.LETTERS.map((r) => r[0]));
const close = (pg) => pg.ctx.close();
const text = (pg, sel) => pg.$eval(sel, (e) => e.textContent.trim());

// ---------- 1. Desktop mouse: every letter plays its own sound ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  ck("page renders 28 letter cards", (await pg.$$(".letter-card")).length === 28 && L.length === 28);
  const dom = await pg.$$eval(".letter-card .big", (a) => a.map((e) => e.textContent));
  ck("card glyphs match the letter data", JSON.stringify(dom) === JSON.stringify(L));
  let allOk = true, why = "";
  for (let i = 0; i < 28; i++) {
    const before = (await calls(pg)).length; await (await card(pg, i)).click(); await wait(40);
    const c = await calls(pg);
    if (c.length !== before + 1 || c[c.length - 1].text !== nm(L[i]) || c[c.length - 1].voice !== "Fake Arabic Saudi" || c[c.length - 1].lang !== "ar-SA") { allOk = false; why += ` [${i}:${L[i]} -> ${JSON.stringify(c.slice(before))}]`; }
  }
  ck("desktop mouse click: all 28 letters speak that letter's correct Arabic NAME (vowelled) with the ar-SA voice, once each", allOk, why);
  const c = await calls(pg);
  ck("playback starts inside the click's user-activation window", c.every((x) => x.userActivated !== false), JSON.stringify(c.find((x) => x.userActivated === false)));
  ck("detail panel shows after click", await pg.$eval("#letterDetail", (e) => e.classList.contains("show")));
  ck("no console/page errors during normal playback (28 clicks)", pg.errs.length === 0, pg.errs.join(" | "));
  ck("no toast during normal playback", !(await toast(pg)).shown, (await toast(pg)).text);
  await close(pg);
}

// ---------- 1b. The spoken-name mapping (reviewable) ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  const page = await pg.evaluate(() => ({ keys: Object.keys(window.ArabicAlphabet.SPOKEN_NAMES || {}), map: window.ArabicAlphabet.SPOKEN_NAMES || {} }));
  ck("mapping covers exactly the 28 displayed letters, in the same order", JSON.stringify(page.keys) === JSON.stringify(L) && L.length === 28);
  const diffs = L.filter((ch) => page.map[ch] !== nm(ch)).map((ch) => `${ch}: page=${page.map[ch]} expected=${nm(ch)}`);
  ck("site mapping equals the independently reviewed expected table (all 28)", diffs.length === 0, diffs.join(" | "));
  const HARAKA = /[\u064B-\u0652]/, ARABIC_ONLY = /^[\u0621-\u064A\u064B-\u0652]+$/;
  const badShape = L.filter((ch) => { const n = page.map[ch] || ""; return !(n.length >= 3 && HARAKA.test(n) && ARABIC_ONLY.test(n) && n === n.normalize("NFC") && n !== ch); });
  ck("every spoken name is vowelled Arabic only: no bare glyph, no Latin/digits/spaces, NFC-stable", badShape.length === 0, badShape.join(" "));
  ck("all 28 spoken names are distinct", new Set(L.map((ch) => page.map[ch] || "")).size === 28);
  const strip = (t) => t.replace(/[\u064B-\u0652]/g, "");
  const notNames = L.filter((ch) => strip(page.map[ch] || "") !== EXPECTED_DISPLAY[ch].name);
  ck("each spoken name, with vowel marks removed, is exactly the letter name the page already displays", notNames.length === 0, notNames.map((ch) => `${ch}: ${strip(page.map[ch])} vs ${EXPECTED_DISPLAY[ch].name}`).join(" | "));
  const spoken = await pg.evaluate(() => { const A = window.ArabicAlphabet; return A.LETTERS.map((r) => (A.spokenNameFor ? A.spokenNameFor(r[0]) : null)); });
  ck("spokenNameFor() returns the mapped name for every letter and null for anything else", spoken.every((t, i) => t === nm(L[i])) && await pg.evaluate(() => !!window.ArabicAlphabet.spokenNameFor && window.ArabicAlphabet.spokenNameFor("x") === null && window.ArabicAlphabet.spokenNameFor("") === null));
  await close(pg);
}

// ---------- 1c. Detail panel: forms, text and replay for ALL 28 letters ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  const probs = [], replayProbs = [], sentProbs = [];
  for (let i = 0; i < 28; i++) {
    const ch = L[i], X = EXPECTED_DISPLAY[ch];
    const before = (await calls(pg)).length;
    await (await card(pg, i)).click(); await wait(30);
    const d = await pg.$eval("#letterDetail", (e) => ({
      shown: e.classList.contains("show"),
      big: e.querySelector(":scope > div > div:first-child").textContent.trim(),
      h3: e.querySelector("h3").textContent.replace(/\s+/g, " ").trim(),
      example: e.querySelector("p").textContent.replace(/\s+/g, " ").trim(),
      glyphs: [...e.querySelectorAll(".form-item .glyph")].map((g) => g.textContent.trim()),
      labels: [...e.querySelectorAll(".form-item .lbl")].map((g) => g.textContent.trim()),
      btn: e.querySelector("#detailSpeak") && e.querySelector("#detailSpeak").getAttribute("aria-label"),
    }));
    const wantGlyphs = [ch, X.initial, X.medial, X.final];
    if (!d.shown || d.big !== ch || !d.h3.startsWith(X.name) || !d.h3.includes(`(${X.translit})`) || d.example !== "مثال: " + X.example
      || JSON.stringify(d.glyphs) !== JSON.stringify(wantGlyphs) || JSON.stringify(d.labels) !== JSON.stringify(["Isolated", "Initial", "Medial", "Final"]) || d.btn !== "نطق الحرف")
      probs.push(`${ch}: ${JSON.stringify(d)} want ${JSON.stringify(wantGlyphs)}`);
    const dom = await pg.$$eval(".letter-card", (a, i) => ({ big: a[i].querySelector(".big").textContent, tr: a[i].querySelector(".translit").textContent, aria: a[i].getAttribute("aria-label") }), i);
    if (dom.big !== ch || dom.tr !== X.translit || dom.aria !== X.name + " — " + X.translit) probs.push(`card ${ch}: ${JSON.stringify(dom)}`);
    let c = await calls(pg);
    if (c.length !== before + 1 || c[c.length - 1].text !== nm(ch)) sentProbs.push(`${ch}: ${JSON.stringify(c.slice(before))}`);
    await (await pg.$("#detailSpeak")).click(); await wait(30);
    c = await calls(pg);
    if (c.length !== before + 2 || c[c.length - 1].text !== nm(ch) || c[c.length - 2].text !== nm(ch)) replayProbs.push(`${ch}: ${JSON.stringify(c.slice(before))}`);
  }
  ck("detail panel for all 28 letters: displayed forms (isolated/initial/medial/final), name, transliteration and example are unchanged from the original", probs.length === 0, probs.slice(0, 3).join(" || "));
  ck("all 28 cards: glyph, transliteration and aria-label unchanged from the original", !probs.some((x) => x.startsWith("card")));
  ck("card click sends the spoken NAME (never the bare glyph) for all 28 letters", sentProbs.length === 0, sentProbs.slice(0, 3).join(" || "));
  ck("detail 'replay' button sends the same spoken name for all 28 letters", replayProbs.length === 0, replayProbs.slice(0, 3).join(" || "));
  const all = await calls(pg);
  ck("no utterance in the whole run was a single bare letter", all.length === 56 && all.every((x) => [...x.text].length > 1 && /[\u064B-\u0652]/.test(x.text)));
  ck("no errors across all 28 detail-panel runs", pg.errs.length === 0, pg.errs.join(" | "));
  await close(pg);
}

// ---------- 1d. Switching between letters, replay follows the CURRENT letter ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  await (await card(pg, 3)).click(); await wait(30);
  await (await card(pg, 8)).click(); await wait(30);
  await (await pg.$("#detailSpeak")).click(); await wait(30);
  await (await card(pg, 3)).click(); await wait(30);
  await (await pg.$("#detailSpeak")).click(); await wait(30);
  const c = (await calls(pg)).map((x) => x.text), want = [nm(L[3]), nm(L[8]), nm(L[8]), nm(L[3]), nm(L[3])];
  ck("switching letters: replay always speaks the letter currently shown (A, B, replay=B, A, replay=A)", JSON.stringify(c) === JSON.stringify(want), JSON.stringify(c));
  ck("switching letters: detail panel follows the last click", (await pg.$eval("#letterDetail", (e) => e.querySelector(":scope > div > div:first-child").textContent.trim())) === L[3]);
  const r = await pg.evaluate(() => { const A = window.ArabicAlphabet, n = window.__tts.calls.length; const res = A.speak("x"); return { res, delta: window.__tts.calls.length - n }; });
  ck("unmapped input is refused: no utterance is sent and nothing falls back to the bare glyph", r.res === "error" && r.delta === 0, JSON.stringify(r));
  ck("…and the visitor is told (toast)", (await toast(pg)).shown && /تعذّر/.test((await toast(pg)).text));
  await close(pg);
}

// ---------- 1e. Manual check page (physical-desktop aid) ----------
{
  const pg = await open({ voices: VOICES }, { url: "/tests/arabic-alphabet/pronunciation-check.html" }); const L = [...Object.keys(EXPECTED_SPOKEN)];
  await wait(300);
  const rows = await pg.$$eval("#tbl tbody tr", (a) => a.map((r) => ({ ch: r.children[1].textContent, name: r.children[2].textContent, expect: r.children[3].textContent })));
  ck("check page lists 28 letters with the spoken name and an expected-sound note for each", rows.length === 28 && rows.every((r, i) => r.ch === L[i] && r.name === nm(L[i]) && r.expect.length > 5), JSON.stringify(rows.filter((r, i) => r.name !== nm(L[i])).slice(0, 2)));
  ck("check page shows the Arabic voice the site would use", /Fake Arabic Saudi/.test(await text(pg, "#siteVoice")) && /Fake Arabic/.test(await text(pg, "#arVoices")));
  let ok = true, why = "";
  for (let i = 0; i < 28; i++) {
    const before = (await calls(pg)).length;
    const btn = (await pg.$$("#tbl tbody tr"))[i]; const play = await btn.$('button[data-act="site"]'); await play.evaluate((e) => e.scrollIntoView({ block: "center" })); await play.click(); await wait(25);
    const c = await calls(pg); if (c.length !== before + 1 || c[c.length - 1].text !== nm(L[i])) { ok = false; why += ` ${L[i]}:${JSON.stringify(c.slice(before))}`; }
  }
  ck("check page 'Play (site)' runs the real site speak() and sends the spoken name for all 28 letters", ok, why);
  const tr = (await pg.$$("#tbl tbody tr"))[1];
  const n0 = (await calls(pg)).length;
  for (const act of ["name", "bare", "plain"]) { const b = await tr.$(`button[data-act="${act}"]`); await b.evaluate((e) => e.scrollIntoView({ block: "center" })); await b.click(); await wait(25); }
  const c3 = (await calls(pg)).slice(n0).map((x) => x.text);
  ck("check page comparison buttons send: vowelled name / bare letter (old behaviour) / name without vowels", JSON.stringify(c3) === JSON.stringify([nm(L[1]), L[1], nm(L[1]).replace(/[\u064B-\u0652]/g, "")]), JSON.stringify(c3));
  ck("check page lists no result as correct until the listener marks it", (await (async () => { await pg.click("#mkReport"); return pg.$eval("#report", (e) => e.value); })()).includes("not marked 28"));
  await (await pg.$$('#tbl tbody tr'))[0].$eval('input[value="ok"]', (e) => e.click()); await (await pg.$$('#tbl tbody tr'))[1].$eval('input[value="wrong"]', (e) => e.click());
  await pg.click("#mkReport"); const rep = await pg.$eval("#report", (e) => e.value);
  ck("check page report records your marks (right/wrong/unmarked) and the voice used", /right 1, wrong 1, unsure 0, not marked 26/.test(rep) && /Site voice: Fake Arabic Saudi/.test(rep) && rep.split("\n").filter((l) => /->/.test(l)).length === 28, rep.split("\n").slice(-2).join(" / "));
  ck("check page has no console/page errors", pg.errs.length === 0, pg.errs.join(" | "));
  await close(pg);
}
{
  const pg = await open({ voices: [{ name: "Fake English", lang: "en-US" }] }, { url: "/tests/arabic-alphabet/pronunciation-check.html" }); await wait(300);
  ck("check page with no Arabic voice says so plainly (no success message)", /none found/.test(await text(pg, "#arVoices")) && /none/.test(await text(pg, "#siteVoice")) && !/ok|success/i.test(await text(pg, "#status")));
  await close(pg);
}

// ---------- 2. Voice selection ----------
{
  const pg = await open({ voices: [{ name: "Fake English", lang: "en-US" }, { name: "Fake Arabic Egypt", lang: "ar-EG" }] });
  await (await card(pg, 3)).click(); await wait(40); const c = await calls(pg);
  ck("falls back to another Arabic voice (ar-EG) when ar-SA is absent", c.length === 1 && c[0].voice === "Fake Arabic Egypt" && c[0].lang === "ar-EG", JSON.stringify(c));
  await close(pg);
}
{
  const pg = await open({ voices: VOICES, voicesLoaded: false });   // Chromium populates voices asynchronously
  await pg.evaluate(() => window.__tts.loadVoices()); await wait(50);
  await (await card(pg, 0)).click(); await wait(40); const c = await calls(pg);
  ck("voices that arrive late (voiceschanged) are used on the next click", c.length === 1 && c[0].voice === "Fake Arabic Saudi", JSON.stringify(c));
  await close(pg);
}

// ---------- 3. Keyboard activation ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  const el = await card(pg, 5); await el.focus();
  await pg.keyboard.press("Enter"); await wait(40);
  let c = await calls(pg);
  ck("keyboard: Enter on a focused letter plays that letter", c.length === 1 && c[0].text === nm(L[5]), JSON.stringify(c));
  await pg.keyboard.press("Space"); await wait(40); c = await calls(pg);
  ck("keyboard: Space on a focused letter plays that letter", c.length === 2 && c[1].text === nm(L[5]), JSON.stringify(c));
  await pg.keyboard.press("Tab"); await pg.keyboard.press("Enter"); await wait(40); c = await calls(pg);
  ck("keyboard: Tab to the next letter then Enter plays the next letter", c.length === 3 && c[2].text === nm(L[6]), JSON.stringify(c));
  ck("letter cards are real <button>s (focusable, labelled)", await pg.$$eval(".letter-card", (a) => a.every((b) => b.tagName === "BUTTON" && b.getAttribute("aria-label"))));
  // detail-panel replay button
  await (await card(pg, 9)).click(); await wait(40);
  await pg.$eval("#detailSpeak", (b) => b.focus()); await pg.keyboard.press("Enter"); await wait(40);
  c = await calls(pg);
  ck("detail 'استماع' button (keyboard Enter) replays the selected letter", c.length === 5 && c[4].text === nm(L[9]) && c[3].text === nm(L[9]), JSON.stringify(c.slice(3)));
  await (await pg.$("#detailSpeak")).click(); await wait(40); c = await calls(pg);
  ck("detail 'استماع' button (mouse) replays the selected letter", c.length === 6 && c[5].text === nm(L[9]));
  ck("no errors during keyboard use", pg.errs.length === 0, pg.errs.join(" | "));
  await close(pg);
}

// ---------- 4. Mobile touch ----------
for (const device of ["iPhone 13", "Pixel 5"]) {
  const pg = await open({ voices: VOICES }, { device }); const L = await letters(pg);
  const el = await card(pg, 12); await el.tap(); await wait(60);
  let c = await calls(pg);
  ck(`mobile touch (${device}): tapping a letter plays it`, c.length === 1 && c[0].text === nm(L[12]) && c[0].voice === "Fake Arabic Saudi", JSON.stringify(c));
  await (await card(pg, 20)).tap(); await wait(60); c = await calls(pg);
  ck(`mobile touch (${device}): second tap plays the second letter`, c.length === 2 && c[1].text === nm(L[20]), JSON.stringify(c));
  ck(`mobile touch (${device}): no errors`, pg.errs.length === 0, pg.errs.join(" | "));
  await close(pg);
}

// ---------- 5. Rapid repeated clicks ----------
{
  const pg = await open({ voices: VOICES }); const L = await letters(pg);
  const els = await pg.$$(".letter-card"); await els[0].evaluate((e) => e.scrollIntoView({ block: "center" }));
  const idx = []; for (let n = 0; n < 40; n++) idx.push((n * 7) % 28);
  // Fire as fast as the page allows, inside the page, so playback overlaps (each dispatched click is a real activation-less synthetic click; the user-gesture path is covered above)
  await pg.evaluate((ix) => { const cs = document.querySelectorAll(".letter-card"); ix.forEach((i) => cs[i].click()); }, idx);
  await wait(300);
  const c = await calls(pg), cancels = await pg.evaluate(() => window.__tts.cancels);
  ck("rapid clicks: every click reached speak() in order with the right letter", c.length === 40 && c.every((x, k) => x.text === nm(L[idx[k]])), `len=${c.length}`);
  ck("rapid clicks: queued speech is cancelled so the latest letter wins", cancels >= 39, `cancels=${cancels}`);
  ck("rapid clicks: superseded utterances ('canceled') do not raise errors or toasts", pg.errs.length === 0 && !(await toast(pg)).shown, pg.errs.join(" | ") + " " + (await toast(pg)).text);
  // real mouse, same card repeatedly
  const el = await card(pg, 2); for (let n = 0; n < 8; n++) await el.click(); await wait(100);
  const c2 = (await calls(pg)).slice(40);
  ck("rapid real mouse clicks on one letter: 8 clicks => 8 plays of that letter", c2.length === 8 && c2.every((x) => x.text === nm(L[2])), JSON.stringify(c2.map((x) => x.text)));
  ck("page still responsive afterwards (detail panel shows the last clicked letter)", (await pg.$eval("#letterDetail", (e) => e.textContent)).includes("تاء"));
  ck("no errors after rapid clicking", pg.errs.length === 0, pg.errs.join(" | "));
  await close(pg);
}

// ---------- 6. Failure handling ----------
{
  const pg = await open({ voices: VOICES, throwOnSpeak: true });
  await (await card(pg, 1)).click(); await wait(60);
  const t = await toast(pg);
  ck("speak() throwing: no uncaught exception, visible toast", pg.errs.length === 0 && t.shown && /تعذّر/.test(t.text), pg.errs.join(" | ") + " | " + t.text);
  ck("speak() throwing: detail panel still renders and page keeps working", await pg.$eval("#letterDetail", (e) => e.classList.contains("show")));
  await (await card(pg, 2)).click(); await wait(60);
  ck("speak() throwing: later clicks still work (no stuck state)", pg.errs.length === 0 && (await pg.$eval("#letterDetail", (e) => e.textContent)).includes("ت"));
  await close(pg);
}
{
  const pg = await open({ voices: VOICES, failWith: "synthesis-failed" });
  await (await card(pg, 4)).click(); await wait(120);
  const t = await toast(pg);
  ck("engine error event (synthesis-failed): toast shown, no page errors", t.shown && /تعذّر/.test(t.text) && pg.errs.length === 0, pg.errs.join(" | ") + " | " + t.text);
  await close(pg);
}
{
  const pg = await open({ voices: VOICES, failWith: "language-unavailable" });
  await (await card(pg, 4)).click(); await wait(120);
  const t = await toast(pg);
  ck("engine error event (language-unavailable): 'no Arabic voice' toast", t.shown && /صوت عربي/.test(t.text) && pg.errs.length === 0, t.text);
  await close(pg);
}
{
  const pg = await open({ voices: [{ name: "Fake English", lang: "en-US" }] });   // typical desktop without an Arabic voice
  await (await card(pg, 0)).click(); await wait(60);
  const c = await calls(pg), t = await toast(pg);
  ck("desktop with voices but none Arabic: explanatory toast instead of silence, no bogus playback", c.length === 0 && t.shown && /صوت عربي/.test(t.text) && pg.errs.length === 0, `${JSON.stringify(c)} | ${t.text}`);
  ck("…and the detail panel / letter forms still show", await pg.$eval("#letterDetail", (e) => e.classList.contains("show") && e.querySelectorAll(".form-item").length === 4));
  await close(pg);
}
{
  const pg = await open({ unsupported: true });
  await (await card(pg, 0)).click(); await wait(60);
  const t = await toast(pg);
  ck("no Speech API at all: 'not supported' toast, page works, no errors", t.shown && /غير مدعوم/.test(t.text) && pg.errs.length === 0 && await pg.$eval("#letterDetail", (e) => e.classList.contains("show")), pg.errs.join(" | ") + " | " + t.text);
  await close(pg);
}
{
  const pg = await open({ voices: VOICES, never: true });   // engine accepts the utterance but never starts it
  await (await card(pg, 0)).click(); await wait(2900);
  const t = await toast(pg);
  ck("engine that never starts: watchdog toast appears (not silent)", t.shown && /تعذّر/.test(t.text) && pg.errs.length === 0, t.text);
  await close(pg);
}

// ---------- 7. English mode (language switching) ----------
{
  const pg = await open({ voices: [{ name: "Fake English", lang: "en-US" }] }, { lang: "en" });
  await (await card(pg, 0)).click(); await wait(250);
  const t = await toast(pg);
  ck("English mode: the new toast message is translated", t.shown && /No Arabic voice/.test(t.text), t.text);
  await close(pg);
}

// ---------- 8. Real engine, nothing stubbed ----------
{
  const pg = await open(null);   // headless Chromium: real speechSynthesis with zero voices (the failure we reproduced)
  const L = await letters(pg);
  let threw = false; try { for (let i = 0; i < 28; i++) await (await card(pg, i)).click(); } catch (e) { threw = true; }
  await wait(200);
  ck("real unstubbed engine: clicking all 28 letters raises no page/console errors", !threw && pg.errs.length === 0, pg.errs.join(" | "));
  ck("real unstubbed engine, no voices: visible explanation instead of silent failure", (await toast(pg)).shown, "toast not shown");
  await close(pg);
}

await browser.close(); srv.close();
console.log(`\n${total - bad.length}/${total} passed`);
if (bad.length) { console.log("FAILED:\n  " + bad.join("\n  ")); process.exit(1); }
process.exit(0);
