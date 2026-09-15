// Phase 7, points 5-8 (Edit / Transform / Arrange / View), extended in
// the hamburger/Project UI-architecture fix with Insert and Help.
//
// Kept as ONE compact dropdown panel (an accordion of the menus) behind
// the single top-bar hamburger (#btn-menu) — Phase 7 point 14
// explicitly asks for "compact contextual controls, don't overcrowd"
// (this app's top bar and tool dock are already full at 320px), and
// every action here already has a real, obvious icon-level home
// (context-panel.js for layering/align/distribute, the inspector for
// flip, arrow keys for nudge, the tool dock for Insert) — this menu
// exists to make the SAME real operations additionally discoverable/
// organized the way a familiar desktop-app menu groups them, not
// to introduce a second, divergent way of doing them.
//
// The hamburger is the MAIN EDITOR MENU (Edit/Transform/Arrange/View/
// Insert/Help) and nothing else — it must never open the Project panel
// (document management: New/Save/Rename/Duplicate/Open/Recent/Delete)
// or the Download/export panel. Those stay on their own separate
// top-bar buttons (#btn-project, #btn-export); see ui.js.
//
// Every row below calls the exact same scene.js/canvas.js/history.js
// functions (and, for Insert, the exact same panel-open callbacks the
// tool dock already uses) the rest of the app already uses and already
// has passing regression coverage for — Arrange's layering/align/
// distribute reuse the identical functions context-panel.js calls,
// Transform's flip reuses the identical function the inspector's flip
// buttons call, Insert reuses the identical onOpen*Panel callbacks
// main.js already wires to the tool dock — so there is exactly one
// real code path per operation, never two.

import * as scene from './scene.js';
import * as history from './history.js';
import { toast } from './toast.js';

// Help > Keyboard Shortcuts: a plain, informational read-out of the
// shortcuts genuinely wired in tools.js/ui.js — not a decorative list
// invented for this menu. Kept in one place so it can't silently drift
// from the real bindings; update this alongside tools.js/ui.js if a
// shortcut ever changes.
const KEYBOARD_SHORTCUTS = [
  ['V', 'Select tool'],
  ['H', 'Hand / Pan tool'],
  ['P', 'Pen tool'],
  ['L', 'Line tool'],
  ['R', 'Rectangle tool'],
  ['C', 'Circle tool'],
  ['T', 'Add Text'],
  ['Delete / Backspace', 'Delete selection'],
  ['Ctrl/Cmd+D', 'Duplicate selection'],
  ['Ctrl/Cmd+Z', 'Undo'],
  ['Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z)', 'Redo'],
  ['Arrow keys', 'Nudge selection 1px (Shift = 10px)'],
  ['Escape', 'Cancel current action / close panel'],
];

