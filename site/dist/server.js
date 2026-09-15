// Static file server for this project.
//
// Why this exists: opening index.html via file:// blocks ES modules,
// WASM (HarfBuzz), and font fetch() in Chrome. Everything in this
// project must be served over http://localhost.
//
// Usage:  node server.js   (or: npm run dev)
// Then open the printed URL in Chrome.
//
// This file only ever served the calligraphy-editor app for local
// development (calligraphy-editor/, calligraphy/, assets/) -- it has
// never served the rest of this multi-page site, which is deployed as
// a plain static site (see CNAME / site/README.md). Two things this
// dev server adds:
//
//   1. A PUBLIC PATH ALLOWLIST. Only the directories the editor
//      actually needs are servable; everything else gets an ordinary
//      404, indistinguishable from a path that doesn't exist at all.
//
//   2. STANDARD SECURITY RESPONSE HEADERS, including a real
//      Content-Security-Policy, built by auditing what the editor's
//      code actually does: it has zero external dependencies and needs
//      no CSP exception beyond the narrow 'wasm-unsafe-eval' HarfBuzz
//      requires. The separate font-gallery page this policy used to
//      also cover (calligraphy/) has been removed from the site --
//      that route, its exclusive assets, and its own looser CSP
//      (Google Fonts CDN, an inline-script hash) are gone. One strict
//      policy now applies to everything this file serves.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------
// 1. Public path allowlist.
//
// Only these top-level directories are ever served. Everything at the
// project root itself (server.js, package.json, *.md, *.zip, *.log,
// test scripts, screenshots, start.bat, node_modules/, tests/, ...) is
// off the public surface entirely -- not "hidden," genuinely
// unreachable over HTTP, with no distinguishable response from a path
// that was never real.
// ---------------------------------------------------------------------
const ALLOWED_TOP_LEVEL_DIRS = new Set(['calligraphy-editor', 'assets']);

function isPubliclyAllowed(absoluteFilePath) {
  const rel = path.relative(ROOT, absoluteFilePath);
  // Outside ROOT entirely (defence in depth -- the traversal check below
  // already rejects this case first, but a path allowlist should never
  // assume it's the only thing standing between a request and the
  // filesystem).
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const topLevel = rel.split(path.sep)[0];
  return ALLOWED_TOP_LEVEL_DIRS.has(topLevel);
}

// ---------------------------------------------------------------------
// 2. Security headers.
// ---------------------------------------------------------------------

// Headers that apply the same way regardless of which directory answered
// the request. Permissions-Policy denies every browser feature this app
// doesn't use; requestFullscreen() IS used by the editor's canvas (see
// canvas.js), so fullscreen is allowed for same-origin use only.
// Strict-Transport-Security has no effect over plain HTTP (user agents
// only honor it on a response delivered over TLS), so it's harmless to
// send unconditionally here and becomes effective the moment this is
// served behind TLS termination in a real deployment.
const COMMON_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), ' +
    'magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=(self)',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

// The editor (calligraphy-editor/): zero external runtime dependencies
// (Phase 30 confirmed this by grepping for any http(s):// reference in
// its HTML/JS -- there are none), and as of Phase 31 no inline
// script/style either (the one inline <script> that used to set
// window.CALLIGRAPHY_ASSET_BASE is now js/asset-base.js; the handful of
// inline style="..." attributes and one .style.cssText assignment are
// now CSS classes). That makes 'self'-only achievable with no
// unsafe-inline, no hash, no nonce for either script-src or style-src.
//
// 'wasm-unsafe-eval' is required for WebAssembly.instantiateStreaming()
// (HarfBuzz) to run under a CSP that omits 'unsafe-eval' -- verified
// empirically (see PHASE31_DEPLOYMENT_HARDENING.md): removing it makes
// HarfBuzz initialization throw under a real, enforced CSP in Chromium.
// It permits compiling/running WebAssembly only -- it does NOT permit
// eval()/new Function()/string-based setTimeout, so it doesn't reopen
// the eval-injection surface that 'unsafe-eval' would.
//
// img-src allows data: because Trace Image (trace-image-panel.js) reads
// a user-selected local file into a data: URL via FileReader to measure
// it before placing it on the canvas -- a same-device, same-origin flow
// with no network fetch involved.
// script-src additionally allows https://pagead2.googlesyndication.com --
// the exact, single origin the AdSense account-verification script tag
// (calligraphy-editor/index.html's <script async src=".../adsbygoogle.js">)
// loads from. Nothing broader was added: no 'unsafe-inline', no
// 'unsafe-eval' beyond the pre-existing HarfBuzz 'wasm-unsafe-eval', no
// wildcard/https: scheme allowance. Google's own CSP guidance
// (support.google.com/adsense/answer/16283098) explicitly does not
// publish a fixed domain allowlist -- it recommends a nonce + 'strict-
// dynamic' policy instead, because "the domains that the AdSense ad code
// uses change over time." This narrower, origin-pinned policy is
// deliberately more restrictive than Google's own recommendation, and
// covers only the bare verification script now in use (no ad units are
// served yet). If ad units are added later, this policy will need a
// fresh audit against whatever the ad-serving code actually requests.
const EDITOR_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://pagead2.googlesyndication.com",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// The separate font gallery (calligraphy/) that used to need a second,
// looser CSP here (a Google Fonts CDN allowance, an inline-script
// SHA-256 hash, 'unsafe-inline' for its static style attributes) has
// been removed from the site. There is now only one policy: EDITOR_CSP,
// applied uniformly to everything this file serves.
function securityHeadersFor(absoluteFilePath) {
  return { ...COMMON_SECURITY_HEADERS, 'Content-Security-Policy': EDITOR_CSP };
}

// Error/blocked responses (404s, 405s, the traversal/allowlist rejections)
// are never real application documents, but they still get the strictest
// CSP available (same as the editor's) rather than none at all -- there's
// no legitimate reason for one of these to ever need looser rules.
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...COMMON_SECURITY_HEADERS, 'Content-Security-Policy': EDITOR_CSP, ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));

  // Prevent escaping the project root (path.sep-anchored so a sibling
  // directory that merely starts with the same characters as ROOT can
  // never pass this check).
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    send(res, 404, 'Not found');
    return;
  }

  // Public allowlist -- this is what actually keeps the project's
  // internal/development files off the public surface. A path that
  // exists on disk but isn't under an allowed directory gets the exact
  // same 404 as a path that was never real.
  if (!isPubliclyAllowed(filePath)) {
    send(res, 404, `Not found: ${urlPath}`);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      send(res, 404, `Not found: ${urlPath}`);
      return;
    }
    if (stats.isDirectory()) {
      // redirect so relative asset paths inside index.html resolve correctly
      res.writeHead(302, { ...COMMON_SECURITY_HEADERS, Location: req.url.endsWith('/') ? req.url + 'index.html' : req.url + '/' });
      res.end();
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        send(res, 500, 'Server error');
        return;
      }
      const headers = { 'Content-Type': contentType, 'Cache-Control': 'no-cache', ...securityHeadersFor(filePath) };
      if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
      send(res, 200, data, headers);
    });
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Calligraphy Editor — local dev server running');
  console.log('');
  console.log(`    Editor:   http://localhost:${PORT}/calligraphy-editor/`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
