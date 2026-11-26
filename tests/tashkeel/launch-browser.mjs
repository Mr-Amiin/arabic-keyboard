// Shared browser launcher for the Tashkeel regression tests (i18n.mjs, translation-ui.mjs, qa-final.mjs).
//
// Why this exists: "@sparticuz/chromium" extracts a LINUX (serverless) Chromium build. On Windows and macOS its
// executablePath() points at a file that cannot run natively (spawn ... ENOENT / "not a valid Win32 application").
// So:
//   - Windows : CHROME_PATH or PUPPETEER_EXECUTABLE_PATH if set, otherwise an installed Google Chrome / Chromium from the
//               standard locations (Program Files, Program Files (x86), %LOCALAPPDATA%). Never the bundled Linux binary.
//   - macOS   : the same override variables, otherwise an installed Chrome / Chromium under /Applications.
//   - Linux   : the bundled @sparticuz/chromium, exactly as before (imported lazily, only here).
//   - Anything else: a clear error that says what to install or which variable to set.
//
// Usage:
//   const browser = await launchBrowser({
//     args: ["--no-sandbox"],                               // test-specific arguments (always passed)
//     filterBundledArgs: /single-process|no-zygote/,        // bundled-Chromium arguments to DROP (Linux only)
//   });
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const isFile = (p) => { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

// Standard install locations for a platform. Environment variables are used first, then the stock defaults, so this also works
// from shells that do not export PROGRAMFILES (e.g. some Git Bash / CI setups). Pure and injectable for tests.
export function candidatePaths(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    const bases = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.PROGRAMW6432, env.LOCALAPPDATA, "C:\\Program Files", "C:\\Program Files (x86)"].filter(Boolean);
    const rels = [["Google", "Chrome", "Application", "chrome.exe"], ["Chromium", "Application", "chrome.exe"]];
    return [...new Set(bases.flatMap((b) => rels.map((r) => path.win32.join(b, ...r))))];
  }
  if (platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"];
  }
  return [];
}

// Decide which browser to use. Returns { kind: "bundled" } (Linux) or { kind: "explicit" | "system", path }; throws a clear Error
// when Windows/macOS has no usable browser. Pure so it can be unit-tested for every platform.
export function resolveBrowser({ platform = process.platform, env = process.env, exists = isFile } = {}) {
  if (platform !== "win32" && platform !== "darwin") return { kind: "bundled" };
  const viaVar = env.CHROME_PATH ? "CHROME_PATH" : env.PUPPETEER_EXECUTABLE_PATH ? "PUPPETEER_EXECUTABLE_PATH" : null;
  if (viaVar) {
    const p = env[viaVar];
    if (!exists(p)) throw new Error(`Browser executable not found: ${p}\n(from ${viaVar}). Point it at an installed Chrome/Chromium executable, or unset it.`);
    return { kind: "explicit", path: p };
  }
  const searched = candidatePaths(platform, env);
  const found = searched.find(exists);
  if (found) return { kind: "system", path: found };
  const example = platform === "win32"
    ? `  PowerShell:  $env:CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"\n  cmd.exe:     set "CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"\n`
    : `  export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"\n`;
  throw new Error(
    `No compatible Chrome/Chromium was found on ${platform}. The bundled @sparticuz/chromium is a Linux binary and cannot run here.\n` +
    `Install Google Chrome (https://www.google.com/chrome/) or set CHROME_PATH / PUPPETEER_EXECUTABLE_PATH to a Chrome/Chromium executable, e.g.\n${example}` +
    `Searched: ${searched.join(", ")}`);
}

// Launch the browser. `deps` exists only so tests can inject a fake platform/filesystem/puppeteer; real callers pass nothing.
export async function launchBrowser({ args = [], filterBundledArgs = null, launchOptions = {} } = {}, deps = {}) {
  const pptr = deps.puppeteer || puppeteer;
  const importChromium = deps.importChromium || (() => import("@sparticuz/chromium"));
  const r = resolveBrowser({ platform: deps.platform, env: deps.env, exists: deps.exists });
  let browser;
  try {
    if (r.kind === "bundled") {
      // Linux: unchanged behaviour. The bundled arguments are kept, minus anything the caller filters out.
      const chromium = (await importChromium()).default;
      const bundled = filterBundledArgs ? chromium.args.filter((a) => !filterBundledArgs.test(a)) : chromium.args;
      browser = await pptr.launch({ ...launchOptions, args: [...bundled, ...args], executablePath: await chromium.executablePath(), headless: "shell" });
    } else {
      // Installed Chrome/Chromium: no bundled arguments exist, so only the caller's own arguments apply (and a flag such as
      // --disable-web-security that a test filters out of the bundle is simply never present). A normal Chrome uses headless: true;
      // a chrome-headless-shell executable (its file name contains "headless") needs "shell".
      const headless = /headless/i.test(path.basename(r.path)) ? "shell" : true;
      browser = await pptr.launch({ ...launchOptions, args: [...args], executablePath: r.path, headless });
    }
  } catch (e) {
    throw new Error(`Could not launch the browser (${r.kind}${r.path ? ": " + r.path : ""}): ${e.message}`);
  }
  console.log(`Browser: ${await browser.version()} [${r.kind}${r.path ? ": " + r.path : ""}] on ${deps.platform || process.platform}`);
  return browser;
}
