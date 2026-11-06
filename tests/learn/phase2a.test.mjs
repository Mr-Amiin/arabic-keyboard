// Phase 2A unit tests: service-worker/precache invariants, static page structure (lazy keyboard), strict grading, review package.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
const D = require("../../assets/js/learn/data.js");
const E = require("../../assets/js/learn/engine.js");
const sw = read("sw.js"), html = read("learn-arabic/index.html");
const coreOf = src => eval(src.match(/const CORE_ASSETS = (\[[\s\S]*?\]);/)[1]);
const CORE = coreOf(sw);
const onDisk = u => fs.existsSync(path.join(REPO, u === "/" ? "index.html" : u.endsWith("/") ? u.slice(1) + "index.html" : u.slice(1)));

/* ---------- service worker ---------- */
test("sw.js: new cache version v17 (stale v16/v11/v10 assets cannot be served)", () => {
  assert.equal(sw.match(/const CACHE_NAME = "([^"]+)"/)[1], "arabic-keyboard-shell-v17");
  assert.equal(sw.match(/const VENDOR_CACHE = "([^"]+)"/)[1], "arabic-keyboard-vendor-v1", "vendor cache name must not change (19 MB model)");
});
test("sw.js: every precache path exists on disk (one bad path makes cache.addAll fail silently for ALL assets)", () => {
  assert.equal(new Set(CORE).size, CORE.length, "duplicates");
  for (const u of CORE) assert.ok(onDisk(u), "missing file for " + u);
});
test("sw.js: Learn page, CSS and every Learn script are precached", () => {
  for (const u of ["/learn-arabic/", "/assets/css/learn.css", ...["data", "vocab-data", "srs", "engine", "review", "progress", "audio", "typing-dock", "app"].map(n => `/assets/js/learn/${n}.js`), "/assets/js/keyboard-tool.js"]) assert.ok(CORE.includes(u), u);
});
test("sw.js: every local script/stylesheet the Learn page references is precached (nothing needed offline is left out)", () => {
  const refs = [...html.matchAll(/(?:src|href)="(\.\.\/assets\/[^"]+)"/g)].map(m => m[1].replace("..", ""));
  assert.ok(refs.length >= 8);
  for (const r of refs.filter(x => /\.(js|css)$/.test(x))) assert.ok(CORE.includes(r), "not precached: " + r);
});
test("sw.js: no previously precached asset was removed (compared with git HEAD)", () => {
  let head; try { head = execFileSync("git", ["show", "HEAD:sw.js"], { cwd: REPO, encoding: "utf8" }); } catch (e) { return; /* no git: nothing to compare */ }
  for (const u of coreOf(head)) assert.ok(CORE.includes(u), "removed from precache: " + u);
});

test("sw.js: ignoreSearch is confined to the OFFLINE NAVIGATION fallback (no change to online, asset or other-request matching)", () => {
  const code = sw.replace(/\/\/.*$/gm, "");
  assert.equal((code.match(/ignoreSearch/g) || []).length, 1, "ignoreSearch must be used exactly once");
  const at = code.indexOf("ignoreSearch"), navAt = code.lastIndexOf('mode === "navigate"', at), errAt = code.indexOf("return Response.error();", at);
  assert.ok(navAt > 0 && navAt < at && at < errAt, "must sit inside the navigate branch, before the non-navigation Response.error()");
  assert.ok(code.slice(navAt, at).indexOf("}") === -1 || code.slice(navAt, at).indexOf("}") > code.slice(navAt, at).indexOf("{"), "no branch closes between the navigate test and ignoreSearch");
  assert.ok(/caches\.match\("\/"\)/.test(code.slice(at, errAt)), "the home-page fallback is still the last resort");
  assert.ok(!/cache:\s*"reload"[^)]*ignoreSearch/.test(code), "precache requests unchanged");
});

