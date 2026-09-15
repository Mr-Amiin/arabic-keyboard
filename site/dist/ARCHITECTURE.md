# Arabic Calligraphy Studio — Architecture

## Where it lives in the existing project

This site is a Python-generated static site (`build/build.py` +
`build/pages.py` → `dist/`), not a JS framework app. The Studio follows
that exact pattern instead of introducing a build step:

```
build/pages.py
  build_calligraphy()        -- HTML for /calligraphy/, registered in
                                 build_all() and NAV_TOOLS (build.py)

assets/js/calligraphy-data.js     -- family/variation registry (data only)
assets/js/calligraphy-studio.js   -- rendering engine (no DOM knowledge)
assets/js/calligraphy-init.js     -- DOM wiring for the /calligraphy/ page

assets/fonts/calligraphy/<id>/    -- WOFF2 font files, one folder per family
fonts/LICENSES.md                 -- license registry (source of truth for
                                      what's legally allowed to ship)
```

Nothing about `/arabic-keyboard/`, `/tashkeel/`, `/editor/`, theme
toggle, language selector, or any other existing page was touched.

## Rendering pipeline

```
Arabic text input (<textarea id="callyText">)
        ↓
studio.state.text                                  (calligraphy-studio.js)
        ↓
preparedLines(state)  — optional tashkeel strip, optional kashida insert
        ↓
buildSvg(state, variation, ...) — builds an SVG <text> markup whose
   inline style includes font-family, font-weight, and
   font-feature-settings for the variation's real OpenType feature(s)
        ↓
live preview: the SVG is inserted directly into the DOM (#callyStage)
   ↳ Arabic shaping (contextual letter joining) AND the selected
     OpenType feature (stylistic set / character variant / stylistic
     alternate / discretionary ligature / justification alternate)
     both happen HERE, inside the browser's own text engine (HarfBuzz
     in Chromium/Firefox) — not reimplemented in JavaScript.
        ↓
export: PNG/JPG (the same SVG, with the font embedded as base64,
        rasterized onto an offscreen <canvas> via an Image), SVG
        (the embedded-font SVG served directly), PDF (JPEG raster
        wrapped in a minimal hand-built single-page PDF, no external
        library)
```

### Why SVG `<text>`, not Canvas 2D `fillText`

