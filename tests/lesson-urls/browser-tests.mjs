// Real-Chromium tests. Serves the NEW tree on :8100 and the untouched BASELINE tree on :8101 (for before/after geometry).
// usage: BASELINE=/path/to/baseline node tests/lesson-urls/browser-tests.mjs [A|B|C|D ...]
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
import { serve } from "./static-server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/opt/npm-tools/node_modules/playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASELINE; if (!BASE) throw new Error("set BASELINE=<pristine tree>");
const U = require(path.join(ROOT, "assets/js/learn/urls.js"));
const suites = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["A", "B", "C", "D"]);
const NEW = "http://127.0.0.1:8100", OLD = "http://127.0.0.1:8101";
const VIEWS = { desktop: { viewport: { width: 1280, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const results = []; let failed = 0;
const ok = (name, cond, detail = "") => { results.push({ name, pass: !!cond, detail }); if (!cond) { failed++; console.log("  FAIL", name, detail); } };
const log = (s) => console.log("\n== " + s);

const s1 = await serve(ROOT, 8100), s2 = await serve(BASE, 8101);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--host-resolver-rules=MAP www.arabic-keyboard.live 127.0.0.1"] });

async function open(origin, urlPath, view, opts = {}) {
  const ctx = await browser.newContext({ ...VIEWS[view], serviceWorkers: "block" });
  const page = await ctx.newPage(); const reqs = [], errors = [];
  await page.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {} });
  if (opts.init) await page.addInitScript(opts.init);
  page.on("request", (r) => reqs.push(r.url())); page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|www\.arabic-keyboard\.live)/, (r) => { const u = r.request().url(); if (opts.routeExternal && opts.routeExternal(r)) return; r.abort(); });
  if (opts.rewriteApp) await page.route("**/assets/js/app.js", async (r) => { const res = await r.fetch(); await r.fulfill({ response: res, body: opts.rewriteApp(await res.text()) }); });
  const resp = await page.goto(origin + urlPath, { waitUntil: "load" }); await page.waitForTimeout(opts.wait ?? 900);
  return { ctx, page, reqs, errors, status: resp.status() };
}
const probe = (page) => page.evaluate(() => {
  const main = document.querySelector("main"), foot = document.querySelector("footer.site"), r = (e) => e ? e.getBoundingClientRect() : null;
  return {
    adNodes: document.querySelectorAll("[data-site-ad],.site-ad,ins.adsbygoogle,#site-ad-style").length,
    adText: (document.body.innerText.match(/advertisement|ad space/gi) || []).length,
    mode: window.SiteAds ? window.SiteAds.mode : "missing", placed: window.SiteAds ? window.SiteAds.state().placed.length : -1,
    scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    mainH: main ? Math.round(r(main).height * 100) / 100 : null, footTop: foot ? Math.round((r(foot).top + scrollY) * 100) / 100 : null, cls: window.__cls || 0
  };
});
const adReqs = (reqs) => reqs.filter((u) => /googlesyndication|doubleclick|adservice|pagead/.test(u));

