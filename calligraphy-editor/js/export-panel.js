// The "Download" floating panel (Phase 6, point 1 + 5; upgraded to a
// full Download menu in Phase 7, point 10): lets the user pick a
// format (SVG / PNG / JPG / Outline SVG / PDF) and, per format, the
// options that format actually supports — PNG gets a 1x/2x/3x/4x
// scale choice plus transparent/white/custom background, JPG and PDF
// get white/custom only (neither has a real alpha channel in the
// exported bytes, so "transparent" is never offered as a choice that
// would silently do something else), SVG and Outline SVG get the
// same background choice as PNG since it's the same underlying vector
// artwork. Every actual pixel/vector this panel produces comes from
// export.js reading the live #scene SVG — this file is presentation
// only, no rasterization/serialization logic of its own.

import * as exp from './export.js';
import { toast } from './toast.js';

const FORMATS = ['svg', 'png', 'jpg', 'outline-svg', 'pdf'];
const FORMAT_LABELS = { svg: 'SVG', png: 'PNG', jpg: 'JPG', 'outline-svg': 'Outline SVG', pdf: 'PDF' };

export function createExportPanel() {
  const root = document.createElement('div');
  root.id = 'export-panel';
  root.className = 'floating-panel panel-export';
  root.hidden = true;
  root.innerHTML = `
    <div class="export-panel-inner">
      <div class="text-panel-header">
        <span class="text-panel-title">تصدير • Export</span>
        <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق نافذة التصدير">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="export-panel-body">
        <div class="export-format-tabs" role="tablist" aria-label="صيغة التصدير">
          <button type="button" class="export-format-tab" data-format="svg" role="tab" aria-selected="true">SVG</button>
          <button type="button" class="export-format-tab" data-format="png" role="tab" aria-selected="false">PNG</button>
          <button type="button" class="export-format-tab" data-format="jpg" role="tab" aria-selected="false">JPG</button>
          <button type="button" class="export-format-tab" data-format="outline-svg" role="tab" aria-selected="false">Outline SVG</button>
          <button type="button" class="export-format-tab" data-format="pdf" role="tab" aria-selected="false">PDF</button>
        </div>

        <div class="export-section" data-section="scale" hidden>
          <label class="text-panel-label">الحجم</label>
          <div class="chip-row">
            <button type="button" class="chip" data-scale="1">1×</button>
            <button type="button" class="chip" data-scale="2">2×</button>
            <button type="button" class="chip" data-scale="3">3×</button>
            <button type="button" class="chip" data-scale="4">4×</button>
          </div>
        </div>

        <div class="export-section" data-section="background">
          <label class="text-panel-label">الخلفية</label>
          <div class="chip-row">
            <button type="button" class="chip" data-bg="transparent">شفافة</button>
            <button type="button" class="chip" data-bg="white">أبيض</button>
            <button type="button" class="chip" data-bg="custom">مخصصة</button>
          </div>
          <div class="export-custom-color" hidden>
            <input type="color" id="export-custom-color" class="inspector-color" value="#ffffff" title="لون الخلفية">
            <input type="text" id="export-custom-hex" class="inspector-hex" value="#ffffff" spellcheck="false" title="قيمة اللون">
          </div>
        </div>

        <button type="button" class="text-btn export-run-btn" data-action="run">تصدير SVG</button>
      </div>
    </div>
  `;
  document.getElementById('app').appendChild(root);

  const closeBtn = root.querySelector('.text-panel-close');
  const tabs = [...root.querySelectorAll('.export-format-tab')];
  const scaleSection = root.querySelector('[data-section="scale"]');
  const scaleChips = [...root.querySelectorAll('.chip[data-scale]')];
  const bgChips = [...root.querySelectorAll('.chip[data-bg]')];
  const customColorRow = root.querySelector('.export-custom-color');
  const customColorInput = root.querySelector('#export-custom-color');
  const customHexInput = root.querySelector('#export-custom-hex');
  const runBtn = root.querySelector('.export-run-btn');

  let format = 'svg';
  let scale = 1;
  let background = 'white';

  function isValidHex(v) { return /^#[0-9a-fA-F]{6}$/.test(v); }

  function backgroundChoicesFor(fmt) {
    // JPG and PDF have no real alpha channel in the bytes this app
    // actually produces (exportPDF silently falls back transparent ->
    // white internally, which is the honest behavior for a format
    // with no universal alpha-canvas concept here) -- offering
    // "transparent" for either would just silently produce a white
    // result anyway, so it is never shown as a choice that would look
    // like it did something it didn't.
    return (fmt === 'jpg' || fmt === 'pdf') ? ['white', 'custom'] : ['transparent', 'white', 'custom'];
  }

  function refreshUI() {
    tabs.forEach((t) => {
      const active = t.dataset.format === format;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });

    scaleSection.hidden = format !== 'png';
    scaleChips.forEach((c) => c.classList.toggle('active', Number(c.dataset.scale) === scale));

    const allowedBg = backgroundChoicesFor(format);
    bgChips.forEach((c) => {
      const bg = c.dataset.bg;
      const allowed = allowedBg.includes(bg);
      c.hidden = !allowed;
      c.classList.toggle('active', bg === background);
    });
    if (!allowedBg.includes(background)) {
      background = (format === 'jpg' || format === 'pdf') ? 'white' : 'transparent';
      bgChips.forEach((c) => c.classList.toggle('active', c.dataset.bg === background));
    }
    customColorRow.hidden = background !== 'custom';

    runBtn.textContent = `تصدير ${FORMAT_LABELS[format]}`;
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => { format = tab.dataset.format; refreshUI(); });
  });
  scaleChips.forEach((chip) => {
    chip.addEventListener('click', () => { scale = Number(chip.dataset.scale); refreshUI(); });
  });
  bgChips.forEach((chip) => {
    chip.addEventListener('click', () => { background = chip.dataset.bg; refreshUI(); });
  });

  customColorInput.addEventListener('input', () => { customHexInput.value = customColorInput.value; });
  customHexInput.addEventListener('change', () => {
    if (!isValidHex(customHexInput.value)) { toast('قيمة لون غير صالحة'); customHexInput.value = customColorInput.value; return; }
    customColorInput.value = customHexInput.value;
  });

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    const prevLabel = runBtn.textContent;
    runBtn.textContent = 'جارٍ التصدير…';
    try {
      const customColor = customColorInput.value;
      let result;
      if (format === 'svg') result = await exp.exportSVG({ background, customColor });
      else if (format === 'png') result = await exp.exportPNG({ scale, background, customColor });
      else if (format === 'jpg') result = await exp.exportJPG({ background, customColor });
      else if (format === 'outline-svg') result = await exp.exportOutlineSVG({ background, customColor });
      else result = await exp.exportPDF({ background, customColor });
      if (result.ok) { toast('تم التصدير بنجاح'); close(); }
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = prevLabel;
    }
  });

  closeBtn.addEventListener('click', () => close());

  function open() {
    format = 'svg';
    scale = 1;
    background = 'white';
    refreshUI();
    root.hidden = false;
  }
  function close() {
    root.hidden = true;
  }

  return { open, close, isOpen: () => !root.hidden, toggle: () => (root.hidden ? open() : close()) };
}
