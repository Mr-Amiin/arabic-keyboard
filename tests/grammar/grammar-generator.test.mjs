import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, lesson } from "./fixtures.mjs";

const SITE = "https://www.arabic-keyboard.live";
const GEN = "scripts/build-learn-pages.mjs";
const ALIF = "learn-arabic/letters/alif/index.html";
const EOLS = ["lf", "crlf"];   // every scenario runs with both, so the suite means the same on Windows (autocrlf=true) and on Linux

const toEol = (text, eol) => { const lf = text.replace(/\r\n/g, "\n"); return eol === "crlf" ? lf.replace(/\n/g, "\r\n") : lf; };
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

// Throw-away copy of the site. `eol` rewrites the copied pages and sitemap to LF or CRLF, which is exactly what a Git checkout does
// to text files (Git stores LF; core.autocrlf=true writes CRLF on disk). Without `eol` the files are copied exactly as checked out.
const sandbox = (grammarRecords, eol) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grammar-gen-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, GEN), path.join(dir, GEN));
  fs.cpSync(path.join(ROOT, "assets/js/learn"), path.join(dir, "assets/js/learn"), { recursive: true });
  fs.cpSync(path.join(ROOT, "learn-arabic"), path.join(dir, "learn-arabic"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "sitemap.xml"), path.join(dir, "sitemap.xml"));
  if (eol) for (const f of [...walk(path.join(dir, "learn-arabic")), path.join(dir, "sitemap.xml")]) fs.writeFileSync(f, toEol(fs.readFileSync(f, "utf8"), eol));
  if (grammarRecords) {
    const f = path.join(dir, "assets/js/learn/grammar.js"), src = fs.readFileSync(f, "utf8");
    assert.equal(src.split("const RAW = [];").length, 2, "grammar.js must contain exactly one empty catalogue declaration");
    fs.writeFileSync(f, src.replace("const RAW = [];", "const RAW = " + JSON.stringify(grammarRecords) + ";"));
  }
  return dir;
};
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const run = (dir, ...args) => spawnSync(process.execPath, [path.join(dir, GEN), ...args], { cwd: dir, encoding: "utf8" });
// Actual bytes of every file under learn-arabic/ plus sitemap.xml, keyed by forward-slash relative path.
const snapshot = (dir) => new Map([...walk(path.join(dir, "learn-arabic")), path.join(dir, "sitemap.xml")].sort().map((f) => [path.relative(dir, f).split(path.sep).join("/"), fs.readFileSync(f)]));
const isPage = (rel) => /^learn-arabic\/[^/]+\/[^/]+\/index\.html$/.test(rel);
const bytesOf = (dir, rel) => fs.readFileSync(path.join(dir, rel));
const assertIdentical = (before, after, label, skip = []) => {
  for (const [rel, buf] of before) if (!skip.includes(rel)) assert.ok(after.has(rel) && Buffer.compare(buf, after.get(rel)) === 0, `${label}: bytes changed for ${rel}`);
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const noBareLF = (s) => !/(^|[^\r])\n/.test(s);

test("the real checkout (whatever its line endings): --check passes and is repeatable", () => {
  const a = spawnSync(process.execPath, [path.join(ROOT, GEN), "--check"], { cwd: ROOT, encoding: "utf8" });
  const b = spawnSync(process.execPath, [path.join(ROOT, GEN), "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout.trim(), "up to date: 62 lesson pages + dashboard index");
  assert.equal(b.stdout, a.stdout);
  assert.equal(b.status, 0);
});

for (const eol of EOLS) {
  test(`[${eol}] --check passes and is repeatable, and the existing pages really have ${eol.toUpperCase()} endings`, () => {
    const dir = sandbox(null, eol);
    try {
      const alif = bytesOf(dir, ALIF).toString("utf8");
      assert.equal(alif.includes("\r\n"), eol === "crlf");
      if (eol === "crlf") assert.ok(noBareLF(alif)); else assert.ok(!alif.includes("\r"));
      const before = snapshot(dir);
      const a = run(dir, "--check"), b = run(dir, "--check");
      assert.equal(a.status, 0, a.stderr);
      assert.equal(a.stdout.trim(), "up to date: 62 lesson pages + dashboard index");
      assert.equal(b.status, 0, b.stderr);
      assert.equal(b.stdout, a.stdout);
      assertIdentical(before, snapshot(dir), "--check must write nothing");
    } finally { cleanup(dir); }
  });

  test(`[${eol}] empty grammar catalogue: check and generate leave every existing file byte-identical and create no grammar page`, () => {
    const dir = sandbox(null, eol);
    try {
      const before = snapshot(dir);
      assert.equal([...before.keys()].filter(isPage).length, 62);
      assert.equal(run(dir, "--check").status, 0);
      assert.equal(run(dir, "--check").status, 0);
      for (const args of [[], ["--sitemap"]]) {
        const r = run(dir, ...args);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /wrote 62 lesson pages/);
        const after = snapshot(dir);
        assert.deepEqual([...after.keys()], [...before.keys()], "no file added or removed");
        assertIdentical(before, after, "generate " + args.join(" "));
      }
      assert.equal(fs.existsSync(path.join(dir, "learn-arabic/grammar")), false);
      const sm = locs(before.get("sitemap.xml").toString("utf8"));
      assert.equal(sm.length, 78);
      assert.equal(new Set(sm).size, 78);
    } finally { cleanup(dir); }
  });

  test(`[${eol}] populated catalogue: grammar pages are generated and all 62 original pages stay byte-identical`, () => {
    const recs = [lesson(), lesson({ id: "gram-fixture-two", slug: "fixture-two", title: "Fixture lesson two", summary: "Second fixture summary.", prerequisites: ["gram-fixture-one"] })];
    const dir = sandbox(recs, eol);
    try {
      const before = snapshot(dir);
      const originals = [...before.keys()].filter(isPage);
      assert.equal(originals.length, 62);

      // freshness: only the new pages and the dashboard directory are out of date; none of the 62 existing pages is reported
      let r = run(dir, "--check");
      assert.equal(r.status, 1);
      const stale = r.stderr.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("learn-arabic/"));
      assert.deepEqual(stale.sort(), ["learn-arabic/grammar/fixture-one/index.html", "learn-arabic/grammar/fixture-two/index.html", "learn-arabic/index.html"]);

      r = run(dir, "--sitemap");
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /wrote 64 lesson pages/);
      const after = snapshot(dir);
      assertIdentical(before, after, "existing page", ["learn-arabic/index.html", "sitemap.xml"]);
      assert.deepEqual([...after.keys()].filter((f) => !before.has(f)), ["learn-arabic/grammar/fixture-one/index.html", "learn-arabic/grammar/fixture-two/index.html"]);

      // the dashboard and sitemap keep the line endings they already had
      const dash = after.get("learn-arabic/index.html").toString("utf8"), smXml = after.get("sitemap.xml").toString("utf8");
      if (eol === "crlf") { assert.ok(noBareLF(dash)); assert.ok(noBareLF(smXml)); } else { assert.ok(!dash.includes("\r")); assert.ok(!smXml.includes("\r")); }

      // new pages: expected route, metadata, content and no review claim
      const buf = after.get("learn-arabic/grammar/fixture-two/index.html"), html = buf.toString("utf8");
      assert.ok(!html.includes("\r"), "a newly generated page is always written with LF");
      const canonical = `${SITE}/learn-arabic/grammar/fixture-two/`;
      assert.match(html, /<title>Arabic Grammar: Fixture lesson two \| Learn Arabic<\/title>/);
      assert.match(html, /<h1 [^>]*>Arabic grammar: Fixture lesson two<\/h1>/);
      assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
      assert.ok(html.includes(`<meta name="description" content="Second fixture summary.`));
      const ld = JSON.parse(/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)[1]);
      assert.equal(ld["@type"], "BreadcrumbList");
      assert.deepEqual(ld.itemListElement.map((i) => i.item), [SITE + "/", SITE + "/learn-arabic/", canonical]);
      assert.equal(ld.itemListElement[2].name, "Fixture lesson two");
      assert.ok(html.includes('data-route="grammar/gram-fixture-two"'));
      const body = html.slice(html.indexOf('<div id="learnApp"'), html.indexOf('<div class="lx lx-after"'));
      for (const text of ["Explanatory fixture text.", "kitab", "A fixture mistake.", "Fixture question?", "Because it is a fixture."]) assert.ok(body.includes(text), text);
      assert.doesNotMatch(body, /teacher|approved|reviewed/i);
      assert.ok(html.includes('href="/learn-arabic/grammar/fixture-one/"'), "previous / prerequisite link");

      // every internal link on both new pages resolves to a file in the sandbox
      for (const slug of ["fixture-one", "fixture-two"]) {
        const page = bytesOf(dir, `learn-arabic/grammar/${slug}/index.html`).toString("utf8");
        for (const m of page.matchAll(/href="(\/learn-arabic\/[^"#]*)"/g)) assert.ok(fs.existsSync(path.join(dir, m[1], m[1].endsWith("/") ? "index.html" : "")), "broken link " + m[1]);
      }

      // dashboard directory and sitemap
      assert.match(dash, /All 64 lesson pages: letters, harakat, vocabulary, conversations, reading and grammar/);
      assert.match(dash, /Grammar lessons \(2\)/);
      assert.ok(dash.includes('href="grammar/fixture-one/"'));
      const sm = locs(smXml);
      assert.equal(sm.length, 80);
      assert.equal(new Set(sm).size, 80);
      assert.ok(sm.includes(`${SITE}/learn-arabic/grammar/fixture-one/`) && sm.includes(canonical));

      // up to date now, and regenerating is byte-for-byte deterministic
      assert.equal(run(dir, "--sitemap", "--check").status, 0);
      assert.equal(run(dir, "--sitemap", "--check").status, 0);
      assert.equal(run(dir, "--sitemap").status, 0);
      assertIdentical(after, snapshot(dir), "second generation");
    } finally { cleanup(dir); }
  });

  test(`[${eol}] a genuine content difference is still detected, and only that file is rewritten, keeping its ${eol.toUpperCase()} endings`, () => {
    const dir = sandbox(null, eol);
    try {
      const file = path.join(dir, ALIF), original = fs.readFileSync(file);
      const edited = original.toString("utf8").replace("</title>", " (edited)</title>");
      assert.notEqual(edited, original.toString("utf8"));
      fs.writeFileSync(file, edited);
      const before = snapshot(dir);

      const r = run(dir, "--check");
      assert.equal(r.status, 1);
      assert.deepEqual(r.stderr.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("learn-arabic/")), [ALIF]);
      assertIdentical(before, snapshot(dir), "--check must write nothing");

      assert.equal(run(dir).status, 0);
      const after = snapshot(dir);
      assertIdentical(before, after, "unrelated file", [ALIF]);
      assert.equal(Buffer.compare(after.get(ALIF), original), 0, "the regenerated page equals the pristine page, byte for byte, in the file's own line-ending style");
      assert.equal(run(dir, "--check").status, 0);
    } finally { cleanup(dir); }
  });
}

