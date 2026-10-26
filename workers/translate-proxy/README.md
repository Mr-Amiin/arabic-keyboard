# Translation proxy: Cloudflare Worker + Workers AI

The `/translation/` page needs a real machine-translation engine. This folder contains a small **Cloudflare Worker** that sits between
the website and **Cloudflare Workers AI**, which runs Meta's open **M2M100** translation model (`@cf/meta/m2m100-1.2b`, 100 languages).

```
visitor's browser  ->  Cloudflare Worker (this folder)  ->  Workers AI model @cf/meta/m2m100-1.2b
 arabic-keyboard.live    checks origin, limits, rate        hosted and run by Cloudflare
```

**There is no API key and no secret to manage.** The Worker talks to the model through a built-in "AI binding" that Cloudflare connects for
you. You only need a free Cloudflare account.

> Until you deploy this and connect it (steps 1-8), the Translation page honestly shows "not connected yet" and its Translate button stays disabled.

---

## What it costs (please read this once)

Checked on Cloudflare's Workers AI pricing page (last updated 20 Oct 2026). **Re-check it before launch, prices and limits can change.**

* Workers AI includes a **free allocation of 10,000 "Neurons" per day** (resets every day at **00:00 UTC**).
* This model uses **about 31,050 Neurons per million input tokens and per million output tokens**. Rough estimates for planning:
  a short sentence (about 20 words) is roughly 2 Neurons, so the free allocation covers **several thousand short translations a day**;
  a maximum-size request (5,000 characters) is roughly 100-150 Neurons, so about **70-100 of those a day**.
* **Stay on the free "Workers Free" plan.** On that plan, when the daily allocation is used up Cloudflare simply **rejects further requests**
  (error `3036`). The website then shows *"Today's free translation quota has been used up and renews automatically tomorrow"*.
  Nothing is charged and nothing silently switches to paid use.
* **Do NOT upgrade to "Workers Paid" unless you want to.** On the paid plan, usage above the free 10,000 Neurons/day is billed
  (Cloudflare lists $0.011 per 1,000 Neurons).
* How the limits are enforced in this project: a visitor can make **10 translations per minute** (per IP), and each Cloudflare location
  accepts at most **120 per minute** overall. These counters are per location and best-effort (Cloudflare's own description), so they slow
  abuse down but are not an exact global cap. The hard stop is always the free daily allocation.
  The limiter runs **before** the input checks, so a request that is rejected as invalid (empty text, unknown language, ...) still counts
  toward the visitor's 10 per minute. Invalid requests never reach the model, so they cost no allocation. When a window is used up, even
  an invalid request is answered `429 rate_limited` (with `retry-after`) instead of `400`. The live test waits that out before judging.

---

## Step-by-step setup (about 15 minutes, no programming needed)

### 1. Create a free Cloudflare account
Go to <https://dash.cloudflare.com/sign-up>, sign up with your email, and confirm the email Cloudflare sends you.
No credit card is needed for the free plan.

### 2. Install Node.js (one time)
Download the **LTS** version from <https://nodejs.org> and install it with the default options.
Check it worked: open a terminal (**Windows:** search "PowerShell"; **Mac:** open "Terminal") and run

```
node --version
```
You should see a number such as `v22.x.x` (18 or newer is fine).

### 3. Open this folder in the terminal
Replace the path with where you saved the project:
```
cd C:\path\to\arabic-keyboard\workers\translate-proxy        (Windows)
cd /path/to/arabic-keyboard/workers/translate-proxy          (Mac / Linux)
```

### 4. Log in to Cloudflare
```
npx wrangler login
```
Your browser opens. Click **Allow**. Return to the terminal when it says you are logged in.
*(Windows: if PowerShell says "running scripts is disabled", run `cmd` first and type the commands there.)*

### 5. Deploy the Worker
```
npx wrangler deploy
```
* The first time, Wrangler asks you to choose a free **workers.dev subdomain** (for example `myname`). Pick anything.
* When it finishes it prints the Worker's address, for example
  **`https://ak-translate-proxy.myname.workers.dev`**. Copy it.
* It also lists the bindings it connected: `env.AI`, `RATE_LIMITER_IP (10 requests/60s)` and `RATE_LIMITER_GLOBAL (120 requests/60s)`.
  That is exactly what we want.

### 6. Check that it is alive
Open this in your browser (use your own address):
```
https://ak-translate-proxy.myname.workers.dev/health
```
You should see: `{"ok":true,"configured":true,"model":"@cf/meta/m2m100-1.2b"}`.
Also try `/languages?ui=en` (a list of 100 languages).

### 7. Connect the website
1. Open `assets/js/translation-config.js` and put your address between the quotes:
   `window.AK_TRANSLATE_API = "https://ak-translate-proxy.myname.workers.dev";`
   (It is a public address, not a secret.)
2. Publish the website as you normally do (commit and push). No other file needs changing: `sw.js` serves
   `translation-config.js` network-first, so returning visitors pick up the new address immediately.

### 8. Prove it really translates (recommended before announcing)
From the project folder (needs Node 18+):
```
TRANSLATE_API=https://ak-translate-proxy.myname.workers.dev node tests/translation/live-translation.mjs
```
*(Windows PowerShell:  `$env:TRANSLATE_API="https://..."; node tests/translation/live-translation.mjs`)*

It sends real requests to the real model and checks Arabic <-> English, Arabic <-> Somali, Arabic <-> Swahili, a round trip, a long text,
12 other common languages, and the safety checks. Read the end of the output:

| Result | Meaning |
|---|---|
| `LIVE: ... 0 FAILED` and exit code 0 | Everything works. |
| `STOPPED: ... FREE DAILY ALLOCATION ... used up` | Not a bug. Run it again after 00:00 UTC. |
| `FAIL` on the Arabic/English/Somali/Swahili checks | Read the `HINT` line it prints (see Troubleshooting). |
| `Other languages that did NOT produce a real translation: xx, yy` (exit code 3) | Hide them: see "Hiding a language" below. |

Add `PROBE=all` to test **all 100 languages** (takes 10+ minutes because of the rate limit; the script waits automatically).

---

## Everyday use

* **See your usage:** Cloudflare dashboard -> **Workers AI** (usage / Neurons) and **Workers & Pages** -> your Worker -> Metrics.
* **Hiding a language** that does not work well: in `wrangler.toml` under `[vars]` add `DISABLED_LANGUAGES = "xx,yy"`, then run `npx wrangler deploy`.
* **Changing the limits:** edit the numbers under `[[ratelimits]]` in `wrangler.toml` (`period` must be 10 or 60), redeploy.
* **Changing the website name/origin:** `ALLOWED_ORIGINS` in `wrangler.toml` must list the exact site addresses (with `https://`, and with and without `www`).
* **Running locally:** `npx wrangler dev` starts the Worker on <http://localhost:8787>. Workers AI always runs on Cloudflare, so local tests
  **use your free daily allocation too**. Add `ALLOW_LOCALHOST = "true"` under `[vars]` while developing (remove it before the real deploy), and temporarily point
  `translation-config.js` at `http://localhost:8787`.

## Troubleshooting

| Problem | What to do |
|---|---|
| The page says *"The translation service hasn't been connected to this site yet"* | `translation-config.js` is still empty, or the change has not been pushed / published yet (step 7). |
| The page says *"Couldn't load the language list"* | The Worker address is wrong, the Worker isn't deployed, or `ALLOWED_ORIGINS` doesn't exactly match the site's address (browsers hide the details; check the browser's Network tab for a 403 / CORS message). |
| Live test: Arabic/English fail with `unsupported_language` | Cloudflare's docs describe language **codes** (`en`) but show names (`english`) in an example. In `wrangler.toml` under `[vars]` add `LANG_FORMAT = "name"` (the Worker then sends `english`, `arabic`, ...), run `npx wrangler deploy`, and rerun the live test. No code edit is needed. |
| *"The free daily translation quota is used up"* | You have used the free 10,000 Neurons today. It renews at 00:00 UTC. Nothing is charged. |
| *"The translation model is busy"* (error 3040) | Temporary. Try again in a few seconds. |
| `npx wrangler deploy` complains about `ratelimits` | Update Wrangler (`npx wrangler@latest deploy`). If it still fails, delete the two `[[ratelimits]]` blocks and add a rate-limiting rule in the Cloudflare dashboard (Security -> WAF -> Rate limiting rules) for `/translate`. |
| Quality is weak for a rare language | M2M100 is strongest for widely used languages. Arabic <-> English is the best case; low-resource languages can be rough. Review important texts. |