/* ======================= A. advertising DISABLED ======================= */
if (suites.has("A")) {
  log("A. Advertising disabled (desktop + mobile; new tree vs untouched baseline)");
  const pages = [["Homepage", "/"], ["Arabic keyboard", "/arabic-keyboard/"], ["Editor", "/editor/"], ["Transliteration", "/transliteration/"], ["Typing test", "/typing-test/"], ["Tashkeel", "/tashkeel/"], ["Calligraphy editor", "/calligraphy-editor/"], ["Arabic alphabet", "/arabic-alphabet/"], ["Translation", "/translation/"], ["Tools hub", "/tools/"], ["About", "/about/"], ["FAQ", "/faq/"], ["Contact", "/contact/"], ["Privacy", "/privacy/"], ["Terms", "/terms/"], ["Learn dashboard", "/learn-arabic/"]];
  const lessons = [["Letter lesson (Alif)", U.pathFor("letter/alif")], ["Harakat lesson", U.pathFor("harakat/harakat-1")], ["Vocabulary lesson (numbers)", U.pathFor("vocab/numbers")], ["Conversation lesson", U.pathFor("conversation/greet")], ["Reading lesson", U.pathFor("reading/read-d1")]];
  for (const view of Object.keys(VIEWS)) for (const [label, p] of [...pages, ...lessons]) {
    const isLesson = p.startsWith("/learn-arabic/") && p !== "/learn-arabic/";
    const n = await open(NEW, p, view); const a = await probe(n.page);
    const tag = `[${view}] ${label}`;
    ok(`${tag}: 200, no page errors`, n.status === 200 && n.errors.length === 0, n.errors.join("|"));
    ok(`${tag}: no ad DOM / style / text`, a.adNodes === 0 && a.adText === 0 && a.mode === "off" && a.placed === 0, JSON.stringify(a));
    let extra = "";
    if (!isLesson) {
      const o = await open(OLD, p, view); const b = await probe(o.page);
      const nr = n.reqs.filter((u) => u.startsWith(NEW)).map((u) => u.replace(NEW, "")), or = o.reqs.filter((u) => u.startsWith(OLD)).map((u) => u.replace(OLD, ""));
      const added = nr.filter((u) => !or.includes(u)), removed = or.filter((u) => !nr.includes(u));
      ok(`${tag}: zero extra network requests vs baseline`, added.every((u) => /learn\/urls\.js$|learn-arabic\//.test(u)) && removed.length === 0, `added=${added} removed=${removed}`);
      ok(`${tag}: ad-domain requests identical to baseline (pre-existing <head> tag only)`, adReqs(n.reqs).length === adReqs(o.reqs).length, `${adReqs(n.reqs).length} vs ${adReqs(o.reqs).length}`);
      if (p === "/learn-arabic/") ok(`${tag}: extra requests are only urls.js`, added.length === 1 && /urls\.js$/.test(added[0]), added.join());
      else {
        ok(`${tag}: page geometry identical to baseline (height/main/footer)`, a.scrollH === b.scrollH && a.mainH === b.mainH && a.footTop === b.footTop, `new ${a.scrollH}/${a.mainH}/${a.footTop} base ${b.scrollH}/${b.mainH}/${b.footTop}`);
        ok(`${tag}: no horizontal overflow introduced`, a.scrollW === b.scrollW, `${a.scrollW} vs ${b.scrollW}`);
      }
      // some pages (e.g. the alphabet) are bimodal on BOTH trees (0 or ~0.117 depending on font-swap timing), so compare against the worst of 3 baseline loads
      let bMax = b.cls; for (let i = 0; i < 2; i++) { const o2 = await open(OLD, p, view); bMax = Math.max(bMax, (await probe(o2.page)).cls); await o2.ctx.close(); }
      ok(`${tag}: layout shift not worse than baseline (worst of 3 baseline loads)`, a.cls <= bMax + 0.002, `${a.cls} vs ${bMax}`);
      extra = ` (height ${a.scrollH} = baseline ${b.scrollH})`; await o.ctx.close();
    } else {
      const gap = await n.page.evaluate(() => { const h = document.querySelector("main .hero"), nx = h.nextElementSibling, nr = nx.getBoundingClientRect(); return { nextClass: nx.className, gap: Math.round((nr.top - h.getBoundingClientRect().bottom) * 100) / 100 }; });
      ok(`${tag}: nothing between intro and lesson (next sibling is the lesson container)`, /lx-main/.test(gap.nextClass), JSON.stringify(gap));
      ok(`${tag}: ad requests only the pre-existing <head> tag`, adReqs(n.reqs).length === 1, adReqs(n.reqs).join());
      ok(`${tag}: no horizontal overflow`, a.scrollW <= a.innerW + 1, `${a.scrollW}>${a.innerW}`);
      extra = ` (intro->lesson gap ${gap.gap}px = normal CSS spacing)`;
    }
    console.log("  ok-run", tag + extra); await n.ctx.close();
  }
}

/* ======================= B. lesson functionality ======================= */
if (suites.has("B")) {
  log("B. Individual lesson functionality");
  for (const view of Object.keys(VIEWS)) {
    const t = (s) => `[${view}] ${s}`;
    const ctx = await browser.newContext({ ...VIEWS[view], serviceWorkers: "block" }); const page = await ctx.newPage(); const errors = [];
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); page.on("pageerror", (e) => errors.push(e.message));
    const go = async (p) => { const r = await page.goto(NEW + p); await page.waitForTimeout(700); return r ? r.status() : 200; };
    ok(t("direct URL opens (200)"), (await go(U.pathFor("letter/ba"))) === 200);
    ok(t("static copy replaced by interactive view; heading present"), /Letter 2 of 28: Ba/.test(await page.textContent("#learnApp h2")) && (await page.$('[data-action="check"]')) !== null);
    ok(t("H1 meaningful"), /Arabic letter Ba/.test(await page.textContent("h1")));
    ok(t("Arabic glyph is lang=ar dir=rtl and rendered"), await page.evaluate(() => { const e = document.querySelector(".lx-hero-ar"); const cs = getComputedStyle(e); return e.textContent === "ب" && e.lang === "ar" && cs.direction === "rtl" && e.getBoundingClientRect().width > 10 && document.documentElement.dir === "rtl"; }));
    ok(t("focus not stolen on load"), await page.evaluate(() => document.activeElement === document.body || !document.activeElement.hasAttribute("data-focus")));
    await page.reload(); await page.waitForTimeout(600); ok(t("refresh keeps the same lesson, no 404"), page.url().endsWith(U.pathFor("letter/ba")) && /Letter 2 of 28/.test(await page.textContent("#learnApp h2")));
    // skip link must not swap lesson for dashboard
    await page.evaluate(() => { location.hash = "#main"; }); await page.waitForTimeout(400);
    ok(t("skip-link hash (#main) does not replace the lesson with the dashboard"), /Letter 2 of 28/.test(await page.textContent("#learnApp h2")));
    // next / previous
    const nextHref = await page.getAttribute(".lx-pager a:last-child", "href"); await page.click(".lx-pager a:last-child"); await page.waitForTimeout(700);
    ok(t("next-lesson link navigates to a real URL"), nextHref === U.pathFor("letter/ta") && page.url().endsWith(U.pathFor("letter/ta")) && /Letter 3 of 28: Ta/.test(await page.textContent("#learnApp h2")), nextHref);
    await page.click(".lx-pager a:first-child"); await page.waitForTimeout(700); ok(t("previous-lesson link works"), page.url().endsWith("/letters/ba/"));
    // exercise + answer checking + progress persistence
    await page.evaluate(() => localStorage.removeItem("ak-learn-progress-v1")); await page.reload(); await page.waitForTimeout(500);
    await page.click('[data-action="check"]'); let right = 0;
    for (let q = 0; q < 3; q++) {
      await page.waitForSelector('[data-action="answer"]'); await page.click('[data-action="answer"][data-v="ba"]'); await page.waitForTimeout(150);
      const fb = (await page.textContent("#lxFb")) || ""; if (/correct|right|well done|yes/i.test(fb) && !/not quite|incorrect|wrong/i.test(fb)) right++;
      const nb = await page.$("#lxNext button, #lxNext a, [data-action='next']"); if (nb) { await nb.click(); await page.waitForTimeout(150); }
    }
    await page.waitForTimeout(300); const finish = await page.textContent("#learnApp");
    ok(t("answer checking gives feedback and a result screen"), /score|passed|complete|out of|\/ ?3|3 of 3/i.test(finish), finish.slice(0, 160));
    const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("ak-learn-progress-v1") || "{}"); return JSON.stringify(d).includes("letter-ba"); });
    ok(t("progress saved to existing store key (ak-learn-progress-v1)"), saved);
    await go(U.pathFor("letter/ba")); ok(t("progress persists: lesson shows complete after reload"), /Lesson complete/.test(await page.textContent("#learnApp")));
    // dashboard integration
    await go("/learn-arabic/"); const tile = await page.getAttribute(`a.lx-tile[href="${U.pathFor("letter/alif")}"]`, "href");
    ok(t("dashboard tile links to the crawlable lesson URL"), tile === U.pathFor("letter/alif"), tile);
    ok(t("dashboard shows the saved completion"), /1 \/ 30/.test(await page.textContent(".lx-stats")), (await page.textContent(".lx-stats")).replace(/\s+/g, " ").slice(0, 80));
    await page.click(`a.lx-tile[href="${U.pathFor("letter/alif")}"]`); await page.waitForTimeout(700); ok(t("dashboard -> lesson navigation"), page.url().endsWith(U.pathFor("letter/alif")));
    await page.click(".lx-back a"); await page.waitForTimeout(700); ok(t("lesson -> dashboard navigation"), page.url().endsWith("/learn-arabic/") && /Your learning dashboard/.test(await page.textContent("#learnApp h2")));
    // legacy hash bookmark
    await go("/learn-arabic/#/letter/ba"); ok(t("legacy bookmark /learn-arabic/#/letter/ba still renders in place"), page.url().endsWith("#/letter/ba") && /Letter 2 of 28: Ba/.test(await page.textContent("#learnApp h2")));
    await go("/learn-arabic/#/practice"); ok(t("other hash routes (practice) still work on the dashboard"), /practice/i.test(await page.textContent("#learnApp h2")));
    // a non-lesson route link from a lesson page goes to the dashboard route
    await go(U.pathFor("vocab/numbers")); const pr = await page.evaluate(() => [...document.querySelectorAll("#learnApp a")].map((a) => a.getAttribute("href")));
    ok(t("vocab lesson: non-lesson routes link to /learn-arabic/#/…, lessons to real URLs"), pr.includes("/learn-arabic/#/vocab"), pr.join(" ").slice(0, 200));
    // vocab practice starts
    await page.click('[data-action="vpractice"]'); await page.waitForTimeout(400); ok(t("vocabulary exercise starts on the lesson page"), /Question 1 of/.test(await page.textContent("#learnApp")));
    ok(t("no page errors during lesson flows"), errors.length === 0, errors.join("|"));
    await ctx.close();
  }
}

