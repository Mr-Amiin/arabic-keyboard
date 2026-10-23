/* ============================================================
   Translation proxy for arabic-keyboard.live  (Cloudflare Worker + Workers AI)

   Translation is done by Meta's M2M100 model, hosted by Cloudflare:
       env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang, target_lang })  ->  { translated_text }
   There is NO external API key: the `AI` binding (see wrangler.toml) is the only credential.

   ENDPOINTS
     GET  /health                  -> { ok, configured, model }
     GET  /languages?ui=ar|en      -> { ok, ui, maxChars, languages:[{code,name,nativeName,dir}] }
     POST /translate {text,from,to}-> { ok, translation, from, to }
     errors                        -> { ok:false, error:{ code, message } } with a matching HTTP status

   NOTES
   * M2M100 cannot detect the source language, so `from` is required (there is no "auto").
   * M2M100 is sentence-oriented. Long input is split into sentence-sized chunks, translated, and re-assembled
     (paragraph breaks preserved) instead of risking silent truncation.
   * Free plan: 10,000 Neurons/day. When that is used up Cloudflare returns error 3036; we report `quota_exceeded`.
     The Worker never retries it and never switches to anything paid.

   CONFIG (wrangler.toml)
     [ai] binding = "AI"
     ALLOWED_ORIGINS        comma-separated origins (default: the two production origins)
     ALLOW_LOCALHOST        "true" only for local development
     DISABLED_LANGUAGES     comma-separated codes to hide (e.g. if the live test shows one does not work)
     LANG_FORMAT            "code" (default) or "name": what is sent to the model as source_lang/target_lang
     RATE_LIMITER_IP / RATE_LIMITER_GLOBAL   rate-limit bindings (per IP, and per Cloudflare location)

   PRIVACY: request bodies are never logged or stored by this Worker.

   FILE LAYOUT: Cloudflare requires a Worker's MAIN module to export only handlers, so all logic (and the helpers the tests import)
   lives here in core.js, and index.js is a thin entry point that exports just the default handler.
   ============================================================ */

export const MODEL = "@cf/meta/m2m100-1.2b";
export const MAX_CHARS = 5000;                    // per request (keeps one request's Neuron cost small)
export const CHUNK_CHARS = 400;                   // target size of one model call (sentence-sized)
const CONCURRENCY = 4;
const CALL_TIMEOUT_MS = 20000;
const DEFAULT_ORIGINS = ["https://www.arabic-keyboard.live", "https://arabic-keyboard.live"];
const NO_SPACE_TARGETS = new Set(["zh", "ja", "th", "km", "lo", "my"]);
const RTL = new Set(["ar", "fa", "he", "ps", "sd", "ur", "yi"]);

/* The 100 languages of M2M100 (Meta / fairseq). These codes are what the model's `source_lang` / `target_lang` take.
   Cloudflare publishes no separate list, so tests/translation/live-translation.mjs probes every one against the real model,
   and DISABLED_LANGUAGES hides any that do not work on your account. */