The previous version of this Studio drew directly to `<canvas>` with
`ctx.fillText()`. That works fine for plain text, but **Canvas 2D has
no API for OpenType feature toggles** (`font-feature-settings`) — see
[whatwg/html#4074](https://github.com/whatwg/html/issues/4074). Once
the font/variation registry started including real stylistic sets and
character variants (`ss01`, `cv01`, ...), that became a real bug, not a
hypothetical one: a card claiming "Stylistic Set 01" would render
pixel-identical to the default on a canvas, because there is no way to
ask `fillText` to turn a feature on. The underlying OpenType data would
have been genuine, but the *rendering* would have quietly lied about
applying it.

SVG `<text>` elements are laid out through the same CSS/text engine as
any other element, so `font-feature-settings` on them works exactly
like it does on an HTML `<span>`, while Arabic contextual shaping
(letter joining) still happens natively via the browser's own shaping
engine — nothing about letter joining is hand-rolled either way. This
is why the live preview switched from a `<canvas>` to a `<div
id="callyStage">` that a fresh SVG is written into on every render, and
why exports build that same SVG (with the font embedded as base64) and
only rasterize it at the very last step, via an off-DOM `<canvas>`
created purely to call `.toBlob()`.

One quoting detail worth flagging for anyone editing `buildSvg`:
`style="..."` is a double-quoted XML attribute, so every value placed
inside it (`font-family`, `font-feature-settings`) uses **single**
quotes internally (`font-family:'cal-...'`, `font-feature-settings:'ss01'
1`) — using double quotes there breaks the attribute and was an actual
bug caught during this pass by round-tripping every family/variation's
generated markup through an XML parser (see "Validation performed"
below).

### Why native `<text>` shaping instead of hand-rolled shaping

Arabic letters change shape depending on position in a word (isolated /
initial / medial / final) and ligate in specific contexts. Correctly
implementing that from scratch is a substantial, error-prone undertaking
(it's what HarfBuzz exists for). Every modern browser already ships a
correct Arabic shaping engine and uses it automatically for any text
drawn with an SVG `<text>` element, as long as the font is loaded. Using
that native path means:

- Letter joining is always correct, for any of the ~30 fonts, without
  us maintaining shaping tables.
- New fonts can be added by just registering their file — no shaping
  code changes needed.
- The same is true of OpenType features (see above): the browser's
  shaping engine applies the feature, we just have to ask for it via
  standard CSS.

For **PNG/JPG/PDF export**, the choice was between (a) converting each
glyph to a vector path ourselves, or (b) embedding the real font file
in the SVG and rasterizing that. We chose (b) — see `buildExportSvg()`
in `calligraphy-studio.js` — because glyph extraction via a JS font
parser (e.g. opentype.js) does not perform Arabic contextual shaping or
OpenType feature substitution either; you'd still need HarfBuzz-quality
logic on top of it, and getting it subtly wrong (broken joins, the
wrong glyph for a stylistic set, misplaced diacritics) would be a worse
result than a slightly bigger file. The SVG is still genuinely
vector/scalable when downloaded as `.svg` — only the glyph outlines are
supplied by the embedded font at render time, exactly like a real print
PDF or an SVG produced by design software that embeds fonts rather than
outlining text.

### Validation performed on the rendering pipeline (this pass)

Because the SVG string is hand-assembled from user-controllable text
(the phrase field) and per-variation data, every one of the 114
available variations was round-tripped through an XML parser together
with several stress-test phrases, including one containing literal `&`,
`<`, `>`, and `"` characters and one with an embedded newline — 456
combinations total, zero XML errors after fixing the quoting bug
mentioned above. This is a syntactic check (the markup is well-formed
XML the browser can parse), not a pixel check — this project's sandbox
had no access to a real browser engine to screenshot-diff every
variation, and the one SVG rasterizer available in the environment
(`librsvg`) does not implement `font-feature-settings` at all (verified
by inspecting its compiled string table), so it can't be used to
visually confirm feature rendering either. What *is* independently
verified is that the underlying OpenType feature substitutions are real
at the font-data level — see "Audit methodology" in
`fonts/LICENSES.md` — via the actual HarfBuzz shaping engine (the same
one browsers embed), which is the strongest verification available
without a full browser. `font-feature-settings` on SVG/HTML text is
long-standing, broadly-supported CSS (Chrome/Firefox/Safari, since
around 2015), so this is a low-risk gap, but it's called out explicitly
rather than silently assumed.

## Family / variation model

`calligraphy-data.js` exports `CALLIGRAPHY_FAMILIES`, an array of:

```js
{
  id, label, labelEn, blurb,
  available: true | false,
  variations: [
    { id, label, file, weight, features, meta, metaEn }
  ]
}
```

- `features` is the literal list of OpenType feature tags
  (`["ss01"]`, `["cv44"]`, `["dlig"]`, ...) to switch on via
  `font-feature-settings` — see `CalligraphyData.buildFeatureSettings()`.
  An empty array means "the font/weight's default shaping."
- `meta` / `metaEn` are the real, feature-accurate labels shown in the
  gallery (e.g. "Stylistic Set 01", "Character Variant 44") — sourced
  from the `FEATURE_LABELS` table in the same file, never a generic
  "Variation N".
- A variation is always one of: a distinct font file (different type
  design), a real named instance of a variable font's weight axis, or
  a real OpenType feature — confirmed to change actual glyphs via the
  HarfBuzz audit described in `fonts/LICENSES.md` — never a CSS
  filter/transform dressed up as a new calligraphy style.
- `available: false` families (Diwani, Jali Diwani, Ijazah, Shekasteh,
  Andalusi, Maghribi, Muhaqqaq, Rayhani) have an empty `variations`
  array and render as "قريبًا" (Coming soon) in the gallery — see
  `fonts/LICENSES.md` for why, and what it takes to promote one to
  `available: true`. Thuluth and Quranic/Tajweed-oriented Naskh used to
  be in that unavailable list too; both were promoted once a
  genuinely-licensed digitization was found. Ajami/Kano (Alkalami) is a
  family not in the original request at all — discovered during this
  pass's research and added under its own honest name rather than
  discarded or mislabeled as a stand-in for Andalusi/Maghribi.

## Adding a new calligraphy family (runbook)

1. Verify the license (OFL/Apache-2.0/etc. that explicitly allows web
   embedding + redistribution).
2. Add `assets/fonts/calligraphy/<new-id>/<Font>.woff2` + its license
   file.
3. Add a row to `fonts/LICENSES.md`.
4. Audit the font: list its GSUB features for the `arab` script with
   `fontTools`, then confirm which ones actually change glyphs via
   `uharfbuzz` shaping diffs against the four acceptance phrases (see
   `fonts/LICENSES.md` "Audit methodology") — only genuine,
   glyph-diff-confirmed features get registered.
5. Add an entry (or flip `available` to `true`) in
   `CALLIGRAPHY_FAMILIES` in `calligraphy-data.js` with its real
   variations, using `FEATURE_LABELS` (extend it if a new feature tag
   shows up) for the `meta`/`metaEn` fields.
6. Rebuild: `cd build && python3 pages.py`.

No changes to `calligraphy-studio.js`, `calligraphy-init.js`, or
`pages.py` are required — the UI (family grid, variation gallery,
swatches, font loading, feature-settings) is entirely data-driven off
that array.

## Controls → state → render

`CalligraphyStudio` (in `calligraphy-studio.js`) owns a plain `state`
object (text, variationId, fontSize, colors, spacing, alignment, rtl,
tashkeel, kashida density, outline, shadow, decorative background) and
one `render()` method. `calligraphy-init.js` only translates DOM events
into `studio.set({...})` + a debounced `requestAnimationFrame` redraw —
it has no rendering logic of its own, so the engine can be reused
outside this page (e.g. from a future template gallery) without
duplicating drawing code.

Undo/redo is a simple text-snapshot stack (same pattern already used by
the existing editor in `keyboard-tool.js`), debounced on typing so
every keystroke doesn't create a new history entry.

## Mobile behavior

The `#callyStage` preview container has no `contenteditable` and isn't
wired to any virtual-keyboard-triggering input — only the real
`<textarea id="callyText">` accepts typed text, so the Android IME
appears exactly where expected (the text field) and never over the
artwork. Mobile layout uses the same source DOM order as desktop (text
→ preview → phrases → download → family selector → controls →
variation gallery); a `min-width:980px` media query in `styles.css`
switches to the two-column desktop layout without reordering markup.
The variation gallery itself is a horizontally-scrollable strip below
`640px` viewport width and a wrapping responsive grid above it (see
`.cally-variations` in `styles.css`), per the requirement that a large
variation set stay genuinely browsable on both form factors, not just
technically present.

## Known limitations (intentionally not hidden)

- Six requested calligraphy families have no available open-licensed
  font yet (see `fonts/LICENSES.md`).
- Kashida is implemented as literal tatweel (`ـ`) insertion between
  joining letters at a user-chosen density — a real, standard technique,
  but it does not (yet) do OpenType-aware justification/kashida
  distribution the way professional DTP software does.
- PDF export is a high-resolution embedded raster, not a fully vector
  PDF with real text objects — see the shaping trade-off above.