/* ======================= C. browser-side SEO / direct navigation ======================= */
if (suites.has("C")) {
  log("C. All 62 lesson URLs in the browser (direct navigation, desktop)");
  const ctx = await browser.newContext({ ...VIEWS.desktop, serviceWorkers: "block" }); const page = await ctx.newPage(); const errors = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); page.on("pageerror", (e) => errors.push(e.message));
  let bad = [];
  for (const e of U.entries) {
    const r = await page.goto(NEW + e.url); await page.waitForTimeout(250);
    const d = await page.evaluate(() => ({ h1: document.querySelectorAll("h1").length, dash: /Your learning dashboard|Page not found/.test(document.querySelector("#learnApp h2")?.textContent || ""), has: !!document.querySelector("#learnApp h2"), canon: document.querySelector('link[rel=canonical]').href, robots: !!document.querySelector('meta[name=robots]'), title: document.title }));
    if (r.status() !== 200 || d.h1 !== 1 || d.dash || !d.has || d.canon !== "https://www.arabic-keyboard.live" + e.url || d.robots) bad.push(e.url + " " + JSON.stringify(d));
  }
  ok("all 62 URLs: 200, one H1, own lesson rendered (not dashboard/404), self-canonical, no robots meta", bad.length === 0, bad.join("\n"));
  ok("all 62 URLs: no JavaScript errors", errors.length === 0, errors.slice(0, 3).join("|"));
  const miss = await page.goto(NEW + "/learn-arabic/letters/nope/"); ok("unknown lesson URL is a real 404", miss.status() === 404);
  await ctx.close();
}

