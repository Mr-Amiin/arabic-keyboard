# Phase 7 asset attribution registry

Per Phase 7 spec point 17 ("every new font/SVG/ornament/design/vector
asset needs documented legitimate license"). This registry covers only
what Phase 7 actually added. Font licensing for the pre-existing
calligraphy font families (unchanged by Phase 7) is tracked separately
in `../assets/fonts/LICENSES.md`.

## 1. Tashkeel (تشكيل) marks — `js/tashkeel-library.js`

No new visual assets. Every mark is a real Unicode Arabic combining
character (U+064B–U+0670 range) rendered through the same fonts and
the same HarfBuzz shaping pipeline already used for every other glyph
in the editor — see the file's own header comment. There is no
separate outline, SVG, or image asset to license here: the glyph
outline that appears on screen is the font's own outline, already
covered by that font's entry in `../assets/fonts/LICENSES.md`. A mark
is offered in the panel only when the target font's real glyph table
produces a genuine, non-empty, zero-advance glyph for it (verified at
run time, not asserted); if the font has no such glyph, the panel
marks the mark unavailable rather than substituting hand-drawn
geometry.

| id | Character | License basis |
|---|---|---|
| fatha, damma, kasra, sukun, shadda, fathatan, dammatan, kasratan, maddah, hamza-above, hamza-below, small-alef | U+064B–U+0670 (standard Unicode Arabic diacritics) | Unicode code points are not copyrightable; the rendered outline belongs to whichever already-licensed font shapes it (see `../assets/fonts/LICENSES.md`) |

## 2. Elements (عناصر) library — `js/elements-library.js`

All 9 entries are original vector path data, hand-authored for this
project in each shape's own 100×100 authoring box, in the same style
and mechanism as the pre-existing Phase 4 Decorations library
(`js/decorations-library.js`) that this library sits alongside.
Nothing here is traced, copied, or derived from Kaleam or any other
third-party product or asset pack. License: original work, part of
this project's own codebase (same terms as the rest of the editor's
source).

| id | Label | Description |
|---|---|---|
| ring | Ring | Two concentric circular outlines (annulus via even-odd-style nested arcs) |
| triple-dot | Triple dot | Three filled circles in a triangular arrangement |
| diamond-frame | Diamond frame | Two concentric diamond outlines |
| corner-frame | Corner frame | Four independent L-shaped corner brackets |
| wave-flourish | Wave flourish | A single flowing cubic-Bézier stroke |
| hex-ornament | Hex ornament | A hexagon outline with internal diagonal/horizontal accent lines |
| teardrop | Teardrop | A filled teardrop/paisley silhouette (cubic curves into a circular arc) |
| arabesque-curl | Arabesque curl | A symmetric double-spiral stroke |
| divider-bar | Divider bar | A horizontal bar interrupted by a central diamond notch |

## 3. Designs (تصاميم) library — `js/designs-library.js`

All 3 compositions are original multi-piece vector artwork,
hand-authored for this project; each piece is plain path data drawn in
its own authoring box within a shared design canvas (see the file's
header comment for how pieces share one canvas so a design scales as
one coherent whole on insert, then can be ungrouped into its
individual real objects). Nothing here is copied or derived from
Kaleam or any other third-party asset. License: original work, part of
this project's own codebase.

| id | Label | Pieces | Description |
|---|---|---|---|
| medallion | Medallion | 6 | A concentric ring plus four cardinal "petal" shapes plus a center dot |
| divider-set | Divider set | 3 | Two horizontal bars flanking a rotated-square (diamond outline) accent |
| frame-accent | Frame accent | 2 | A square frame (one path with two opposite-wound subpaths, punching a real hole via the nonzero fill rule — not a stroke-only outline) plus a small diamond accent |

## 4. Trace Image — `js/trace-image-panel.js`

No bundled visual asset. This feature only ever displays an image the
*user* imports at runtime (their own file, via the browser's native
file picker); the editor ships no sample or placeholder image. Nothing
to license.

## 5. Vendored libraries used by Phase 7's new export formats

Already covered in `../assets/fonts/LICENSES.md` §"Vendored non-font
code libraries", repeated here for visibility since they are new to
Phase 7:

- jsPDF 2.5.1 — MIT — `vendor/jspdf/LICENSE`
- svg2pdf.js 2.2.1 — MIT — `vendor/svg2pdf/LICENSE`

Both are used unmodified, loaded as classic `<script>` tags, solely to
produce the new PDF export format from the editor's own real SVG
composition.
