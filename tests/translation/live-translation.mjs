// LIVE test: talks to the DEPLOYED Worker and therefore to the REAL Cloudflare-hosted model @cf/meta/m2m100-1.2b.
//
//   TRANSLATE_API=https://ak-translate-proxy.<you>.workers.dev  node tests/translation/live-translation.mjs
//
// Optional environment variables
//   ORIGIN=https://www.arabic-keyboard.live   an origin that is in the Worker's ALLOWED_ORIGINS (default shown)
//   PROBE=core | common | all                 core: the required pairs only; common (default): + 12 widely used languages;
//                                             all: every advertised language (about 100 calls; slow because of the rate limit)
//   RATE_TEST=1                               also fire a burst to confirm the rate limiter answers 429
//   MAX_WAIT_S=65                             upper bound for waiting after a 429 (rate limit)
//
// What it checks (hard = counts as failure):
//   hard  Arabic<->English, Arabic<->Somali, Arabic<->Swahili are REAL translations (right script, non-empty, differs from the input)
//   hard  Arabic -> Somali -> Arabic round trip returns Arabic
//   soft  expected words / round-trip similarity (wording varies between model versions) -> WARN only
//   info  every other advertised language: reported; failing ones are listed so you can hide them with DISABLED_LANGUAGES
//   hard  validation, error codes and origin protection
//
// Exit codes: 0 all good | 1 a required pair failed | 2 setup problem | 3 required pairs OK but some other languages failed
// It paces itself: the Worker allows 10 translations per minute per IP, so on 429 it waits for Retry-After and continues.
// If Cloudflare's free daily allocation is used up (error quota_exceeded) it stops with an explanation. It never retries that.
const API = (process.env.TRANSLATE_API || "").replace(/\/+$/, "");
const ORIGIN = process.env.ORIGIN || "https://www.arabic-keyboard.live";
const PROBE = (process.env.PROBE || "common").toLowerCase();
if (!API) { console.error("Set TRANSLATE_API to the deployed Worker URL (see workers/translate-proxy/README.md)."); process.exit(2); }

