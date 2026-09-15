// Wires the bottom-right contextual panel: layer order, align (with a
// compact popover for the 6 directions), distribute (popover, 2
// directions), center-in-view, and lock/unlock. Every button here is
// enabled/disabled live based on the current selection — nothing is a
// permanent sidebar, and nothing is a placeholder that looks live but
// does nothing.

import * as scene from './scene.js';

function closeAllPopovers(panel) {
  panel.querySelectorAll('.ctx-popover').forEach((p) => { p.hidden = true; });
}

export function wireContextPanel({ panelEl, canvas, workspaceEl }) {
  const btnFront = panelEl.querySelector('[data-ctx="front"]');
  const btnForward = panelEl.querySelector('[data-ctx="forward"]');
  const btnBackward = panelEl.querySelector('[data-ctx="backward"]');
  const btnBack = panelEl.querySelector('[data-ctx="back"]');
  const btnAlign = panelEl.querySelector('[data-ctx="align"]');
  const btnDistribute = panelEl.querySelector('[data-ctx="distribute"]');
  const btnCenter = panelEl.querySelector('[data-ctx="center"]');
  const btnLock = panelEl.querySelector('[data-ctx="lock"]');
  const alignPopover = panelEl.querySelector('#align-popover');
  const distributePopover = panelEl.querySelector('#distribute-popover');

  function refresh() {
    const ids = scene.getSelection();
    const hasSelection = ids.length > 0;
    const hasUnlocked = scene.getUnlockedSelection().length > 0;
    const enoughForDistribute = scene.countRigidUnits() >= 3;

    btnFront.disabled = !hasSelection;
    btnForward.disabled = !hasSelection;
    btnBackward.disabled = !hasSelection;
    btnBack.disabled = !hasSelection;
    btnAlign.disabled = !hasUnlocked;
    btnDistribute.disabled = !enoughForDistribute;
    btnCenter.disabled = !hasUnlocked;
    btnLock.disabled = !hasSelection;

    if (hasSelection) {
      const allLocked = ids.every((id) => scene.getObject(id)?.locked);
      btnLock.classList.toggle('active', allLocked);
      btnLock.title = allLocked ? 'Unlock' : 'Lock';
    } else {
      btnLock.classList.remove('active');
    }

    if (!hasSelection) closeAllPopovers(panelEl);
  }

  btnFront.addEventListener('click', () => scene.bringToFront());
  btnForward.addEventListener('click', () => scene.bringForward());
  btnBackward.addEventListener('click', () => scene.sendBackward());
  btnBack.addEventListener('click', () => scene.sendToBack());

  btnAlign.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = alignPopover.hidden;
    closeAllPopovers(panelEl);
    alignPopover.hidden = !willOpen;
  });
  btnDistribute.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = distributePopover.hidden;
    closeAllPopovers(panelEl);
    distributePopover.hidden = !willOpen;
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panelEl.contains(e.target)) closeAllPopovers(panelEl);
  });

  alignPopover.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-align]');
    if (!btn) return;
    scene.alignSelection(btn.dataset.align);
    closeAllPopovers(panelEl);
  });
  distributePopover.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-distribute]');
    if (!btn) return;
    scene.distributeSelection(btn.dataset.distribute);
    closeAllPopovers(panelEl);
  });

  btnCenter.addEventListener('click', () => {
    const rect = workspaceEl.getBoundingClientRect();
    const { camera } = canvas;
    const targetCx = (rect.width / 2 - camera.x) / camera.scale;
    const targetCy = (rect.height / 2 - camera.y) / camera.scale;
    scene.centerSelectionIn(targetCx, targetCy);
  });

  btnLock.addEventListener('click', () => {
    const ids = scene.getSelection();
    if (!ids.length) return;
    const allLocked = ids.every((id) => scene.getObject(id)?.locked);
    scene.setLockedForSelection(!allLocked);
  });

  scene.onSelectionChange(refresh);
  scene.onChange(refresh);
  refresh();
}
