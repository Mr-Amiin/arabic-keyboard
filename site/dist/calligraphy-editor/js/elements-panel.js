// Phase 7, point 2: the "Elements" floating panel. Same "click adds a
// real, already-selected vector object at the current view center"
// flow as the Decorations panel it's modeled on (see decorations-
// panel.js), backed by its own distinct library (elements-library.js)
// and its own scene-object constructor (scene.addElementUndoable) —
// kept fully separate from Decorations per the Phase 7 spec, which
// asks for these as two distinct libraries/panels even though they
// share the same underlying real-vector-object mechanism.

import * as scene from './scene.js';
import { ELEMENTS } from './elements-library.js';

export function createElementsPanel({ canvas, workspaceEl }) {
  const root = document.createElement('div');
  root.id = 'elements-panel';
  root.className = 'floating-panel panel-elements';
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">عناصر • Elements</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق لوحة العناصر">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="library-grid"></div>
  `;
  document.getElementById('app').appendChild(root);

  const grid = root.querySelector('.library-grid');
  const closeBtn = root.querySelector('.text-panel-close');

  for (const item of ELEMENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'library-chip';
    btn.title = item.label;
    btn.innerHTML = `<svg viewBox="0 0 ${item.viewW} ${item.viewH}"><path d="${item.d}" fill="${item.fill}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"/></svg><span>${item.label}</span>`;
    btn.addEventListener('click', () => {
      const rect = workspaceEl.getBoundingClientRect();
      const { camera } = canvas;
      const x = (rect.width / 2 - camera.x) / camera.scale;
      const y = (rect.height / 2 - camera.y) / camera.scale;
      scene.addElementUndoable({
        d: item.d, viewW: item.viewW, viewH: item.viewH, targetSize: 110,
        x, y, fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth,
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
