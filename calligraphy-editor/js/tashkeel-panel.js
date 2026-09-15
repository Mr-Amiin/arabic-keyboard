// Phase 7, point 1 (rewritten in Phase 15): the "Tashkeel" floating
// panel. Opened from the tool dock's "تشكيل • Tashkeel" button.
//
// Phase 15 turned this from a single flat grid (always showing
// whichever one font the current selection/default happened to be
// using) into a real, style-organized calligraphic glyph library
// matching a reference tool's layout: one section per real registered
// calligraphic style (see tashkeel-library.js's STYLE_SECTIONS —
// الرقعة/الثلث/النسخ/الفارسي/الديواني, each backed by one of this
// project's own already-licensed font families, never an invented
// style), each showing a dense grid of that style's OWN real marks.
//
// Every visual glyph in every section still comes from the exact same
// real probe this panel always used (tashkeel-probe.js's
// probeMark/probeCombo — genuine HarfBuzz shaping against the dotted-
// circle placeholder, real cmap + post-shape glyph-ID checks, never a
// generic icon, never CSS-rotated/skewed/thickened). A style section
// simply runs that same probe once per its own real font instead of
// once for a single global font. Unsupported marks are still hidden
// behind a real, honest "غير متاح" reason — never swapped for another
// font's shape — and a style with zero genuinely supported marks in
// its own font is not rendered as an empty shelf.
//
// Clicking an available mark/combo still creates one real,
// independent vector scene object (via scene.addTashkeelMarkUndoable /
// addTashkeelComboUndoable) using the EXACT SAME path data the tile
// just previewed — never a re-derived or re-shaped copy — that is
// immediately selectable/movable/rotatable/scalable/duplicable/
// deletable, that Fine Edit can drill into individually, and that
// travels with its target patch in normal mode. If the glyph being
// clicked belongs to the same font the currently selected word is
// really set in, it attaches to that word exactly like before; if the
// user is just browsing a different style/font's library, it lands
// freestanding at canvas center (the same fallback this panel already
// used for "nothing selected"), since attaching a mark from a font the
// target patch isn't actually using would be exactly the kind of
// cross-font fake the whole architecture exists to avoid.

import * as scene from './scene.js';
import * as registry from './font-registry.js';
import { TASHKEEL_MARKS, TASHKEEL_COMBOS, STYLE_SECTIONS } from './tashkeel-library.js';
import { CALLIGRAPHIC_STYLE_SECTIONS } from './tashkeel-calligraphic-library.js';
import { probeMark, probeCombo } from './tashkeel-probe.js';
import { toast } from './toast.js';

// Phase 15 (library structure rebuild): a lookup from each calligraphic-
// library section's id to its Category-A (font-driven OpenType marks)
// counterpart in tashkeel-library.js's STYLE_SECTIONS — the two arrays
// share the same 5 ids (thuluth/naskh/diwani/nastaliq/ruqaa) but
// CALLIGRAPHIC_STYLE_SECTIONS now drives the panel's actual render
// order/labels (ثلث، نسخ، ديواني، فارسي، رقعة — matching the attached
// reference tool's own verified structure), while STYLE_SECTIONS itself
// is left completely untouched (its own order/labels still exist and
// are used nowhere directly anymore, since this file now sources
// heading text/order from CALLIGRAPHIC_STYLE_SECTIONS instead).
const FONT_SECTION_BY_ID = new Map(STYLE_SECTIONS.map((s) => [s.id, s]));

// Phase 10D: the real "is this genuinely supported" probes live in
// tashkeel-probe.js, shared with text-panel.js's font-switch reshape
// path — untouched by this rewrite.

const UNAVAILABLE_TITLE = {
  'glyph-missing': 'غير متاح — هذا الطراز لا يحتوي على هذه العلامة',
  'notdef-rejected': 'غير متاح — هذا الطراز لا يعرض علامة حقيقية لهذا الرمز',
  'probe-error': 'غير متاح — تعذّر التحقق من هذه العلامة',
};
const UNAVAILABLE_COMBO_TITLE = {
  'glyph-missing': 'غير متاح — هذا الطراز لا يجمع هاتين العلامتين',
  'notdef-rejected': 'غير متاح — هذا الطراز لا يعرض علامتين حقيقيتين لهذا التسلسل',
  'probe-error': 'غير متاح — تعذّر التحقق من هذا التسلسل',
};

