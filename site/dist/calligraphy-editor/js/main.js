// Calligraphy Editor — bootstrap.
// Phase 1: shell + canvas viewport + tool dock + zoom/pan.
// Phase 2: ABC -> real font/variation preview -> HarfBuzz -> real
//          vector glyph objects on the SAME canvas, select + move.
// Phase 3: full object manipulation — rotate, resize, delete,
//          duplicate, color, opacity, flip, lock, layers, multi-select
//          (shift/ctrl-click + marquee), align, distribute, center.
// See PHASES.md at the project root for what's deliberately deferred.

import { createCanvasController } from './canvas.js';
import { createToolController } from './tools.js';
import { wireTopBar, wireZoom, createZoomReadoutUpdater } from './ui.js';
import * as scene from './scene.js';
import { createTextPanel } from './text-panel.js';
import { createDecorationsPanel } from './decorations-panel.js';
import { createTashkeelPanel } from './tashkeel-panel.js';
import { createElementsPanel } from './elements-panel.js';
import { createDesignsPanel } from './designs-panel.js';
import { createTraceImagePanel } from './trace-image-panel.js';
import { createProjectPanel } from './project-panel.js';
import { createExportPanel } from './export-panel.js';
import { createMenuBar } from './menu-bar.js';
import { initProjectTracking } from './project-controller.js';
import { createObjectInteractions } from './object-interactions.js';
import { createPathPointInteractions } from './path-point-interactions.js';
import { wireContextPanel } from './context-panel.js';
import { wireInspector } from './inspector-panel.js';
import { installFineEditIndicator } from './fine-edit-indicator.js';
import { toast } from './toast.js';

// Phase 6, point 8: a global last-resort safety net. Every specific
// failure mode this app knows about (font/HarfBuzz load errors,
// malformed project files, export failures, a single corrupt object)
// already surfaces its own clear Arabic message at the point it
// happens — this handler exists ONLY for whatever's left over: a bug
// this phase didn't anticipate. Without it, an uncaught exception
// anywhere just silently stops whatever it was doing, which for a
// canvas app often looks exactly like "blank canvas, no explanation"
// — the one failure mode the spec explicitly forbids. The real error
// always still goes to the console for developers; the user only ever
// sees a short, honest, non-technical message.
let lastGlobalErrorToastAt = 0;
function reportUnexpectedError(err) {
  console.error('[calligraphy-editor] Unexpected error:', err);
  const now = Date.now();
  if (now - lastGlobalErrorToastAt < 4000) return; // don't spam if several fire in a burst
  lastGlobalErrorToastAt = now;
  toast('حدث خطأ غير متوقع — قد لا يعمل جزء من المحرر كما هو متوقع');
}
window.addEventListener('error', (e) => reportUnexpectedError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportUnexpectedError(e.reason));

