// Unit tests for the shared browser launcher. Platform, environment, filesystem, puppeteer and the bundled-Chromium
// module are all injected, so Windows and macOS behaviour is verified on any machine (including Linux CI).
// Run: node --test launch-browser.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { launchBrowser, resolveBrowser, candidatePaths } from "./launch-browser.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const WIN = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "D:\\Users\\someone\\AppData\\Local" };
const only = (...ok) => (p) => ok.includes(p);

// A fake puppeteer that records the launch options, and a fake bundled-Chromium module whose use is counted.
const fakePuppeteer = () => { const calls = []; return { calls, launch: async (o) => { calls.push(o); return { version: async () => "FakeChrome/1.0" }; } }; };
const noBundled = () => { throw new Error("@sparticuz/chromium must NOT be imported on this platform"); };
const bundledModule = (counter = { exe: 0 }) => async () => ({
  default: {
    args: ["--allow-pre-commit-input", "--single-process", "--no-zygote", "--disable-web-security", "--font-render-hinting=none", "--hide-scrollbars"],
    executablePath: async () => { counter.exe++; return "/tmp/chromium"; },
  },
});

test("Windows: CHROME_PATH or PUPPETEER_EXECUTABLE_PATH is used when supplied; CHROME_PATH wins; a missing explicit path is an error (no silent fallback)", () => {
  assert.deepEqual(resolveBrowser({ platform: "win32", env: { CHROME_PATH: "X:\\c\\chrome.exe" }, exists: only("X:\\c\\chrome.exe") }), { kind: "explicit", path: "X:\\c\\chrome.exe" });
  assert.equal(resolveBrowser({ platform: "win32", env: { PUPPETEER_EXECUTABLE_PATH: "/p" }, exists: only("/p") }).path, "/p");
  assert.equal(resolveBrowser({ platform: "win32", env: { PUPPETEER_EXECUTABLE_PATH: "/p", CHROME_PATH: "/c" }, exists: only("/p", "/c") }).path, "/c");
  assert.throws(() => resolveBrowser({ platform: "win32", env: { CHROME_PATH: "C:\\nope\\chrome.exe" }, exists: () => false }), /not found: C:\\nope\\chrome\.exe.*CHROME_PATH/s);
});

test("Windows: discovers Chrome in the standard locations (Program Files, Program Files (x86), LocalAppData, Chromium) and even with no environment variables", () => {
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only(CHROME) }).path, CHROME);
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe") }).kind, "system");
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("D:\\Users\\someone\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe") }).kind, "system");
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("C:\\Program Files\\Chromium\\Application\\chrome.exe") }).kind, "system");
  assert.equal(resolveBrowser({ platform: "win32", env: {}, exists: only(CHROME) }).path, CHROME, "stock Program Files location works without PROGRAMFILES set");
});

test("Windows: launches the installed Chrome with headless:true and ONLY the caller's arguments; never imports or runs the bundled Linux Chromium", async () => {
  const p = fakePuppeteer();
  await launchBrowser({ args: ["--no-sandbox", "--lang=en-US"], filterBundledArgs: /single-process|no-zygote|disable-web-security/ },
    { platform: "win32", env: {}, exists: only(CHROME), puppeteer: p, importChromium: noBundled });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].executablePath, CHROME);
  assert.equal(p.calls[0].headless, true);
  assert.deepEqual(p.calls[0].args, ["--no-sandbox", "--lang=en-US"]);
  assert.ok(!p.calls[0].args.some((a) => /disable-web-security|single-process|no-zygote/.test(a)), "no bundled/insecure flags reach installed Chrome");
});

test("Windows: an explicit CHROME_PATH is honoured end to end; a chrome-headless-shell executable gets headless:'shell'", async () => {
  const p = fakePuppeteer();
  await launchBrowser({ args: ["--no-sandbox"] }, { platform: "win32", env: { CHROME_PATH: "E:\\tools\\chrome-headless-shell.exe" }, exists: only("E:\\tools\\chrome-headless-shell.exe"), puppeteer: p, importChromium: noBundled });
  assert.equal(p.calls[0].executablePath, "E:\\tools\\chrome-headless-shell.exe");
  assert.equal(p.calls[0].headless, "shell");
});