// Phase 17: every remaining Layer-2 'unavailable' item carries a
// machine-readable `reason` (see tashkeel-calligraphic-library.js's
// header comment) that is NEVER surfaced verbatim -- these are the
// plain-Arabic explanations shown to ordinary users instead, per the
// exact wording the Phase 17 spec asked for.
const UNAVAILABLE_LIBRARY_REASON_TEXT = {
  'font-gap': 'هذا الشكل غير متوفر في الخطوط المعتمدة لهذا الأسلوب',
  'no-asset': 'لا يوجد شكل أصلي متاح لهذا الأسلوب',
  unidentified: 'لم يتم اعتماد شكل أصلي لهذا العنصر',
};
function unavailableLibraryReasonText(reason) {
  return UNAVAILABLE_LIBRARY_REASON_TEXT[reason] || UNAVAILABLE_LIBRARY_REASON_TEXT['no-asset'];
}

function codepointHex(str) {
  return Array.from(str).map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

// A Tashkeel mark's real font-design-unit path usually sits in one
// small corner of the full em-square (marks are drawn to hover near
// the top of a base letter, not to fill the em the way a full glyph
// does), so framing every preview with a fixed [-upem,upem] viewBox —
// the pre-Phase-15 behavior — rendered most marks as a barely-visible
// speck. This measures the path's OWN real bounding box the exact same
// way scene.js's measurePathBBox already does for real placement math
// (a real, momentarily-attached SVG <path>'s native getBBox() — not an
// approximation) and frames the preview tightly around it instead.
// This only changes how much of the SAME path is zoomed into for
// display; the path data shown and the path data inserted on click
// remain byte-for-byte identical (point 9).
let bboxProbeSvg = null;
function ensureBBoxProbe() {
  if (bboxProbeSvg && bboxProbeSvg.isConnected) return bboxProbeSvg;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'fixed';
  svg.style.left = '-99999px';
  svg.style.top = '0';
  document.body.appendChild(svg);
  bboxProbeSvg = svg;
  return svg;
}
function pathBBox(d) {
  if (!d) return null;
  const svg = ensureBBoxProbe();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  let box;
  try { box = path.getBBox(); } finally { svg.removeChild(path); }
  if (!box || (box.width === 0 && box.height === 0)) return null;
  return { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
}

// Every preview draws its path inside an inner <g transform="scale(1,-1)">
// (font design units are y-up; SVG is y-down), so content sitting at
// raw y in [minY,maxY] actually renders at y in [-maxY,-minY] — the
// viewBox has to be framed around THAT rendered range, not the raw one,
// or a tight crop would clip the very content it's trying to frame.
function viewBoxFor(bbox, upem) {
  if (!bbox) return `${-upem} ${-upem} ${upem * 2} ${upem * 2}`;
  const w = bbox.maxX - bbox.minX || upem * 0.2;
  const h = bbox.maxY - bbox.minY || upem * 0.2;
  const pad = Math.max(w, h) * 0.2;
  return `${bbox.minX - pad} ${-bbox.maxY - pad} ${w + pad * 2} ${h + pad * 2}`;
}

function unionBBox(boxes) {
  const real = boxes.filter(Boolean);
  if (!real.length) return null;
  return {
    minX: Math.min(...real.map((b) => b.minX)),
    minY: Math.min(...real.map((b) => b.minY)),
    maxX: Math.max(...real.map((b) => b.maxX)),
    maxY: Math.max(...real.map((b) => b.maxY)),
  };
}

function translateBBox(bbox, dx, dy) {
  if (!bbox) return null;
  return { minX: bbox.minX + dx, minY: bbox.minY + dy, maxX: bbox.maxX + dx, maxY: bbox.maxY + dy };
}

// Phase 15 Layer 2 (calligraphic glyph library): every available item's
// `d` is raw HarfBuzz output in y-up font-design units — exactly like
// every Category-A mark above, previewed here via the SAME scale(1,-1)
// + viewBoxFor() convention. scene.addTashkeelGlyphUndoable(), unlike
// addTashkeelMarkUndoable, stores its object as an ordinary y-down
// 'path' (see scene.js for why: so Group/Ungroup and other "is this a
// text-composition glyph" checks never mistake a freestanding library
// ornament for one) — so the same y-flip the preview already applies
// via its <g> wrapper must also apply to the inserted object. This is
// done via addTashkeelGlyphUndoable's `flipY` option (a negative
// scaleY — a flip this codebase's object model already documents and
// supports natively), NOT by negating y-coordinates in the `d` string
// by hand: an earlier version of this file did exactly that with a
// regex assuming whitespace-separated coordinate pairs, which silently
// corrupted real font path data using commas (e.g.
// "M354,1021Q379,1036 372,1011" — a genuine extracted mark path),
// visibly producing a doubled bounding box and an off-center insertion.
// The `d` passed to scene.addTashkeelGlyphUndoable below is therefore
// the item's real, untouched path exactly as HarfBuzz produced it.

// Resolves the currently-selected word's REAL font, if any, straight
// from its own patch/group metadata — the same lookup resolveFontContext
// used pre-Phase-15, just factored out so every style section can
// compare itself against it (to decide whether IT is "the active
// style" and whether a click should attach to that real word).
function resolveActivePatch() {
  const sel = scene.getSelection();
  if (!sel.length) return null;
  const first = scene.getObject(sel[0]);
  if (!first || !first.patchId) return null;
  const memberIds = scene.getPatchChildIds(first.patchId);
  const anchor = memberIds.map((id) => scene.getObject(id)).find((o) => o && o.groupId);
  const meta = anchor ? scene.getGroupMeta(anchor.groupId) : null;
  if (!meta) return null;
  return {
    targetPatchId: first.patchId,
    fill: first.fill || '#161616',
    fontSizePx: meta.fontSizePx || 220,
    familyId: meta.familyId,
    variationId: meta.variationId,
  };
}

function shapingContextFor(variation) {
  return {
    shapingUrl: registry.fontShapingUrl(variation.file),
    features: variation.features || [],
    weight: variation.weight || 400,
  };
}

export function createTashkeelPanel({ canvas, workspaceEl } = {}) {
  const root = document.createElement('div');
  root.id = 'tashkeel-panel';
  root.className = 'floating-panel panel-tashkeel';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">تشكيل • Tashkeel</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق لوحة التشكيل">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="library-chip-note" data-role="status">جارٍ التحقق من كل طراز…</div>
    <div class="tashkeel-sections" data-role="sections" hidden></div>
  `;
  document.getElementById('app').appendChild(root);

  const statusEl = root.querySelector('[data-role="status"]');
  const sectionsEl = root.querySelector('[data-role="sections"]');
  const closeBtn = root.querySelector('.text-panel-close');
  closeBtn.addEventListener('click', () => close());

  let loadToken = 0;
  // Per-section, per-open choice of which of that style's real
  // registered variations to preview/insert from (point 13: a style
  // may hold more than one real font — Ruq'ah has Aref Ruqaa + Aref
  // Ruqaa Ink, Thuluth has Tholoth + Layla). Reset on every open() so
  // a stale choice from a previous session never lingers (point 20).
  let chosenVariationId = {};

  function insertionTarget(section, variation, activePatch) {
    const matchesCanvas = !!activePatch && activePatch.familyId === section.familyId && activePatch.variationId === variation.id;
    return matchesCanvas
      ? { targetPatchId: activePatch.targetPatchId, fill: activePatch.fill, fontSizePx: activePatch.fontSizePx }
      : { targetPatchId: null, fill: undefined, fontSizePx: undefined };
  }

  function buildMarkChip(mark, probe, section, variation, activePatch) {
    const supported = probe.status === 'supported';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-chip' + (supported ? '' : ' chip-unavailable');
    btn.disabled = !supported;
    btn.dataset.tashkeelStyle = section.id;
    btn.dataset.tashkeelVariation = variation.id;
    btn.dataset.tashkeelMark = mark.id;
    btn.dataset.tashkeelSupport = probe.status;
    btn.dataset.tashkeelReason = probe.reason;
    if (supported) {
      btn.dataset.tashkeelGeometrySource = 'font';
      const vb = viewBoxFor(pathBBox(probe.path), probe.upem);
      btn.innerHTML = `<svg viewBox="${vb}"><g transform="scale(1,-1)"><path d="${probe.path}" fill="#161616"/></g></svg>`;
      btn.title = `${mark.labelAr} • ${mark.labelEn}\n${codepointHex(mark.char)}\n${section.label} — ${variation.label}`;
      btn.addEventListener('click', () => {
        const target = insertionTarget(section, variation, activePatch);
        scene.addTashkeelMarkUndoable({
          path: probe.path,
          upem: probe.upem,
          ...(target.fontSizePx != null ? { fontSizePx: target.fontSizePx } : {}),
          ...(target.fill != null ? { fill: target.fill } : {}),
          targetPatchId: target.targetPatchId,
          markChar: mark.char,
        });
        if (!target.targetPatchId) toast('تمت إضافة العلامة — لم يتم اختيار كلمة، وُضعت في منتصف اللوحة');
        close();
      });
    } else {
      btn.title = `${mark.labelAr} • ${mark.labelEn}\n${UNAVAILABLE_TITLE[probe.reason] || UNAVAILABLE_TITLE['glyph-missing']}\n${section.label} — ${variation.label}`;
    }
    return btn;
  }

  function buildComboChip(combo, probe, section, variation, activePatch) {
    const supported = probe.status === 'supported';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-chip' + (supported ? '' : ' chip-unavailable');
    btn.disabled = !supported;
    btn.dataset.tashkeelStyle = section.id;
    btn.dataset.tashkeelVariation = variation.id;
    btn.dataset.tashkeelCombo = combo.id;
    btn.dataset.tashkeelSupport = supported ? 'combo-supported' : 'combo-unavailable';
    btn.dataset.tashkeelReason = probe.reason;
    if (supported) {
      btn.dataset.tashkeelGeometrySource = 'font';
      btn.dataset.tashkeelPositioningSource = probe.positioningSource;
      // Apply each member's real xOffset/yOffset in the preview too (the
      // same relative placement scene.js's real insertion uses), and
      // frame the crop around the union of all members' translated
      // bboxes — matching point 9: the preview must show the same
      // geometry that lands on the canvas, not each glyph re-centered
      // on its own as if it were alone.
      const memberBoxes = probe.glyphs.map((g) => translateBBox(pathBBox(g.path), g.xOffset || 0, g.yOffset || 0));
      const vb = viewBoxFor(unionBBox(memberBoxes), probe.upem);
      const paths = probe.glyphs.map((g) => `<g transform="translate(${g.xOffset || 0},${g.yOffset || 0})"><path d="${g.path}" fill="#161616"/></g>`).join('');
      btn.innerHTML = `<svg viewBox="${vb}"><g transform="scale(1,-1)">${paths}</g></svg>`;
      btn.title = `${combo.labelAr} • ${combo.labelEn}\n${section.label} — ${variation.label}`
        + (probe.positioningSource === 'editor' ? '\n(تموضع محرر التحرير — لا يحتوي هذا الطراز على بيانات GPOS للتموضع المتبادل)' : '');
      btn.addEventListener('click', () => {
        const target = insertionTarget(section, variation, activePatch);
        scene.addTashkeelComboUndoable({
          members: probe.glyphs.map((g) => ({ path: g.path, upem: probe.upem, xOffset: g.xOffset, yOffset: g.yOffset })),
          ...(target.fontSizePx != null ? { fontSizePx: target.fontSizePx } : {}),
          ...(target.fill != null ? { fill: target.fill } : {}),
          targetPatchId: target.targetPatchId,
          comboChars: combo.chars,
          positioningSource: probe.positioningSource,
        });
        if (!target.targetPatchId) toast('تمت إضافة العلامة المركّبة — لم يتم اختيار كلمة، وُضعت في منتصف اللوحة');
        close();
      });
    } else {
      btn.title = `${combo.labelAr} • ${combo.labelEn}\n${UNAVAILABLE_COMBO_TITLE[probe.reason] || UNAVAILABLE_COMBO_TITLE['glyph-missing']}\n${section.label} — ${variation.label}`;
    }
    return btn;
  }

  // Phase 15 Layer 2: one dense, chrome-less, two-column cell for a
  // calligraphic-library item. Deliberately NOT built from
  // .library-chip (that class's white card/border/padding is exactly
  // the "generic icon picker" look the reference does not use) — this
  // reuses only the same real-geometry-preview technique (pathBBox +
  // viewBoxFor + scale(1,-1), the identical convention every Category-A
  // mark tile already uses above), with its own flat, glyph-first,
  // thin-row-separator markup matching the reference's own density.
  function buildCalligraphicChip(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tashkeelLibraryItem = item.id;
    btn.dataset.tashkeelStyle = item.styleId;
    if (!item.available) {
      // Phase 17 (unavailable-state UX polish): the slot's POSITION must
      // stay in the grid (density/order/count has to keep matching the
      // reference exactly), so this is never omitted -- but it must also
      // never look like a real glyph or a broken control. Deliberately
      // NOT `btn.disabled = true`: a truly disabled button is removed
      // from the tab order entirely, so a keyboard/screen-reader user
      // would never discover this slot exists or why it's unavailable.
      // Instead this stays a normal, focusable button (native tabIndex
      // 0) marked aria-disabled, with no click/keydown side effect
      // attached below -- so it is honestly "reachable but inert": Tab
      // finds it, a screen reader announces it, Enter/Space/click do
      // nothing (point 10's "keyboard reachable if appropriate" +
      // point 9's "non-clickable").
      btn.className = 'tashkeel-calligraphic-chip unavailable';
      btn.setAttribute('aria-disabled', 'true');
      const reasonText = unavailableLibraryReasonText(item.reason);
      btn.dataset.tashkeelUnavailableReason = item.reason || 'no-asset';
      btn.setAttribute('aria-label', `غير متاح. ${reasonText}`);
      btn.title = `غير متاح\n${reasonText}`;
      // Small lock glyph + tiny caption -- a "reserved, unavailable"
      // indicator, deliberately smaller/quieter than a real item's 46px
      // preview (point 5's "real glyph > unavailable indicator"), never
      // a fake calligraphic silhouette standing in for the reference item.
      btn.innerHTML = `
        <span class="tashkeel-calligraphic-unavailable-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 17.2a1.9 1.9 0 100-3.8 1.9 1.9 0 000 3.8zM17.5 9.8h-.8V7.6a4.7 4.7 0 00-9.4 0v2.2h-.8A1.7 1.7 0 004.8 11.5v8.1A1.7 1.7 0 006.5 21.3h11A1.7 1.7 0 0019.2 19.6v-8.1a1.7 1.7 0 00-1.7-1.7zM8.9 7.6a3.1 3.1 0 016.2 0v2.2H8.9z"/></svg>
        </span>
        <span class="tashkeel-calligraphic-unavailable-label" aria-hidden="true">غير متاح</span>
      `;
      return btn;
    }
    btn.className = 'tashkeel-calligraphic-chip';
    const vb = viewBoxFor(pathBBox(item.d), item.upem);
    btn.innerHTML = `<svg viewBox="${vb}"><g transform="scale(1,-1)"><path d="${item.d}" fill="#161616"/></g></svg>`;
    btn.dataset.tashkeelGeometrySource = item.type;
    // Phase 19 added two more real (non-font-derived) provenance kinds:
    // 'licensed-asset' (a real third-party icon under a permissive
    // license, e.g. Material Icons) and 'original-artwork' (plain
    // in-house geometry, documented as such -- never claimed to be a
    // font mark). Each gets its own honest detail line rather than
    // being folded into the font-mark case, which would misdescribe it
    // as "a genuine font mark" when it is neither a font glyph nor mark.
    let detail;
    if (item.type === 'font-glyph') {
      detail = `حرف حقيقي: ${item.letter} (${codepointHex(item.letter)})`;
    } else if (item.type === 'licensed-asset') {
      detail = `عنصر مرخص: ${item.provenance ? item.provenance.source : item.source}`;
    } else if (item.type === 'original-artwork') {
      detail = 'رسم أصلي لهذا المشروع';
    } else {
      detail = `علامة حقيقية: ${item.markLabel}`;
    }
    // Phase 26 (visual/interaction audit) already found that leaving the
    // accessible name to fall back to `title` leaks internal debugging
    // text (the raw item id and the machine-readable `source` slug, e.g.
    // "font-mark:thuluth/thuluth-tholoth/fatha") into what gets
    // announced -- fixed there by giving this button its own explicit
    // aria-label (`detail`, the clean human-meaningful line) below.
    // Phase 32 (reference-name cleanup) went one step further: the raw
    // `item.source` slug for a handful of items also happens to name the
    // internal reference tool this library's structure/provenance is
    // documented against (see this file's own header comment and
    // tashkeel-calligraphic-library.js's), and that slug was still being
    // shown to every user as this button's hover tooltip even after the
    // aria-label fix. It carried no information a user needs -- `detail`
    // already gives a clean, honest one-line description of what the
    // item is -- so the tooltip now shows only the id and that
    // description, never the internal source slug.
    btn.title = `${item.id}\n${detail}`;
    btn.setAttribute('aria-label', detail);
    btn.addEventListener('click', () => {
      const rect = workspaceEl.getBoundingClientRect();
      const { camera } = canvas;
      const x = (rect.width / 2 - camera.x) / camera.scale;
      const y = (rect.height / 2 - camera.y) / camera.scale;
      // Phase 19: the two-dot/three-dot compound items carry `pieces`
      // (several copies of one verified primitive) instead of a single
      // `d` -- these insert as one grouped construction via
      // addTashkeelCompoundUndoable so the whole item behaves as ONE
      // Tashkeel library item (one click, one undo step, one selectable
      // group) while still being made of real, individually-editable
      // vector pieces underneath. Every other item (single font-glyph/
      // font-mark/licensed-asset/original-artwork geometry) keeps the
      // existing single-path insertion unchanged.
      if (item.pieces) {
        scene.addTashkeelCompoundUndoable({
          pieces: item.pieces, x, y, targetSize: 90,
          tashkeelItemId: item.id, tashkeelStyleId: item.styleId, tashkeelSource: item.source,
        });
      } else {
        scene.addTashkeelGlyphUndoable({
          d: item.d, flipY: true, x, y, targetSize: 90, fill: '#161616',
          tashkeelItemId: item.id, tashkeelStyleId: item.styleId, tashkeelSource: item.source,
        });
      }
      toast('تمت إضافة العنصر — وُضع في منتصف اللوحة');
      close();
    });
    return btn;
  }

  function buildCalligraphicGrid(calligraphicSection) {
    const grid = document.createElement('div');
    grid.className = 'tashkeel-calligraphic-grid';
    grid.dataset.role = 'calligraphic-grid';
    for (const item of calligraphicSection.items) grid.appendChild(buildCalligraphicChip(item));
    return grid;
  }

  // Layer 1 (existing, untouched font-driven OpenType marks + combos)
  // for one style — returns null when this style's own family/font
  // registration can't support it, exactly as before Phase 15's
  // structure rebuild; Layer 2 above renders regardless, since
  // its content never depends on live font probing.
  async function buildFontMarksLayer(section, activePatch) {
    const family = registry.getFamily(section.familyId);
    if (!family || !family.available || !family.variations || !family.variations.length) return null;

    const isActiveStyle = !!activePatch && activePatch.familyId === section.familyId;
    const requestedId = chosenVariationId[section.id] || (isActiveStyle ? activePatch.variationId : null) || family.variations[0].id;
    const found = registry.findVariation(requestedId);
    const variation = (found && found.family.id === family.id) ? found.variation : family.variations[0];
    chosenVariationId[section.id] = variation.id;

    const ctx = shapingContextFor(variation);
    const [markResults, comboResults] = await Promise.all([
      Promise.all(TASHKEEL_MARKS.map(async (mark) => ({ mark, probe: await probeMark(ctx, mark.char) }))),
      Promise.all(TASHKEEL_COMBOS.map(async (combo) => ({ combo, probe: await probeCombo(ctx, combo.chars) }))),
    ]);

    const anyMarkSupported = markResults.some((r) => r.probe.status === 'supported');
    if (!anyMarkSupported) return null;

    const wrap = document.createElement('div');
    wrap.className = 'tashkeel-font-marks-layer';

    const label = document.createElement('label');
    label.className = 'text-panel-label library-section-label';
    label.textContent = 'علامات الخط الحقيقية (OpenType) • Font marks';
    wrap.appendChild(label);

    // Real font-variation identity for this section: a small secondary
    // label naming the one real font in use, or — only when this style
    // genuinely holds more than one DISTINCT real font — a compact
    // picker of exactly those fonts. "Distinct" means a different real
    // font FILE, not a different catalog entry: a variable font like
    // Noto Naskh lists four weights (400/500/600/700) that all share
    // one file (a runtime axis, not a different design), while Mirza's
    // four weights really are four separate static font files — this
    // keeps the picker to one chip per genuinely different font (Amiri,
    // Scheherazade, Lateef, Noto Naskh, ... for Naskh; Tholoth, Layla
    // for Thuluth) rather than listing every weight/feature permutation
    // already reachable from the main font/variation picker.
    const seenFiles = new Set();
    const pickable = [];
    for (const v of family.variations) {
      if (v.features && v.features.length) continue; // stylistic-set/cv previews stay in the main picker
      if (seenFiles.has(v.file)) continue;
      seenFiles.add(v.file);
      pickable.push(v);
    }
    if (!pickable.length) pickable.push(family.variations[0]);
    const subrow = document.createElement('div');
    if (pickable.length > 1) {
      subrow.className = 'tashkeel-variation-picker';
      for (const v of pickable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tashkeel-variation-chip' + (v.id === variation.id ? ' active' : '');
        btn.textContent = v.label;
        btn.addEventListener('click', () => {
          chosenVariationId[section.id] = v.id;
          renderAll();
        });
        subrow.appendChild(btn);
      }
    } else {
      subrow.className = 'tashkeel-style-subvariation';
      subrow.textContent = variation.label;
    }
    wrap.appendChild(subrow);

    const grid = document.createElement('div');
    grid.className = 'library-grid tashkeel-style-grid';
    for (const { mark, probe } of markResults) grid.appendChild(buildMarkChip(mark, probe, section, variation, activePatch));
    wrap.appendChild(grid);

    const anyComboSupported = comboResults.some((r) => r.probe.status === 'supported');
    if (anyComboSupported) {
      const comboLabel = document.createElement('label');
      comboLabel.className = 'text-panel-label library-section-label';
      comboLabel.textContent = 'تشكيل مركّب • Combined marks';
      wrap.appendChild(comboLabel);
      const comboGrid = document.createElement('div');
      comboGrid.className = 'library-grid tashkeel-style-grid';
      comboGrid.dataset.role = 'combos-grid';
      for (const { combo, probe } of comboResults) comboGrid.appendChild(buildComboChip(combo, probe, section, variation, activePatch));
      wrap.appendChild(comboGrid);
    }

    return wrap;
  }

  // Phase 15 (library structure rebuild): the outer per-style-section
  // orchestrator, one call per CALLIGRAPHIC_STYLE_SECTIONS entry (the
  // master ordered list now — ثلث/نسخ/ديواني/فارسي/رقعة — matching the
  // reference tool's own verified section order). Always builds a
  // section (Layer 2 never depends on live font probing, so unlike the
  // pre-rebuild version a style is never hidden entirely): a centered
  // heading reusing the pre-rebuild .tashkeel-style-heading rule-line
  // styling (already matches both reference-tool requirements' "centered
  // heading with horizontal rule lines on both sides, production-safe
  // typography" requirement — no reference artwork/branding involved),
  // the dense Layer-2 calligraphic grid, and — appended beneath it,
  // visually secondary via its own smaller label — the existing Layer-1
  // font-marks block, but ONLY when this style's own real font
  // registration genuinely supports at least one real OpenType mark
  // (exactly the same gate buildFontMarksLayer already applied before
  // this rewrite).
  async function buildStyleSection(calligraphicSection, activePatch) {
    const wrap = document.createElement('div');
    wrap.className = 'tashkeel-style-section';
    wrap.dataset.styleId = calligraphicSection.id;

    const heading = document.createElement('div');
    heading.className = 'tashkeel-style-heading';
    heading.innerHTML = `<span>${calligraphicSection.label}</span>`;
    wrap.appendChild(heading);

    wrap.appendChild(buildCalligraphicGrid(calligraphicSection));

    const fontSection = FONT_SECTION_BY_ID.get(calligraphicSection.id);
    if (fontSection) {
      const layer1 = await buildFontMarksLayer(fontSection, activePatch);
      if (layer1) wrap.appendChild(layer1);
    }

    return wrap;
  }

  async function renderAll() {
    const myToken = ++loadToken;
    const activePatch = resolveActivePatch();
    const built = await Promise.all(CALLIGRAPHIC_STYLE_SECTIONS.map((s) => buildStyleSection(s, activePatch)));
    if (myToken !== loadToken) return; // a newer renderAll() superseded this one

    // Layer 2 (the dense calligraphic library) always has content for
    // all 5 sections regardless of live font-probing, so — unlike the
    // pre-rebuild version, which could show an empty "no styles
    // registered" shelf — renderAll() never produces zero sections here.
    sectionsEl.innerHTML = '';
    for (const el of built) sectionsEl.appendChild(el);
    statusEl.hidden = true;
    sectionsEl.hidden = false;
  }

  function open() {
    root.hidden = false;
    chosenVariationId = {};
    statusEl.hidden = false;
    statusEl.textContent = 'جارٍ التحقق من كل طراز…';
    sectionsEl.hidden = true;
    sectionsEl.innerHTML = '';
    renderAll();
  }
  function close() {
    root.hidden = true;
  }

  return { open, close, isOpen: () => !root.hidden };
}
