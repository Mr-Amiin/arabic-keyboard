// The "ABC / Add Text" floating panel — Phase 2's whole point.
//
// ABC -> Arabic text -> font family -> variation -> live preview ->
// "إضافة إلى اللوحة" -> HarfBuzz shaping -> real vector glyph objects
// on the Phase 1 canvas. This module owns the panel's DOM and talks to
// font-registry.js (the real, audited font data), glyph-shaper.js (the
// real HarfBuzz pipeline) and scene.js (the Phase 1 canvas's own
// object model) — it does not invent any of its own font or rendering
// logic.

import * as registry from './font-registry.js';
import { shapeText } from './glyph-shaper.js';
import * as scene from './scene.js';
import { toast } from './toast.js';
import { probeMark, probeCombo } from './tashkeel-probe.js';

const loadedPreviewFonts = new Map(); // internal family name -> Promise<FontFace>

function previewFamilyName(file) {
  return 'cal-preview-' + file.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

// Uses the FontFace API directly, with a wide weight range so a
// single @font-face serves every named weight instance of a variable
// font.
function loadPreviewFont(file) {
  const family = previewFamilyName(file);
  if (loadedPreviewFonts.has(family)) return loadedPreviewFonts.get(family);
  const url = registry.fontCssUrl(file);
  const face = new FontFace(family, `url(${JSON.stringify(url)})`, { weight: '100 900', style: 'normal' });
  const promise = face.load().then((loaded) => {
    document.fonts.add(loaded);
    return loaded;
  });
  loadedPreviewFonts.set(family, promise);
  return promise;
}

export function createTextPanel({ canvas }) {
  const root = document.createElement('div');
  root.id = 'text-panel';
  root.className = 'floating-panel panel-text-add';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title text-panel-title-text">إضافة نص عربي</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>

    <label class="text-panel-label">النص</label>
    <textarea class="text-panel-input" dir="rtl" rows="1"
      placeholder="بسم الله الرحمن الرحيم"></textarea>

    <label class="text-panel-label">عائلة الخط</label>
    <div class="chip-row chip-row-families"></div>

    <label class="text-panel-label">النمط</label>
    <div class="chip-row chip-row-variations"></div>

    <div class="text-panel-preview" dir="rtl"><span class="text-panel-preview-text"></span></div>
    <div class="text-panel-error" hidden></div>

    <button type="button" class="text-btn text-panel-submit"></button>
  `;
  document.getElementById('app').appendChild(root);

  const textarea = root.querySelector('.text-panel-input');
  const titleEl = root.querySelector('.text-panel-title-text');
  const familyRow = root.querySelector('.chip-row-families');
  const variationRow = root.querySelector('.chip-row-variations');
  const previewText = root.querySelector('.text-panel-preview-text');
  const errorBox = root.querySelector('.text-panel-error');
  const submitBtn = root.querySelector('.text-panel-submit');
  const closeBtn = root.querySelector('.text-panel-close');

  const state = {
    familyId: null,
    variationId: null,
    // Phase 5's "Change Font / Change Variation": when set, this panel
    // is re-shaping an EXISTING composition (see reshapeGroupUndoable)
    // instead of inserting a brand-new one. Same panel, same real
    // shaping pipeline, same user-text-driven preview — only what
    // happens on submit differs.
    replaceGroupId: null,
  };
  updateSubmitLabel();

  function updateSubmitLabel() {
    submitBtn.textContent = state.replaceGroupId ? 'تحديث الخط' : 'إضافة إلى اللوحة';
    titleEl.textContent = state.replaceGroupId ? 'تغيير الخط / النمط' : 'إضافة نص عربي';
  }

  function showError(message) {
    if (!message) {
      errorBox.hidden = true;
      errorBox.textContent = '';
      return;
    }
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  function currentVariation() {
    if (!state.variationId) return null;
    const found = registry.findVariation(state.variationId);
    return found ? found.variation : null;
  }

  function updateSubmitEnabled() {
    submitBtn.disabled = !textarea.value.trim() || !currentVariation();
  }

  async function updatePreview() {
    const variation = currentVariation();
    previewText.textContent = textarea.value;
    updateSubmitEnabled();
    if (!variation) return;
    try {
      await loadPreviewFont(variation.file);
      previewText.style.fontFamily = previewFamilyName(variation.file);
      previewText.style.fontWeight = String(variation.weight || 400);
      previewText.style.fontFeatureSettings = registry.buildFeatureSettings(variation.features);
      showError(null);
    } catch (err) {
      showError(`Font preview failed to load: ${err.message}`);
    }
  }

  function renderVariationChips() {
    variationRow.innerHTML = '';
    const family = registry.getFamily(state.familyId);
    if (!family) return;
    for (const variation of family.variations) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = variation.label;
      chip.title = variation.metaEn || variation.meta || '';
      chip.classList.toggle('active', variation.id === state.variationId);
      chip.addEventListener('click', () => {
        state.variationId = variation.id;
        renderVariationChips();
        updatePreview();
      });
      variationRow.appendChild(chip);
    }
  }

  function renderFamilyChips() {
    familyRow.innerHTML = '';
    for (const family of registry.getFamilies()) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (family.available ? '' : ' chip-unavailable');
      chip.textContent = family.label;
      chip.disabled = !family.available;
      chip.title = family.available ? (family.labelEn || '') : 'غير متاح — لا يوجد خط حقيقي مدقّق لهذا الطراز بعد';
      chip.classList.toggle('active', family.id === state.familyId);
      if (family.available) {
        chip.addEventListener('click', () => {
          state.familyId = family.id;
          state.variationId = family.variations[0] ? family.variations[0].id : null;
          renderFamilyChips();
          renderVariationChips();
          updatePreview();
        });
      }
      familyRow.appendChild(chip);
    }
  }

  function resetToDefaults() {
    const { family, variation } = registry.defaultFamilyAndVariation();
    state.familyId = family ? family.id : null;
    state.variationId = variation ? variation.id : null;
    renderFamilyChips();
    renderVariationChips();
    showError(null);
  }

  // Pre-fills the panel from an EXISTING composition's own real text
  // and the font/variation it was actually last shaped with (Phase 5's
  // "Change Font" — never a hardcoded phrase, always this group's own
  // stored text; see scene.js's groupMeta).
  function loadFromGroup(groupId) {
    const meta = scene.getGroupMeta(groupId);
    textarea.value = meta?.text || '';
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
    const found = meta?.variationId ? registry.findVariation(meta.variationId) : null;
    if (found) {
      state.familyId = found.family.id;
      state.variationId = found.variation.id;
    } else {
      const { family, variation } = registry.defaultFamilyAndVariation();
      state.familyId = family ? family.id : null;
      state.variationId = variation ? variation.id : null;
    }
    renderFamilyChips();
    renderVariationChips();
    showError(null);
  }

  textarea.addEventListener('input', () => {
    // auto-grow so RTL long phrases stay visible without an inner scrollbar
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
    updatePreview();
  });

  closeBtn.addEventListener('click', () => close());

  submitBtn.addEventListener('click', async () => {
    const variation = currentVariation();
    const text = textarea.value.trim();
    if (!text || !variation) return;

    const busyLabel = state.replaceGroupId ? 'جارٍ إعادة التشكيل…' : 'جارٍ التحضير…';
    submitBtn.disabled = true;
    submitBtn.textContent = busyLabel;
    showError(null);

    try {
      const shapingUrl = registry.fontShapingUrl(variation.file);
      const { upem, glyphs } = await shapeText({
        shapingUrl,
        text,
        features: variation.features || [],
        weight: variation.weight || null,
      });

      const visibleGlyphs = glyphs.filter((g) => !g.empty);
      if (!visibleGlyphs.length) {
        throw new Error('Shaping produced no visible glyphs for this text/font combination.');
      }

      const runArgs = { text, upem, glyphs, fontSizePx: 220, familyId: state.familyId, variationId: state.variationId };
      if (state.replaceGroupId) {
        // Phase 7 critical addendum, points 7 & 8: a font/variation
        // change must genuinely reshape any manually-attached Tashkeel
        // marks against the NEW font too -- never leave them wearing
        // the old font's stale geometry. Real-probe each attached
        // mark/combo through the exact same HarfBuzz path the
        // Tashkeel panel itself uses, BEFORE touching the scene, so
        // reshapeGroupUndoable can apply everything as one atomic step.
        // Phase 10D: this probe now goes through the SAME hardened,
        // shared check the Tashkeel panel itself uses (tashkeel-
        // probe.js) — a single mark via probeMark, a combo (memberCount
        // > 1) via probeCombo, which also reports whether the NEW
        // font's own real GPOS mark-to-mark data can be trusted for
        // this combo's relative offsets, or whether editor-computed
        // stacking must be used instead (see scene.js's
        // placeComboMembers). Before this phase, this call site used
        // its own separate, un-hardened `xAdvance === 0` check — the
        // exact false-positive pattern Phase 10C's Layla Thuluth audit
        // found (a .notdef substitute glyph can still show xAdvance 0
        // on a font with no GPOS table). Duplicating the check here was
        // itself part of the bug: fixing only the panel's own probe
        // would have left a font switch free to re-attach a fake mark
        // this same font can't really render.
        const attachedGroups = scene.getAttachedTashkeelMarkGroups(state.replaceGroupId);
        const probeCtx = { shapingUrl, features: variation.features || [], weight: variation.weight || 400 };
        const reshapedMarkGroups = attachedGroups.length
          ? await Promise.all(attachedGroups.map(async (g) => {
              const probe = g.memberCount > 1
                ? await probeCombo(probeCtx, g.markChar, g.memberCount)
                : await probeMark(probeCtx, g.markChar);
              if (probe.status !== 'supported') return { ...g, supported: false };
              const members = g.memberCount > 1
                ? probe.glyphs.slice(0, g.memberCount).map((gl) => ({ path: gl.path, upem: probe.upem, xOffset: gl.xOffset, yOffset: gl.yOffset }))
                : [{ path: probe.path, upem: probe.upem, xOffset: 0, yOffset: 0 }];
              return {
                ...g,
                supported: true,
                members,
                positioningSource: g.memberCount > 1 ? probe.positioningSource : 'gpos',
              };
            }))
          : [];

        const result = scene.reshapeGroupUndoable(state.replaceGroupId, runArgs, reshapedMarkGroups);
        if (!result) throw new Error('Could not reshape this composition.');
        // One single, combined, honest message -- never two toasts
        // racing on the shared #toast element (the mark-drop notice
        // would otherwise be silently clobbered a moment later by a
        // plain "تم تحديث الخط", found via real end-to-end testing).
        const dropped = result.droppedMarkCount || 0;
        toast(dropped > 0
          ? (dropped === 1
              ? 'تم تحديث الخط — وأُزيلت علامة تشكيل واحدة غير متاحة في الخط الجديد'
              : `تم تحديث الخط — وأُزيلت ${dropped} علامات تشكيل غير متاحة في الخط الجديد`)
          : 'تم تحديث الخط');
      } else {
        scene.insertGlyphRunUndoable({ ...runArgs, fill: '#161616' });
        canvas.fit();
        toast('تمت الإضافة إلى اللوحة');
      }
      close();
    } catch (err) {
      // Per spec: never hide the error.
      console.error('[calligraphy-editor] Add to Canvas failed:', err);
      showError(`تعذّرت الإضافة: ${err.message}`);
    } finally {
      updateSubmitLabel();
      updateSubmitEnabled();
    }
  });

  function open({ replaceGroupId } = {}) {
    state.replaceGroupId = replaceGroupId || null;
    if (replaceGroupId) loadFromGroup(replaceGroupId);
    else resetToDefaults();
    updateSubmitLabel();
    root.hidden = false;
    updatePreview();
    textarea.focus();
  }

  function close() {
    root.hidden = true;
    state.replaceGroupId = null;
    textarea.blur(); // Phase 1's canvas stays non-editable — closing
                      // the panel must not leave the keyboard pinned.
  }

  return { open, close, isOpen: () => !root.hidden };
}
