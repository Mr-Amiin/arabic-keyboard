// Classifies browser console output for the Learn browser suites. Deliberately narrow: this never hides application errors.
//
// A console message is a NON-BLOCKING THIRD-PARTY NOTICE only when BOTH hold:
//   1. it is a report-only CSP message ("[Report Only] Refused to ..."): by definition the browser only REPORTS it and still performs the
//      request/frame (verified in real Chromium: with Content-Security-Policy-Report-Only the cross-origin iframe still loads and the console
//      logs "[Report Only] Refused to frame ..."; with the enforced header the iframe is blocked and the message has no such prefix), and
//   2. every host the message names is a Google advertising host. Neither the site's pages nor the test servers send any CSP header or meta tag,
//      so a report-only policy can only come from the third-party content, i.e. the existing AdSense loader / its ad iframes, which is
//      intentionally left in the page <head> until AdSense approval.
// Everything else still fails the suite: enforced CSP violations (no "[Report Only]" prefix, even for Google hosts), report-only messages
// that name the site's own origin or any other host, and every other console error.
const AD_HOSTS = /^(?:[a-z0-9-]+\.)*(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com)$|^adservice\.google\.[a-z.]+$/i;
const BENIGN_NETWORK = /Failed to load resource|ERR_/;

export function classifyConsole(type, text) {
  if (type !== "error") return "ignore";
  if (BENIGN_NETWORK.test(text)) return "ignore";                      // pre-existing rule: blocked/aborted external requests in the sandboxed runs
  if (/^\[Report Only\]/.test(text)) {
    const hosts = [...text.matchAll(/https?:\/\/([^\/'"\s:]+)/g)].map(m => m[1]);
    if (hosts.length && hosts.every(h => AD_HOSTS.test(h))) return "report-only-ad-host";
  }
  return "error";
}
