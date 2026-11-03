// Audio: the REAL LearnAudio/UI code against a controllable speechSynthesis stub (headless Chromium has no Arabic voices, so audio itself is NOT heard here).
import { harness, sleep, txt } from "./lib.mjs";
import { planAnswer } from "./v1-lib.mjs";
const H = await harness("audio"); const { base, ok } = H; let N = 0;
const url = h => `${base}/learn-arabic/?n=${++N}${h || ""}`;
const V = (name, lang, local = true) => ({ name, lang, local });
const page = async (cfg) => {
  const p = await H.page();
  await p.evaluateOnNewDocument(c => {
    window.__cfg = c; window.__utts = []; const L = {};
    if (c.unsupported) { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; return; }
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ""; this.voice = null; this.rate = 1; } };
    let voices = c.voices.map(v => ({ name: v.name, lang: v.lang, localService: v.local !== false }));
    // window.speechSynthesis is a read-only accessor in Chromium: a plain assignment is silently ignored, so define the property.
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices() { return voices; }, cancel() {}, addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, removeEventListener() {},
      speak(u) { window.__utts.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, rate: u.rate }); const m = window.__cfg.mode;
        setTimeout(() => { if (m === "ok") { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 20); } else if (m.indexOf("error:") === 0) { u.onerror && u.onerror({ error: m.slice(6) }); } /* "silent": never starts */ }, 10); } } });
    window.__setVoices = list => { voices = list.map(v => ({ name: v.name, lang: v.lang, localService: true })); (L.voiceschanged || []).forEach(f => f()); };
  }, Object.assign({ mode: "ok", voices: [] }, cfg));
  await p.goto(url("#/vocab/numbers"), { waitUntil: "load" }); await p.waitForSelector(".lx-ex .lx-hear");
  return p;
};
const status = p => p.evaluate(() => ({ text: document.getElementById("lxSpeechStatus").textContent, err: document.getElementById("lxSpeechStatus").classList.contains("is-error"), live: document.getElementById("lxSpeechMsg").textContent, btn: document.getElementById("lxSpeedBtn").textContent, hidden: document.getElementById("lxSpeedBtn").hidden, pressed: document.getElementById("lxSpeedBtn").getAttribute("aria-pressed") }));
const hear = async (p, i = 0) => { await p.evaluate(n => document.querySelectorAll(".lx-ex .lx-hear")[n].click(), i); await sleep(120); };
const utts = p => p.evaluate(() => window.__utts);
const clearPref = p => p.evaluate(() => localStorage.removeItem("ak-learn-speech"));

