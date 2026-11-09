// Helpers shared by the V1 browser suites: deterministic answering (answers are DERIVED from the course data the page loaded) and an injectable clock.
import { sleep } from "./lib.mjs";
export const KEY = "ak-learn-progress-v1";
// Shifts the page's clock by `offsetMs` from the first byte (new Date(), Date.now()); other Date behaviour is inherited unchanged.
export const withClock = (p, offsetMs) => p.evaluateOnNewDocument(off => { const RD = Date; class FD extends RD { constructor(...a) { if (a.length === 0) super(RD.now() + off); else super(...a); } static now() { return RD.now() + off; } } window.Date = FD; }, offsetMs);
export const DAY = 86400000;
export const readStore = p => p.evaluate(k => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }, KEY);
export const writeStore = (p, obj) => p.evaluate((k, o) => localStorage.setItem(k, JSON.stringify(o)), KEY, obj);
export const todayNo = p => p.evaluate(() => LearnSRS.dayNumber(Date.now()));

// Works out, inside the page, how to answer the CURRENT question correctly (or wrongly).
export async function planAnswer(p, wrong = false) {
  return p.evaluate(w => {
    const D = LearnData, V = LearnVocab, W = V.ITEMS, PT = V.PATTERN_ITEMS.concat(window.LearnConversations ? LearnConversations.SENTENCE_ITEMS : []), panel = document.getElementById("lxTypePanel");
    const lbl = i => i.ar + (i.punct || "");
    if (panel && !panel.hidden) {                                   // typing question
      const pr = document.getElementById("lxTPrompt"), en = ((pr.querySelector(".lx-q-en") || {}).textContent || "").replace(/^“|”$/g, "");
      let right;
      if (en) { const it = W.concat(PT).find(i => i.en === en); right = it && it.plain; }
      else right = ((pr.querySelector(".lx-show-ar") || {}).textContent || "").replace(/[\u064B-\u0652\u0670]/g, "");   // reading/typing stages: copy what is shown
      return { kind: "type", text: w ? "ظظظ" : right, right };
    }
    const q = document.querySelector(".lx-q").textContent, show = ((document.querySelector(".lx-show") || {}).textContent || "").trim();
    const opts = [...document.querySelectorAll(".lx-opt")].map(o => o.textContent.trim()); let right = -1;
    const byEn = list => list.filter(i => q.includes("“" + i.en + "”")).sort((a, b) => b.en.length - a.en.length)[0];
    if (/What does this word mean\?/.test(q)) right = opts.indexOf(W.find(i => lbl(i) === show).en);
    else if (/Which Arabic means/.test(q)) right = opts.indexOf(lbl(byEn(W)));
    else if (/correct spelling of/.test(q)) right = opts.indexOf(byEn(W).plain);
    else if (/completes the sentence/.test(q)) right = opts.indexOf(byEn(PT).slot);
    else if (/name of this letter/.test(q)) { const l = D.LETTERS.find(x => x.letter === show); right = opts.indexOf(`${l.nameEn} (${l.nameAr})`); }
    else if (/Which letter is called/.test(q)) { const l = D.LETTERS.find(x => q.includes(`${x.nameEn} (${x.nameAr})`)); right = opts.indexOf(l.letter); }
    else if (/makes this sound/.test(q)) { const snd = q.split("makes this sound: ")[1].replace(/\?\s*$/, ""); right = opts.indexOf(D.LETTERS.find(x => x.sound === snd).letter); }
    else if (/form of a letter/.test(q)) { const l = D.LETTERS.find(x => [x.forms.initial, x.forms.medial, x.forms.final].includes(show)); right = opts.indexOf(l.letter); }
    if (right < 0) throw new Error("cannot derive the answer for: " + q);
    return { kind: "click", idx: w ? opts.findIndex((_, i) => i !== right) : right, right, n: opts.length };
  }, wrong);
}
export async function answerOne(p, wrong = false) {
  const plan = await planAnswer(p, wrong);
  if (plan.kind === "click") { await (await p.$$(".lx-opt"))[plan.idx].click(); await p.waitForSelector("#lxNextBtn"); await p.click("#lxNextBtn"); }
  else { await p.focus("#lxEditor"); await p.type("#lxEditor", plan.text); await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn"); await p.click("#lxTNextBtn"); }
  return plan;
}
// Answers every question of the running session; `wrongWhen(i, plan)` may request a deliberate miss. Returns the question kinds seen.
export async function finishSession(p, wrongWhen = () => false) {
  const kinds = [];
  for (let i = 0; i < 40; i++) {
    await p.waitForFunction(() => document.querySelector(".lx-score") || document.querySelector(".lx-opt") || (document.getElementById("lxTypePanel") && !document.getElementById("lxTypePanel").hidden), { timeout: 15000 });
    if (await p.$(".lx-score")) return kinds;
    const plan = await planAnswer(p, false); kinds.push(plan.kind);
    await answerOne(p, !!wrongWhen(i, plan));
  }
  throw new Error("session did not finish");
}
export const score = p => p.$eval(".lx-score", e => e.textContent.replace(/\s+/g, " ").trim());
export const dupIds = p => p.evaluate(() => { const m = {}; document.querySelectorAll("[id]").forEach(e => { m[e.id] = (m[e.id] || 0) + 1; }); return Object.keys(m).filter(k => m[k] > 1); });
export { sleep };
