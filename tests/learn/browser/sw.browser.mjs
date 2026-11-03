// Service-worker suite: the REAL worker (v16) in headless Chromium, served from the repo root.
import fs from "node:fs";
import path from "node:path";
import { harness, sleep, txt, REPO } from "./lib.mjs";
import { finishSession, score, readStore } from "./v1-lib.mjs";
const H = await harness("service-worker"); const { base, ok } = H;
const src = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
const CACHE = src.match(/CACHE_NAME = "([^"]+)"/)[1], VENDOR = src.match(/VENDOR_CACHE = "([^"]+)"/)[1];
const CORE = eval(src.match(/const CORE_ASSETS = (\[[\s\S]*?\]);/)[1]);
ok(CACHE === "arabic-keyboard-shell-v16", "sw.js CACHE_NAME is v16 (above the live v15) (" + CACHE + ")");
const p = await H.page({ sw: true }); let N = 0;
const U = h => `${base}/learn-arabic/?n=${++N}${h || ""}`;
const settle = async () => { await p.evaluate(() => navigator.serviceWorker.ready); await sleep(2500); };
const wipe = () => p.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); });
const keys = () => p.evaluate(() => caches.keys());
const ready = () => p.waitForFunction(() => window.LearnTypingDock && ["ready", "failed"].includes(LearnTypingDock.state().keyboard), { timeout: 15000 });
const openTyping = async stage => { await p.goto(U("#/read"), { waitUntil: "domcontentloaded" }); await p.waitForSelector(`[data-action="stage"][data-id="${stage}"]`); await p.click(`[data-action="stage"][data-id="${stage}"]`); await p.waitForSelector("#lxEditor", { visible: true }); await ready(); };