const MENUS = [
  {
    id: 'edit',
    label: 'تحرير • Edit',
    rows: [
      { label: 'Undo', run: () => history.undo(), enabled: () => history.historyState().canUndo },
      { label: 'Redo', run: () => history.redo(), enabled: () => history.historyState().canRedo },
      { sep: true },
      { label: 'Select All', run: () => scene.selectAll(), enabled: () => scene.getAllObjectIds().length > 0 },
      { label: 'Deselect / Clear Selection', run: () => scene.clearSelection(), enabled: () => scene.getSelection().length > 0 },
      { sep: true },
      { label: 'Copy', run: () => scene.copySelectionToClipboard(), enabled: () => scene.getSelection().length > 0 },
      { label: 'Paste', run: () => scene.pasteClipboardUndoable(), enabled: () => scene.hasClipboardContent() },
      { label: 'Duplicate', run: () => scene.duplicateSelection(), enabled: () => scene.getSelection().length > 0 },
      { label: 'Delete', run: () => scene.deleteSelection(), enabled: () => scene.getSelection().length > 0 },
    ],
  },
  {
    id: 'transform',
    label: 'تحويل • Transform',
    rows: [
      { label: 'Move left', run: () => scene.nudgeSelection(-10, 0), enabled: () => scene.getSelection().length > 0 },
      { label: 'Move right', run: () => scene.nudgeSelection(10, 0), enabled: () => scene.getSelection().length > 0 },
      { label: 'Move up', run: () => scene.nudgeSelection(0, -10), enabled: () => scene.getSelection().length > 0 },
      { label: 'Move down', run: () => scene.nudgeSelection(0, 10), enabled: () => scene.getSelection().length > 0 },
      { sep: true },
      { label: 'Resize larger', run: () => scene.scaleSelectionByFactor(1.1), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Resize smaller', run: () => scene.scaleSelectionByFactor(0.9), enabled: () => scene.getUnlockedSelection().length > 0 },
      { sep: true },
      { label: 'Rotate left 15°', run: () => scene.rotateSelectionByDegrees(-15), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Rotate right 15°', run: () => scene.rotateSelectionByDegrees(15), enabled: () => scene.getUnlockedSelection().length > 0 },
      { sep: true },
      { label: 'Flip Horizontal', run: () => scene.flipSelection('x'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Flip Vertical', run: () => scene.flipSelection('y'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { sep: true },
      { label: 'Reset Transform (where applicable)', run: () => scene.resetTransformForSelection(), enabled: () => scene.getUnlockedSelection().length > 0 },
    ],
  },
  {
    id: 'arrange',
    label: 'ترتيب • Arrange',
    rows: [
      { label: 'Bring to Front', run: () => scene.bringToFront(), enabled: () => scene.getSelection().length > 0 },
      { label: 'Bring Forward', run: () => scene.bringForward(), enabled: () => scene.getSelection().length > 0 },
      { label: 'Send Backward', run: () => scene.sendBackward(), enabled: () => scene.getSelection().length > 0 },
      { label: 'Send to Back', run: () => scene.sendToBack(), enabled: () => scene.getSelection().length > 0 },
      { sep: true },
      { label: 'Align Left', run: () => scene.alignSelection('left'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Align Center', run: () => scene.alignSelection('centerX'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Align Right', run: () => scene.alignSelection('right'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Align Top', run: () => scene.alignSelection('top'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Align Middle', run: () => scene.alignSelection('centerY'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { label: 'Align Bottom', run: () => scene.alignSelection('bottom'), enabled: () => scene.getUnlockedSelection().length > 0 },
      { sep: true },
      { label: 'Distribute Horizontally', run: () => scene.distributeSelection('x'), enabled: () => scene.countRigidUnits() >= 3 },
      { label: 'Distribute Vertically', run: () => scene.distributeSelection('y'), enabled: () => scene.countRigidUnits() >= 3 },
      { sep: true },
      { label: 'Group', run: () => scene.groupSelectionUndoable(), enabled: () => scene.canGroupSelection() },
      { label: 'Ungroup', run: () => scene.ungroupSelectionUndoable(), enabled: () => scene.canUngroupSelection() },
    ],
  },
  {
    id: 'view',
    label: 'عرض • View',
    // `rows` for this menu is computed at open-time (needs live canvas
    // state), see buildViewRows below.
  },
  {
    id: 'insert',
    label: 'إدراج • Insert',
    // `rows` for this menu is computed at open-time from the real
    // insertActions callbacks passed into createMenuBar (the exact same
    // functions main.js wires to the tool dock) — see buildInsertRows.
  },
  {
    id: 'help',
    label: 'المساعدة • Help',
    rows: [
      { label: 'Keyboard Shortcuts', info: true, enabled: () => true },
      ...KEYBOARD_SHORTCUTS.map(([keys, desc]) => ({ label: `${keys} — ${desc}`, info: true, indent: true, enabled: () => true })),
    ],
  },
];

export function createMenuBar({ canvas, toolController, insertActions = {}, triggerEl = null }) {
  function buildInsertRows() {
    const rows = [];
    if (insertActions.openText) rows.push({ label: 'Text', run: insertActions.openText, enabled: () => true, closesMenu: true });
    if (insertActions.openTashkeel) rows.push({ label: 'Tashkeel', run: insertActions.openTashkeel, enabled: () => true, closesMenu: true });
    if (insertActions.openElements) rows.push({ label: 'Elements', run: insertActions.openElements, enabled: () => true, closesMenu: true });
    if (insertActions.openDesigns) rows.push({ label: 'Designs', run: insertActions.openDesigns, enabled: () => true, closesMenu: true });
    if (insertActions.openTrace) rows.push({ label: 'Trace Image', run: insertActions.openTrace, enabled: () => true, closesMenu: true });
    return rows;
  }
  function buildViewRows() {
    return [
      { label: 'Zoom In', run: () => canvas.zoomIn(), enabled: () => true },
      { label: 'Zoom Out', run: () => canvas.zoomOut(), enabled: () => true },
      { label: 'Fit Canvas', run: () => canvas.fit(), enabled: () => true },
      {
        label: 'Fit Selection', enabled: () => scene.getSelection().length > 0,
        run: () => {
          const box = scene.getSelectionWorldAABB();
          if (box) canvas.fitBox(box);
        },
      },
      { label: 'Reset View (100%)', run: () => canvas.resetTo100(), enabled: () => true },
      { sep: true },
      {
        label: () => (canvas.isGridVisible() ? 'Hide Grid' : 'Show Grid'),
        run: () => canvas.toggleGrid(), enabled: () => true,
      },
      { label: 'Guides', run: () => toast('Guides are not available in this build yet'), enabled: () => false },
      { sep: true },
      {
        label: 'Pan Mode (Hand tool)',
        run: () => toolController && toolController.switchTool('hand'),
        enabled: () => !!toolController,
      },
      {
        label: () => (canvas.isFullscreen() ? 'Exit Fullscreen' : 'Fullscreen'),
        run: () => canvas.toggleFullscreen(document.getElementById('app')),
        enabled: () => canvas.isFullscreenSupported(),
      },
    ];
  }

  const root = document.createElement('div');
  root.id = 'menu-bar-panel';
  root.className = 'floating-panel panel-menu-bar';
  root.setAttribute('role', 'menu');
  root.hidden = true;
  root.innerHTML = `
    <div class="text-panel-header">
      <span class="text-panel-title">قائمة المحرر • Editor Menu</span>
      <button type="button" class="icon-btn sm text-panel-close" title="إغلاق" aria-label="إغلاق القائمة">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="menu-bar-accordion"></div>
  `;
  document.getElementById('app').appendChild(root);

  const accordion = root.querySelector('.menu-bar-accordion');
  const closeBtn = root.querySelector('.text-panel-close');
  closeBtn.addEventListener('click', () => close());

  function rowsFor(menu) {
    if (menu.id === 'view') return buildViewRows();
    if (menu.id === 'insert') return buildInsertRows();
    return menu.rows;
  }

  function render() {
    accordion.innerHTML = '';
    for (const menu of MENUS) {
      const section = document.createElement('div');
      section.className = 'menu-bar-section';
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'menu-bar-section-header';
      header.textContent = menu.label;
      const list = document.createElement('div');
      list.className = 'menu-bar-section-list';
      list.hidden = menu.id !== (root.dataset.openMenu || MENUS[0].id);
      header.classList.toggle('active', !list.hidden);

      for (const row of rowsFor(menu)) {
        if (row.sep) { list.appendChild(document.createElement('hr')); continue; }
        const label = typeof row.label === 'function' ? row.label() : row.label;
        if (row.info) {
          // Plain, non-interactive read-out (Help > Keyboard Shortcuts)
          // — real, existing shortcuts, never a clickable command.
          const info = document.createElement('div');
          info.className = 'menu-bar-row menu-bar-info' + (row.indent ? ' menu-bar-info-indent' : '');
          info.textContent = label;
          list.appendChild(info);
          continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'menu-bar-row';
        btn.textContent = label;
        btn.disabled = !row.enabled();
        btn.addEventListener('click', () => {
          row.run();
          if (row.closesMenu) close(); else render();
        });
        list.appendChild(btn);
      }

      header.addEventListener('click', () => {
        root.dataset.openMenu = list.hidden ? menu.id : '';
        render();
      });

      section.appendChild(header);
      section.appendChild(list);
      accordion.appendChild(section);
    }
  }

  // Selection/scene changes flip which rows are enabled (e.g. Paste
  // becomes available right after a Copy, Ungroup right after
  // selecting a groupable composition) — keep the open menu's rows
  // honest without the user having to close and reopen it.
  scene.onSelectionChange(() => { if (!root.hidden) render(); });
  scene.onChange(() => { if (!root.hidden) render(); });
  history.onHistoryChange(() => { if (!root.hidden) render(); });

  function open() {
    root.hidden = false;
    if (!root.dataset.openMenu) root.dataset.openMenu = 'edit';
    if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');
    render();
  }
  function close() {
    root.hidden = true;
    if (triggerEl) triggerEl.setAttribute('aria-expanded', 'false');
  }

  return { open, close, isOpen: () => !root.hidden, toggle: () => (root.hidden ? open() : close()) };
}
