// Phase 7, point 3: the "Designs" floating panel. Each entry previews
// its real multi-piece vector composition (rendered directly from the
// same `pieces` data scene.insertDesignUndoable() will use — never a
// separate raster thumbnail), and clicking one inserts the whole
// design as one real, already-selected, already-undo-safe scene
// object group at the current view center.

import * as scene from './scene.js';
import { DESIGNS } from './designs-library.js';

export function createDesignsPanel({ canvas, workspaceEl }) {
  const root = document.createElement('div');
  root.id = 'designs-panel';
  root.className = 'floating-panel panel-designs';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">تصاميم • Designs</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق لوحة التصاميم">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="library-grid library-grid-wide"></div>
  `;
  document.getElementById('app').appendChild(root);

  const grid = root.querySelector('.library-grid');
  const closeBtn = root.querySelector('.text-panel-close');

  for (const design of DESIGNS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-chip';
    btn.title = design.label;
    const pieceSvg = design.pieces.map((p) => `<path d="${p.d}" fill="${p.fill ?? '#161616'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.strokeWidth ?? 0}"/>`).join('');
    btn.innerHTML = `<svg viewBox="${design.previewViewBox}">${pieceSvg}</svg><span>${design.label}</span>`;
    btn.addEventListener('click', () => {
      const rect = workspaceEl.getBoundingClientRect();
      const { camera } = canvas;
      const x = (rect.width / 2 - camera.x) / camera.scale;
      const y = (rect.height / 2 - camera.y) / camera.scale;
      scene.insertDesignUndoable({ pieces: design.pieces, x, y, targetSize: 260 });
      close();
    });
    grid.appendChild(btn);
  }

  closeBtn.addEventListener('click', () => close());

  function open() { root.hidden = false; }
  function close() { root.hidden = true; }

  return { open, close, isOpen: () => !root.hidden };
}
