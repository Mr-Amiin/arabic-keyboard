// Chooses and launches the browser for the theme tests, on Linux, macOS and Windows.
//
// Why this exists: "@sparticuz/chromium" ships a LINUX (serverless) Chromium build. On Windows/macOS its executablePath()
// points at a file that cannot run there (e.g. C:\Users\...\Temp\chromium -> "spawn ... ENOENT"). So:
//   1. CHROME_PATH or PUPPETEER_EXECUTABLE_PATH (explicit; any Chrome/Chromium/Edge executable) always wins on every OS.
//   2. Linux without an override: the bundled @sparticuz/chromium, exactly as before.
//   3. Windows / macOS without an override: an installed Google Chrome or Chromium found in the standard locations.
//   4. Otherwise: a clear error telling you what to install or set. The tests never run without a real browser.
import fs from "node:fs"; import path from "node:path";
import puppeteer from "puppeteer-core";

const isFile = p => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

// Standard install locations for the current platform (no user names or drive letters hard-coded: they come from the environment).
export function candidatePaths(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const bases = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.PROGRAMW6432, env.LOCALAPPDATA].filter(Boolean);
    const rels = [["Google", "Chrome", "Application", "chrome.exe"], ["Chromium", "Application", "chrome.exe"]];
    return [...new Set(bases.flatMap(b => rels.map(r => path.win32.join(b, ...r))))];
  }
  if (platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"];
  return ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
}

// Returns { kind: "explicit" | "system" | "bundled", path? } or throws a clear Error. Pure (injectable) so it can be unit-tested.
export function resolveBrowser({ platform = process.platform, env = process.env, exists = isFile } = {}) {
  const explicit = env.CHROME_PATH || env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) {
    if (!exists(explicit)) throw new Error(`Browser executable not found: ${explicit}\n(from ${env.CHROME_PATH ? "CHROME_PATH" : "PUPPETEER_EXECUTABLE_PATH"}). Point it at an installed Chrome/Chromium executable, or unset it.`);
    return { kind: "explicit", path: explicit };
  }
  if (platform === "linux") return { kind: "bundled" };
  const found = candidatePaths(platform, env).find(exists);
  if (found) return { kind: "system", path: found };
  throw new Error(
    `No Chrome/Chromium found on ${platform}. The bundled @sparticuz/chromium is Linux-only, so it cannot be used here.\n` +
    `Install Google Chrome (https://www.google.com/chrome/) or set CHROME_PATH to a Chrome/Chromium/Edge executable, e.g.\n` +
    (platform === "win32" ? `  PowerShell:  $env:CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"; npm test\n  cmd.exe:     set "CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" && npm test\n` : `  CHROME_PATH="/path/to/chrome" npm test\n`) +
    `Searched: ${candidatePaths(platform, env).join(", ") || "(nothing)"}`);
}

export async function launchBrowser() {
  const r = resolveBrowser();
  let browser;
  try {
    if (r.kind === "bundled") {
      const chromium = (await import("@sparticuz/chromium")).default;
      browser = await puppeteer.launch({ args: [...chromium.args.filter(a => !/single-process|no-zygote/.test(a)), "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
    } else {
      // A regular Chrome uses the new headless mode; a chrome-headless-shell binary (name contains "headless") needs "shell".
      const headless = /headless/i.test(path.basename(r.path)) ? "shell" : true;
      browser = await puppeteer.launch({ executablePath: r.path, headless, args: process.platform === "linux" ? ["--no-sandbox"] : [] });
    }
  } catch (e) {
    throw new Error(`Could not launch the browser (${r.kind}${r.path ? ": " + r.path : ""}): ${e.message}`);
  }
  console.log(`Browser: ${await browser.version()} [${r.kind}${r.path ? ": " + r.path : ""}] on ${process.platform}`);
  return browser;
}