const LANGUAGE_NAMES = {
  af: "Afrikaans", am: "Amharic", ar: "Arabic", ast: "Asturian", az: "Azerbaijani", ba: "Bashkir", be: "Belarusian", bg: "Bulgarian",
  bn: "Bengali", br: "Breton", bs: "Bosnian", ca: "Catalan", ceb: "Cebuano", cs: "Czech", cy: "Welsh", da: "Danish", de: "German",
  el: "Greek", en: "English", es: "Spanish", et: "Estonian", fa: "Persian", ff: "Fulah", fi: "Finnish", fr: "French", fy: "Western Frisian",
  ga: "Irish", gd: "Scottish Gaelic", gl: "Galician", gu: "Gujarati", ha: "Hausa", he: "Hebrew", hi: "Hindi", hr: "Croatian",
  ht: "Haitian Creole", hu: "Hungarian", hy: "Armenian", id: "Indonesian", ig: "Igbo", ilo: "Ilocano", is: "Icelandic", it: "Italian",
  ja: "Japanese", jv: "Javanese", ka: "Georgian", kk: "Kazakh", km: "Khmer", kn: "Kannada", ko: "Korean", lb: "Luxembourgish",
  lg: "Ganda", ln: "Lingala", lo: "Lao", lt: "Lithuanian", lv: "Latvian", mg: "Malagasy", mk: "Macedonian", ml: "Malayalam",
  mn: "Mongolian", mr: "Marathi", ms: "Malay", my: "Burmese", ne: "Nepali", nl: "Dutch", no: "Norwegian", ns: "Northern Sotho",
  oc: "Occitan", or: "Odia", pa: "Punjabi", pl: "Polish", ps: "Pashto", pt: "Portuguese", ro: "Romanian", ru: "Russian", sd: "Sindhi",
  si: "Sinhala", sk: "Slovak", sl: "Slovenian", so: "Somali", sq: "Albanian", sr: "Serbian", ss: "Swati", su: "Sundanese", sv: "Swedish",
  sw: "Swahili", ta: "Tamil", th: "Thai", tl: "Tagalog", tn: "Tswana", tr: "Turkish", uk: "Ukrainian", ur: "Urdu", uz: "Uzbek",
  vi: "Vietnamese", wo: "Wolof", xh: "Xhosa", yi: "Yiddish", yo: "Yoruba", zh: "Chinese", zu: "Zulu"
};
export const LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES);

const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const fail = (status, code, message, headers, extra) => json({ ok: false, error: { code, message } }, status, { ...headers, ...(extra || {}) });

/* ---------- origins / CORS ---------- */
function allowedOrigins(env) { return (env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(",") : DEFAULT_ORIGINS).map(s => s.trim()).filter(Boolean); }
function originAllowed(origin, env) {
  if (!origin) return false;
  if (allowedOrigins(env).includes(origin)) return true;
  return String(env.ALLOW_LOCALHOST) === "true" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function corsHeaders(origin, env) {
  if (!originAllowed(origin, env)) return {};
  return { "access-control-allow-origin": origin, "vary": "Origin", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };
}

/* ---------- languages ---------- */
function enabledCodes(env) {
  const off = new Set(String(env.DISABLED_LANGUAGES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  return LANGUAGE_CODES.filter(c => !off.has(c));
}
function displayName(code, locale) {
  try { const n = new Intl.DisplayNames([locale], { type: "language" }).of(code); if (n && n.toLowerCase() !== code.toLowerCase()) return n; } catch (e) { /* runtime without this locale */ }
  return null;
}
const listCache = new Map();
export function languageList(env, ui) {
  const key = ui + "|" + String(env.DISABLED_LANGUAGES || "");
  if (listCache.has(key)) return listCache.get(key);
  const list = enabledCodes(env).map(code => {
    const en = LANGUAGE_NAMES[code];
    return { code, name: ui === "ar" ? (displayName(code, "ar") || en) : en, nativeName: displayName(code, code) || en, dir: RTL.has(code) ? "rtl" : "ltr" };
  });
  listCache.set(key, list); return list;
}

/* ---------- splitting long text into sentence-sized chunks ---------- */
// Returns { items:[{chunk, before}], tail }: `chunk` is text to translate, `before` is the exact whitespace / line breaks that preceded it,
// `tail` is trailing whitespace. Re-assembly = for each item: before + translated, then tail.
export function splitForTranslation(text, max = CHUNK_CHARS) {
  const items = []; let ws = "";
  for (const part of text.split(/(\n+)/)) {
    if (/^\n+$/.test(part)) { ws += part; continue; }
    const core = part.trim();
    if (!core) { ws += part; continue; }
    ws += part.slice(0, part.length - part.trimStart().length);
    packSentences(core, max).forEach((c, i) => items.push({ chunk: c.text, before: i === 0 ? ws : c.before }));
    ws = part.slice(part.trimEnd().length);
  }
  return { items, tail: ws };
}
const SENTENCE_BREAK = /((?<=[.!?؟۔।…])\s+|(?<=[。！？])\s*)/;
function packSentences(core, max) {
  const toks = core.split(SENTENCE_BREAK);              // sentence, separator, sentence, separator, ...
  const sentences = [];
  for (let i = 0; i < toks.length; i += 2) {
    if (!toks[i]) continue;
    const prevSep = i === 0 ? "" : toks[i - 1];
    (toks[i].length > max ? hardSplit(toks[i], max) : [toks[i]]).forEach((piece, k) => sentences.push({ text: piece, before: k === 0 ? prevSep : " " }));
  }
  const out = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && (last.text + s.before + s.text).length <= max) last.text += s.before + s.text;
    else out.push({ text: s.text, before: s.before });
  }
  if (out.length) out[0].before = "";
  return out;
}
function hardSplit(s, max) {                           // over-long sentence: break at spaces (or at `max` for scripts without spaces)
  const out = []; let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max); if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trimEnd()); rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
