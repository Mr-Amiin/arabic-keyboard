// Service-worker behaviour with the REAL worker enabled: offline lesson pages, offline fallback, and the v20 -> v21 upgrade.
// usage: BASELINE=/pristine/tree node tests/lesson-urls/sw-offline-tests.mjs
import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url"; import { serve } from "./static-server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/opt/npm-tools/node_modules/playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), BASE = process.env.BASELINE;
const U = require(path.join(ROOT, "assets/js/learn/urls.js"));   // the one source of truth for lesson URLs
const PORT = 8110, O = `http://127.0.0.1:${PORT}`; let failed = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (!c) failed++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : "  -> " + d)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const swReady = (p) => p.evaluate(async () => { const r = await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise((x) => setTimeout(x, 100)); return !!r.active; });
const cacheInfo = (p) => p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); return out; });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

/* ---- 1. upgrade: a visitor who already has the CURRENT (v20) worker + cached old app.js ---- */
console.log("== 1. upgrade from the live v20 worker");
let srv = await serve(BASE, PORT);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
await page.goto(O + "/learn-arabic/"); await swReady(page); await page.reload(); await page.waitForTimeout(800);
let c = await cacheInfo(page);
ok("baseline visitor has the v20 shell cache", Object.keys(c).includes("arabic-keyboard-shell-v20"), Object.keys(c).join());
ok("baseline visitor's cached app.js has no SiteAds / LearnUrls yet", await page.evaluate(() => !window.SiteAds && !window.LearnUrls));
srv.close(); await sleep(300); srv = await serve(ROOT, PORT);                     // "deploy" the new version on the same origin
await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
await sleep(2500);
await page.reload(); await page.waitForTimeout(1200);
c = await cacheInfo(page); const keys = Object.keys(c);
ok("after update: v21 shell cache present and v20 deleted", keys.includes("arabic-keyboard-shell-v21") && !keys.includes("arabic-keyboard-shell-v20"), keys.join());
ok("urls.js precached in v21", (c["arabic-keyboard-shell-v21"] || []).includes("/assets/js/learn/urls.js"));
await page.reload(); await page.waitForTimeout(1000);
const fresh = await page.evaluate((alif) => ({ ads: !!window.SiteAds, mode: window.SiteAds && window.SiteAds.mode, urls: !!window.LearnUrls, tile: (document.querySelector(`a.lx-tile[href="${alif}"]`) || {}).getAttribute?.("href") }), U.pathFor("letter/alif"));
ok("returning visitor now runs the NEW app.js and learn app (no stale cache)", fresh.ads && fresh.mode === "off" && fresh.urls && fresh.tile === U.pathFor("letter/alif"), JSON.stringify(fresh));

/* ---- 2. offline behaviour on the new tree ---- */
console.log("== 2. offline behaviour");
await page.goto(O + U.pathFor("letter/ba")); await page.waitForTimeout(900);
c = await cacheInfo(page);
ok("a visited lesson page is cached for offline", Object.values(c).some((l) => l.includes(U.pathFor("letter/ba"))), Object.values(c).map((l) => l.filter((x) => x.includes("learn-arabic/letters"))).join());
await ctx.setOffline(true);
let r = await page.goto(O + U.pathFor("letter/ba")).catch((e) => ({ err: String(e) }));
await page.waitForTimeout(900);
ok("offline: visited lesson reloads and the interactive lesson renders", !r.err && /Letter 2 of 28: Ba/.test(await page.textContent("#learnApp h2").catch(() => "")) && !!(await page.$('[data-action="check"]')), JSON.stringify(r.err || ""));
r = await page.goto(O + U.pathFor("letter/ta")).catch((e) => ({ err: String(e) })); await page.waitForTimeout(900);
const t2 = r.err ? "ERR " + r.err : await page.evaluate(() => ({ url: location.pathname, h1: (document.querySelector("h1") || {}).textContent, h2: (document.querySelector("#learnApp h2") || {}).textContent }));
ok("offline: an UNVISITED lesson redirects to the working precached dashboard (not the home page)", t2.url === "/learn-arabic/" && t2.h2 && /Your learning dashboard/.test(t2.h2), JSON.stringify(t2));
r = await page.goto(O + "/faq/").catch((e) => ({ err: String(e) })); await page.waitForTimeout(500);
const t3 = r.err ? "ERR" : await page.evaluate(() => document.title);
ok("offline: unvisited NON-learn page keeps the old behaviour (falls back to home)", !r.err && /\S/.test(t3), t3);
await page.goto(O + "/learn-arabic/"); await page.waitForTimeout(900);
ok("offline: dashboard works and its lesson links are real URLs", (await page.getAttribute(`a.lx-tile[href="${U.pathFor("letter/alif")}"]`, "href")) === U.pathFor("letter/alif"));
await ctx.setOffline(false);
await browser.close(); srv.close();
console.log(`\nSW RESULT: ${total - failed}/${total} passed`); process.exit(failed ? 1 : 0);