test("macOS: uses an installed Chrome/Chromium (or the override); never the bundled binary; clear error otherwise", async () => {
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const p = fakePuppeteer();
  await launchBrowser({ args: ["--no-sandbox"] }, { platform: "darwin", env: {}, exists: only(mac), puppeteer: p, importChromium: noBundled });
  assert.equal(p.calls[0].executablePath, mac); assert.equal(p.calls[0].headless, true); assert.deepEqual(p.calls[0].args, ["--no-sandbox"]);
  assert.equal(resolveBrowser({ platform: "darwin", env: { PUPPETEER_EXECUTABLE_PATH: "/x/chrome" }, exists: only("/x/chrome") }).path, "/x/chrome");
  assert.throws(() => resolveBrowser({ platform: "darwin", env: {}, exists: () => false }), /No compatible Chrome\/Chromium was found on darwin/);
});

test("no browser found on Windows: the error is clear and actionable (what to install, which variables, where it looked)", () => {
  assert.throws(() => resolveBrowser({ platform: "win32", env: WIN, exists: () => false }), (e) =>
    /No compatible Chrome\/Chromium was found on win32/.test(e.message) && /Linux binary/.test(e.message) && /CHROME_PATH/.test(e.message) &&
    /PUPPETEER_EXECUTABLE_PATH/.test(e.message) && /Program Files\\Google\\Chrome\\Application\\chrome\.exe/.test(e.message) && /Searched:/.test(e.message));
});

test("Linux: keeps the bundled @sparticuz/chromium exactly as before (headless:'shell', bundled executablePath), imported lazily, ignoring Windows/mac overrides", async () => {
  assert.deepEqual(resolveBrowser({ platform: "linux", env: { CHROME_PATH: "/whatever" }, exists: () => false }), { kind: "bundled" });
  const counter = { exe: 0 }; const p = fakePuppeteer();
  await launchBrowser({ args: ["--no-sandbox"] }, { platform: "linux", env: {}, puppeteer: p, importChromium: bundledModule(counter) });
  assert.equal(counter.exe, 1, "executablePath() is called exactly once, on Linux only");
  assert.equal(p.calls[0].executablePath, "/tmp/chromium"); assert.equal(p.calls[0].headless, "shell");
});

test("Linux: bundled arguments can be filtered per test; the caller's own arguments are appended; unfiltered flags are preserved", async () => {
  const p = fakePuppeteer();
  await launchBrowser({ args: ["--no-sandbox", "--lang=en-US"], filterBundledArgs: /single-process|no-zygote/ }, { platform: "linux", env: {}, puppeteer: p, importChromium: bundledModule() });
  assert.deepEqual(p.calls[0].args, ["--allow-pre-commit-input", "--disable-web-security", "--font-render-hinting=none", "--hide-scrollbars", "--no-sandbox", "--lang=en-US"]);
  const q = fakePuppeteer(); // translation-ui.mjs also drops --disable-web-security so real CORS rules apply
  await launchBrowser({ args: ["--no-sandbox"], filterBundledArgs: /single-process|no-zygote|disable-web-security/ }, { platform: "linux", env: {}, puppeteer: q, importChromium: bundledModule() });
  assert.ok(!q.calls[0].args.includes("--disable-web-security") && q.calls[0].args.at(-1) === "--no-sandbox");
  const r = fakePuppeteer(); // no filter -> every bundled argument is kept
  await launchBrowser({}, { platform: "linux", env: {}, puppeteer: r, importChromium: bundledModule() });
  assert.equal(r.calls[0].args.length, 6);
});

test("a launch failure is reported with the browser kind and path for easy diagnosis", async () => {
  const p = { launch: async () => { throw new Error("spawn ENOENT"); } };
  await assert.rejects(launchBrowser({}, { platform: "win32", env: {}, exists: only(CHROME), puppeteer: p, importChromium: noBundled }), /Could not launch the browser \(system: C:\\Program Files\\Google\\Chrome\\Application\\chrome\.exe\): spawn ENOENT/);
});

test("candidate list has no duplicates, no empty or 'undefined' segments, and is empty on Linux", () => {
  const c = candidatePaths("win32", { PROGRAMFILES: "C:\\Program Files", PROGRAMW6432: "C:\\Program Files" });
  assert.equal(new Set(c).size, c.length); assert.ok(c.every((x) => !/undefined/.test(x)) && c.includes(CHROME));
  assert.deepEqual(candidatePaths("linux", {}), []);
});