function assemble(items, translations, tail, to) {
  const glue = NO_SPACE_TARGETS.has(to);
  let out = "";
  items.forEach((p, i) => { out += (glue ? p.before.replace(/[ \t]+/g, "") : p.before) + translations[i]; });
  return out + tail;
}

/* ---------- Workers AI call + error mapping ---------- */
export class AiFailure extends Error { constructor(kind, status, retryAfter) { super(kind); this.kind = kind; this.status = status; this.retryAfter = retryAfter; } }
function classify(e) {
  if (e instanceof AiFailure) return e;
  const msg = String((e && e.message) || e || "");
  const code = Number(e && (e.code || e.internalCode)) || Number((msg.match(/\b([35]\d{3})\b/) || [])[1]) || 0;
  if (code === 3036) return new AiFailure("quota_exceeded", 503);            // daily free allocation spent: retrying does not help
  if (code === 3040) return new AiFailure("busy", 503, "5");                  // no capacity right now: retrying shortly does help
  if (code === 3006) return new AiFailure("too_long", 413);
  if (code === 3007 || code === 3008 || /timed? ?out|timeout/i.test(msg)) return new AiFailure("timeout", 504);
  if (code) console.error("Workers AI error code", code);                    // the code only, never the text
  return new AiFailure("unavailable", 503);
}
function withTimeout(p, ms) {
  let t; const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new AiFailure("timeout", 504)), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}
