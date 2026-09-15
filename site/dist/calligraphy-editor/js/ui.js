// Top bar + zoom readout wiring.

import { toast } from './toast.js';
import { undo, redo, onHistoryChange, historyState } from './history.js';
import * as pc from './project-controller.js';

// Wires the top bar's three, now clearly-separated controls:
//  - #btn-menu (the ☰ hamburger)  -> the main editor menu (Edit /
//    Transform / Arrange / View / Insert / Help — menu-bar.js), never
//    the Project panel. Previously this button opened the Project
//    panel, which duplicated the separate "Project" button below and
//    is exactly the confusion this wiring now removes.
//  - #btn-project ("Project")     -> document management only (New/
//    Save/Rename/Duplicate/Open/Recent/Delete — project-panel.js).
//  - #btn-export ("Download ▾")   -> export only (export-panel.js).
// Also keeps the center "project-name" label showing the CURRENT
// project's real name plus an honest unsaved-changes marker (Phase 5,
// point 11) — never a static placeholder.
export function wireTopBar(projectPanel, exportPanel, closeOtherPanels = () => {}, menuBarPanel = null) {
  const btnMenu = document.getElementById('btn-menu');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnExport = document.getElementById('btn-export');
  const btnProject = document.getElementById('btn-project');
  const projectNameEl = document.getElementById('project-name');

  if (menuBarPanel) {
    btnMenu.addEventListener('click', () => { closeOtherPanels(menuBarPanel); menuBarPanel.toggle(); });
  }
  btnExport.addEventListener('click', () => { closeOtherPanels(exportPanel); exportPanel.toggle(); });
  btnProject.addEventListener('click', () => { closeOtherPanels(projectPanel); projectPanel.toggle(); });

  function refreshProjectName(state) {
    projectNameEl.textContent = state.dirty ? `${state.name} *` : state.name;
    projectNameEl.title = state.dirty ? 'يحتوي على تغييرات غير محفوظة' : state.name;
  }
  refreshProjectName(pc.getState());
  pc.onProjectChange(refreshProjectName);

  function refreshHistoryButtons(state) {
    btnUndo.disabled = !state.canUndo;
    btnRedo.disabled = !state.canRedo;
  }
  refreshHistoryButtons(historyState());
  onHistoryChange(refreshHistoryButtons);

  btnUndo.addEventListener('click', () => { if (!undo()) toast('Nothing to undo'); });
  btnRedo.addEventListener('click', () => { if (!redo()) toast('Nothing to redo'); });

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (!undo()) toast('Nothing to undo'); }
    if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (!redo()) toast('Nothing to redo'); }
  });
}

// Returns an onZoomChange(scale) callback that only touches the zoom
// readout text — created up front so it can be handed to the canvas
// controller at construction time, before the controller itself exists.
export function createZoomReadoutUpdater() {
  const zoomLevel = document.getElementById('zoom-level');
  return function onZoomChange(scale) {
    zoomLevel.textContent = `${Math.round(scale * 100)}%`;
  };
}

// Wires the zoom buttons to a real, already-constructed canvas controller.
export function wireZoom(canvas) {
  document.getElementById('zoom-out').addEventListener('click', () => canvas.zoomOut());
  document.getElementById('zoom-in').addEventListener('click', () => canvas.zoomIn());
  document.getElementById('zoom-fit').addEventListener('click', () => canvas.fit());
  document.getElementById('zoom-level').addEventListener('click', () => canvas.resetTo100());
}

// The bottom-right contextual panel (layer order, align, distribute,
// lock) is intentionally left disabled in Phase 1: it is real UI, but
// it only ever makes sense once an object is selected, and Phase 1 has
// no objects yet. It lights up starting Phase 3.