test("a line-ending-only difference is not staleness: the opposite endings are accepted and their bytes preserved", () => {
  for (const [from, to] of [["lf", "crlf"], ["crlf", "lf"]]) {
    const dir = sandbox(null, from);
    try {
      const file = path.join(dir, ALIF);
      fs.writeFileSync(file, toEol(fs.readFileSync(file, "utf8"), to));   // only this page now has the other style
      const before = snapshot(dir);
      assert.equal(run(dir, "--check").status, 0, `${from} checkout with one ${to} page`);
      assert.equal(run(dir).status, 0);
      assertIdentical(before, snapshot(dir), `${from} checkout with one ${to} page`);
    } finally { cleanup(dir); }
  }
});

test("newly generated grammar pages are byte-identical whatever line endings the checkout uses", () => {
  const recs = [lesson()], pages = {};
  for (const eol of EOLS) {
    const dir = sandbox(recs, eol);
    try { assert.equal(run(dir).status, 0); pages[eol] = bytesOf(dir, "learn-arabic/grammar/fixture-one/index.html"); }
    finally { cleanup(dir); }
  }
  assert.equal(Buffer.compare(pages.lf, pages.crlf), 0);
});

test("an invalid grammar catalogue makes the generator fail without writing anything", () => {
  for (const eol of EOLS) {
    const dir = sandbox([lesson({ slug: "Not A Slug" })], eol);
    try {
      const before = snapshot(dir);
      const r = run(dir);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Grammar catalogue is invalid/);
      assertIdentical(before, snapshot(dir), "invalid catalogue");
    } finally { cleanup(dir); }
  }
});
