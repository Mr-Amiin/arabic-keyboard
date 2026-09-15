// Thin ESM wrapper around the existing, audited font registry.
//
// window.CalligraphyData comes from assets/js/calligraphy-data.js,
// loaded as a classic <script> in index.html — the real, audited
// registry (untouched, not duplicated, not hand-edited), shared with
// the rest of the site. This module never invents a family, a
// variation, or a feature: everything here is read straight from that
// registry.

function data() {
  if (!window.CalligraphyData) {
    throw new Error('CalligraphyData not loaded — assets/js/calligraphy-data.js must load before the editor modules.');
  }
  return window.CalligraphyData;
}

export function getFamilies() {
  return data().FAMILIES;
}

export function getFamily(familyId) {
  return getFamilies().find((f) => f.id === familyId) || null;
}

export function findVariation(variationId) {
  return data().findVariation(variationId);
}

export function fontCssUrl(file) {
  return data().fontUrl(null, file);
}

// The real font file is served as .woff2 (for CSS/browser rendering).
// HarfBuzz shaping needs raw SFNT bytes, so a losslessly-decompressed
// sibling (.ttf) sits next to every .woff2 in assets/fonts/calligraphy/
// — same outlines, same hinting, same glyphs, just not brotli-packed.
// See PHASES.md for why. Never used for anything the user sees; only
// for feeding the real shaping engine.
export function fontShapingUrl(file) {
  const cssUrl = fontCssUrl(file);
  return cssUrl.replace(/\.woff2$/i, '.ttf');
}

export function buildFeatureSettings(features) {
  return data().buildFeatureSettings(features);
}

export function defaultFamilyAndVariation() {
  const families = getFamilies().filter((f) => f.available);
  const family = families[0];
  const variation = family ? family.variations[0] : null;
  return { family, variation };
}
