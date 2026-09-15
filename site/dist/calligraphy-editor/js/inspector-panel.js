// The compact floating inspector: fill, stroke, opacity, flip,
// duplicate, lock, delete — for whatever is currently selected.
// Appears only when selection is non-empty (no permanent sidebar).
// Multi-selection is supported: changing a value applies to every
// unlocked selected object ("apply to selection").
//
// Phase 4: drawing objects (rect/ellipse/triangle/diamond/line/arrow/
// path) additionally have a stroke color + stroke width, which glyphs
// and calligraphic patches don't have at all. Rather than a fixed set
// of controls, the panel asks scene.js what kind of thing is selected
// (scene.selectionKind()) and shows only the rows that apply:
//   - glyph/patch selection: fill + opacity + flip/dup/lock/delete
//     (unchanged from Phase 3).
//   - line/arrow: stroke (their only visible color — they have no
//     fill) + stroke width + opacity + flip/dup/lock/delete.
//   - other drawing objects: fill + stroke + stroke width + opacity +
//     flip/dup/lock/delete.
//   - mixed selection (a patch AND a shape together): the common
//     denominator only (opacity + flip/dup/lock/delete) so no control
//     silently no-ops on part of the selection.
//
// Phase 5 adds, ALL conditionally shown by the exact same real-field
// test rather than a hardcoded type list:
//   - stroke cap/join, alongside stroke color/width, for any object
//     that actually has those fields (drawing objects only — a
//     font-derived filled glyph outline has no stroke geometry at all
//     to give a cap or join to, so the controls are simply absent for
//     a patch/glyph selection, never shown-but-fake).
//   - Spacing/Baseline, shown only for a COHERENT WHOLE patch
//     selection (every member of one calligraphic patch, nothing
//     more/less) — adjusts inter-glyph gaps and vertical placement
//     without ever touching the glyphs' own HarfBuzz-shaped outlines.
//   - Edit Path, shown only inside Fine Edit with exactly one glyph
//     selected — enters/exits real anchor/Bézier point editing.
//   - Change Font / Variation, shown for a coherent whole patch —
//     re-shapes that patch's whole composition with a different font.

import * as scene from './scene.js';
import { toast } from './toast.js';
import { shapeText } from './glyph-shaper.js';

