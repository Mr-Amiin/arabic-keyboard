// Packages the review files into ONE zip for a qualified Arabic teacher (no dependencies, deterministic output).
//   node docs/arabic-course-review/package-for-reviewer.mjs [output-directory]      (default: current directory)
// The zip holds REVIEWER-GUIDE.md, review-sheet.md, review-items.csv, recording-script.csv and MANIFEST.txt. It refuses to build if the committed review
// files are stale compared with the course source (regenerate first with build-review-package.mjs).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPackage } from "./build-review-package.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, "../..");
export const ZIP_NAME = "arabic-course-review-package.zip", FOLDER = "arabic-course-review";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// Files that define "the course as reviewed": their hashes go into the manifest so the reviewed version is identifiable.
const SOURCES = ["assets/js/learn/data.js", "assets/js/learn/engine.js", "assets/js/learn/app.js", "assets/js/learn/vocab-data.js", "assets/js/learn/vocab-packs.js", "assets/js/learn/conversations.js", "assets/js/learn/reading.js", "learn-arabic/index.html"];

export function collect() {
  const files = ["REVIEWER-GUIDE.md", "review-sheet.md", "review-items.csv", "recording-script.csv"].map(n => [n, fs.readFileSync(path.join(HERE, n))]);
  const fresh = buildPackage();
  const want = { "REVIEWER-GUIDE.md": fresh.guide, "review-sheet.md": fresh.markdown, "review-items.csv": fresh.csv, "recording-script.csv": fresh.recording };
  for (const [n, buf] of files) if (buf.toString("utf8") !== want[n]) throw new Error(`${n} is stale compared with the course source: run node docs/arabic-course-review/build-review-package.mjs first`);
  const manifest = [
    "ARABIC COURSE REVIEW PACKAGE", "",
    "STATUS: UNREVIEWED. Nothing in this package has been approved by a qualified Arabic teacher. All teacher_decision fields are blank.", "",
    "Start with REVIEWER-GUIDE.md. Record decisions in review-items.csv (or review-sheet.md).", "",
    `Items: ${fresh.rows.length}   High-priority suggestions: ${fresh.rows.filter(r => r.suggested_priority === "high").length}`, "",
    "SHA-256 of the files in this package:", ...files.map(([n, b]) => `  ${sha(b)}  ${n}`), "",
    "SHA-256 of the course source files these items were generated from (identifies exactly which version of the course is under review):", ...SOURCES.map(s => `  ${sha(fs.readFileSync(path.join(REPO, s)))}  ${s}`), "",
    "Regenerate the review files:  node docs/arabic-course-review/build-review-package.mjs", ""
  ].join("\n");
  return [...files, ["MANIFEST.txt", Buffer.from(manifest, "utf8")]];
}

export function buildZip(entries = collect()) {
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;       // fixed 1980-01-01 00:00 so the bytes are reproducible
  const locals = [], central = []; let offset = 0;
  for (const [name, data] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nameBuf = Buffer.from(`${FOLDER}/${name}`, "utf8"), comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); central.push(ch, nameBuf); offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(process.argv[2] || "."); fs.mkdirSync(outDir, { recursive: true });
  const zip = buildZip(), out = path.join(outDir, ZIP_NAME); fs.writeFileSync(out, zip);
  console.log(`wrote ${out}  (${zip.length} bytes, sha256 ${sha(zip).slice(0, 16)}…)`);
}
