// Phase 10D: the single, shared, hardened "does this font genuinely
// support this Tashkeel mark/combo" probe.
//
// Before this phase, this same detection logic was duplicated in two
// places — tashkeel-panel.js (deciding what to show as available) and
// text-panel.js's font-switch reshape flow (deciding what survives a
// font change) — and both used the same too-permissive test:
// `xAdvance === 0 && !empty`. Phase 10C's real-font audit of Layla
// Thuluth found that test produces a false positive for a font with no
// GPOS table at all: HarfBuzz applies a blanket fallback that zeroes
// the advance width of ANY input character in the Unicode "combining
// mark" categories, even when the glyph actually produced is glyph ID
// 0 (.notdef) — and a font's .notdef glyph is very commonly a visible
// "tofu box" outline (the normal, conventional font-design choice, not
// a defect), so `!empty` doesn't catch it either. The result: Maddah,
// Hamza Above, and Hamza Below appeared "available" in Layla Thuluth
// and, when clicked, inserted a meaningless placeholder box onto the
// canvas instead of being honestly greyed out.
//
// This module fixes that once, for every caller, using two real,
// structural signals instead of an advance-width heuristic:
//   1. Does this font's own cmap (glyph-shaper.js's getFontCapabilities,
//      backed by HarfBuzz's real hb_face_collect_unicodes) actually map
//      this Unicode codepoint at all?
//   2. Does the font's own shaped output for it resolve to a real,
//      non-zero glyph ID (never inferred — read directly off HarfBuzz's
//      post-shaping buffer via glyph-shaper.js's `glyphId` field)?
// A mark fails on (1) is categorized `glyph-missing`; a mark that
// passes (1) but fails (2) — a rarer case where cmap lists the
// codepoint but the shaped result still resolves to .notdef — is
// categorized `notdef-rejected`. Both are honestly reported as
// unavailable; only a mark that passes both real checks and produces
// a non-empty, zero-advance glyph is `glyph-supported`.
//
// A combo (Phase 7's linguistic whitelist of shadda + a real short
// vowel/tanwin — see tashkeel-library.js's own note on why that list
// is deliberately not larger) is only genuinely supported when EVERY
// constituent codepoint passes the same two checks; it additionally
// reports `positioningSource`, the honest answer to "should the two
// resulting glyphs trust the font's own relative mark-to-mark (mkmk)
// GPOS offsets, or does this font have none to trust" — real table
// presence, never guessed from whether the offsets happen to be zero.

import { shapeText, getFontCapabilities } from './glyph-shaper.js';
import { DOTTED_CIRCLE } from './tashkeel-library.js';

function isGenuineMarkGlyph(g) {
  return g.xAdvance === 0 && !g.empty && g.glyphId !== 0;
}

function codepointsOf(str) {
  return Array.from(str).map((ch) => ch.codePointAt(0));
}

/**
 * Probe one single Tashkeel mark against a real font context.
 * Returns:
 *   { status: 'supported', reason: 'glyph-supported', path, upem }
 *   { status: 'unavailable', reason: 'glyph-missing' | 'notdef-rejected' | 'probe-error' }
 */
export async function probeMark(ctx, markChar) {
  const caps = await getFontCapabilities(ctx.shapingUrl);
  const missing = codepointsOf(markChar).some((cp) => !caps.unicodeSet.has(cp));
  if (missing) return { status: 'unavailable', reason: 'glyph-missing' };

  try {
    const { glyphs, upem } = await shapeText({
      shapingUrl: ctx.shapingUrl,
      text: DOTTED_CIRCLE + markChar,
      features: ctx.features,
      weight: ctx.weight,
    });
    const markGlyph = glyphs.find((g) => isGenuineMarkGlyph(g));
    if (!markGlyph) return { status: 'unavailable', reason: 'notdef-rejected' };
    return { status: 'supported', reason: 'glyph-supported', path: markGlyph.path, upem };
  } catch (err) {
    console.error('[calligraphy-editor] Tashkeel probe failed:', err);
    return { status: 'unavailable', reason: 'probe-error' };
  }
}

/**
 * Probe one combined Tashkeel sequence (e.g. shadda+fatha) against a
 * real font context. `expectedMemberCount` lets the font-switch
 * reshape path (which already knows how many real objects the old
 * font produced for this combo) require exactly that many surviving
 * glyphs in the new font, rather than a fixed 2.
 *
 * Returns:
 *   { status: 'supported', reason: 'combo-supported', glyphs, upem, positioningSource: 'gpos' | 'editor' }
 *   { status: 'unavailable', reason: 'glyph-missing' | 'notdef-rejected' | 'probe-error' }
 */
export async function probeCombo(ctx, chars, expectedMemberCount = 2) {
  const caps = await getFontCapabilities(ctx.shapingUrl);
  const missing = codepointsOf(chars).some((cp) => !caps.unicodeSet.has(cp));
  if (missing) return { status: 'unavailable', reason: 'glyph-missing' };

  try {
    const { glyphs, upem } = await shapeText({
      shapingUrl: ctx.shapingUrl,
      text: DOTTED_CIRCLE + chars,
      features: ctx.features,
      weight: ctx.weight,
    });
    const markGlyphs = glyphs.filter((g) => isGenuineMarkGlyph(g));
    if (markGlyphs.length < expectedMemberCount) {
      return { status: 'unavailable', reason: 'notdef-rejected' };
    }
    // Real, structural signal — not inferred from whether the shaped
    // offsets happen to be (0,0) — see this module's header comment.
    const positioningSource = caps.hasMarkToMark ? 'gpos' : 'editor';
    return { status: 'supported', reason: 'combo-supported', glyphs: markGlyphs, upem, positioningSource };
  } catch (err) {
    console.error('[calligraphy-editor] Tashkeel combo probe failed:', err);
    return { status: 'unavailable', reason: 'probe-error' };
  }
}
