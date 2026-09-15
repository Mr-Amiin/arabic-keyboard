// Real text-to-glyph pipeline: Arabic text -> HarfBuzz shaping -> real
// vector glyph outlines (SVG path data, straight from the font's own
// glyf/CFF outlines via HarfBuzz's glyphToPath). No canvas.fillText(),
// no rasterization, no CSS text as the output — this is the actual
// shaping engine, the same one browsers and font tools use.
//
// HarfBuzz itself only reads raw SFNT (TTF/OTF) bytes, not compressed
// WOFF2 — see font-registry.js's fontShapingUrl() for the decompressed
// sibling files this reads from.

let hbPromise = null;
function loadHarfBuzz() {
  if (!hbPromise) hbPromise = import('../vendor/harfbuzz/index.mjs');
  return hbPromise;
}

const faceCache = new Map(); // shapingUrl -> Promise<{hb, face, upem}>

async function loadFace(shapingUrl) {
  if (faceCache.has(shapingUrl)) return faceCache.get(shapingUrl);
  const promise = (async () => {
    const hb = await loadHarfBuzz();
    const res = await fetch(shapingUrl);
    if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${shapingUrl}`);
    const buf = await res.arrayBuffer();
    const blob = new hb.Blob(buf);
    const face = new hb.Face(blob);
    if (!face.upem || face.upem <= 0) {
      throw new Error(`HarfBuzz could not parse font face: ${shapingUrl}`);
    }
    return { hb, face, upem: face.upem };
  })();
  faceCache.set(shapingUrl, promise);
  return promise;
}

/**
 * Shape `text` with the given font (already-decompressed .ttf URL),
 * OpenType feature tags, and (for variable fonts) a weight.
 *
 * Returns { upem, glyphs } where each glyph is:
 *   { path, xAdvance, yAdvance, xOffset, yOffset, cluster, empty, glyphId }
 * — path is raw SVG path data in font design units (y-up, baseline at
 * 0), exactly as HarfBuzz's font.glyphToPath() produced it. Advances
 * are also in font design units; the caller (scene.js) applies the
 * pixel scale, baseline placement, and the y-flip needed for SVG.
 *
 * `glyphId` (Phase 10D) is HarfBuzz's own post-shaping glyph ID for
 * this position — `info.codepoint` is repurposed by hb_shape() to hold
 * the resolved glyph ID rather than the original Unicode codepoint,
 * which is the real, authoritative signal for "did this font actually
 * have a glyph here, or did it silently fall back to .notdef"
 * (glyphId === 0). Phase 10C found that a font's advance width alone
 * (xAdvance === 0) is NOT sufficient to prove a combining mark is
 * genuinely supported: a font with no GPOS table at all makes HarfBuzz
 * apply a blanket fallback that zeroes the advance of ANY input
 * character in the Unicode "combining mark" categories, even when the
 * glyph it actually produced is glyph ID 0 (.notdef) because the font
 * has no real outline for that character. Exposing the real glyph ID
 * lets every caller check for that directly instead of inferring it.
 */
export async function shapeText({ shapingUrl, text, features = [], weight = null }) {
  if (!text) return { upem: 1000, glyphs: [] };

  const { hb, face, upem } = await loadFace(shapingUrl);

  const font = new hb.Font(face);
  font.setScale(upem, upem);
  if (weight != null) {
    font.setVariations([new hb.Variation('wght', weight)]);
  }

  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();

  const hbFeatures = features.map((tag) => new hb.Feature(tag, 1));

  hb.shape(font, buffer, hbFeatures);

  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();

  const glyphs = infos.map((info, i) => {
    const pos = positions[i];
    const path = font.glyphToPath(info.codepoint);
    return {
      path,
      xAdvance: pos.xAdvance,
      yAdvance: pos.yAdvance,
      xOffset: pos.xOffset,
      yOffset: pos.yOffset,
      cluster: info.cluster,
      empty: !path || path.length === 0,
      glyphId: info.codepoint,
    };
  });

  return { upem, glyphs };
}

// Phase 10D: real, structural, per-font capability data — never
// guessed from shaping output. Used to decide (a) whether a Unicode
// codepoint has any real glyph mapping in this font at all
// (`unicodeSet`, from HarfBuzz's own cmap-derived
// hb_face_collect_unicodes) and (b) whether this font's own GPOS table
// carries real mark-to-base ('mark') or mark-to-mark ('mkmk')
// positioning data, which is the authoritative, non-heuristic answer
// to "can this font's own relative mark offsets be trusted" — a font
// missing GPOS entirely (Phase 10C's Layla Thuluth finding) or missing
// the 'mkmk' feature specifically will always report zero relative
// offsets between two marks, which must NOT be mistaken for "the two
// marks are meant to occupy the same point". Cached per shapingUrl
// exactly like loadFace, since a face's own table contents never
// change during a session.
const capabilitiesCache = new Map(); // shapingUrl -> Promise<capabilities>

export async function getFontCapabilities(shapingUrl) {
  if (capabilitiesCache.has(shapingUrl)) return capabilitiesCache.get(shapingUrl);
  const promise = (async () => {
    const { face } = await loadFace(shapingUrl);
    const gposTable = face.referenceTable('GPOS');
    const hasGPOS = !!gposTable;
    const gposFeatures = hasGPOS ? face.getTableFeatureTags('GPOS') : [];
    const hasMarkToBase = gposFeatures.includes('mark');
    const hasMarkToMark = gposFeatures.includes('mkmk');
    const unicodeSet = new Set(Array.from(face.collectUnicodes()));
    return { hasGPOS, gposFeatures, hasMarkToBase, hasMarkToMark, unicodeSet };
  })();
  capabilitiesCache.set(shapingUrl, promise);
  return promise;
}
