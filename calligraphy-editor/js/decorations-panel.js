// The "Decorations" floating panel (Phase 4, point 6): a small library
// of real vector decorative elements. Clicking one drops it, already
// selected, at the center of the current view — same "add, then edit
// on the canvas" flow as Add Text — so it immediately gets every
// generic drawing-object capability (move/rotate/scale/color/opacity/
// duplicate/delete/lock/layers/undo-redo) for free.

import * as scene from './scene.js';
import { DECORATIONS } from './decorations-library.js';

export function createDecorationsPanel({ canvas, workspaceEl }) {
  const root = document.createElement('div');
  root.id = 'decorations-panel';
  root.className = 'floating-panel panel-decorations';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">زخارف • Decorations</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق لوحة الزخارف">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="decorations-grid"></div>
  `;
  document.getElementById('app').appendChild(root);

  const grid = root.querySelector('.decorations-grid');
  const closeBtn = root.querySelector('.text-panel-close');

  for (const deco of DECORATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'decoration-chip';
    btn.title = deco.label;
    btn.innerHTML = `<svg viewBox="0 0 ${deco.viewW} ${deco.viewH}"><path d="${deco.d}" fill="${deco.fill}" stroke="${deco.stroke}" stroke-width="${deco.strokeWidth}"/></svg><span>${deco.label}</span>`;
    btn.addEventListener('click', () => {
      const rect = workspaceEl.getBoundingClientRect();
      const { camera } = canvas;
      const x = (rect.width / 2 - camera.x) / camera.scale;
      const y = (rect.height / 2 - camera.y) / camera.scale;
      scene.addDecorationUndoable({
        d: deco.d, viewW: deco.viewW, viewH: deco.viewH, targetSize: 110,
        x, y, fill: deco.fill, stroke: deco.stroke, strokeWidth: deco.strokeWidth,
      });
      close();
    });
    grid.appendChild(btn);
  }

  closeBtn.addEventListener('click', () => close());

  function open() { root.hidden = false; }
  function close() { root.hidden = true; }

  return { open, close, isOpen: () => !root.hidden };
}