function boot() {
  const workspaceEl = document.getElementById('workspace');
  const worldEl = document.getElementById('world');
  const dockEl = document.getElementById('tool-dock');
  const sceneEl = document.getElementById('scene');
  const previewEl = document.getElementById('draw-preview');
  const overlayEl = document.getElementById('selection-overlay');
  const contextPanelEl = document.getElementById('context-panel');
  const inspectorPanelEl = document.getElementById('inspector-panel');

  scene.init({ sceneEl, overlayEl });
  // Phase 6, point 24: the ONE intentional production diagnostic kept
  // in this build. It exposes no UI, no button, no menu, and grants no
  // capability a user couldn't already reach through the real
  // interface — it is a plain reference to the same scene module every
  // panel in this app already calls into. It exists because this
  // project's entire testing discipline (every phase verified against
  // a real browser, never mocked) reads scene state through exactly
  // this hook; removing it would not make the app more secure, only
  // untestable. Every genuinely dev-only surface (the ?debugPatches=1
  // visual overlay, the Phase 1-3 boot console.log) was removed in
  // this pass instead.
  window.__caScene = scene;
  installFineEditIndicator({ artboardEl: document.getElementById('artboard') });
  initProjectTracking(); // dirty-flag + beforeunload warning (Phase 5, point 11)

  // Phase 6, point 13: the empty-state hint tracks the REAL object
  // count on every scene change (New/Open/add/delete-everything all
  // route through here), plus one explicit check right after boot --
  // a boot with nothing to render never fires a scene render at all,
  // so nothing would otherwise trigger this on first paint.
  const emptyStateHintEl = document.getElementById('empty-state-hint');
  function updateEmptyStateHint() {
    emptyStateHintEl.hidden = scene.getAllObjectIds().length > 0;
  }
  scene.onChange(updateEmptyStateHint);
  updateEmptyStateHint();

  const onZoomChange = createZoomReadoutUpdater();
  const canvas = createCanvasController({ workspaceEl, worldEl, onZoomChange });
  wireZoom(canvas);

  const textPanel = createTextPanel({ canvas });
  const decorationsPanel = createDecorationsPanel({ canvas, workspaceEl });
  const tashkeelPanel = createTashkeelPanel({ canvas, workspaceEl });
  const elementsPanel = createElementsPanel({ canvas, workspaceEl });
  const designsPanel = createDesignsPanel({ canvas, workspaceEl });
  const traceImagePanel = createTraceImagePanel({ canvas, workspaceEl });
  const projectPanel = createProjectPanel();
  const exportPanel = createExportPanel();

  // Phase 6, point 12: only one of these floating panels should ever be
  // open at a time -- without this, opening Export and then clicking
  // the Menu button (say) left BOTH panels visibly open at once, which
  // is confusing and makes "click outside closes" ambiguous about
  // which panel that click was even meant to dismiss.
  const closableFloatingPanels = [textPanel, decorationsPanel, tashkeelPanel, elementsPanel, designsPanel, traceImagePanel, projectPanel, exportPanel];
  function closeOtherPanels(except) {
    for (const p of closableFloatingPanels) if (p !== except) p.close();
  }

  const inspector = wireInspector({
    panelEl: inspectorPanelEl,
    onOpenChangeFont: (groupId) => { closeOtherPanels(textPanel); textPanel.open({ replaceGroupId: groupId }); },
  });
  wireContextPanel({ panelEl: contextPanelEl, canvas, workspaceEl });
  // Phase 27 (full-editor audit): object-interactions.js's handle
  // gestures must defer to whatever drawing tool the user has active
  // (see that file's own comment for the bug this closes) -- but
  // toolController itself isn't constructed until below, and
  // createObjectInteractions is deliberately wired early (before the
  // panel-open callbacks it has no dependency on) to keep this
  // unrelated-looking ordering stable for the rest of this function.
  // `toolController` is declared here and assigned below, and this
  // closure reads it lazily, so the getter is always live by the time
  // any real pointerdown can happen (the whole app finishes
  // constructing synchronously before the user can click anything).
  let toolController;
  createObjectInteractions({ overlayEl, workspaceEl, canvas, getActiveTool: () => toolController && toolController.getActiveTool() });
  createPathPointInteractions({ overlayEl, workspaceEl, canvas, getActiveTool: () => toolController && toolController.getActiveTool() });

  // Named once so BOTH the tool dock and the hamburger's Insert menu
  // call the exact same functions — one real "open this panel" path
  // per panel, never a second, divergent one added for the menu.
  const openTextPanel = () => { closeOtherPanels(textPanel); textPanel.open(); };
  const openDecorationsPanel = () => { closeOtherPanels(decorationsPanel); decorationsPanel.open(); };
  const openTashkeelPanel = () => { closeOtherPanels(tashkeelPanel); tashkeelPanel.open(); };
  const openElementsPanel = () => { closeOtherPanels(elementsPanel); elementsPanel.open(); };
  const openDesignsPanel = () => { closeOtherPanels(designsPanel); designsPanel.open(); };
  const openTracePanel = () => { closeOtherPanels(traceImagePanel); traceImagePanel.open(); };

  toolController = createToolController({
    dockEl,
    workspaceEl,
    canvas,
    previewEl,
    onOpenTextPanel: openTextPanel,
    onOpenColorPanel: () => inspector.focusColor(),
    onOpenDecorationsPanel: openDecorationsPanel,
    onOpenTashkeelPanel: openTashkeelPanel,
    onOpenElementsPanel: openElementsPanel,
    onOpenDesignsPanel: openDesignsPanel,
    onOpenTracePanel: openTracePanel,
  });

  // The hamburger (#btn-menu) is the MAIN EDITOR MENU only — Edit /
  // Transform / Arrange / View / Insert / Help. It must never open the
  // Project panel (document management) or the Download/export panel;
  // those keep their own separate top-bar buttons. Insert's rows reuse
  // the identical onOpen*Panel callbacks above (no font-specific / no
  // second panel-opening code path), and deliberately omits Decorations/
  // Color/Background, which are not "insert new content" tools.
  const menuBarPanel = createMenuBar({
    canvas,
    toolController,
    triggerEl: document.getElementById('btn-menu'),
    insertActions: {
      openText: openTextPanel,
      openTashkeel: openTashkeelPanel,
      openElements: openElementsPanel,
      openDesigns: openDesignsPanel,
      openTrace: openTracePanel,
    },
  });
  closableFloatingPanels.push(menuBarPanel);
  wireTopBar(projectPanel, exportPanel, closeOtherPanels, menuBarPanel);

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const panel of closableFloatingPanels) {
      if (panel.isOpen()) { panel.close(); return; }
    }
  });

  // Phase 6, point 12: clicking outside a floating panel closes it —
  // every one of these panels (Add Text, Decorations, Project, Export)
  // is meant to feel like a transient popover, not a mode the user has
  // to explicitly dismiss with the X button or Escape every time.
  // Excluded from "outside": clicks inside any floating panel itself
  // (so choosing an option doesn't close the panel out from under the
  // user), and clicks on the panel's OWN trigger button (its own click
  // handler already runs first and toggles it correctly — without this
  // exclusion, this same click would immediately re-close a panel that
  // just opened).
  const panelTriggerSelectors = '#btn-menu, #btn-project, #btn-export, .dock-btn[data-tool="text"], .dock-btn[data-tool="decoration"], .dock-btn[data-tool="tashkeel"], .dock-btn[data-tool="elements"], .dock-btn[data-tool="designs"], .dock-btn[data-tool="trace"]';
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.floating-panel')) return;
    if (e.target.closest(panelTriggerSelectors)) return;
    for (const panel of closableFloatingPanels) {
      if (panel.isOpen()) panel.close();
    }
  });

  // Start fitted so the whole artboard is visible on load, like a real
  // design app rather than pinned at some arbitrary pan/zoom.
  canvas.fit();

  // Keep the fit sane across window/devtools resizes without fighting
  // a user who has already zoomed/panned/selected manually.
  let hasUserAdjustedView = false;
  ['wheel', 'pointerdown'].forEach((evt) =>
    workspaceEl.addEventListener(evt, () => { hasUserAdjustedView = true; }, { once: true, capture: true })
  );
  window.addEventListener('resize', () => {
    if (!hasUserAdjustedView) canvas.fit();
  });
}

function bootSafely() {
  try {
    boot();
  } catch (err) {
    // If boot() itself fails (a missing DOM node, a broken module),
    // the app never reaches a working state at all -- the one case
    // toast() can't be relied on to have a live, wired-up dismiss
    // cycle around it, so this also writes a small permanent message
    // directly onto the page rather than only a transient toast.
    console.error('[calligraphy-editor] Failed to start the editor:', err);
    const banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    // Phase 31 (deployment hardening): was banner.style.cssText = '...'
    // (a whole-string inline style assignment, which CSP's style-src
    // gates the same as a literal style="..." attribute). Using a
    // stylesheet class instead lets the editor run under a strict CSP
    // with no style-src exception at all.
    banner.className = 'boot-fatal-error-banner';
    banner.textContent = 'تعذّر تشغيل المحرر. يرجى تحديث الصفحة، وإذا استمرت المشكلة يرجى إبلاغنا.';
    document.body.appendChild(banner);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSafely);
} else {
  bootSafely();
}
