// Phase 5, point 1: make it visually unmistakable when the user has
// drilled past normal patch-level selection into Fine Edit (glyph/mark)
// or further into Edit Path (anchor/Bézier) — rather than leaving the
// only cue to be "the selection frame got smaller", which is easy to
// miss. A colored ring around the artboard plus a small badge that
// names which mode is active; both disappear the instant scene.js says
// neither mode is active.

import * as scene from './scene.js';

export function installFineEditIndicator({ artboardEl }) {
  const badge = document.createElement('div');
  badge.className = 'fine-edit-badge';
  badge.hidden = true;
  artboardEl.appendChild(badge);

  function refresh() {
    const fineEdit = scene.getFineEditPatchId();
    const pathEdit = scene.getPathEditId();
    const active = !!fineEdit;
    artboardEl.classList.toggle('fine-edit-active', active);
    if (pathEdit) {
      badge.textContent = 'Editing Path — Esc to finish';
      badge.hidden = false;
    } else if (fineEdit) {
      badge.textContent = 'Fine Edit — Esc to leave';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  scene.onEditModeChange(refresh);
  refresh();
}
