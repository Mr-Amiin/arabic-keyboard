// Phase 7, point 4: "Trace Image" — import a reference photo, place it
// on the canvas as a real (but export-excluded-by-default) scene
// object, then draw real vector paths over it with the existing Pen/
// Shape/Line/Arrow tools. Move/resize/rotate and opacity are already
// fully generic (object-interactions.js + inspector-panel.js handle
// any scene object, this one included) — this panel only adds the
// two things genuinely specific to a reference layer: a hide/show
// toggle (viewport-only, via scene.setHiddenForSelection) and an
// explicit "include in the exported file" opt-in (via
// scene.setExcludeFromExportForSelection) — off by default, so a photo
// being traced over never silently ends up baked into an export.
//
// No text input anywhere in this panel (a native <input type="file">
// picker never raises the software keyboard), so it is inherently
// mobile-keyboard-safe per the Phase 7 mobile requirements.

import * as scene from './scene.js';
import { toast } from './toast.js';

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a readable image'));
      img.onload = () => resolve({ dataUrl: reader.result, naturalW: img.naturalWidth || 500, naturalH: img.naturalHeight || 500 });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function createTraceImagePanel({ canvas, workspaceEl }) {
  const root = document.createElement('div');
  root.id = 'trace-image-panel';
  root.className = 'floating-panel panel-trace-image';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">تتبّع الصورة • Trace Image</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق لوحة تتبّع الصورة">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="trace-image-row">
      <label class="trace-image-import-btn" tabindex="0">
        استيراد صورة مرجعية • Import reference image
        <input type="file" accept="image/*" hidden id="trace-image-input">
      </label>
      <p class="library-chip-note library-chip-note-right">
        بعد الاستيراد: استخدم أداتَي القلم أو الأشكال للرسم فوق الصورة. الصورة نفسها مستبعدة من التصدير افتراضيًا.
      </p>
    </div>
    <div class="trace-image-controls" hidden>
      <div class="trace-image-row trace-image-row-inline">
        <span>إظهار/إخفاء المرجع • Show reference</span>
        <input type="checkbox" id="trace-image-visible-toggle" checked>
      </div>
      <div class="trace-image-row trace-image-row-inline">
        <span>تضمين في التصدير • Include in export</span>
        <input type="checkbox" id="trace-image-export-toggle">
      </div>
    </div>
  `;
  document.getElementById('app').appendChild(root);

  const fileInput = root.querySelector('#trace-image-input');
  const controls = root.querySelector('.trace-image-controls');
  const visibleToggle = root.querySelector('#trace-image-visible-toggle');
  const exportToggle = root.querySelector('#trace-image-export-toggle');
  const closeBtn = root.querySelector('.text-panel-close');

  // The currently-relevant reference image, for the toggles below --
  // whichever image object is selected, or (if none is) the most
  // recently imported one in this session, so the toggles still mean
  // something right after import even before the user clicks it again.
  let lastImageId = null;

  function currentImageId() {
    const sel = scene.getSelection();
    const selectedImage = sel.map((id) => scene.getObject(id)).find((o) => o && o.type === 'image');
    if (selectedImage) return selectedImage.id;
    return lastImageId && scene.getObject(lastImageId) ? lastImageId : null;
  }

  function refreshControls() {
    const id = currentImageId();
    const obj = id ? scene.getObject(id) : null;
    controls.hidden = !obj;
    if (obj) {
      visibleToggle.checked = !obj.hidden;
      exportToggle.checked = !!obj.excludeFromExport === false;
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { dataUrl, naturalW, naturalH } = await readImageFile(file);
      const rect = workspaceEl.getBoundingClientRect();
      const { camera } = canvas;
      const x = (rect.width / 2 - camera.x) / camera.scale;
      const y = (rect.height / 2 - camera.y) / camera.scale;
      const newId = scene.addImageUndoable({ imageHref: dataUrl, naturalW, naturalH, x, y, targetSize: 500 });
      if (newId) {
        lastImageId = newId;
        scene.setSelection([newId]);
        refreshControls();
      }
    } catch (err) {
      toast('تعذّر استيراد الصورة — حاول مرة أخرى');
      console.error('[calligraphy-editor] Trace Image import failed:', err);
    }
  });

  visibleToggle.addEventListener('change', () => {
    const id = currentImageId();
    if (!id) return;
    scene.setSelection([id]);
    scene.setHiddenForSelection(!visibleToggle.checked);
  });
  exportToggle.addEventListener('change', () => {
    const id = currentImageId();
    if (!id) return;
    scene.setSelection([id]);
    scene.setExcludeFromExportForSelection(!exportToggle.checked);
  });

  scene.onChange(() => { if (!root.hidden) refreshControls(); });

  closeBtn.addEventListener('click', () => close());

  function open() { root.hidden = false; refreshControls(); }
  function close() { root.hidden = true; }

  return { open, close, isOpen: () => !root.hidden };
}