/* 1. ranking and labelling ------------------------------------------------------------------------------------------- */
let p = await page({ voices: [V("David", "en-US"), V("Laila", "ar-EG"), V("Majed", "ar-SA"), V("Generic Arabic", "ar")] });
let s = await status(p);
ok(/Device voice: Majed \(ar-SA\)/.test(s.text) && /device-generated speech, not a native recording/.test(s.text), "ar-SA voice is preferred over ar-EG, ar and non-Arabic voices, and named; speech is labelled device-generated, not a native recording: " + s.text.slice(0, 70));
await hear(p); let u = await utts(p);
ok(u.length === 1 && u[0].voice === "Majed" && u[0].lang === "ar-SA" && u[0].rate === 0.9 && u[0].text === "صِفْر", "Hear speaks the item's vowelled Arabic with the preferred voice at normal rate: " + JSON.stringify(u[0]));
ok(!s.err && s.live === "" && s.btn === "Slow speech: off" && s.pressed === "false", "no error shown for a normal start");
/* 2. slow speech, persisted --------------------------------------------------------------------------------------------- */
await p.click("#lxSpeedBtn"); s = await status(p); await hear(p); u = await utts(p);
ok(s.btn === "Slow speech: on" && s.pressed === "true" && u[1].rate === 0.6, "slow speech: button state and the utterance rate (0.6) change");
ok((await p.evaluate(() => localStorage.getItem("ak-learn-speech"))) === "slow", "the speed preference is saved");
await p.goto(url("#/vocab/numbers"), { waitUntil: "load" }); await p.waitForSelector(".lx-ex .lx-hear"); s = await status(p);
ok(s.btn === "Slow speech: on" && s.pressed === "true", "the preference survives a reload");
await p.click("#lxSpeedBtn"); await hear(p); ok((await utts(p)).slice(-1)[0].rate === 0.9 && (await status(p)).btn === "Slow speech: off", "toggling back restores normal speed"); await clearPref(p); await p.close();
/* 3. only a regional voice / no Arabic voice -------------------------------------------------------------------------------- */
p = await page({ voices: [V("David", "en-US"), V("Laila", "ar-EG")] }); s = await status(p); await hear(p);
ok(/Device voice: Laila \(ar-EG\)/.test(s.text) && (await utts(p))[0].voice === "Laila", "with only a regional Arabic voice, that voice is used and named"); await p.close();
p = await page({ voices: [V("David", "en-US")] }); s = await status(p); await hear(p); u = await utts(p);
ok(/No Arabic voice was found/.test(s.text) && !/Device voice:/.test(s.text), "no Arabic voice: the status says so plainly (and does not name a device voice)");
ok(u.length === 1 && u[0].voice === null && u[0].lang === "ar-SA" && p.errs.length === 0, "no Arabic voice: Hear still requests ar-SA speech (the browser decides) and nothing throws"); await p.close();
/* 4. browser without speech synthesis ------------------------------------------------------------------------------------------ */
p = await page({ unsupported: true }); s = await status(p);
ok(/cannot play speech/.test(s.text) && s.hidden, "unsupported browser: clear message and the speed control is hidden");
await hear(p); s = await status(p);
ok(/This browser cannot play speech\./.test(s.live) && s.err && p.errs.length === 0, "unsupported browser: pressing Hear announces the problem in the live region, shows it in red, and throws nothing"); await p.close();
/* 5. error events -------------------------------------------------------------------------------------------------------------- */
p = await page({ voices: [V("Majed", "ar-SA")], mode: "error:synthesis-failed" }); await hear(p); s = await status(p);
ok(s.err && /Speech could not be played \(synthesis-failed\)/.test(s.text) && s.live === s.text, "speech error: shown in the status line AND announced via the live region: " + s.text);
await p.evaluate(() => { window.__cfg.mode = "ok"; }); await hear(p); s = await status(p);
ok(!s.err && /Device voice: Majed/.test(s.text) && s.live === "", "after a successful start the error clears and the normal status returns");
await p.evaluate(() => { window.__cfg.mode = "error:not-allowed"; }); await hear(p); ok(/The browser blocked audio\. Press Hear again\./.test((await status(p)).text), "not-allowed gets a human message");
await p.evaluate(() => { window.__cfg.mode = "ok"; }); await hear(p);
for (const benign of ["interrupted", "canceled"]) { await p.evaluate(m => { window.__cfg.mode = "error:" + m; }, benign); await hear(p); s = await status(p); ok(!s.err && s.live === "", `a "${benign}" event (caused by pressing Hear again) is not reported as an error`); }
ok(p.errs.length === 0, "no page errors across the error scenarios " + JSON.stringify(p.errs)); await p.close();
/* 6. a browser that accepts speech but never starts it --------------------------------------------------------------------------- */
p = await page({ voices: [V("Majed", "ar-SA")], mode: "silent" }); await hear(p); s = await status(p); ok(!s.err, "silent failure: not reported prematurely");
await sleep(4400); s = await status(p); ok(s.err && /did not start/.test(s.text) && /did not start/.test(s.live), "silent failure: after 4 s the learner is told the device voice did not start: " + s.text); await p.close();
/* 7. voices that load late -------------------------------------------------------------------------------------------------------- */
p = await page({ voices: [] }); ok(/No Arabic voice was found/.test((await status(p)).text), "voices not loaded yet: honest 'no Arabic voice' message");
await p.evaluate(() => window.__setVoices([{ name: "Majed", lang: "ar-SA" }])); await sleep(100); s = await status(p);
ok(/Device voice: Majed \(ar-SA\)/.test(s.text), "when the browser reports its voices later, the status updates without a reload"); await p.close();
/* 8. no claim of recordings; the recordings hook works when verified files exist -------------------------------------------------- */
p = await page({ voices: [V("Majed", "ar-SA")] });
const rec = await p.evaluate(() => ({ n: Object.keys(LearnAudio.RECORDINGS).length, has: LearnAudio.hasRecording("vocab-num-1"), text: document.body.innerText }));
ok(rec.n === 0 && !rec.has && !/recorded audio|native speaker|studio/i.test(rec.text), "no recordings exist today and the page makes no recording claim");
await p.evaluate(() => { window.__audio = []; window.Audio = class { constructor(src) { this.src = src; window.__audio.push(src); } play() { return Promise.resolve(); } }; LearnAudio.RECORDINGS["vocab-num-1"] = "/assets/audio/num-1.mp3"; });
await p.evaluate(() => document.querySelectorAll(".lx-ex .lx-hear")[1].click()); await sleep(100);
ok(JSON.stringify(await p.evaluate(() => window.__audio)) === JSON.stringify(["/assets/audio/num-1.mp3"]) && (await utts(p)).length === 0, "future hook: a verified recording registered for an item plays instead of device speech");
await p.evaluate(() => { window.Audio = class { constructor(src) { this.src = src; } play() { return Promise.reject(new Error("blocked")); } }; }); await p.evaluate(() => document.querySelectorAll(".lx-ex .lx-hear")[1].click()); await sleep(150);
ok((await utts(p)).length === 1, "if a recording fails to play, speech is used as the fallback"); await p.close();
/* 9. Hear buttons everywhere they appear ------------------------------------------------------------------------------------------- */
p = await page({ voices: [V("Majed", "ar-SA")] });
await p.evaluate(() => { location.hash = "#/letter/ba"; }); await p.waitForSelector(".lx-hero-ar"); await p.evaluate(() => document.querySelector(".lx-hero .lx-hear").click()); await sleep(100);
ok((await utts(p)).slice(-1)[0].text.startsWith("ب"), "letter lesson: Hear speaks the letter");
await p.evaluate(() => { location.hash = "#/vocab/greetings"; }); await p.waitForSelector(".lx-dialect"); await p.evaluate(() => document.querySelector(".lx-dialect .lx-hear").click()); await sleep(100);
ok((await utts(p)).slice(-1)[0].text === "إِزَّيَّك", "regional variants can also be heard (clearly labelled as dialect on the page)");
await p.evaluate(() => { location.hash = "#/patterns/this-m"; }); await p.waitForSelector(".lx-exs"); await p.evaluate(() => document.querySelector(".lx-ex .lx-hear").click()); await sleep(100);
ok((await utts(p)).slice(-1)[0].text === "هَٰذَا كِتَابٌ", "pattern lesson: Hear speaks the whole example sentence");
await p.goto(url("#/vocab/numbers"), { waitUntil: "load" }); await p.waitForSelector('[data-action="vpractice"][data-type="v-recall"]'); await p.click('[data-action="vpractice"][data-type="v-recall"]'); await p.waitForSelector("#lxEditor", { visible: true });
const plan = await planAnswer(p, false); await p.type("#lxEditor", plan.text); await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn"); await p.evaluate(() => document.querySelector("#lxTFb .lx-hear").click()); await sleep(100);
ok(/[\u0600-\u06FF]/.test((await utts(p)).slice(-1)[0].text), "after answering a recall question, Hear speaks the correct Arabic answer");
ok(p.errs.length === 0, "no page errors " + JSON.stringify(p.errs)); await p.close();
await H.finish();