const AR = /[\u0600-\u06FF]/, LATIN = /[A-Za-z]/;
const SCRIPT = { // expected script of the OUTPUT for non-Latin targets (anything not listed must be Latin script)
  am: /[\u1200-\u137F]/, ar: AR, fa: AR, ps: AR, sd: AR, ur: AR, he: /[\u0590-\u05FF]/, yi: /[\u0590-\u05FF]/, bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/,
  hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/, ne: /[\u0900-\u097F]/, kn: /[\u0C80-\u0CFF]/, ml: /[\u0D00-\u0D7F]/, ta: /[\u0B80-\u0BFF]/, or: /[\u0B00-\u0B7F]/,
  pa: /[\u0A00-\u0A7F]/, si: /[\u0D80-\u0DFF]/, th: /[\u0E00-\u0E7F]/, lo: /[\u0E80-\u0EFF]/, km: /[\u1780-\u17FF]/, my: /[\u1000-\u109F]/, ka: /[\u10A0-\u10FF]/,
  hy: /[\u0530-\u058F]/, el: /[\u0370-\u03FF]/, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, zh: /[\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/,
  ru: /[\u0400-\u04FF]/, uk: /[\u0400-\u04FF]/, be: /[\u0400-\u04FF]/, bg: /[\u0400-\u04FF]/, mk: /[\u0400-\u04FF]/, sr: /[\u0400-\u04FF\u0100-\u017F]|[A-Za-z]/, kk: /[\u0400-\u04FF]/, mn: /[\u0400-\u04FF]/, ba: /[\u0400-\u04FF]/
};
const COMMON = ["fr", "es", "de", "tr", "id", "ur", "fa", "ru", "zh", "ja", "hi", "ha"];
const hardFail = [], softWarn = [], langFail = []; let passed = 0, calls = 0;
const ok = (n, c, d = "") => { if (c) { passed++; console.log("PASS " + n); } else { hardFail.push(n); console.log("FAIL " + n + (d ? "  — " + d : "")); } };
const warn = (n, c, d = "") => { if (!c) { softWarn.push(n); console.log("WARN " + n + (d ? "  — " + d : "")); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const words = s => (s || "").toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
const H = { "content-type": "application/json", origin: ORIGIN };

class QuotaStop extends Error { }
async function tr(text, from, to, raw = false) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    calls++;
    const r = await fetch(API + "/translate", { method: "POST", headers: H, body: JSON.stringify({ text, from, to }) });
    const body = await r.json().catch(() => null), code = body && body.error && body.error.code;
    if (code === "quota_exceeded") throw new QuotaStop();
    if (!raw && r.status === 429) { const w = Math.min(Number(process.env.MAX_WAIT_S) || 65, Number(r.headers.get("retry-after")) || 30); console.log(`     (rate limit: waiting ${w}s)`); await sleep(w * 1000 + 500); continue; }
    if (!raw && code === "busy" && attempt < 4) { await sleep(5000); continue; }
    return { status: r.status, body, headers: r.headers };
  }
  return { status: 429, body: { ok: false, error: { code: "rate_limited" } }, headers: new Headers() };
}
const out = r => (r.body && r.body.ok ? r.body.translation : "");
const show = (label, r) => console.log(`     ${label}: ${r.body && r.body.ok ? JSON.stringify(r.body.translation) : JSON.stringify(r.body)}`);
const real = (r, to, input) => r.status === 200 && r.body.ok && out(r).trim().length > 0 && out(r) !== input && (SCRIPT[to] ? SCRIPT[to].test(out(r)) : (LATIN.test(out(r)) && !AR.test(out(r))));

try {
  /* ---- setup ---- */
  const hr = await fetch(API + "/health", { headers: { origin: ORIGIN } }); const health = await hr.json().catch(() => null);
  ok("0. /health: the Worker is up, the AI binding is present, model is @cf/meta/m2m100-1.2b", health && health.ok && health.configured === true && health.model === "@cf/meta/m2m100-1.2b", JSON.stringify(health));
  if (!health || !health.configured) { console.error("\nThe Worker is not configured (no AI binding). Check wrangler.toml [ai] and redeploy."); process.exit(2); }
  const lr = await fetch(API + "/languages?ui=en", { headers: { origin: ORIGIN } }); const langs = await lr.json().catch(() => null);
  const codes = new Set(((langs && langs.languages) || []).map(l => l.code));
  ok("1. /languages advertises the 100 M2M100 languages incl. ar, en, so, sw", lr.status === 200 && codes.size >= 90 && ["ar", "en", "so", "sw"].every(c => codes.has(c)), `count=${codes.size}`);
  const arNames = await (await fetch(API + "/languages?ui=ar", { headers: { origin: ORIGIN } })).json().catch(() => null);
  warn("1b. language names are localized to Arabic when ui=ar", arNames && arNames.ok && AR.test((arNames.languages.find(l => l.code === "so") || {}).name || ""));

  /* ---- REQUIRED real translations ---- */
  let r = await tr("السلام عليكم، كيف حالك؟", "ar", "en"); show("ar→en", r);
  ok("2. Arabic → English is a REAL translation (Latin script, differs from input, several words)", real(r, "en", "السلام عليكم، كيف حالك؟") && words(out(r)).length >= 3, JSON.stringify(r.body));
  warn("2b. English output mentions peace/hello/how/you", /peace|hello|how|you|greet/i.test(out(r)));
  if (!(r.status === 200) && r.body && /unsupported_language/.test(JSON.stringify(r.body))) console.log("\n     HINT: the model rejected the language CODES. Cloudflare's docs describe codes ('en') but show names ('english') in an example.\n     In workers/translate-proxy/wrangler.toml under [vars] add  LANG_FORMAT = \"name\"  (the Worker then sends names such as 'english'), run `npx wrangler deploy` again, and rerun this test.\n");
  const enOut = out(r);

  r = await tr("Good morning, how are you today?", "en", "ar"); show("en→ar", r);
  ok("3. English → Arabic is a REAL translation (Arabic script, no leftover English words)", real(r, "ar", "Good morning, how are you today?") && !/[A-Za-z]{4,}/.test(out(r)), JSON.stringify(r.body));
  warn("3b. Arabic output contains صباح", /صباح/.test(out(r)));

  r = await tr("شكرا جزيلا على مساعدتك", "ar", "so"); show("ar→so", r); const soOut = out(r);
  ok("4. Arabic → Somali is a REAL translation (Latin script, differs from input)", real(r, "so", "شكرا جزيلا على مساعدتك"), JSON.stringify(r.body));
  warn("4b. Somali output contains 'mahad'", /mahad/i.test(soOut));

  r = await tr("Mahadsanid, waan ku salaamayaa", "so", "ar"); show("so→ar", r);
  ok("5. Somali → Arabic is a REAL translation (Arabic script)", real(r, "ar", "Mahadsanid, waan ku salaamayaa"), JSON.stringify(r.body));
  warn("5b. Arabic output contains شكر", /شكر/.test(out(r)));

  r = await tr("أحب القراءة كل يوم", "ar", "sw"); show("ar→sw", r);
  ok("6. Arabic → Swahili is a REAL translation (Latin script)", real(r, "sw", "أحب القراءة كل يوم"), JSON.stringify(r.body));
  r = await tr("Ninapenda kusoma kila siku", "sw", "ar"); show("sw→ar", r);
  ok("7. Swahili → Arabic is a REAL translation (Arabic script)", real(r, "ar", "Ninapenda kusoma kila siku"), JSON.stringify(r.body));

  const original = "أحب القراءة كل يوم في المكتبة"; const a = await tr(original, "ar", "so"); const b = real(a, "so", original) ? await tr(out(a), "so", "ar") : null; show("round trip so", a); b && show("round trip ar", b);
  ok("8. round trip Arabic → Somali → Arabic: a real Somali middle step and Arabic again", real(a, "so", original) && b && b.status === 200 && AR.test(out(b)), JSON.stringify(b && b.body));
  const shared = b ? words(original).filter(w => words(out(b)).includes(w)).length : 0; warn("8b. round trip keeps at least 2 of the original words", shared >= 2, `shared=${shared}`);

  /* ---- long text: chunking really works against the real model ---- */
  const longAr = Array.from({ length: 14 }, (_, i) => `هذه هي الجملة رقم ${i + 1}، وهي جزء من نص أطول لاختبار تقسيم النص.`).join(" ") + "\n\n" + "الفقرة الثانية قصيرة. شكرا لكم.";
  r = await tr(longAr, "ar", "en"); show("long ar→en (first 120 chars)", { body: r.body && r.body.ok ? { ok: true, translation: out(r).slice(0, 120) } : r.body });
  ok("9. a long multi-paragraph Arabic text (split into several model calls) is translated completely, keeping the paragraph break", real(r, "en", longAr) && out(r).includes("\n\n") && words(out(r)).length >= 60, JSON.stringify(r.body && r.body.error));

  /* ---- other languages ---- */
  const list = PROBE === "core" ? [] : PROBE === "all" ? [...codes].filter(c => c !== "en") : COMMON.filter(c => codes.has(c));
  for (const to of list) {
    const x = await tr("Good morning, how are you?", "en", to); const good = real(x, to, "Good morning, how are you?");
    console.log(`${good ? "ok  " : "BAD "} en→${to.padEnd(3)} ${x.body && x.body.ok ? JSON.stringify(out(x)).slice(0, 70) : JSON.stringify(x.body && x.body.error)}`);
    if (!good) langFail.push(to);
  }
  if (list.length) { const rev = []; for (const c of ["fr", "es", "tr", "ur"].filter(c => list.includes(c))) { const x = await tr("Bonjour, comment allez-vous ?", c === "fr" ? "fr" : "en", "ar"); rev.push(c); if (c === "fr") ok("10. French → Arabic is a REAL translation (Arabic script)", real(x, "ar", "Bonjour, comment allez-vous ?"), JSON.stringify(x.body)); break; } }

  /* ---- validation / protection (cheap: rejected before the model is called) ---- */
  r = await tr("   ", "ar", "en", true); ok("11a. empty text -> 400 empty", r.status === 400 && r.body.error.code === "empty");
  r = await tr("ع".repeat(5001), "ar", "en", true); ok("11b. over 5,000 characters -> 413 too_long", r.status === 413 && r.body.error.code === "too_long");
  r = await tr("نص", "ar", "xx", true); ok("11c. unsupported language -> 400 unsupported_language", r.status === 400 && r.body.error.code === "unsupported_language");
  r = await tr("نص", "ar", "ar", true); ok("11d. same language -> 400 same_language", r.status === 400 && r.body.error.code === "same_language");
  r = await tr("نص", "auto", "en", true); ok("11e. no auto-detect: from='auto' -> 400 bad_request (the model cannot detect languages)", r.status === 400 && r.body.error.code === "bad_request");
  const evil = await fetch(API + "/translate", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ text: "x", from: "en", to: "ar" }) });
  ok("11f. a foreign Origin is refused (403) and gets no CORS header", evil.status === 403 && evil.headers.get("access-control-allow-origin") === null);
  const pre = await fetch(API + "/translate", { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
  ok("11g. CORS preflight for the site's origin succeeds", pre.status === 204 && pre.headers.get("access-control-allow-origin") === ORIGIN);
  if (process.env.RATE_TEST === "1") {
    const codesSeen = []; for (let i = 0; i < 16; i++) codesSeen.push((await tr("نص", "ar", "en", true)).status);
    ok("12. rate limiter: a rapid burst from one IP is answered with 429", codesSeen.includes(429), codesSeen.join());
  }
} catch (e) {
  if (e instanceof QuotaStop) {
    console.error("\nSTOPPED: Cloudflare reports the FREE DAILY ALLOCATION (10,000 Neurons) is used up (error quota_exceeded).\nThis is not a bug. It renews at 00:00 UTC. Run the test again after that. (Nothing was charged; nothing switched to a paid plan.)");
    console.error(`So far: ${passed} passed, ${hardFail.length} failed (${calls} calls).`); process.exit(2);
  }
  console.error(`\nCould not complete the live test: ${e && e.message}.\nCheck that TRANSLATE_API (${API}) is the deployed Worker URL and reachable from this machine.`); process.exit(2);
}

console.log(`\nLIVE: ${passed} passed, ${hardFail.length} FAILED, ${softWarn.length} warnings   (${calls} model/Worker calls)`);
if (langFail.length) {
  console.log(`\nOther languages that did NOT produce a real translation: ${langFail.join(", ")}`);
  console.log(`To hide them from the website without changing code, set in wrangler.toml [vars]:\n   DISABLED_LANGUAGES = "${langFail.join(",")}"\nthen run "npx wrangler deploy" again.`);
}
process.exit(hardFail.length ? 1 : (langFail.length ? 3 : 0));
