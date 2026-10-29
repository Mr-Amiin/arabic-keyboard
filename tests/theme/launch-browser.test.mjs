// Unit tests for the browser selection logic (platform / env / filesystem are injected, so Windows behaviour is verified on any OS).
// Run: npm run test:unit
import test from "node:test"; import assert from "node:assert/strict";
import { resolveBrowser, candidatePaths } from "./launch-browser.mjs";

const WIN = { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "D:\\Users\\someone\\AppData\\Local" };
const only = (...ok) => p => ok.includes(p);

test("explicit CHROME_PATH wins on every platform", () => {
  for (const platform of ["win32", "darwin", "linux"]) assert.deepEqual(resolveBrowser({ platform, env: { CHROME_PATH: "X:\\b\\chrome.exe" }, exists: only("X:\\b\\chrome.exe") }), { kind: "explicit", path: "X:\\b\\chrome.exe" });
});
test("PUPPETEER_EXECUTABLE_PATH is honoured too, CHROME_PATH takes priority", () => {
  assert.equal(resolveBrowser({ platform: "win32", env: { PUPPETEER_EXECUTABLE_PATH: "/p" }, exists: only("/p") }).path, "/p");
  assert.equal(resolveBrowser({ platform: "win32", env: { PUPPETEER_EXECUTABLE_PATH: "/p", CHROME_PATH: "/c" }, exists: only("/p", "/c") }).path, "/c");
});
test("explicit path that does not exist is an error (no silent fallback)", () => {
  assert.throws(() => resolveBrowser({ platform: "win32", env: { CHROME_PATH: "C:\\nope\\chrome.exe" }, exists: () => false }), /not found: C:\\nope\\chrome\.exe.*CHROME_PATH/s);
});
test("Windows: finds Chrome under Program Files, derived from the environment (no hard-coded user)", () => {
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe") }).path, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe") }).kind, "system");
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("D:\\Users\\someone\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe") }).kind, "system");   // per-user install
  assert.equal(resolveBrowser({ platform: "win32", env: WIN, exists: only("C:\\Program Files\\Chromium\\Application\\chrome.exe") }).kind, "system");
});
test("Windows: never selects the bundled Linux binary; missing browser gives a clear, actionable error", () => {
  assert.throws(() => resolveBrowser({ platform: "win32", env: WIN, exists: () => false }), e => /No Chrome\/Chromium found on win32/.test(e.message) && /CHROME_PATH/.test(e.message) && /chrome\.exe/.test(e.message));
});
test("macOS: finds Chrome in /Applications, otherwise errors", () => {
  assert.equal(resolveBrowser({ platform: "darwin", env: {}, exists: only("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") }).kind, "system");
  assert.throws(() => resolveBrowser({ platform: "darwin", env: {}, exists: () => false }), /No Chrome\/Chromium found on darwin/);
});
test("Linux keeps the bundled @sparticuz/chromium by default", () => {
  assert.deepEqual(resolveBrowser({ platform: "linux", env: {}, exists: () => false }), { kind: "bundled" });
});
test("candidate list has no duplicates and no empty segments", () => {
  const c = candidatePaths("win32", { PROGRAMFILES: "C:\\Program Files", PROGRAMW6432: "C:\\Program Files" });
  assert.equal(new Set(c).size, c.length); assert.ok(c.every(p => !/undefined/.test(p)));
});