/* ======================= D. advertising ENABLED simulation ======================= */
if (suites.has("D")) {
  log("D. Advertising enabled simulation (fixture + stubbed AdSense; nothing real is requested)");
  const places = [["Homepage", "/", "#tool"], ["Arabic keyboard", "/arabic-keyboard/", "#tool"], ["Editor", "/editor/", "main .tool-card"], ["Transliteration", "/transliteration/", "main .tool-card"], ["Tashkeel", "/tashkeel/", "main .tk-app"], ["Typing test", "/typing-test/", "#resultPanel"], ["Alphabet", "/arabic-alphabet/", "#letterDetail"], ["About", "/about/", "main"], ["FAQ", "/faq/", "main"], ["Privacy", "/privacy/", "main"], ["Terms", "/terms/", "main"]];
  for (const view of Object.keys(VIEWS)) {
    for (const [label, p, anchor] of places) {
      const n = await open(NEW, p + "?ads-fixture=1", view);
      const r = await n.page.evaluate((anchor) => { const ads = [...document.querySelectorAll("[data-site-ad]")], a = ads[0], an = document.querySelector(anchor); if (!a) return { count: 0 }; const ar = a.getBoundingClientRect(), nr = an.getBoundingClientRect(), cs = getComputedStyle(a); return { count: ads.length, adjacent: an.nextElementSibling === a, overlap: !(ar.top >= nr.bottom - 0.5 || ar.bottom <= nr.top + 0.5), pos: cs.position, filled: a.classList.contains("is-filled"), overflowX: document.documentElement.scrollWidth > innerWidth + 1, label: a.querySelector(".site-ad__label").textContent, nearButtons: !!a.querySelector("button,a,input"), h: Math.round(ar.height) }; }, anchor);
      ok(`[${view}] ${label}: exactly one slot, immediately after workspace, no overlap, not fixed/sticky`, r.count === 1 && r.adjacent && !r.overlap && r.pos === "static" && r.filled && !r.overflowX && !r.nearButtons && r.label === "Advertisement", JSON.stringify(r));
      ok(`[${view}] ${label}: fixture issues no ad-domain request beyond the head tag`, adReqs(n.reqs).length <= 1, adReqs(n.reqs).join());
      await n.ctx.close();
    }
    for (const [label, p] of [["Calligraphy editor", "/calligraphy-editor/"], ["Translation", "/translation/"], ["Tools hub", "/tools/"], ["Contact", "/contact/"]]) {
      const n = await open(NEW, p + "?ads-fixture=1", view); ok(`[${view}] ${label}: intentionally NO slot (not in approved table)`, (await probe(n.page)).adNodes === 0); await n.ctx.close();
    }
    // lesson page
    for (const lp of [U.pathFor("letter/ba"), U.pathFor("harakat/harakat-2"), U.pathFor("vocab/colours"), U.pathFor("conversation/order"), U.pathFor("reading/read-t2")]) {
      const n = await open(NEW, lp + "?ads-fixture=1", view);
      const r = await n.page.evaluate(() => { const ads = document.querySelectorAll("[data-site-ad]"), a = ads[0], hero = document.querySelector("main .hero"), app = document.querySelector("#learnApp"); const ar = a.getBoundingClientRect(); return { count: ads.length, prevIsHero: a.previousElementSibling === hero, nextIsLesson: a.nextElementSibling.classList.contains("lx-main"), afterIntro: ar.top >= hero.getBoundingClientRect().bottom - 0.5, beforeLesson: ar.bottom <= app.getBoundingClientRect().top + 0.5, insideLesson: app.contains(a), vh: innerHeight, h: Math.round(ar.height), top: Math.round(ar.top) }; });
      ok(`[${view}] lesson ${lp.split("/").slice(-2, -1)[0]}: one slot after title+intro, before lesson/exercises, never inside lesson`, r.count === 1 && r.prevIsHero && r.nextIsLesson && r.afterIntro && r.beforeLesson && !r.insideLesson, JSON.stringify(r));
      if (view === "mobile") ok(`[mobile] lesson slot does not dominate viewport (${r.h}px of ${r.vh}px)`, r.h < r.vh * 0.4, JSON.stringify(r));
      await n.ctx.close();
    }
    // dashboard
    const d = await open(NEW, "/learn-arabic/?ads-fixture=1", view);
    const dr = await d.page.evaluate(() => { const ads = document.querySelectorAll("[data-site-ad]"), a = ads[0]; return { count: ads.length, prev: a?.previousElementSibling?.className, next: a?.nextElementSibling?.textContent.slice(0, 20), inButtons: !!a?.closest(".lx-cards,.lx-grid") }; });
    ok(`[${view}] dashboard: one slot after learning-path overview, before module directory`, dr.count === 1 && dr.prev === "lx-path" && /Alphabet course/.test(dr.next) && !dr.inButtons, JSON.stringify(dr));
    await d.ctx.close();
  }
  // production-host refusal
  const prod = await browser.newContext({ ...VIEWS.desktop, serviceWorkers: "block" }); const pp = await prod.newPage(); await pp.route(/^https?:\/\/(?!127\.0\.0\.1|www\.arabic-keyboard\.live)/, (r) => r.abort());
  await pp.goto("http://www.arabic-keyboard.live:8100" + U.pathFor("letter/ba") + "?ads-fixture=1"); await pp.waitForTimeout(700);
  const pr = await probe(pp); ok("fixture refused on the production hostname (www.arabic-keyboard.live + ?ads-fixture=1)", pr.adNodes === 0 && pr.mode === "off", JSON.stringify(pr)); await prod.close();
  const lo = await open(NEW, U.pathFor("letter/ba") + "?ads-fixture=1", "desktop"); const lt = await lo.page.textContent("[data-site-ad]"); ok("fixture is visibly labelled as a dev fixture", /DEV FIXTURE/.test(lt)); await lo.ctx.close();

  // LIVE path with a stubbed AdSense (route-intercepted: the real Google script is never contacted)
  const stub = `(function(){var q=window.adsbygoogle=window.adsbygoogle||[];window.__push=0;function run(){document.querySelectorAll('ins.adsbygoogle').forEach(function(i){if(i.getAttribute('data-ad-status'))return;i.style.height='100px';i.setAttribute('data-ad-status',window.__unfill?'unfilled':'filled');});}var c=q.length;for(var k=0;k<c;k++){window.__push++;run();}q.push=function(){window.__push++;run();return 0;};})();`;
  const live = (o = {}) => ({ rewriteApp: (t) => t.replace("ADS_ENABLED: false,", "ADS_ENABLED: true,").replace('AD_SLOT_ID: "",', o.noSlot ? 'AD_SLOT_ID: "",' : 'AD_SLOT_ID: "1234567890",'), routeExternal: (r) => { if (/adsbygoogle\.js/.test(r.request().url())) { r.fulfill({ contentType: "text/javascript", body: stub }); return true; } return false; }, init: o.unfill ? () => { window.__unfill = true; } : undefined });
  const L1 = await open(NEW, U.pathFor("letter/ba"), "desktop", live());
  const lv = await L1.page.evaluate(() => { const a = document.querySelector("[data-site-ad]"), ins = a.querySelector("ins.adsbygoogle"); return { mode: SiteAds.mode, state: SiteAds.state(), count: document.querySelectorAll("[data-site-ad]").length, filled: a.classList.contains("is-filled"), client: ins.dataset.adClient, slot: ins.dataset.adSlot, format: ins.dataset.adFormat, fwr: ins.dataset.fullWidthResponsive, loaders: document.querySelectorAll('script[src*="adsbygoogle.js"]').length, stubPush: window.__push, hero: a.previousElementSibling.matches("main .hero") }; });
  ok("LIVE path: real <ins class=adsbygoogle> with existing publisher ID, responsive attrs, one slot, after hero", lv.mode === "live" && lv.count === 1 && lv.client === "ca-pub-2057098005458261" && lv.slot === "1234567890" && lv.fwr === "true" && lv.hero, JSON.stringify(lv));
  ok("LIVE path: exactly one ad request (push) and no duplicate loader script", lv.state.pushes === 1 && lv.stubPush === 1 && lv.loaders === 1, JSON.stringify(lv));
  ok("LIVE path: frame (border/label/spacing) appears only once filled", lv.filled);
  await L1.page.waitForTimeout(3000); ok("LIVE path: no automatic refresh (still 1 request after 3s)", (await L1.page.evaluate(() => window.__push)) === 1);
  await L1.page.click(".lx-pager a:last-child"); await L1.page.waitForTimeout(900);
  ok("LIVE path: next lesson = normal page navigation = its own single slot", (await L1.page.evaluate(() => [document.querySelectorAll("[data-site-ad]").length, window.__push].join())) === "1,1");
  await L1.ctx.close();
  const L2 = await open(NEW, U.pathFor("letter/ba"), "desktop", live({ unfill: true }));
  const un = await probe(L2.page); const nx = await L2.page.evaluate(() => document.querySelector("main .hero").nextElementSibling.className);
  ok("LIVE path, unfilled: slot removed entirely (no empty box left behind)", un.adNodes === 1 - 1 + (await L2.page.evaluate(() => document.querySelectorAll("#site-ad-style").length)) && /lx-main/.test(nx), JSON.stringify({ un, nx })); await L2.ctx.close();
  const L3 = await open(NEW, U.pathFor("letter/ba"), "desktop", live({ noSlot: true })); const ns = await probe(L3.page);
  ok("ADS_ENABLED=true but no ad-unit ID: renders nothing (never invents an ID)", ns.adNodes === 0 && ns.mode === "off", JSON.stringify(ns)); await L3.ctx.close();
  const L4 = await open(NEW, "/learn-arabic/", "desktop", live());
  await L4.page.evaluate(() => { location.hash = "#/practice"; }); await L4.page.waitForTimeout(400); await L4.page.evaluate(() => { location.hash = "#/"; }); await L4.page.waitForTimeout(600);
  const dd = await L4.page.evaluate(() => ({ pushes: SiteAds.state().pushes, slots: document.querySelectorAll("[data-site-ad]").length }));
  ok("LIVE dashboard: re-rendering the dashboard (hash navigation) issues NO second ad request", dd.pushes === 1 && dd.slots === 0, JSON.stringify(dd)); await L4.ctx.close();
}

await browser.close(); s1.close(); s2.close();
const out = path.join(ROOT, "tests/lesson-urls/last-results.json"); fs.writeFileSync(out, JSON.stringify({ failed, total: results.length, results }, null, 1));
console.log(`\nRESULT: ${results.length - failed}/${results.length} passed, ${failed} failed  (details: tests/lesson-urls/last-results.json)`);
process.exit(failed ? 1 : 0);
