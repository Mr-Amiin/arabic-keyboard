// Logic tests for the translation proxy Worker (Cloudflare Workers AI, @cf/meta/m2m100-1.2b).
// The Workers AI binding is replaced by a STUB `env.AI.run` that records its inputs. These tests prove the Worker's validation,
// chunking, security, rate limiting and error mapping. They do NOT prove translation quality: that is what
// live-translation.mjs checks against the real, Cloudflare-hosted model.
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle, MAX_CHARS, CHUNK_CHARS, MODEL, LANGUAGE_CODES, splitForTranslation } from "../../workers/translate-proxy/src/core.js";

const ORIGIN = "https://www.arabic-keyboard.live";
let calls, aiImpl;
const stubAI = () => ({ run: async (model, input) => { calls.push({ model, input }); return aiImpl(model, input); } });
const echo = (m, i) => ({ translated_text: i.text });                       // identity "translator": lets us check chunking/re-assembly exactly
const tagged = (m, i) => ({ translated_text: `[${i.source_lang}>${i.target_lang}] ${i.text}` });
const mkEnv = (extra = {}) => ({ AI: stubAI(), ...extra });
test.beforeEach(() => { calls = []; aiImpl = tagged; });

const req = (p, { method = "GET", body, origin = ORIGIN, ct = "application/json", headers = {} } = {}) => new Request("https://proxy.test" + p, { method, headers: { ...(origin ? { origin } : {}), ...(body !== undefined ? { "content-type": ct } : {}), ...headers }, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
const call = async (r, env = mkEnv()) => { const res = await handle(r, env, {}); return { res, body: await res.json().catch(() => null) }; };
const tr = (b, o, env) => call(req("/translate", { method: "POST", body: b, ...(o || {}) }), env);

test("the main module exports ONLY the default handler (Cloudflare rejects other exports at startup)", async () => {
  const m = await import("../../workers/translate-proxy/src/index.js");
  assert.deepEqual(Object.keys(m), ["default"]); assert.equal(typeof m.default.fetch, "function");
});
test("no Azure / Microsoft / API-key remnants anywhere in the Worker folder", () => {
  const dir = fileURLToPath(new URL("../../workers/translate-proxy", import.meta.url));
  const files = fs.readdirSync(dir, { recursive: true }).filter(f => !f.includes("node_modules") && fs.statSync(path.join(dir, f)).isFile());
  for (const f of files) assert.ok(!/azure|ocp-apim|cognitive|microsoft|subscription[-_ ]?key/i.test(fs.readFileSync(path.join(dir, f), "utf8")), "found in " + f);
});
test("model name is exactly @cf/meta/m2m100-1.2b", () => assert.equal(MODEL, "@cf/meta/m2m100-1.2b"));

test("GET /languages: 100 unique M2M100 languages incl. the required ones, with names, dir and the character limit", async () => {
  const { res, body } = await call(req("/languages?ui=en"));
  assert.equal(res.status, 200); assert.equal(body.maxChars, MAX_CHARS); assert.equal(body.languages.length, 100);
  assert.equal(new Set(body.languages.map(l => l.code)).size, 100);
  for (const c of ["ar", "en", "so", "sw", "fr", "es", "de", "tr", "ur", "id", "zh"]) assert.ok(body.languages.some(l => l.code === c), c);
  assert.deepEqual(body.languages.filter(l => l.dir === "rtl").map(l => l.code).sort(), ["ar", "fa", "he", "ps", "sd", "ur", "yi"]);
  assert.equal(body.languages.find(l => l.code === "so").name, "Somali");
  assert.ok(body.languages.every(l => l.name && l.nativeName && /^[a-z]{2,3}$/.test(l.code)));
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(calls.length, 0);                                                // listing languages never uses the model (no Neurons)
});
test("languages: ui=ar localizes names (Arabic names for Arabic UI); unknown ui falls back to ar", async () => {
  const ar = (await call(req("/languages?ui=ar"))).body.languages, zz = (await call(req("/languages?ui=zz"))).body;
  assert.match(ar.find(l => l.code === "so").name, /[\u0600-\u06FF]/); assert.equal(zz.ui, "ar");
});
test("DISABLED_LANGUAGES hides languages from the list and rejects them in /translate", async () => {
  const env = mkEnv({ DISABLED_LANGUAGES: "ns, FF" });
  const l = (await call(req("/languages?ui=en"), env)).body.languages.map(x => x.code); assert.ok(!l.includes("ns") && !l.includes("ff") && l.length === 98);
  assert.equal((await tr({ text: "x", from: "ar", to: "ns" }, null, env)).body.error.code, "unsupported_language"); assert.equal(calls.length, 0);
});

test("translate: calls env.AI.run with the exact model and {text, source_lang, target_lang} CODES, returns the model's translated_text", async () => {
  const { res, body } = await tr({ text: "السلام عليكم، كيف حالك؟", from: "ar", to: "en" });
  assert.equal(res.status, 200); assert.deepEqual(body, { ok: true, translation: "[ar>en] السلام عليكم، كيف حالك؟", from: "ar", to: "en" });
  assert.equal(calls.length, 1); assert.equal(calls[0].model, "@cf/meta/m2m100-1.2b");
  assert.deepEqual(calls[0].input, { text: "السلام عليكم، كيف حالك؟", source_lang: "ar", target_lang: "en" });
  assert.equal(res.headers.get("cache-control"), "no-store");
});
test("translate: every advertised language works as source and target (codes passed through unchanged, uppercase normalised)", async () => {
  for (const code of LANGUAGE_CODES) { if (code === "en") continue; calls.length = 0; const r = await tr({ text: "Hello", from: "EN", to: code.toUpperCase() }); assert.equal(r.res.status, 200, code); assert.deepEqual(calls[0].input, { text: "Hello", source_lang: "en", target_lang: code }); }
  for (const code of ["ar", "so", "sw", "ur"]) { calls.length = 0; assert.equal((await tr({ text: "x", from: code, to: "en" })).res.status, 200); assert.equal(calls[0].input.source_lang, code); }
});
test("LANG_FORMAT: default sends codes; LANG_FORMAT=name sends the lowercase English names; both still return the model's text", async () => {
  let r = await tr({ text: "Hi", from: "ar", to: "en" });
  assert.deepEqual(calls[0].input, { text: "Hi", source_lang: "ar", target_lang: "en" }); assert.equal(r.res.status, 200);
  calls.length = 0;
  r = await tr({ text: "Hi", from: "ar", to: "en" }, null, mkEnv({ LANG_FORMAT: "name" }));
  assert.deepEqual(calls[0].input, { text: "Hi", source_lang: "arabic", target_lang: "english" }); assert.equal(r.res.status, 200);
  assert.equal(r.body.from, "ar"); assert.equal(r.body.to, "en");                  // the API contract with the page stays codes
  calls.length = 0; await tr({ text: "Hi", from: "so", to: "fy" }, null, mkEnv({ LANG_FORMAT: "name" }));
  assert.deepEqual(calls[0].input, { text: "Hi", source_lang: "somali", target_lang: "western frisian" });
  calls.length = 0; await tr({ text: "Hi", from: "ar", to: "en" }, null, mkEnv({ LANG_FORMAT: "bogus" }));   // anything else = codes
  assert.equal(calls[0].input.source_lang, "ar");
});
test("translate: there is no auto-detect (the model cannot detect): 'from' is required", async () => {
  assert.equal((await tr({ text: "x", from: "auto", to: "en" })).body.error.code, "bad_request");
  assert.equal((await tr({ text: "x", to: "en" })).body.error.code, "bad_request"); assert.equal(calls.length, 0);
});
test("validation: empty / whitespace / non-string / bad JSON / wrong content type", async () => {
  assert.equal((await tr({ text: "  \n ", from: "ar", to: "en" })).body.error.code, "empty");
  assert.equal((await tr({ text: 5, from: "ar", to: "en" })).body.error.code, "bad_request");
  assert.equal((await tr({ from: "ar", to: "en" })).body.error.code, "bad_request");
  assert.equal((await tr("{nope")).body.error.code, "bad_request");
  assert.equal((await tr({ text: "x", from: "ar", to: "en" }, { ct: "text/plain" })).res.status, 415); assert.equal(calls.length, 0);
});
test("validation: length cap counts characters (not bytes) and is enforced BEFORE the model is called", async () => {
  assert.equal((await tr({ text: "ع".repeat(MAX_CHARS), from: "ar", to: "en" })).res.status, 200);
  calls.length = 0; const big = await tr({ text: "ع".repeat(MAX_CHARS + 1), from: "ar", to: "en" });
  assert.equal(big.res.status, 413); assert.equal(big.body.error.code, "too_long"); assert.equal(calls.length, 0);
});
test("validation: unsupported / malformed codes and same language never reach the model", async () => {
  for (const [from, to, code] of [["ar", "xx", "unsupported_language"], ["xx", "en", "unsupported_language"], ["ar", "en;drop", "unsupported_language"], ["../x", "en", "unsupported_language"], ["en", "EN", "same_language"], ["zh-Hans", "en", "unsupported_language"]]) assert.equal((await tr({ text: "x", from, to })).body.error.code, code, `${from}->${to}`);
  assert.equal(calls.length, 0);
});

test("chunking: long multi-paragraph text is split into sentence-sized model calls (<= CHUNK_CHARS) and re-assembled EXACTLY", async () => {
  aiImpl = echo;
  const para = n => Array.from({ length: n }, (_, i) => `هذه هي الجملة رقم ${i + 1} في الفقرة، وهي جملة طويلة نسبيًا لاختبار التقسيم.`).join(" ");
  const text = "  عنوان النص\n\n" + para(12) + "\n" + para(9) + "؟ سؤال أخير!\n\n\nخاتمة قصيرة.  ";
  const { body } = await tr({ text, from: "ar", to: "fr" });
  assert.equal(body.translation, text);                                                         // identity translator => identical output
  assert.ok(calls.length >= 6 && calls.every(c => c.input.text.length <= CHUNK_CHARS && c.input.text.trim() === c.input.text));
});
test("chunking: order is preserved even when chunks finish out of order (concurrent calls)", async () => {
  const text = Array.from({ length: 25 }, (_, i) => `جملة ${i + 1}. `.repeat(12)).join("\n");
  aiImpl = async (m, i) => { const n = Number(i.text.match(/جملة (\d+)/)[1]); await new Promise(r => setTimeout(r, (30 - n) * 2)); return { translated_text: i.text }; };
  assert.equal((await tr({ text, from: "ar", to: "fr" })).body.translation, text);
});
test("chunking: scripts without spaces and over-long sentences are split safely; Chinese/Japanese targets get no inserted spaces", async () => {
  aiImpl = echo;
  const cjk = "这是第一句话。这是第二句话！这是第三句话？".repeat(30);
  assert.equal((await tr({ text: cjk, from: "zh", to: "fr" })).body.translation, cjk);
  const noBreaks = "كلمة ".repeat(300).trim();                                                  // one 1,500-char "sentence"
  const r = await tr({ text: noBreaks, from: "ar", to: "fr" }); assert.equal(r.body.translation.replace(/\s+/g, " "), noBreaks);
  assert.ok(calls.every(c => c.input.text.length <= CHUNK_CHARS));
  calls.length = 0; aiImpl = tagged;
  const zh = (await tr({ text: "Sentence one. Sentence two. ".repeat(40), from: "en", to: "zh" })).body.translation;
  assert.ok(/\.\[en>zh\]/.test(zh) && !/\. \[en>zh\]/.test(zh));                        // chunks are glued without inserted spaces for a Chinese target
});
test("chunking: splitForTranslation properties (no text lost, short text = one call)", () => {
  const s = "Hello world. How are you?\n\nFine.";
  const { items, tail } = splitForTranslation(s); assert.equal(items.map(i => i.before + i.chunk).join("") + tail, s);
  assert.equal(splitForTranslation("مرحبا").items.length, 1);
});
test("one failing chunk fails the WHOLE request (never returns a partial translation)", async () => {
  const text = Array.from({ length: 10 }, (_, i) => `الجملة ${i}. `.repeat(20)).join("\n");
  let n = 0; aiImpl = async (m, i) => { if (++n === 3) throw new Error("boom"); return { translated_text: i.text }; };
  const { res, body } = await tr({ text, from: "ar", to: "fr" }); assert.equal(res.status, 503); assert.equal(body.ok, false); assert.equal(body.translation, undefined);
});

test("Workers AI error mapping: 3036 daily allocation -> quota_exceeded (no retry), 3040 -> busy+retry-after, 3006 -> too_long, 3007/timeouts -> timeout, others -> unavailable", async () => {
  const run = async (fn) => { calls.length = 0; aiImpl = fn; return tr({ text: "نص", from: "ar", to: "en" }); };
  let r = await run(() => { throw new Error("3036: You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage."); });
  assert.equal(r.res.status, 503); assert.equal(r.body.error.code, "quota_exceeded"); assert.match(r.body.error.message, /renews automatically/); assert.equal(calls.length, 1);   // exactly one attempt: no retry, no fallback
  r = await run(() => { throw Object.assign(new Error("AiError"), { code: 3036 }); }); assert.equal(r.body.error.code, "quota_exceeded");
  r = await run(() => { throw new Error("3040: No more data centers to forward the request to"); }); assert.equal(r.body.error.code, "busy"); assert.equal(r.res.headers.get("retry-after"), "5");
  r = await run(() => { throw new Error("3006: Request is too large"); }); assert.equal(r.res.status, 413); assert.equal(r.body.error.code, "too_long");
  r = await run(() => { throw new Error("3007: Request timeout"); }); assert.equal(r.res.status, 504); assert.equal(r.body.error.code, "timeout");
  r = await run(() => { throw new Error("5007: No such model"); }); assert.equal(r.body.error.code, "unavailable");
  r = await run(() => { throw "weird"; }); assert.equal(r.body.error.code, "unavailable");
});
test("model oddities: empty / missing / ERROR text -> clean errors, never shown as translations", async () => {
  const run = async (out) => { aiImpl = async () => out; return tr({ text: "نص", from: "ar", to: "en" }); };
  assert.equal((await run({})).body.error.code, "bad_response"); assert.equal((await run({ translated_text: "" })).body.error.code, "bad_response");
  assert.equal((await run(null)).body.error.code, "bad_response"); assert.equal((await run({ translated_text: 7 })).body.error.code, "bad_response");
  const e = await run({ translated_text: "ERROR: invalid language" }); assert.equal(e.res.status, 400); assert.equal(e.body.error.code, "unsupported_language");
});
test("a hung model call times out cleanly (504)", async () => {
  aiImpl = () => new Promise(() => { });
  const { res, body } = await tr({ text: "نص", from: "ar", to: "en" }, null, mkEnv({ CALL_TIMEOUT_MS: "60" })); assert.equal(res.status, 504); assert.equal(body.error.code, "timeout");
});
test("service without the AI binding -> 503 unconfigured (and /health says so)", async () => {
  const { res, body } = await tr({ text: "x", from: "ar", to: "en" }, null, {}); assert.equal(res.status, 503); assert.equal(body.error.code, "unconfigured");
  assert.equal((await call(req("/health"), {})).body.configured, false); const ok = (await call(req("/health"))).body; assert.deepEqual([ok.configured, ok.model], [true, MODEL]);
});

test("security: foreign origin 403 with no CORS; allowed origins get CORS; preflight; localhost only when ALLOW_LOCALHOST", async () => {
  const bad = await tr({ text: "x", from: "ar", to: "en" }, { origin: "https://evil.example" }); assert.equal(bad.res.status, 403); assert.equal(bad.res.headers.get("access-control-allow-origin"), null); assert.equal(calls.length, 0);
  const pre = await handle(new Request("https://proxy.test/translate", { method: "OPTIONS", headers: { origin: ORIGIN } }), mkEnv(), {}); assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal((await handle(new Request("https://proxy.test/translate", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), mkEnv(), {})).status, 403);
  assert.equal((await tr({ text: "x", from: "ar", to: "en" }, { origin: "https://arabic-keyboard.live" })).res.status, 200);
  const lh = "http://localhost:8080"; assert.equal((await call(req("/languages", { origin: lh }))).res.status, 403); assert.equal((await call(req("/languages", { origin: lh }), mkEnv({ ALLOW_LOCALHOST: "true" }))).res.status, 200);
});
test("rate limiting: per-IP then global limiter run only for POST /translate, block with 429 + retry-after, key = client IP / 'global'; a limiter failure never breaks translation", async () => {
  const keys = []; const lim = (name, ok) => ({ limit: async ({ key }) => { keys.push(name + ":" + key); return { success: ok }; } });
  let r = await tr({ text: "x", from: "ar", to: "en" }, { headers: { "cf-connecting-ip": "203.0.113.5" } }, mkEnv({ RATE_LIMITER_IP: lim("ip", true), RATE_LIMITER_GLOBAL: lim("g", true) }));
  assert.equal(r.res.status, 200); assert.deepEqual(keys, ["ip:203.0.113.5", "g:global"]);
  keys.length = 0; calls.length = 0; r = await tr({ text: "x", from: "ar", to: "en" }, null, mkEnv({ RATE_LIMITER_IP: lim("ip", false) })); assert.equal(r.res.status, 429); assert.equal(r.body.error.code, "rate_limited"); assert.equal(r.res.headers.get("retry-after"), "30"); assert.equal(calls.length, 0);
  r = await tr({ text: "x", from: "ar", to: "en" }, null, mkEnv({ RATE_LIMITER_IP: lim("ip", true), RATE_LIMITER_GLOBAL: lim("g", false) })); assert.equal(r.res.status, 429);
  keys.length = 0; await call(req("/languages"), mkEnv({ RATE_LIMITER_IP: lim("ip", false) })); await call(req("/health"), mkEnv({ RATE_LIMITER_IP: lim("ip", false) })); assert.deepEqual(keys, []);
  const broken = { limit: async () => { throw new Error("binding down"); } }; assert.equal((await tr({ text: "x", from: "ar", to: "en" }, null, mkEnv({ RATE_LIMITER_IP: broken, RATE_LIMITER_GLOBAL: broken }))).res.status, 200);
});
test("privacy: the Worker never logs request text (success, error and unknown-error paths)", async () => {
  const seen = []; const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => seen.push(a.join(" "));
  try { await tr({ text: "نص سري للغاية", from: "ar", to: "en" }); aiImpl = () => { throw new Error("5004: something about نص سري للغاية"); }; await tr({ text: "نص سري للغاية", from: "ar", to: "en" }); }
  finally { Object.assign(console, orig); }
  assert.ok(!seen.join("\n").includes("نص سري")); assert.ok(seen.some(l => l.includes("5004")));      // only the numeric code is logged
});
test("routing: unknown path 404, wrong method 404", async () => { assert.equal((await call(req("/nope"))).res.status, 404); assert.equal((await call(req("/translate"))).res.status, 404); });
