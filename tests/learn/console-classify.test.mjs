import test from "node:test"; import assert from "node:assert/strict";
import { classifyConsole as c } from "./browser/console-classify.mjs";
// The first two strings are the exact format Chromium produced in this repo's probe (report-only vs enforced); the Google-host strings use that same
// format with a Google ad host (SYNTHETIC: the real Google messages cannot be captured without network access to Google).
const RO = h => `[Report Only] Refused to frame '${h}' because it violates the following Content Security Policy directive: "frame-src 'self'".`;
const ENF = h => `Refused to frame '${h}' because it violates the following Content Security Policy directive: "frame-src 'self'".`;
test("report-only violation naming only Google ad hosts is a non-blocking notice", () => {
  for (const h of ["https://googleads.g.doubleclick.net/", "https://tpc.googlesyndication.com/", "https://pagead2.googlesyndication.com/", "https://adservice.google.com/"]) assert.equal(c("error", RO(h)), "report-only-ad-host", h);
});
test("an ENFORCED violation is still an error, even for a Google host", () => assert.equal(c("error", ENF("https://googleads.g.doubleclick.net/")), "error"));
test("a report-only violation naming the site's own origin or another host is still an error", () => {
  for (const h of ["http://127.0.0.1:37035/", "https://www.arabic-keyboard.live/", "https://evil.example/", "https://www.google.com/", "https://notgooglesyndication.com/", "https://googlesyndication.com.evil.example/"]) assert.equal(c("error", RO(h)), "error", h);
});
test("a message naming a Google host AND another host is still an error", () => assert.equal(c("error", RO("https://googleads.g.doubleclick.net/") + " " + "https://evil.example/"), "error"));
test("a report-only message with no host at all is still an error", () => assert.equal(c("error", "[Report Only] Refused to execute inline script"), "error"));
test("ordinary application errors are still errors", () => { for (const t of ["Uncaught TypeError: x is not a function", "LearnApp failed", "console.error from app"]) assert.equal(c("error", t), "error"); });
test("warnings/logs are ignored; the existing network-failure rule is unchanged", () => { assert.equal(c("warning", "anything"), "ignore"); assert.equal(c("log", "x"), "ignore"); assert.equal(c("error", "Failed to load resource: net::ERR_FAILED"), "ignore"); });
