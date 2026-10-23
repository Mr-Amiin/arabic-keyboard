// Runs the REAL Worker code inside Cloudflare's real runtime (workerd, via Miniflare) with real [[ratelimits]] bindings.
// Only the Workers AI binding is replaced by a tiny stub (it needs a Cloudflare account). Run: npm install && npm run workerd
import { Miniflare } from "miniflare"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "../../workers/translate-proxy/src");
const ORIGIN = "https://www.arabic-keyboard.live";
let pass = 0, bad = [];
const ck = (n, ok, d = "") => { ok ? pass++ : bad.push(n); console.log((ok ? "PASS " : "FAIL ") + n + (!ok && d ? "  — " + d : "")); };

const mf = new Miniflare({
  workers: [
    { name: "proxy", modules: true, modulesRoot: srcDir, modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], scriptPath: path.join(srcDir, "index.js"), compatibilityDate: "2026-01-01",
      bindings: { ALLOWED_ORIGINS: ORIGIN },
      wrappedBindings: { AI: "ai-stub" },
      ratelimits: { RATE_LIMITER_IP: { namespace_id: "1001", simple: { limit: 3, period: 60 } }, RATE_LIMITER_GLOBAL: { namespace_id: "1002", simple: { limit: 1000, period: 60 } } } },
    { name: "ai-stub", modules: true, script: `export default function (env) { return { run: async (model, input) => ({ translated_text: "[" + model + "|" + input.source_lang + ">" + input.target_lang + "] " + input.text }) }; }` }
  ]
});
const call = (p, init = {}) => mf.dispatchFetch("http://proxy.test" + p, { ...init, headers: { origin: ORIGIN, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } });
try {
  const h = await (await call("/health")).json();
  ck("workerd: /health reports configured + model", h.ok && h.configured === true && h.model === "@cf/meta/m2m100-1.2b", JSON.stringify(h));
  const ar = await (await call("/languages?ui=ar")).json(), en = await (await call("/languages?ui=en")).json();
  ck("workerd: 100 languages advertised, Arabic is rtl, maxChars=5000", ar.languages.length === 100 && ar.languages.find(l => l.code === "ar").dir === "rtl" && ar.maxChars === 5000);
  const so = l => l.languages.find(x => x.code === "so");
  console.log("     so (ui=ar):", JSON.stringify(so(ar)), " so (ui=en):", JSON.stringify(so(en)));
  ck("workerd: English names, and Arabic names via Intl.DisplayNames when the runtime has them", so(en).name === "Somali" && /[\u0600-\u06FF]/.test(so(ar).name), JSON.stringify(so(ar)));
  const t = await (await call("/translate", { method: "POST", body: JSON.stringify({ text: "مرحبا بالعالم", from: "ar", to: "so" }) })).json();
  ck("workerd: env.AI.run is called with model, source_lang and target_lang as CODES", t.ok && t.translation === "[@cf/meta/m2m100-1.2b|ar>so] مرحبا بالعالم", JSON.stringify(t));
  const long = Array.from({ length: 30 }, (_, i) => `هذه هي الجملة رقم ${i + 1} من النص الطويل.`).join(" ");
  const lt = await (await call("/translate", { method: "POST", body: JSON.stringify({ text: long, from: "ar", to: "en" }) })).json();
  ck("workerd: a long text is split into several model calls and re-assembled in order", lt.ok && (lt.translation.match(/\[@cf/g) || []).length >= 3 && lt.translation.indexOf("رقم 1 ") < lt.translation.indexOf("رقم 30"), String((lt.translation || "").length));
  const bad1 = await call("/translate", { method: "POST", body: JSON.stringify({ text: "x", from: "ar", to: "en" }), headers: { origin: "https://evil.example" } });
  ck("workerd: foreign origin refused with 403", bad1.status === 403);
  // rate limiter: limit 3 per 60 s per IP key
  const statuses = []; for (let i = 0; i < 6; i++) statuses.push((await call("/translate", { method: "POST", body: JSON.stringify({ text: "x", from: "ar", to: "en" }), headers: { "cf-connecting-ip": "203.0.113.9" } })).status);
  console.log("     statuses for one IP (limit 3 per 60s):", statuses.join(","));
  ck("workerd: per-IP rate limit blocks after the configured number of requests (429)", statuses.slice(0, 3).every(s => s === 200) && statuses.slice(3).some(s => s === 429), statuses.join());
  const other = await call("/translate", { method: "POST", body: JSON.stringify({ text: "x", from: "ar", to: "en" }), headers: { "cf-connecting-ip": "198.51.100.7" } });
  ck("workerd: a DIFFERENT visitor is not blocked by someone else's limit", other.status === 200);
} finally { await mf.dispose(); }
console.log(`\nWORKERD: ${pass}/${pass + bad.length} passed` + (bad.length ? "\nFAILED: " + bad.join("; ") : ""));
process.exit(bad.length ? 1 : 0);
