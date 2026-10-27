// Read-only diagnostic. Sends only INVALID requests (they are rejected before the model, so they cost no Workers AI allocation).
// Usage: node probe-validation.mjs https://YOUR-WORKER.workers.dev
const API = (process.argv[2] || "").replace(/\/+$/, ""), ORIGIN = "https://www.arabic-keyboard.live";
if (!API) { console.error("Give the Worker URL as the first argument."); process.exit(2); }
const WAIT = (Number(process.env.WAIT_S) || 65) * 1000, sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (text, from, to) => { const r = await fetch(API + "/translate", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ text, from, to }) }); return { status: r.status, ra: r.headers.get("retry-after"), body: await r.text() }; };
const cases = [["11a empty", "   ", "ar", "en"], ["11b 5001 chars", "\u0639".repeat(5001), "ar", "en"], ["11c unsupported", "\u0646\u0635", "ar", "xx"], ["11d same language", "\u0646\u0635", "ar", "ar"], ["11e from=auto", "\u0646\u0635", "auto", "en"]];
console.log(`Waiting ${WAIT / 1000}s so the per-minute rate-limit window is clear...`); await sleep(WAIT);
console.log("\nPHASE 1: the five validation requests, 1 s apart (5 requests, under the limit of 10 per minute)");
for (const [label, t, f, to] of cases) { const r = await post(t, f, to); console.log(label.padEnd(18), r.status, r.body, r.ra ? "retry-after=" + r.ra : ""); await sleep(1000); }
console.log(`\nWaiting ${WAIT / 1000}s again...`); await sleep(WAIT);
console.log("\nPHASE 2: 14 invalid (empty-text) requests back to back; statuses in order:");
const seq = []; for (let i = 0; i < 14; i++) seq.push((await post("   ", "ar", "en")).status); console.log(seq.join(" "));