// Cloudflare's schema documents language CODES ("en") but its own code sample passes lowercase NAMES ("english").
// Default = codes. If the live test (tests/translation/live-translation.mjs) shows the model rejects codes, set
// LANG_FORMAT = "name" in wrangler.toml and redeploy: no code change needed.
function modelLang(env, code) { return String(env.LANG_FORMAT) === "name" ? LANGUAGE_NAMES[code].toLowerCase() : code; }
async function translateChunk(env, chunk, from, to) {
  let out;
  try { out = await withTimeout(env.AI.run(MODEL, { text: chunk, source_lang: modelLang(env, from), target_lang: modelLang(env, to) }), Number(env.CALL_TIMEOUT_MS) || CALL_TIMEOUT_MS); }   // CALL_TIMEOUT_MS env: tests only
  catch (e) { throw classify(e); }
  const text = out && typeof out.translated_text === "string" ? out.translated_text : null;
  if (text === null || !text.trim()) throw new AiFailure("bad_response", 502);
  if (/^ERROR\b/.test(text.trim())) throw new AiFailure("unsupported_language", 400);   // the model reports bad language arguments this way
  return text;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let next = 0, failure = null;
  const worker = async () => { while (failure === null) { const i = next++; if (i >= items.length) return; try { results[i] = await fn(items[i], i); } catch (e) { failure = e; } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
  return results;
}

const ERR_MSG = {
  quota_exceeded: "The free daily translation quota is used up. It renews automatically (00:00 UTC).",
  busy: "The translation model is busy. Try again in a few seconds.",
  timeout: "Translation timed out.", unavailable: "Translation service is unavailable.", bad_response: "Unexpected model response.",
  unsupported_language: "Language is not supported.", too_long: "Text is too long."
};

async function handleTranslate(request, env, cors) {
  const ct = request.headers.get("content-type") || "";
  if (!/application\/json/i.test(ct)) return fail(415, "bad_request", "Content-Type must be application/json.", cors);
  if (Number(request.headers.get("content-length") || 0) > 64 * 1024) return fail(413, "too_long", "Request body is too large.", cors);
  let body; try { body = await request.json(); } catch (e) { return fail(400, "bad_request", "Invalid JSON.", cors); }
  if (!body || typeof body !== "object" || typeof body.text !== "string") return fail(400, "bad_request", "Field 'text' (string) is required.", cors);

  const text = body.text;
  if (!text.trim()) return fail(400, "empty", "Text is empty.", cors);
  if ([...text].length > MAX_CHARS) return fail(413, "too_long", `Text exceeds ${MAX_CHARS} characters.`, cors, { "x-max-chars": String(MAX_CHARS) });

  const to = String(body.to || "").toLowerCase(), from = String(body.from || "").toLowerCase();
  if (!from || from === "auto") return fail(400, "bad_request", "Field 'from' is required: this model cannot detect the source language.", cors);
  const known = new Set(enabledCodes(env));
  if (!known.has(from) || !known.has(to)) return fail(400, "unsupported_language", "Language is not supported.", cors);
  if (from === to) return fail(400, "same_language", "Source and target languages are the same.", cors);
  if (!env.AI || typeof env.AI.run !== "function") return fail(503, "unconfigured", "Translation service is not configured (missing AI binding).", cors);

  const { items, tail } = splitForTranslation(text);
  try {
    const translated = await mapLimit(items, CONCURRENCY, (p) => translateChunk(env, p.chunk, from, to));
    return json({ ok: true, translation: assemble(items, translated, tail, to), from, to }, 200, { ...cors, "cache-control": "no-store" });
  } catch (e) {
    const f = classify(e);
    return fail(f.status, f.kind, ERR_MSG[f.kind] || "Translation failed.", cors, f.retryAfter ? { "retry-after": f.retryAfter } : {});
  }
}

export async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin, env);

  if (request.method === "OPTIONS") return originAllowed(origin, env) ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
  if (origin && !originAllowed(origin, env)) return fail(403, "forbidden_origin", "Origin not allowed.", {});   // also stops other sites from using our quota in browsers

  if (url.pathname === "/translate" && request.method === "POST") {
    // Abuse protection. A limiter failure must never break translation; the bindings are enabled in wrangler.toml.
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    for (const [binding, key] of [["RATE_LIMITER_IP", ip], ["RATE_LIMITER_GLOBAL", "global"]]) {
      if (!env[binding]) continue;
      try { const { success } = await env[binding].limit({ key }); if (!success) return fail(429, "rate_limited", "Too many requests. Try again shortly.", cors, { "retry-after": "30" }); } catch (e) { /* ignore */ }
    }
  }

  try {
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, configured: !!(env.AI && typeof env.AI.run === "function"), model: MODEL }, 200, { ...cors, "cache-control": "no-store" });
    if (url.pathname === "/languages" && request.method === "GET") {
      const ui = url.searchParams.get("ui") === "en" ? "en" : "ar";
      return json({ ok: true, ui, maxChars: MAX_CHARS, languages: languageList(env, ui) }, 200, { ...cors, "cache-control": "public, max-age=3600" });
    }
    if (url.pathname === "/translate" && request.method === "POST") return await handleTranslate(request, env, cors);
    return fail(404, "not_found", "Not found.", cors);
  } catch (e) {
    return fail(503, "unavailable", "Translation service is unavailable.", cors);
  }
}
