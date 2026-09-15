// Phase 7 critical addendum, point 9 (hardened in Phase 10D): generates
// a REAL, machine-readable Tashkeel capability audit by actually
// shaping every single mark and every combo through the real HarfBuzz
// pipeline, against EVERY available font variation in the registry --
// not asserted, not guessed.
//
// This is a checked-in, re-run-whenever-fonts-change QA/documentation
// artifact, NOT the editor's live source of truth -- the Tashkeel
// panel itself (tashkeel-panel.js) always re-probes live against
// whichever font a patch is ACTUALLY using at click time, through the
// exact same shared tashkeel-probe.js this generator now also calls,
// which stays the more honest, always-current mechanism. This audit
// exists so a human (or a test) can see every font's real support at a
// glance without opening the app, per spec point 9.
//
// Phase 10D hardened what "genuinely supported" means: Phase 10C's
// Layla Thuluth audit found that a font with no GPOS table at all
// makes HarfBuzz zero the advance width of ANY combining-mark
// codepoint, even when it actually resolved to glyph ID 0 (.notdef) --
// so `xAdvance === 0` alone is not sufficient proof. tashkeel-probe.js
// now checks the real post-shaping glyph ID and the font's own real
// cmap coverage, and categorizes every unavailable mark/combo as
// exactly one of `glyph-missing` (codepoint not in this font's cmap at
// all) or `notdef-rejected` (cmap lists it, but shaping still resolved
// to .notdef) rather than a single undifferentiated `false`. It also
// reports, for every genuinely-supported combo, whether its members'
// relative placement should trust the font's own real mark-to-mark
// (mkmk) GPOS data (`positioningSource: 'gpos'`) or must fall back to
// the editor's own generic bounding-box stacking because the font has
// none (`positioningSource: 'editor'`) -- see scene.js's
// placeComboMembers.
//
// Usage: start the dev server (`node server.js` from the project
// root) on port 8080, then from this file's directory:
//   node generate-tashkeel-audit.js
// Rewrites ../../assets/tashkeel-font-audit.json. Run this again
// whenever a font file, feature list, or the Tashkeel mark/combo list
// changes -- WASM HarfBuzz only runs in a real browser, so this must
// be run (not hand-edited) to stay truthful.
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('http://localhost:8080/calligraphy-editor/', { waitUntil: 'networkidle' });

  const audit = await page.evaluate(async () => {
    const registry = await import('./js/font-registry.js');
    const lib = await import('./js/tashkeel-library.js');
    const probe = await import('./js/tashkeel-probe.js');

    const perVariation = [];
    for (const family of registry.getFamilies()) {
      if (!family.available) continue;
      for (const variation of family.variations) {
        const shapingUrl = registry.fontShapingUrl(variation.file);
        const features = variation.features || [];
        const weight = variation.weight || 400;
        const ctx = { shapingUrl, features, weight };

        const tashkeel = {};
        const tashkeelReason = {};
        for (const mark of lib.TASHKEEL_MARKS) {
          const result = await probe.probeMark(ctx, mark.char);
          tashkeel[mark.id] = result.status === 'supported';
          tashkeelReason[mark.id] = result.reason;
        }
        const combos = {};
        const comboReason = {};
        const comboPositioning = {};
        for (const combo of lib.TASHKEEL_COMBOS) {
          const result = await probe.probeCombo(ctx, combo.chars);
          combos[combo.id] = result.status === 'supported';
          comboReason[combo.id] = result.reason;
          comboPositioning[combo.id] = result.status === 'supported' ? result.positioningSource : null;
        }
        const markPositioning = Object.values(tashkeel).some(Boolean);
        const markToMark = Object.values(combos).some(Boolean);

        perVariation.push({
          familyId: family.id,
          familyLabel: family.labelEn || family.label || family.id,
          variationId: variation.id,
          label: variation.label,
          file: variation.file,
          weight,
          features,
          tashkeel,
          tashkeelReason,
          combos,
          comboReason,
          comboPositioning,
          markPositioning,
          markToMark,
        });
      }
    }
    return perVariation;
  });

  const output = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'calligraphy-editor/tools/generate-tashkeel-audit.js — real HarfBuzz probe via the shared tashkeel-probe.js, not asserted',
    method: "Each mark/combo is shaped as DOTTED_CIRCLE+char(s) through the real WASM HarfBuzz pipeline (js/glyph-shaper.js), via the SAME hardened probe (js/tashkeel-probe.js) the live Tashkeel panel and font-switch reshape flow both use, against the exact font file/features/weight the editor itself uses for that variation. tashkeel[id]/combos[id]=true means the font genuinely produced a real (non-.notdef) glyph, never inferred from advance width alone. tashkeelReason[id]/comboReason[id] is exactly one of: 'glyph-supported' (a real glyph exists), 'glyph-missing' (the codepoint has no mapping in this font's own cmap at all), 'notdef-rejected' (the codepoint IS mapped, but the font's shaped output for it still resolved to glyph ID 0/.notdef), or 'probe-error'. comboPositioning[id] is 'gpos' when the combo's relative mark placement trusts the font's own real mark-to-mark (mkmk) GPOS data, or 'editor' when the font has no such data and the editor's own generic bounding-box stacking (scene.js's placeComboMembers) computes the placement instead — never null for a combo[id]===true entry.",
    variationCount: audit.length,
    perVariation: audit,
  };

  const outPath = path.join(__dirname, '..', '..', 'assets', 'tashkeel-font-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote audit for ${audit.length} variations to ${outPath}`);
  console.log(`Console errors during generation: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log(consoleErrors.slice(0, 10));

  await browser.close();
})();