export function wireInspector({ panelEl, onOpenChangeFont }) {
  const fillRow = panelEl.querySelector('#inspector-fill-row');
  const fillLabel = panelEl.querySelector('#inspector-fill-label');
  const colorInput = panelEl.querySelector('#inspector-color');
  const hexInput = panelEl.querySelector('#inspector-hex');

  const strokeRow = panelEl.querySelector('#inspector-stroke-row');
  const strokeLabel = panelEl.querySelector('#inspector-stroke-label');
  const strokeColorInput = panelEl.querySelector('#inspector-stroke-color');
  const strokeHexInput = panelEl.querySelector('#inspector-stroke-hex');

  const strokeWidthRow = panelEl.querySelector('#inspector-stroke-width-row');
  const strokeWidthInput = panelEl.querySelector('#inspector-stroke-width');
  const strokeWidthValue = panelEl.querySelector('#inspector-stroke-width-value');

  const strokeStyleRow = panelEl.querySelector('#inspector-stroke-style-row');
  const strokeCapInput = panelEl.querySelector('#inspector-stroke-cap');
  const strokeJoinInput = panelEl.querySelector('#inspector-stroke-join');

  const opacityInput = panelEl.querySelector('#inspector-opacity');
  const opacityValue = panelEl.querySelector('#inspector-opacity-value');

  const compositionRow = panelEl.querySelector('#inspector-composition-row');
  const spacingInput = panelEl.querySelector('#inspector-patch-spacing');
  const spacingValueEl = panelEl.querySelector('#inspector-patch-spacing-value');
  const baselineRow = panelEl.querySelector('#inspector-baseline-row');
  const baselineInput = panelEl.querySelector('#inspector-patch-baseline');
  const baselineValueEl = panelEl.querySelector('#inspector-patch-baseline-value');

  const editPathRow = panelEl.querySelector('#inspector-editpath-row');
  const editPathBtn = panelEl.querySelector('#inspector-edit-path');
  const changeFontRow = panelEl.querySelector('#inspector-changefont-row');
  const changeFontBtn = panelEl.querySelector('#inspector-change-font');
  const extendRow = panelEl.querySelector('#inspector-extend-row');
  const extendBtn = panelEl.querySelector('#inspector-extend');

  const flipHBtn = panelEl.querySelector('#inspector-flip-h');
  const flipVBtn = panelEl.querySelector('#inspector-flip-v');
  const duplicateBtn = panelEl.querySelector('#inspector-duplicate');
  const lockBtn = panelEl.querySelector('#inspector-lock');
  const deleteBtn = panelEl.querySelector('#inspector-delete');

  let syncing = false;

  // Which whole patch (if any) the composition controls are currently
  // keyed to, and the layout they measure changes FROM. Recaptured
  // fresh every time refresh() runs and neither slider is mid-drag, so
  // "Spacing"/"Baseline" always read 100%/0px right after any other
  // edit — each adjustment is relative to how the patch looks right
  // now, not to some stale reference from before an unrelated move.
  let compositionPatchId = null;
  let compositionBase = null;
  let spacingDragging = false;
  let baselineDragging = false;

  function wholePatchId(ids) {
    if (!ids.length) return null;
    const pid = scene.getObject(ids[0])?.patchId;
    if (!pid) return null;
    if (!ids.every((id) => scene.getObject(id)?.patchId === pid)) return null;
    return scene.getPatchChildIds(pid).length === ids.length ? pid : null;
  }

  function refresh() {
    const ids = scene.getSelection();
    if (!ids.length) {
      panelEl.hidden = true;
      return;
    }
    panelEl.hidden = false;

    const first = scene.getObject(ids[0]);
    const kind = scene.selectionKind(); // 'glyph' | 'drawing' | 'mixed'
    const strokeOnly = kind === 'drawing' && scene.selectionIsStrokeOnly();

    // Fill: hidden only for a pure line/arrow selection, where fill
    // isn't rendered at all and the control would silently do nothing.
    fillRow.hidden = strokeOnly;
    if (!strokeOnly) {
      fillLabel.textContent = kind === 'drawing' ? 'Fill' : 'Color';
    }

    // Stroke: only drawing objects have a stroke field.
    const showStroke = kind === 'drawing';
    strokeRow.hidden = !showStroke;
    strokeWidthRow.hidden = !showStroke;
    strokeStyleRow.hidden = !showStroke;
    if (showStroke) strokeLabel.textContent = strokeOnly ? 'Color' : 'Stroke';

    syncing = true;
    if (!strokeOnly) {
      colorInput.value = first.fill && first.fill !== 'none' ? first.fill : '#161616';
      hexInput.value = colorInput.value;
    }
    if (showStroke) {
      strokeColorInput.value = first.stroke && first.stroke !== 'none' ? first.stroke : '#161616';
      strokeHexInput.value = strokeColorInput.value;
      strokeWidthInput.value = String(Math.round(first.strokeWidth ?? 3));
      strokeWidthValue.textContent = `${strokeWidthInput.value}px`;
      strokeCapInput.value = first.strokeCap || 'round';
      strokeJoinInput.value = first.strokeJoin || 'miter';
    }
    opacityInput.value = String(Math.round(first.opacity * 100));
    opacityValue.textContent = `${Math.round(first.opacity * 100)}%`;

    // Fine Edit / Edit Path (Phase 5).
    const fineEditPatchId = scene.getFineEditPatchId();
    const pathEditId = scene.getPathEditId();
    const singleGlyphInFineEdit = fineEditPatchId && ids.length === 1 && first.type === 'glyph';
    editPathRow.hidden = !singleGlyphInFineEdit;
    if (singleGlyphInFineEdit) {
      const active = pathEditId === ids[0];
      editPathBtn.textContent = active ? 'Exit Path Edit' : 'Edit Path';
      editPathBtn.classList.toggle('active', active);
    }

    // Composition controls + Change Font (Phase 5) — only for a
    // coherent WHOLE patch selection (glyphs only, not a drawing
    // object, and not while drilled into Fine Edit on that same patch,
    // since Fine Edit's whole point is per-glyph work).
    const patchId = !fineEditPatchId && kind === 'glyph' ? wholePatchId(ids) : null;
    compositionRow.hidden = !patchId;
    baselineRow.hidden = !patchId;
    changeFontRow.hidden = !patchId;
    // Phase 7, point 12: "Extend" (genuine kashida/tatweel extension) —
    // shown only where there's even a structural internal join to
    // extend (scene.canExtendPatch is a cheap sync check); whether the
    // CURRENT font's real glyph table actually supports it is only
    // knowable by really shaping it, which extendBtn's click handler
    // does on demand rather than probing every patch on every refresh.
    extendRow.hidden = !patchId || !scene.canExtendPatch(patchId);
    if (!extendRow.hidden) { extendBtn.disabled = false; extendBtn.textContent = 'Extend'; }
    if (patchId) {
      if (patchId !== compositionPatchId || (!spacingDragging && !baselineDragging)) {
        compositionPatchId = patchId;
        compositionBase = scene.getPatchLayoutSnapshot(patchId);
        spacingInput.value = '100';
        spacingValueEl.textContent = '100%';
        baselineInput.value = '0';
        baselineValueEl.textContent = '0px';
      }
    } else {
      compositionPatchId = null;
      compositionBase = null;
    }
    syncing = false;

    const allLocked = ids.every((id) => scene.getObject(id)?.locked);
    lockBtn.classList.toggle('active', allLocked);
    lockBtn.title = allLocked ? 'Unlock' : 'Lock';

    const hasUnlocked = scene.getUnlockedSelection().length > 0;
    [colorInput, hexInput, strokeColorInput, strokeHexInput, strokeWidthInput, strokeCapInput, strokeJoinInput, opacityInput, spacingInput, baselineInput, flipHBtn, flipVBtn, duplicateBtn, deleteBtn].forEach((el) => {
      el.disabled = !hasUnlocked;
    });
  }

  colorInput.addEventListener('input', () => {
    if (syncing) return;
    hexInput.value = colorInput.value;
    scene.setFillForSelection(colorInput.value);
  });
  hexInput.addEventListener('change', () => {
    if (syncing) return;
    if (!isValidHex(hexInput.value)) { toast('Not a valid hex color'); hexInput.value = colorInput.value; return; }
    colorInput.value = normalizeHex(hexInput.value);
    scene.setFillForSelection(colorInput.value);
  });

  strokeColorInput.addEventListener('input', () => {
    if (syncing) return;
    strokeHexInput.value = strokeColorInput.value;
    scene.setStrokeForSelection(strokeColorInput.value);
  });
  strokeHexInput.addEventListener('change', () => {
    if (syncing) return;
    if (!isValidHex(strokeHexInput.value)) { toast('Not a valid hex color'); strokeHexInput.value = strokeColorInput.value; return; }
    strokeColorInput.value = normalizeHex(strokeHexInput.value);
    scene.setStrokeForSelection(strokeColorInput.value);
  });

  strokeWidthInput.addEventListener('input', () => {
    if (syncing) return;
    strokeWidthValue.textContent = `${strokeWidthInput.value}px`;
    scene.setStrokeWidthForSelection(Number(strokeWidthInput.value));
  });
  strokeCapInput.addEventListener('change', () => {
    if (syncing) return;
    scene.setStrokeCapForSelection(strokeCapInput.value);
  });
  strokeJoinInput.addEventListener('change', () => {
    if (syncing) return;
    scene.setStrokeJoinForSelection(strokeJoinInput.value);
  });

  opacityInput.addEventListener('input', () => {
    if (syncing) return;
    const v = Number(opacityInput.value) / 100;
    opacityValue.textContent = `${opacityInput.value}%`;
    scene.setOpacityForSelection(v);
  });

  spacingInput.addEventListener('pointerdown', () => { spacingDragging = true; });
  spacingInput.addEventListener('input', () => {
    if (syncing || !compositionBase) return;
    spacingValueEl.textContent = `${spacingInput.value}%`;
    scene.applyPatchSpacingLive(compositionBase, Number(spacingInput.value) / 100);
  });
  spacingInput.addEventListener('change', () => {
    if (!compositionBase) return;
    scene.commitPatchLayout(compositionBase);
    spacingDragging = false;
  });

  baselineInput.addEventListener('pointerdown', () => { baselineDragging = true; });
  baselineInput.addEventListener('input', () => {
    if (syncing || !compositionBase) return;
    baselineValueEl.textContent = `${baselineInput.value}px`;
    scene.applyPatchBaselineLive(compositionBase, Number(baselineInput.value));
  });
  baselineInput.addEventListener('change', () => {
    if (!compositionBase) return;
    scene.commitPatchLayout(compositionBase);
    baselineDragging = false;
  });

  editPathBtn.addEventListener('click', () => {
    const ids = scene.getSelection();
    if (scene.getPathEditId() === ids[0]) scene.exitPathEdit();
    else if (ids.length === 1) scene.enterPathEdit(ids[0]);
  });

  changeFontBtn.addEventListener('click', () => {
    const ids = scene.getSelection();
    const groupId = ids.length ? scene.getObject(ids[0])?.groupId : null;
    if (groupId && onOpenChangeFont) onOpenChangeFont(groupId);
  });

  extendBtn.addEventListener('click', async () => {
    const ids = scene.getSelection();
    const patchId = ids.length ? scene.getObject(ids[0])?.patchId : null;
    if (!patchId) return;
    extendBtn.disabled = true;
    extendBtn.textContent = 'جارٍ التحقق…';
    try {
      const newRun = await scene.probeGlyphExtension(patchId, shapeText);
      if (!newRun) {
        toast('هذا الطراز لا يدعم تمديد هذا الحرف حاليًا — Genuine extension is not supported for this font here');
        return;
      }
      scene.applyGlyphExtensionUndoable(patchId, newRun);
    } catch (err) {
      toast('تعذّر تمديد الحرف — حاول مرة أخرى');
      console.error('[calligraphy-editor] Glyph extension failed:', err);
    } finally {
      extendBtn.disabled = false;
      extendBtn.textContent = 'Extend';
    }
  });

  flipHBtn.addEventListener('click', () => scene.flipSelection('x'));
  flipVBtn.addEventListener('click', () => scene.flipSelection('y'));
  duplicateBtn.addEventListener('click', () => scene.duplicateSelection());
  deleteBtn.addEventListener('click', () => scene.deleteSelection());
  lockBtn.addEventListener('click', () => {
    const ids = scene.getSelection();
    const allLocked = ids.every((id) => scene.getObject(id)?.locked);
    scene.setLockedForSelection(!allLocked);
  });

  scene.onSelectionChange(refresh);
  scene.onChange(refresh);
  scene.onEditModeChange(refresh);
  refresh();

  return { focusColor: () => colorInput.focus() };
}

function isValidHex(v) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}
function normalizeHex(v) {
  const s = v.trim();
  return s.length === 4 ? `#${[...s.slice(1)].map((c) => c + c).join('')}` : s;
}