## How it behaves (and its limits)

* **Languages:** the 100 M2M100 languages (listed by `GET /languages`). Arabic, English, Somali, Swahili, Urdu, French, Spanish, German, Turkish, Indonesian
  and Chinese are the ones shown first on the page.
* **No automatic language detection:** the model cannot detect the source language, so visitors choose it.
* **Long text:** the model works best on sentences, so the Worker splits long input into sentence-sized pieces, translates them, and puts the result back together
  (paragraph breaks are kept). The page's limit is 5,000 characters per request (`MAX_CHARS` in `src/core.js`).
* **Privacy:** visitor text is sent to Cloudflare Workers AI. The Worker never logs or stores the text. The site's Privacy page says so;
  review Cloudflare's Workers AI data-usage documentation and adjust the Privacy page if your obligations require.
* **Security:** only the site's own origins are accepted from browsers (others get 403), input is validated, the length cap is enforced
  before the model is called, and rate limits are on. Origin checks stop other *websites* from using your quota in browsers; scripted clients are
  slowed by the rate limits.

## Files
* `src/index.js` the entry point (a Worker's main module may export only the handler)
* `src/core.js` all the logic (validation, chunking, error mapping, languages)
* `wrangler.toml` the configuration: `[ai]` binding, variables, rate limiters

## Tests
* `node --test tests/translation/worker.test.mjs` : the Worker's logic with the AI binding **stubbed**.
* `cd tests/translation && npm install && npm run workerd` : runs the Worker inside Cloudflare's real `workerd` runtime (AI stubbed, rate limiters real).
* `cd tests/tashkeel && npm install && npm run translation` : the page in a real browser against the real Worker code (AI stubbed).
* `tests/translation/live-translation.mjs` : **the real test against the real model** (step 8).

## API contract
`GET /health` -> `{ok, configured, model}` · `GET /languages?ui=ar|en` -> `{ok, ui, maxChars, languages:[{code,name,nativeName,dir}]}` ·
`POST /translate {text, from, to}` -> `{ok, translation, from, to}` · errors -> `{ok:false, error:{code,message}}`
(`empty`, `too_long`, `unsupported_language`, `same_language`, `rate_limited`, `quota_exceeded`, `busy`, `unavailable`, `timeout`,
`bad_response`, `unconfigured`, `bad_request`, `forbidden_origin`).
