
// Shared harness for the Learn browser suites:
// a tiny static server for the repo root + headless browser helpers.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { classifyConsole } from "./console-classify.mjs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

// Individual lesson URLs. The suites never hard-code a lesson path: they ask the same resolver the site uses
// (assets/js/learn/urls.js), so a renamed or added lesson cannot silently drift from the tests.
export const LearnUrls = createRequire(import.meta.url)(path.join(REPO, "assets/js/learn/urls.js"));
// "#/vocab/numbers" -> "/learn-arabic/vocabulary/numbers/"; null for routes that are intentionally still hash routes
// on the dashboard (practice, review, journey, read, patterns, story, workshop, the list pages ...).
export const lessonPath = hash => LearnUrls.pathFor(String(hash || "").replace(/^#\/?/, ""));
// The URL a test should open for a route: the real lesson page when one exists, otherwise the dashboard + hash route.
// n is the cache-buster; q is any extra query (e.g. "&lang=en"). Passing { hashOnly: true } forces the legacy hash form.
export function pageUrl(base, n, hash, q = "", opts = {}) {
  const lp = opts.hashOnly ? null : lessonPath(hash);
  return lp ? `${base}${lp}?n=${n}${q}` : `${base}/learn-arabic/?n=${n}${q}${hash || ""}`;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json"
};

function getBrowserConfig() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    process.env.CHROME_PATH,
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe"
      )
  ].filter(Boolean);

  const executablePath = candidates.find(candidate =>
    fs.existsSync(candidate)
  );

  if (!executablePath) {
    throw new Error(
      "Chrome or Edge was not found. Set CHROME_PATH to the full path of chrome.exe or msedge.exe."
    );
  }

  console.log(`[browser] Using Windows browser: ${executablePath}`);

  return {
    executablePath,
    headless: true,
    args: []
  };
}

export function startServer() {
  const hits = [];

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);

    let f = path.join(REPO, decodeURIComponent(u.pathname));

    if (!f.startsWith(REPO)) {
      res.writeHead(403).end();
      return;
    }

    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      f = path.join(f, "index.html");
    }

    if (!fs.existsSync(f)) {
      res.writeHead(404).end("not found");
      return;
    }

    res.writeHead(200, {
      "content-type":
        MIME[path.extname(f)] || "application/octet-stream",
      "cache-control": "no-cache"
    });

    fs.createReadStream(f).pipe(res);
  });

  return new Promise(resolve =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        base: "http://127.0.0.1:" + server.address().port,
        hits,
        server
      })
    )
  );
}

export async function harness(name) {
  const srv = await startServer();

  let browser;

  try {
    const windowsConfig = getBrowserConfig();

    browser = await puppeteer.launch(
      windowsConfig || {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: "shell"
      }
    );
  } catch (error) {
    await new Promise(resolve => srv.server.close(resolve));
    throw error;
  }

  const out = [];
  const reportOnlyNotices = [];
  let failed = 0;

  const ok = (cond, msg) => {
    out.push((cond ? "PASS " : "FAIL ") + msg);
    if (!cond) failed++;
  };

  // motion=true keeps smooth scrolling/animations.
  // Default: reduced motion for deterministic clicks.
  // block/hang are arrays of regexes.
  // mobile=true emulates touch.
  async function page({
    w = 1100,
    h = 900,
    sw = false,
    block = [],
    hang = [],
    mobile = false,
    motion = false
  } = {}) {
    const p = await browser.newPage();

    await p.setViewport({
      width: w,
      height: h,
      isMobile: mobile,
      hasTouch: mobile
    });

    if (!motion) {
      await p.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" }
      ]);
    }

    p.errs = [];

    p.on("pageerror", e =>
      p.errs.push("pageerror: " + e.message)
    );

    // Console classification (see console-classify.mjs): real errors fail the suites. The only thing set aside is a REPORT-ONLY CSP message
    // naming only Google ad hosts (the AdSense loader that stays in the page <head> until approval): non-blocking by definition, so it is
    // recorded and printed by finish(), never counted as an application error and never silently dropped.
    p.on("console", m => {
      const kind = classifyConsole(m.type(), m.text());
      if (kind === "error") p.errs.push("console: " + m.text());
      else if (kind === "report-only-ad-host") reportOnlyNotices.push(m.text());
    });

    if (!sw) {
      await p.setBypassServiceWorker(true);
      await p.setRequestInterception(true);

      p.on("request", r => {
        const url = r.url();

        if (hang.some(re => re.test(url))) return;

        // Never answered: simulates a stalled network.
        if (
          !url.startsWith(srv.base) ||
          block.some(re => re.test(url))
        ) {
          r.abort();
        } else {
          r.continue();
        }
      });
    }

    return p;
  }

  // Really takes the network away, including service-worker fetches.
  async function stop() {
    try {
      if (srv.server.closeAllConnections) {
        srv.server.closeAllConnections();
      }

      await new Promise(resolve =>
        srv.server.close(() => resolve())
      );
    } catch {
      // Already stopped.
    }
  }

  async function finish() {
    console.log(out.join("\n"));
    if (reportOnlyNotices.length) {
      const uniq = [...new Set(reportOnlyNotices)];
      console.log(`\nNOTE: ${reportOnlyNotices.length} non-blocking report-only CSP notice(s) from Google ad hosts (third-party AdSense loader; not application errors):`);
      uniq.slice(0, 3).forEach(t => console.log("  " + t.slice(0, 220)));
    }

    console.log(
      `\n[${name}] PASS ${out.filter(line => line.startsWith("PASS")).length}  FAIL ${failed}`
    );

    await browser.close();
    await stop();

    process.exit(failed ? 1 : 0);
  }

  return {
    base: srv.base,
    hits: srv.hits,
    browser,
    page,
    ok,
    finish,
    stop
  };
}

export const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

export const txt = (p, sel) =>
  p.$eval(sel, e => e.textContent);
