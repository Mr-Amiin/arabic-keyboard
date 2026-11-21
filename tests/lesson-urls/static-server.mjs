// GitHub-Pages-like static server for tests: "/dir/" -> dir/index.html, anything missing -> real 404 (no SPA fallback, no redirects).
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain", ".woff2": "font/woff2", ".wasm": "application/wasm", ".onnx": "application/octet-stream" };
export function serve(root, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let f = path.normalize(path.join(root, p.endsWith("/") ? p + "index.html" : p));
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(f, (e, st) => {
      if (e || st.isDirectory()) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("404"); }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(f).pipe(res);
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