/* ---------- static structure of the Learn page ---------- */
test("Learn page: keyboard-tool.js is NOT a static script tag (it must be lazy-loaded) and its URL is configured", () => {
  assert.ok(!/<script[^>]+keyboard-tool/.test(html), "eager keyboard script tag found");
  const m = html.match(/id="learnApp"[^>]*data-keyboard-src="([^"]+)"/); assert.ok(m, "data-keyboard-src missing");
  assert.ok(fs.existsSync(path.join(REPO, "learn-arabic", m[1])), "keyboard src does not resolve: " + m[1]);
});
test("Learn page: scripts load in dependency order, with typing-dock before app", () => {
  const order = [...html.matchAll(/<script src="\.\.\/assets\/js\/learn\/(\w[\w-]*)\.js"/g)].map(m => m[1]);
  assert.deepEqual(order, ["data", "vocab-data", "srs", "engine", "review", "progress", "audio", "typing-dock", "app"]);
});
test("Learn page: dock markup is complete, hidden by default, persistent (outside #learnApp), with an accessible toggle", () => {
  for (const id of ["lxTypePanel", "lxTPrompt", "lxEditor", "lxKbToggle", "lxKbWrap", "lxKb", "lxKbStatus", "lxKbRetry", "lxKbAnnounce", "lxTCheck", "lxTNext", "lxTFb"]) assert.ok(new RegExp(`id="${id}"`).test(html), id);
  assert.ok(/id="lxTypePanel"[^>]*\bhidden\b/.test(html), "panel must start hidden");
  const appStart = html.indexOf('id="learnApp"'), appEnd = html.indexOf("</div>", appStart), panel = html.indexOf('id="lxTypePanel"');
  assert.ok(panel > appEnd, "dock must be a sibling after #learnApp, not inside it");
  assert.ok(/id="lxKbToggle"[^>]*aria-controls="lxKbWrap"/.test(html) && /id="lxKbToggle"[^>]*aria-expanded=/.test(html));
  assert.ok(/<label[^>]+for="lxEditor"/.test(html) && /<textarea id="lxEditor" class="editor"/.test(html) && /class="editor-area[^"]*"><textarea id="lxEditor"/.test(html), "textarea needs a label and the site's .editor/.editor-area classes");
  assert.ok(/id="lxKbWrap"[^>]*class="kb-panel/.test(html) || /class="kb-panel[^"]*"[^>]*id="lxKbWrap"/.test(html) || /id="lxKbWrap" class="kb-panel/.test(html));
});
test("Learn page: the keyboard host is outside any data-i18n-skip container (so its control labels follow the site language), still in the right tab/DOM order, and starts hidden", () => {
  const at = html.indexOf('id="lxKbWrap"'); assert.ok(at > 0);
  assert.ok(/id="lxKbWrap"[^>]*\bhidden\b/.test(html), "keyboard host must start hidden");
  const openers = [...html.slice(0, at).matchAll(/<div class="lx[^"]*"[^>]*>/g)]; const nearest = openers[openers.length - 1][0];
  assert.ok(!/data-i18n-skip/.test(nearest), "keyboard host is inside a skipped container: " + nearest);
  assert.ok(html.indexOf('id="lxTypePanel"') < at && at < html.indexOf('class="lx-intro"'), "DOM order: dock controls, then keyboard, then page text");
  const skipped = html.match(/<div class="lx[^"]*"[^>]*data-i18n-skip>/g) || []; assert.ok(skipped.length >= 2, "course text stays protected from the translator");
});
test("Learn page: no duplicate id attributes in the static HTML", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, []);
});
test("Learn page: the dock IDs do not collide with IDs rendered into #learnApp by app.js", () => {
  const appJs = read("assets/js/learn/app.js"), rendered = new Set([...appJs.matchAll(/\bid="([A-Za-z]+)"/g)].map(m => m[1]));
  for (const id of ["lxTypePanel", "lxEditor", "lxKbToggle", "lxKbWrap", "lxKb", "lxKbStatus", "lxKbRetry", "lxKbAnnounce", "lxTCheck", "lxTNext", "lxTFb", "lxTPrompt"]) assert.ok(!rendered.has(id), id + " is also rendered by app.js");
});
test("typing-dock.js: no eager keyboard load and init is guarded to run once", () => {
  const src = read("assets/js/learn/typing-dock.js");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // ignore comments
  assert.ok(!/\.init\(/.test(code.split("function tryInit")[0]), "init must only be called inside tryInit");
  assert.equal((src.match(/\.init\(\{/g) || []).length, 1, "exactly one init call site");
  assert.ok(/initAttempted/.test(src) && /initialised/.test(src), "init guards present");
  assert.ok(/createElement\("script"\)/.test(src), "script is created on demand");
});

test("Learn page: the key-press announcement region is a polite, atomic live region, visually hidden, and the dock never touches the shared keyboard tool", () => {
  assert.ok(/id="lxKbAnnounce"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(html) && /id="lxKbAnnounce" class="lx-sr"/.test(html));
  const tool = read("assets/js/keyboard-tool.js"); assert.ok(!/lxKb|LearnTypingDock/.test(tool), "keyboard-tool.js must stay free of Learn-specific code");
  const dock = read("assets/js/learn/typing-dock.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(/isKeyboardActivation/.test(dock) && /pointerType === ""/.test(dock), "focus restoration is limited to pointer-less (keyboard / AT) activation");
});

/* ---------- strict vs lenient grading ---------- */
test("every reading stage declares a valid check mode; only the vowelled-words stage is exact; marked is multiple choice", () => {
  const modes = Object.fromEntries(D.READING_STAGES.map(s => [s.id, s.check]));
  assert.deepEqual(modes, { letters: "letters", marked: "choice", joined: "letters", words: "exact", phrases: "letters", sentences: "letters" });
});
test("exact-stage items are NFC and each contains at least one harakat mark (otherwise strictness would be meaningless)", () => {
  for (const s of D.READING_STAGES.filter(x => x.check === "exact")) for (const it of s.items) { assert.equal(it[0], it[0].normalize("NFC")); assert.ok(/[\u064B-\u0652]/.test(it[0]), it[0]); }
});
test("gradeTyped: exact mode needs letters AND marks; letters mode keeps the original lenient check; empty never passes", () => {
  const w = "كِتَاب";
  assert.deepEqual(E.gradeTyped("exact", w, w), { correct: true, reason: "ok" });
  assert.deepEqual(E.gradeTyped("exact", w, "كتاب"), { correct: false, reason: "marks" });
  assert.deepEqual(E.gradeTyped("exact", w, "كَتَاب"), { correct: false, reason: "marks" });
  assert.deepEqual(E.gradeTyped("exact", w, "كتب"), { correct: false, reason: "letters" });
  assert.equal(E.gradeTyped("letters", w, "كتاب").correct, true);
  assert.equal(E.gradeTyped("letters", w, "كتب").correct, false);
  for (const m of ["exact", "letters", undefined]) assert.deepEqual(E.gradeTyped(m, w, "   "), { correct: false, reason: "empty" });
});
test("gradeTyped: letters mode is exactly the pre-existing checkTyped for every reading item (no relaxation, no tightening)", () => {
  for (const s of D.READING_STAGES) for (const it of s.items) for (const typed of [it[0], it[0].replace(/[\u064B-\u0652\u0670]/g, ""), it[0] + "x", "ب", ""]) assert.equal(E.gradeTyped("letters", it[0], typed).correct, E.checkTyped(it[0], typed) && typed.trim() !== "");
});
test("exact mode: canonical mark order is tolerated (shadda/vowel typed in either order), tatweel and extra spaces are ignored", () => {
  assert.ok(E.gradeTyped("exact", "مُعَلِّم", "مُعَلِّم").correct);
  assert.ok(E.gradeTyped("exact", "مُعَلِّم", "مُعَلّ\u0650م").correct);
  assert.ok(E.gradeTyped("exact", "كِتَاب", "  كِـتَاب ").correct);
  assert.ok(!E.gradeTyped("exact", "مُعَلِّم", "مُعَلَّم").correct, "wrong vowel under shadda must fail");
});

/* ---------- review package ---------- */
const { buildPackage, COLUMNS, DECISIONS } = await import("../../docs/arabic-course-review/build-review-package.mjs");
const pkg = buildPackage();
function parseCsv(text) { // minimal RFC 4180 parser
  const rows = []; let row = [], f = "", q = false; text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\r") { /* skip */ } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows;
}
const byId = Object.fromEntries(pkg.rows.map(r => [r.item_id, r]));
test("review package: item IDs are unique and every row is marked REQUIRES REVIEW with blank teacher fields (no invented approvals)", () => {
  assert.equal(new Set(pkg.rows.map(r => r.item_id)).size, pkg.rows.length);
  for (const r of pkg.rows) { assert.equal(r.review_status, "REQUIRES REVIEW"); assert.equal(r.teacher_decision, ""); assert.equal(r.proposed_correction, ""); assert.equal(r.reviewer_comments, ""); }
  assert.deepEqual(DECISIONS, ["approved", "correction needed", "uncertain"]);
});
test("review package: all 28 lessons and all 56 example words are present with values copied exactly from the source", () => {
  assert.equal(pkg.rows.filter(r => r.category === "example-word").length, 56);
  for (const l of D.LETTERS) {
    const id = "L" + String(l.order).padStart(2, "0");
    for (const k of ["LETTER", "SAY", "DOTS", "SHAPES", "SYL", "QC-NAME", "QC-SOUND"]) assert.ok(byId[`${id}-${k}`], `${id}-${k}`);
    assert.equal(byId[`${id}-SAY`].english_text, l.say, "pronunciation text must be verbatim");
    l.examples.forEach((e, i) => { const r = byId[`${id}-W${i + 1}`]; assert.equal(r.arabic_as_implemented, e.vowelled); assert.equal(r.plain_spelling, e.plain); assert.equal(r.transliteration, e.translit); assert.equal(r.english_text, e.meaning); assert.ok(r.context_notes.includes(e.position.toUpperCase())); });
  }
});
test("review package: harakat, quick-check, reading stages and page text are included", () => {
  for (const h of D.HARAKAT) assert.ok(byId["H-MARK-" + h.id.toUpperCase()], h.id);
  D.HARAKAT_LESSONS.forEach((h, i) => { assert.ok(byId[`H${i + 1}-INTRO`]); h.check.forEach((c, qi) => assert.ok(byId[`H${i + 1}-Q${qi + 1}`].english_text.includes(c[0]))); });
  D.READING_STAGES.forEach((s, i) => { assert.ok(byId[`R${i + 1}-STAGE`].english_text.includes(s.check === "exact" ? "letters AND harakat" : s.check === "letters" ? "harakat optional" : "multiple choice")); s.items.forEach((it, ii) => assert.equal(byId[`R${i + 1}-I${ii + 1}`].arabic_as_implemented, it[0])); });
  assert.ok(byId["P-INTRO1"] && byId["X-JOIN-YES"] && byId["X-JOIN-NO"] && byId["P-LEAD"]);
  assert.ok(byId["X-JOIN-NO"].english_text.includes("never joins"));
});
test("review package: hamza, dagger alif, non-joining letters and letter shapes are flagged for the teacher", () => {
  assert.ok(byId["L01-W1"].special_flags.includes("hamza"));                      // أَسَد
  assert.ok(byId["R6-I1"].special_flags.includes("dagger-alif"));                  // هَٰذَا كِتَابٌ
  assert.ok(byId["R6-I1"].special_flags.includes("tanween"));
  for (const n of ["L01", "L08", "L09", "L10", "L11", "L27"]) assert.ok(byId[`${n}-SHAPES`].special_flags.includes("non-joining-letter"), n);   // ا د ذ ر ز و
  assert.ok(byId["L26-W1"].special_flags.includes("lam-alif-ligature") && byId["L26-W1"].context_notes.includes("ligature"));   // هِلَال
  assert.ok(byId["L02-W2"].context_notes.includes("ك (initial)  ت (medial)  ا (final)  ب (isolated)"), "machine-derived shapes: ب after the non-joining ا is isolated");
  assert.ok(byId["L03-W1"].special_flags.includes("shadda"));
  assert.equal(byId["L02-W2"].suggested_priority, "standard");
  for (const k of ["L04", "L05", "L06", "L07", "L14", "L15", "L16", "L17", "L18", "L19", "L21"]) assert.equal(byId[`${k}-SAY`].suggested_priority, "high", k);   // tha jim ha kha sad dad ta(emph.) dha(emph.) ayn ghayn qaf
  for (const k of ["L02", "L12", "L20", "L24"]) assert.equal(byId[`${k}-SAY`].suggested_priority, "standard", k);   // ba sin fa mim: plain English equivalents
});
test("review package: learner-facing instructional sentences from the UI code are included and still match app.js word for word", () => {
  const app = read("assets/js/learn/app.js"), ui = pkg.rows.filter(r => r.item_id.startsWith("X-UI-"));
  assert.ok(ui.length >= 9);
  for (const r of ui) { assert.ok(app.includes(r.english_text), r.item_id + " no longer matches app.js: regenerate the package"); assert.equal(r.teacher_decision, ""); }
  assert.ok(byId["X-UI-READING-INTRO"].english_text.includes("Modern Standard Arabic") && byId["X-UI-READING-INTRO"].suggested_priority === "high");
  assert.ok(byId["X-UI-PASS-RULE"].english_text.includes("at least 2"));
});
test("review package: no cell can be mistaken for a spreadsheet formula (= + - @), and Excel's cell-length limit is respected", () => {
  for (const r of pkg.rows) for (const c of COLUMNS) { const v = String(r[c]); assert.ok(!/^[=+\-@\t\r]/.test(v), `${r.item_id}.${c} starts with a formula character`); assert.ok(v.length < 32000); }
});
test("review package: Markdown table rows are well-formed (10 unescaped pipes-delimited fields)", () => {
  const lines = pkg.markdown.split("\n").filter(l => /^\| [A-Z]/.test(l) && !l.startsWith("| ID |")); assert.equal(lines.length, pkg.rows.length);
  for (const l of lines) assert.equal(l.split(/(?<!\\)\|/).length, 10, l.slice(0, 50));
});
test("review package: Unicode code points column matches the Arabic text exactly", () => {
  for (const r of pkg.rows.filter(r => /[\u0600-\u06FF]/.test(r.arabic_as_implemented))) assert.equal(r.unicode_codepoints, [...r.arabic_as_implemented].map(c => c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" "));
});
test("review package: CSV has a BOM, the documented columns, and round-trips every row and Arabic string exactly", () => {
  assert.ok(pkg.csv.startsWith("\uFEFF")); const t = parseCsv(pkg.csv);
  assert.deepEqual(t[0], COLUMNS); assert.equal(t.length - 1, pkg.rows.length);
  t.slice(1).forEach((cells, i) => { assert.equal(cells.length, COLUMNS.length); COLUMNS.forEach((c, ci) => assert.equal(cells[ci], pkg.rows[i][c], `${pkg.rows[i].item_id}.${c}`)); });
  for (const c of ["teacher_decision", "proposed_correction", "reviewer_comments"]) assert.ok(COLUMNS.includes(c));
});
test("review package: the Markdown sheet lists every item ID and the guide documents the decisions and the human-review requirement", () => {
  for (const r of pkg.rows) assert.ok(pkg.markdown.includes(`| ${r.item_id} |`), r.item_id);
  for (const d of DECISIONS) assert.ok(pkg.guide.includes(d));
  assert.ok(/qualified Arabic teacher/.test(pkg.guide) && /cannot/.test(pkg.guide) && /Reviewer sign-off/.test(pkg.guide));
  assert.ok(pkg.markdown.includes("UNREVIEWED"));
});
test("review package: committed files are up to date with the course source (regenerate after any content change)", () => {
  const dir = "docs/arabic-course-review/";
  assert.equal(read(dir + "review-items.csv"), pkg.csv, "review-items.csv is stale: run node docs/arabic-course-review/build-review-package.mjs");
  assert.equal(read(dir + "review-sheet.md"), pkg.markdown, "review-sheet.md is stale");
  assert.equal(read(dir + "REVIEWER-GUIDE.md"), pkg.guide, "REVIEWER-GUIDE.md is stale");
});

/* ---------- reviewer zip ---------- */
const zipMod = await import("../../docs/arabic-course-review/package-for-reviewer.mjs");
function readZip(buf) { // minimal reader: end-of-central-directory -> central directory -> inflate each entry and verify its CRC
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = {};
  for (let i = 0; i < n; i++) { const o = buf.readUInt32LE(p + 42), nl = buf.readUInt16LE(p + 28), name = buf.slice(p + 46, p + 46 + nl).toString("utf8");
    const csize = buf.readUInt32LE(o + 18), data = require("node:zlib").inflateRawSync(buf.slice(o + 30 + buf.readUInt16LE(o + 26), o + 30 + buf.readUInt16LE(o + 26) + csize));
    assert.equal(zipMod.crc32(data), buf.readUInt32LE(p + 16), "CRC mismatch for " + name); assert.equal(data.length, buf.readUInt32LE(p + 24)); out[name] = data; p += 46 + nl; }
  return out;
}
test("reviewer zip: valid archive with the three review files plus a manifest, identical to the repo files", () => {
  const z = readZip(zipMod.buildZip()), dir = "docs/arabic-course-review/";
  assert.deepEqual(Object.keys(z).sort(), ["arabic-course-review/MANIFEST.txt", "arabic-course-review/REVIEWER-GUIDE.md", "arabic-course-review/review-items.csv", "arabic-course-review/review-sheet.md"]);
  for (const n of ["REVIEWER-GUIDE.md", "review-sheet.md", "review-items.csv"]) assert.ok(z["arabic-course-review/" + n].equals(fs.readFileSync(path.join(REPO, dir + n))), n);
});
test("reviewer zip: deterministic (two builds are byte-identical) and the manifest states UNREVIEWED and fingerprints both files and course sources", () => {
  assert.ok(zipMod.buildZip().equals(zipMod.buildZip()));
  const m = readZip(zipMod.buildZip())["arabic-course-review/MANIFEST.txt"].toString("utf8");
  assert.ok(/STATUS: UNREVIEWED/.test(m) && /All teacher_decision fields are blank/.test(m));
  for (const f of ["review-items.csv", "review-sheet.md", "REVIEWER-GUIDE.md", "assets/js/learn/data.js", "assets/js/learn/engine.js", "assets/js/learn/app.js", "learn-arabic/index.html"]) assert.ok(new RegExp(`[0-9a-f]{64}  ${f.replace(/[./]/g, "\\$&")}`).test(m), "no hash for " + f);
  assert.ok(!/approved by a qualified Arabic teacher\.?\s*$/m.test(m.replace("Nothing in this package has been approved by a qualified Arabic teacher.", "")), "manifest must not claim approval");
});