/* 1. fresh install */
await p.goto(U(), { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid", { timeout: 20000 }); await wipe();
await p.goto(U(), { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid"); await settle();
let ks = await keys();
ok(ks.includes(CACHE), "fresh install creates cache " + CACHE + " (caches: " + JSON.stringify(ks) + ")");
const cached = await p.evaluate(async c => { const ch = await caches.open(c); return (await ch.keys()).map(r => new URL(r.url).pathname); }, CACHE);
const missing = CORE.filter(u => !cached.includes(u));
ok(missing.length === 0, `all ${CORE.length} precache entries were actually cached` + (missing.length ? " MISSING: " + missing.join(", ") : ""));
ok(["/learn-arabic/", "/assets/css/learn.css", "/assets/js/learn/typing-dock.js", "/assets/js/learn/app.js", "/assets/js/keyboard-tool.js", "/assets/js/learn/vocab-data.js", "/assets/js/learn/srs.js", "/assets/js/learn/review.js"].every(u => cached.includes(u)), "Learn page, its CSS/JS (incl. typing-dock) and keyboard-tool.js are precached");
ok(ks.every(k => k === CACHE || k === VENDOR), "no unexpected caches after a fresh install");
/* 2. activation removes obsolete caches, keeps the vendor cache, and old Learn assets cannot linger */
await p.evaluate(async v => {
  for (const name of ["arabic-keyboard-shell-v10", "arabic-keyboard-shell-v11", "arabic-keyboard-shell-v15"]) { const c = await caches.open(name); await c.put("/assets/js/learn/app.js", new Response("window.__STALE_" + name.slice(-3) + "=1")); await c.put("/old-only.txt", new Response("x")); }
  const vc = await caches.open(v); await vc.put("/assets/vendor/keepme.bin", new Response("vendor"));
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
}, VENDOR);
await p.goto(U(), { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid"); await settle();
ks = await keys();
ok(!ks.includes("arabic-keyboard-shell-v10") && !ks.includes("arabic-keyboard-shell-v11") && !ks.includes("arabic-keyboard-shell-v15") && ks.includes(CACHE), "activation deleted the obsolete v10, v11 and the currently-live v15 caches (now: " + JSON.stringify(ks) + ")");
ok(ks.includes(VENDOR) && await p.evaluate(async v => !!(await (await caches.open(v)).match("/assets/vendor/keepme.bin")), VENDOR), "the separate vendor cache (19 MB Tashkeel model) was preserved");
await p.goto(U(), { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid");
ok(await p.evaluate(() => !("__STALE_v10" in window) && !("__STALE_v11" in window) && !("__STALE_v15" in window) && typeof LearnTypingDock === "object" && typeof LearnEngine.gradeTyped === "function"), "page runs the new Learn code, not stale cached v10/v11/v15 files");
/* 3. dashboard + keyboard under the worker */
await p.goto(U(), { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid");
ok((await p.$$(".lx-tile")).length === 28 && (await p.evaluate(() => !!navigator.serviceWorker.controller)), "dashboard renders (28 tiles) while controlled by the worker");
await openTyping("words");
ok(await p.evaluate(() => LearnTypingDock.state().keyboard === "ready" && document.querySelectorAll("#lxKb .key").length === 74), "keyboard loads and mounts (74 keys) under the worker");
/* 3b. ONLINE exactness: a never-cached query URL goes to the network (ignoreSearch must not be used online) */
const before = H.hits.filter(h => h === "/learn-arabic/").length;
await p.goto(`${base}/learn-arabic/?lang=en&fresh=${Date.now()}`, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid");
ok(H.hits.filter(h => h === "/learn-arabic/").length > before && (await txt(p, "h1")) === "Learn Arabic", "ONLINE: an uncached ?query URL is fetched from the network (not answered from a different cached URL) and renders in English");
const online = await p.evaluate(async () => { const r = await fetch("/assets/css/learn.css?v=online-" + Date.now()); return r.status; });
ok(online === 200, "ONLINE: an asset URL with a query still goes to the network");
/* 4. offline: the test server is STOPPED, so nothing (page or worker) can reach the network.
      (Page-level setOfflineMode does not affect the worker's own fetches, so it cannot prove anything here.) */
const OFF = base + "/learn-arabic/";                       // the worker matches cache entries by exact URL: no query string
await p.goto(OFF, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".lx-grid"); await settle();   // make sure this exact URL is cached while online
await H.stop();
await p.goto(OFF, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {}); await p.waitForSelector(".lx-grid", { timeout: 15000 }).catch(() => {});
ok((await p.$$(".lx-tile")).length === 28, "OFFLINE (server stopped): Learn dashboard renders from the cache");
/* 4b. REGRESSION: offline navigation to a cached page WITH a ?lang query used to fall through to the HOME page */
const homeTitle = await p.evaluate(async () => { const r = await caches.match("/"); return ((await r.text()).match(/<title>([\s\S]*?)<\/title>/) || [])[1]; });
const homeH1 = await p.evaluate(async () => { const r = await caches.match("/"); return ((await r.text()).match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1].replace(/<[^>]+>/g, ""); });
const nav = async path => { await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}); await sleep(700); return p.evaluate(() => ({ title: document.title, learn: !!document.querySelector("#learnApp"), tiles: document.querySelectorAll(".lx-tile").length, h1: (document.querySelector("h1") || {}).textContent, keys: document.querySelectorAll("#virtualKeyboard .key").length })); };
let r = await nav("/learn-arabic/?lang=en");
ok(r.learn && r.tiles === 28 && r.h1 === "Learn Arabic", "OFFLINE: /learn-arabic/?lang=en serves the Learn page (not home) and the query still selects English " + JSON.stringify({ h1: r.h1, tiles: r.tiles }));
r = await nav("/learn-arabic/?lang=ar"); ok(r.learn && r.tiles === 28 && /تعلّم/.test(r.h1), "OFFLINE: /learn-arabic/?lang=ar serves the Learn page in Arabic");
r = await nav("/learn-arabic/?lang=en&utm_source=x"); ok(r.learn && r.tiles === 28, "OFFLINE: extra, unknown query parameters also resolve to the cached page");
await p.evaluate(() => { location.hash = "#/letter/ba"; }); await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForSelector(".lx-hero-ar", { timeout: 10000 }).catch(() => {});
ok((await p.$$(".lx-form")).length === 4, "OFFLINE: lesson deep link (?lang=en#/letter/ba) reloads from the cache");
// Page identity only (h1/title differ from home). Whether a tool page's own init script works offline depends on that script being cached,
// which is a separate, pre-existing precache matter (the standalone tools' *-init.js files are not precached) and not part of this check.
for (const path of ["/arabic-keyboard/?lang=en", "/translation/?lang=en"]) { r = await nav(path); ok(!r.learn && r.h1 !== homeH1 && r.title !== homeTitle, `OFFLINE: ${path} serves ITS OWN page, not home ` + JSON.stringify({ h1: r.h1, title: r.title.slice(0, 40) })); }
/* unrelated behaviour that must NOT change */
r = await nav("/no-such-page/?lang=en"); ok(!r.learn && r.keys === 0 && r.title === homeTitle, "OFFLINE: an unknown path still falls back to the home page (unchanged behaviour)");
const asset = await p.evaluate(async () => { const res = {}; try { res.plain = (await fetch("/assets/css/learn.css")).status; } catch (e) { res.plain = "error"; } try { res.query = (await fetch("/assets/css/learn.css?v=999")).status; } catch (e) { res.query = "error"; } return res; });
ok(asset.plain === 200 && asset.query === "error", "OFFLINE: non-navigation requests keep exact-URL matching (cached asset OK; same asset with a query fails honestly) " + JSON.stringify(asset));
await p.goto(OFF, { waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForSelector(".lx-grid", { timeout: 10000 }).catch(() => {});
await p.evaluate(() => { location.hash = "#/letter/ba"; }); await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForSelector(".lx-hero-ar", { timeout: 10000 }).catch(() => {});
ok((await p.$$(".lx-form")).length === 4, "OFFLINE: a lesson renders after a full reload");
await p.evaluate(() => { location.hash = "#/read"; }); await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForSelector('[data-action="stage"][data-id="words"]', { timeout: 10000 }).catch(() => {});
await p.click('[data-action="stage"][data-id="words"]'); await p.waitForSelector("#lxEditor", { visible: true }); await ready();
ok(await p.evaluate(() => LearnTypingDock.state().keyboard === "ready" && document.querySelectorAll("#lxKb .key").length === 74), "OFFLINE: typing exercise + on-screen keyboard load from the precache");
/* 4c. V1 offline: vocabulary, practice, review and English-mode URLs work from the cache with the server stopped */
r = await nav("/learn-arabic/?lang=en#/vocab/numbers"); await p.waitForSelector(".lx-ex", { timeout: 8000 }).catch(() => {});
const vo = await p.evaluate(() => ({ h1: document.querySelector("h1").textContent, n: document.querySelectorAll(".lx-ex").length, first: (document.querySelector(".lx-ex-ar") || {}).textContent }));
ok(vo.n === 11 && vo.h1 === "Learn Arabic" && vo.first === "صِفْر", "OFFLINE + English mode: /learn-arabic/?lang=en#/vocab/numbers shows the 11 numbers with the Arabic intact " + JSON.stringify(vo));
await p.evaluate(() => localStorage.removeItem("ak-learn-progress-v1"));
await p.click('[data-action="vpractice"][data-type="v-match"]'); await finishSession(p);
const offState = await readStore(p);
ok((await score(p)).startsWith("10 / 10") && Object.keys(offState.srs).length === 10 && offState.v === 2, "OFFLINE: a full vocabulary practice round completes and the review schedule is saved (10 items, schema v2)");
await p.evaluate(() => { location.hash = "#/review"; }); await p.waitForFunction(() => /Daily review/.test((document.querySelector("#learnApp .lx-h") || {}).textContent || ""), { timeout: 8000 }).catch(() => {});
ok(/caught up/.test(await txt(p, "#learnApp")) && /Next review: in 2 days/.test(await txt(p, "#learnApp")), "OFFLINE: the Daily review page works and reports the next review time");
r = await nav("/learn-arabic/?lang=ar#/patterns/this-f"); await p.waitForSelector(".lx-ex", { timeout: 8000 }).catch(() => {});
ok((await p.$$(".lx-ex")).length === 3, "OFFLINE: a sentence-pattern page opens through a ?lang=ar URL");
/* 5. offline AND the keyboard script is missing from every cache -> native fallback */
await p.evaluate(async () => { for (const k of await caches.keys()) await (await caches.open(k)).delete("/assets/js/keyboard-tool.js"); });
await p.evaluate(() => { location.hash = "#/read"; }); await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await p.waitForSelector('[data-action="stage"][data-id="joined"]', { timeout: 10000 }).catch(() => {});
await p.click('[data-action="stage"][data-id="joined"]'); await p.waitForSelector("#lxEditor", { visible: true }); await ready();
const fb = await p.evaluate(() => ({ s: LearnTypingDock.state().keyboard, msg: document.getElementById("lxKbStatus").textContent, keys: document.querySelectorAll("#lxKb .key").length }));
ok(fb.s === "failed" && fb.keys === 0 && /could not be loaded/.test(fb.msg), "OFFLINE + keyboard script in no cache: dock reports failure instead of hanging " + JSON.stringify(fb));
await p.type("#lxEditor", "بنت"); await p.click("#lxTCheck"); await p.waitForSelector("#lxTNextBtn");
ok((await txt(p, "#lxTFb")).includes("Correct"), "OFFLINE + no keyboard script: native textarea and answer checking still work");
ok(p.errs.length === 0, "no page errors in the service-worker run: " + JSON.stringify(p.errs));
await H.finish();
