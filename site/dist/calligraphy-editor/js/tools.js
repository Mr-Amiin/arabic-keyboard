// Tool dock state machine + the select tool's own interactions:
// click/drag-to-move an object, marquee (rubber-band) multi-select on
// empty canvas, and the object-manipulation keyboard shortcuts.
// Handle dragging (rotate/resize) lives in object-interactions.js.

import { toast } from './toast.js';
import * as scene from './scene.js';
import { arrowHeadPoints } from './geometry.js';

const COMING_SOON = {
  background: 'Background controls — coming soon',
};

// Drag-to-draw tools: a bounding-box drag (rectangle/circle/triangle/
// diamond), an endpoint-to-endpoint drag (line/arrow), or a freehand
// stroke (pen). 'decoration' is intentionally NOT here — it opens the
// decorations panel (like 'text' opens the text panel) rather than
// drawing on drag; see the dock click handler below.
const SHAPE_TOOLS = { rectangle: 'addRectUndoable', circle: 'addEllipseUndoable', triangle: 'addTriangleUndoable', diamond: 'addDiamondUndoable' };
const LINE_TOOLS = new Set(['line', 'arrow']);
const DRAWING_TOOLS = new Set([...Object.keys(SHAPE_TOOLS), ...LINE_TOOLS, 'pen']);

const IMPLEMENTED = new Set(['select', 'hand', ...DRAWING_TOOLS]);
const DRAG_THRESHOLD = 3; // px, screen space — below this a mousedown+up is a "click"
const MIN_DRAWN_SIZE = 4; // artboard px — a drag shorter than this is treated as an accidental/no-op click, not a shape

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

export function createToolController({ dockEl, workspaceEl, canvas, previewEl, onOpenTextPanel, onOpenColorPanel, onOpenDecorationsPanel, onOpenTashkeelPanel, onOpenElementsPanel, onOpenDesignsPanel, onOpenTracePanel }) {
  let activeTool = 'select';

  // ---- drag-to-draw state (pen/line/arrow/rectangle/circle/triangle/diamond) ----
  let drawState = null; // { tool, start, end } for shapes/lines, or { tool:'pen', points:[...] }

  // ---- drag-to-move state (select tool, on a hit object) ----
  let dragIds = null;
  let dragStart = null;
  let dragSnapshot = null;
  let dragMoved = false;
  // Set on pointerdown when the hit object is already part of a bigger
  // selection: we keep the WHOLE group selected/draggable through the
  // gesture (so dragging any one member moves everyone), but if the
  // gesture turns out to be a plain click with no drag, we narrow down
  // to just this object on pointerup — same as Figma/Illustrator.
  let pendingNarrowId = null;

  // ---- marquee (rubber-band) selection state ----
  let marqueeEl = null;
  let marqueeStart = null; // { clientX, clientY }
  let marqueeActive = false;

  function applyWorkspaceCursorClass() {
    // Remove every possible tool-* class (not just the two Phase 1/3
    // ever used) so switching between drawing tools doesn't leave stale
    // classes accumulating on #workspace.
    workspaceEl.classList.remove('tool-select', 'tool-hand', ...[...IMPLEMENTED].map((t) => `tool-${t}`));
    workspaceEl.classList.add(`tool-${activeTool}`);
  }

  function setActiveButton(toolId) {
    dockEl.querySelectorAll('.dock-btn[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolId);
    });
  }

  function switchTool(toolId) {
    if (!IMPLEMENTED.has(toolId)) {
      toast(COMING_SOON[toolId] || 'Not implemented yet');
      return;
    }
    if (activeTool === 'hand' && canvas.isPanning()) canvas.endPan();
    activeTool = toolId;
    setActiveButton(toolId);
    applyWorkspaceCursorClass();
  }

  dockEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dock-btn');
    if (!btn) return;

    if (btn.dataset.action === 'delete') {
      if (!scene.deleteSelection()) toast('Nothing selected to delete');
      return;
    }
    if (btn.dataset.tool === 'text') { onOpenTextPanel && onOpenTextPanel(); return; }
    if (btn.dataset.tool === 'decoration') { onOpenDecorationsPanel && onOpenDecorationsPanel(); return; }
    if (btn.dataset.tool === 'tashkeel') { onOpenTashkeelPanel && onOpenTashkeelPanel(); return; }
    if (btn.dataset.tool === 'elements') { onOpenElementsPanel && onOpenElementsPanel(); return; }
    if (btn.dataset.tool === 'designs') { onOpenDesignsPanel && onOpenDesignsPanel(); return; }
    if (btn.dataset.tool === 'trace') { onOpenTracePanel && onOpenTracePanel(); return; }
    if (btn.dataset.tool === 'color') {
      if (!scene.getSelection().length) { toast('Select an object to change its color'); return; }
      onOpenColorPanel && onOpenColorPanel();
      return;
    }
    if (btn.dataset.tool) switchTool(btn.dataset.tool);
  });

  // ---- keyboard shortcuts ----
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

    if (e.key === 'v' || e.key === 'V') switchTool('select');
    if (e.key === 'h' || e.key === 'H') switchTool('hand');
    if (e.key === 'p' || e.key === 'P') switchTool('pen');
    if (e.key === 'l' || e.key === 'L') switchTool('line');
    if (e.key === 'r' || e.key === 'R') switchTool('rectangle');
    if (e.key === 'c' || e.key === 'C') switchTool('circle');
    // The dock button's own title has always advertised "Add Text (T)"
    // (Phase 6, point 10 audit found the shortcut itself was never
    // actually wired) -- mirrors the dock click handler exactly rather
    // than introducing a second, possibly-diverging "open text panel"
    // path.
    if ((e.key === 't' || e.key === 'T') && !(e.ctrlKey || e.metaKey || e.altKey)) { onOpenTextPanel && onOpenTextPanel(); return; }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (scene.getSelection().length) { e.preventDefault(); scene.deleteSelection(); }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      if (scene.getSelection().length) { e.preventDefault(); scene.duplicateSelection(); }
      return;
    }

    if (e.key === 'Escape' && drawState) {
      // Cancel an in-progress drag-to-draw gesture without committing
      // anything — same convention as Escape cancelling a marquee or
      // leaving fine-edit below.
      drawState = null;
      clearPreview();
      return;
    }

    if (e.key === 'Escape' && scene.getPathEditId()) {
      // One level at a time: leave Edit Path first (back to the plain
      // Fine-Edit glyph selection), a second Escape leaves Fine Edit
      // itself — never both at once.
      scene.exitPathEdit();
      return;
    }

    if (e.key === 'Escape' && scene.getFineEditPatchId()) {
      // Leave fine-edit mode (drilled-into glyph/cluster editing) and
      // fall back to the coherent-composition default, same convention
      // as leaving a group in Figma/Illustrator.
      scene.exitFineEdit();
      scene.clearSelection();
      return;
    }

    const nudgeMap = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (nudgeMap[e.key] && scene.getSelection().length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const [dx, dy] = nudgeMap[e.key];
      scene.nudgeSelection(dx * step, dy * step);
    }
  });

  // ---- marquee helpers ----

  function ensureMarqueeEl() {
    if (!marqueeEl) {
      marqueeEl = document.createElement('div');
      marqueeEl.className = 'marquee';
      workspaceEl.appendChild(marqueeEl);
    }
    return marqueeEl;
  }

  function updateMarqueeVisual(x0, y0, x1, y1) {
    const el = ensureMarqueeEl();
    const left = Math.min(x0, x1), top = Math.min(y0, y1);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${Math.abs(x1 - x0)}px`;
    el.style.height = `${Math.abs(y1 - y0)}px`;
    el.hidden = false;
  }

  function hideMarquee() {
    if (marqueeEl) marqueeEl.hidden = true;
  }

  function screenToArtboard(clientX, clientY) {
    const rect = workspaceEl.getBoundingClientRect();
    const { camera } = canvas;
    return {
      x: (clientX - rect.left - camera.x) / camera.scale,
      y: (clientY - rect.top - camera.y) / camera.scale,
    };
  }

  // ---- drag-to-draw helpers (pen/line/arrow/rectangle/circle/triangle/diamond) ----

  function clearPreview() {
    if (previewEl) previewEl.textContent = '';
  }

  // Renders the in-progress gesture into #draw-preview — a sibling SVG
  // scene.js's render() never touches — so it survives every re-render
  // that happens elsewhere while the user is still dragging (e.g. a
  // dev-only debug view, or another tab of this same document). The
  // colors here are cosmetic-only guesses at the eventual object; the
  // real fill/stroke/strokeWidth defaults are applied by scene.js's
  // addXUndoable functions when the gesture commits.
  function updateDrawPreview() {
    clearPreview();
    if (!drawState || !previewEl) return;

    if (drawState.tool === 'pen') {
      if (drawState.points.length < 2) return;
      const d = drawState.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
      previewEl.appendChild(svgEl('path', { d, fill: 'none', stroke: '#161616', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 }));
      return;
    }

    const { start: p1, end: p2 } = drawState;
    if (LINE_TOOLS.has(drawState.tool)) {
      const strokeWidth = 4;
      previewEl.appendChild(svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: '#161616', 'stroke-width': strokeWidth, 'stroke-linecap': 'round', opacity: 0.85 }));
      if (drawState.tool === 'arrow') {
        const [tip, left, right] = arrowHeadPoints(p1, p2, strokeWidth);
        previewEl.appendChild(svgEl('polygon', { points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`, fill: '#161616', opacity: 0.85 }));
      }
      return;
    }

    // Shape tools: dragged corner-to-corner, previewed as the actual
    // shape (not just a rubber-band rectangle) so the user sees what
    // they're about to commit.
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    const w = maxX - minX, h = maxY - minY;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const common = { fill: 'rgba(43,138,62,0.35)', stroke: '#2b8a3e', 'stroke-width': 2 };
    if (drawState.tool === 'rectangle') {
      previewEl.appendChild(svgEl('rect', { x: minX, y: minY, width: Math.max(w, 0.001), height: Math.max(h, 0.001), ...common }));
    } else if (drawState.tool === 'circle') {
      previewEl.appendChild(svgEl('ellipse', { cx, cy, rx: Math.max(w / 2, 0.001), ry: Math.max(h / 2, 0.001), ...common }));
    } else if (drawState.tool === 'triangle') {
      previewEl.appendChild(svgEl('polygon', { points: `${cx},${minY} ${minX},${maxY} ${maxX},${maxY}`, ...common }));
    } else if (drawState.tool === 'diamond') {
      previewEl.appendChild(svgEl('polygon', { points: `${cx},${minY} ${maxX},${cy} ${cx},${maxY} ${minX},${cy}`, ...common }));
    }
  }

  // Commits the finished gesture as a real, undo-safe scene object via
  // scene.js's Phase-4 creation functions, then returns to the select
  // tool so the user can immediately move/rotate/recolor what they just
  // drew — the same "draw once, then edit" flow Add Text already uses
  // (auto-selecting the new object and putting the user back in a mode
  // where they can act on it).
  function commitDraw() {
    if (!drawState) return;
    let newId = null;

    if (drawState.tool === 'pen') {
      if (drawState.points.length >= 2) newId = scene.addPathFromPointsUndoable({ points: drawState.points });
    } else if (LINE_TOOLS.has(drawState.tool)) {
      const { start: p1, end: p2 } = drawState;
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) >= MIN_DRAWN_SIZE) {
        newId = drawState.tool === 'line'
          ? scene.addLineUndoable({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
          : scene.addArrowUndoable({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
    } else {
      const { start: p1, end: p2 } = drawState;
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      if (w >= MIN_DRAWN_SIZE || h >= MIN_DRAWN_SIZE) {
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const fnName = SHAPE_TOOLS[drawState.tool];
        newId = scene[fnName]({ x: cx, y: cy, width: Math.max(w, MIN_DRAWN_SIZE), height: Math.max(h, MIN_DRAWN_SIZE) });
      }
    }

    if (newId) switchTool('select');
  }

  // ---- pointer wiring: hand tool pans, select tool hits/drags/marquees, drawing tools draw ----
  workspaceEl.addEventListener('pointerdown', (e) => {
    // Phase 27 (full-editor audit): handles only get first refusal on a
    // pointerdown while the SELECT tool is active. Switching to the dock's
    // "select" tool does not clear the current scene selection (by
    // design — that is what makes the select tool immediately act on
    // whatever was last selected), so a previously-drawn, still-selected
    // shape's resize/rotate handles stay visible and interactive even
    // after the user switches to a DRAWING tool. Reproduced: draw a
    // rectangle (auto-selected), re-click the rectangle tool, then
    // drag-to-draw a second shape starting exactly on the first
    // rectangle's now-visible SE handle — before this fix, that drag
    // silently resized the OLD rectangle instead of drawing a new one,
    // because this same unconditional check swallowed the pointerdown
    // before DRAWING_TOOLS was ever consulted. A drawing tool's intent
    // is unambiguous (the user explicitly chose it to create something
    // new), so stale handles must never intercept it — only the select
    // tool defers to object-interactions.js here.
    if (activeTool === 'select' && e.target.closest('[data-handle]')) return; // handles own this (object-interactions.js)

    if (DRAWING_TOOLS.has(activeTool)) {
      const p = screenToArtboard(e.clientX, e.clientY);
      drawState = activeTool === 'pen' ? { tool: 'pen', points: [p] } : { tool: activeTool, start: p, end: p };
      workspaceEl.setPointerCapture(e.pointerId);
      updateDrawPreview();
      return;
    }

    if (activeTool === 'hand') {
      workspaceEl.setPointerCapture(e.pointerId);
      canvas.beginPan(e.clientX, e.clientY);
      return;
    }

    if (activeTool === 'select') {
      const hitId = scene.objectIdAtEvent(e);

      if (!hitId) {
        // Empty canvas: could be a plain deselect-click, or the start
        // of a marquee drag — decided by DRAG_THRESHOLD in pointermove.
        // Clicking empty space also leaves fine-edit mode, same as
        // clicking outside a group in Figma/Illustrator.
        if (scene.getFineEditPatchId()) scene.exitFineEdit();
        marqueeStart = { clientX: e.clientX, clientY: e.clientY };
        marqueeActive = false;
        workspaceEl.setPointerCapture(e.pointerId);
        return;
      }

      const obj = scene.getObject(hitId);

      // A visual calligraphic PATCH (e.g. "عيد" within "عيد مبارك") is
      // the NORMAL editable unit by default — clicking any glyph in it
      // selects the WHOLE patch, not just that letter, and not the
      // whole phrase either. Individual glyph/cluster selection only
      // happens once you've double-clicked INTO that patch (fine-edit
      // mode); clicking something outside the patch currently being
      // fine-edited leaves that mode first.
      const wasFineEditing = scene.getFineEditPatchId();
      if (wasFineEditing && obj?.patchId !== wasFineEditing) {
        scene.exitFineEdit();
      }
      const targets = scene.resolveClickTargets(hitId);

      pendingNarrowId = null;
      if (e.shiftKey) {
        const allIn = targets.every((id) => scene.isSelected(id));
        if (allIn) scene.setSelection(scene.getSelection().filter((id) => !targets.includes(id)));
        else scene.addToSelection(targets);
      } else if (!scene.isSelected(hitId)) {
        // The clicked object isn't part of the current selection at
        // all: switch straight to its resolved unit (the whole
        // calligraphic patch, or — inside fine-edit mode — just its
        // cluster).
        scene.setSelection(targets);
      } else {
        const cur = scene.getSelection();
        const sameSet = cur.length === targets.length && targets.every((id) => cur.includes(id));
        if (!sameSet) {
          // Already selected, but as part of a BIGGER selection than its
          // own resolved unit — either several individually fine-edit-
          // selected glyphs/clusters, OR (very commonly) the whole
          // composition auto-selected right after "Add to Canvas" and
          // never clicked since. Keep the whole current selection intact
          // so a drag still moves everyone together; only narrow down to
          // just this click's resolved unit (the clicked calligraphic
          // PATCH in normal mode, or a single glyph/cluster in fine-edit
          // mode) if the gesture turns out to be a plain click with no
          // movement — the same click-vs-drag disambiguation Phase 3
          // already verified, now generalized beyond fine-edit mode so a
          // plain click always lands on the patch per the object model.
          // (A coherent whole-patch selection in normal mode never
          // narrows this way — sameSet is always true there, so it
          // stays one unit until you double-click into it.)
          pendingNarrowId = hitId;
        }
      }
      if (obj && obj.locked) return;

      dragIds = scene.getUnlockedSelection();
      dragStart = { clientX: e.clientX, clientY: e.clientY };
      dragSnapshot = scene.snapshotTransforms(dragIds);
      dragMoved = false;
      workspaceEl.setPointerCapture(e.pointerId);
    }
  });

  // Double-click a glyph inside a calligraphic patch to drill into
  // fine-edit mode: HarfBuzz shaped-cluster becomes the selectable unit
  // (a ligature or a base letter + its diacritic move together), so the
  // rest of the patch — and the rest of the phrase — stays put. Escape
  // / clicking empty canvas / clicking a different patch leaves
  // fine-edit mode again.
  workspaceEl.addEventListener('dblclick', (e) => {
    if (activeTool !== 'select') return;
    // Not e.target: the preceding pointerdown's setPointerCapture(...)
    // redirects subsequent mouse events' target to the capturing
    // element (a spec'd legacy-compat behavior), so by the time
    // 'dblclick' fires, e.target is #workspace itself, not the glyph
    // under the cursor. Hit-test by coordinate instead.
    const hitEl = document.elementFromPoint(e.clientX, e.clientY);
    const hitId = hitEl && hitEl.closest ? (hitEl.closest('[data-object-id]')?.getAttribute('data-object-id') || null) : null;
    if (!hitId) return;
    const obj = scene.getObject(hitId);
    if (!obj || !obj.patchId) return; // nothing to drill into
    scene.enterFineEdit(obj.patchId);
    scene.setSelection(scene.resolveClickTargets(hitId));
  });

  workspaceEl.addEventListener('pointermove', (e) => {
    if (drawState) {
      const p = screenToArtboard(e.clientX, e.clientY);
      if (drawState.tool === 'pen') {
        const last = drawState.points[drawState.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 2) drawState.points.push(p);
      } else {
        drawState.end = p;
      }
      updateDrawPreview();
      return;
    }

    if (activeTool === 'hand' && canvas.isPanning()) {
      canvas.movePan(e.clientX, e.clientY);
      return;
    }

    if (marqueeStart) {
      const dx = e.clientX - marqueeStart.clientX;
      const dy = e.clientY - marqueeStart.clientY;
      if (!marqueeActive && Math.hypot(dx, dy) > DRAG_THRESHOLD) marqueeActive = true;
      if (marqueeActive) {
        updateMarqueeVisual(marqueeStart.clientX, marqueeStart.clientY, e.clientX, e.clientY);
      }
      return;
    }

    if (dragIds && dragStart) {
      const dxScreen = e.clientX - dragStart.clientX;
      const dyScreen = e.clientY - dragStart.clientY;
      if (Math.hypot(dxScreen, dyScreen) > DRAG_THRESHOLD) dragMoved = true;
      const dx = dxScreen / canvas.camera.scale;
      const dy = dyScreen / canvas.camera.scale;
      scene.applyTransformLive(dragSnapshot, (o, orig) => { o.x = orig.x + dx; o.y = orig.y + dy; });
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (drawState) {
      commitDraw();
      drawState = null;
      clearPreview();
      return;
    }

    if (canvas.isPanning()) canvas.endPan();

    if (marqueeStart) {
      if (marqueeActive) {
        const a = screenToArtboard(marqueeStart.clientX, marqueeStart.clientY);
        const b = screenToArtboard(e.clientX, e.clientY);
        const rect = {
          minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
        };
        const hits = scene.resolveMarqueeSelection(scene.objectsIntersectingRect(rect));
        if (e.shiftKey) scene.addToSelection(hits); else scene.setSelection(hits);
      } else {
        if (scene.getFineEditPatchId()) scene.exitFineEdit();
        scene.clearSelection();
      }
      hideMarquee();
      marqueeStart = null;
      marqueeActive = false;
    }

    if (dragIds && dragSnapshot) {
      if (dragMoved) {
        scene.commitTransform(dragSnapshot);
      } else if (pendingNarrowId) {
        // Plain click (no drag) on a member of a bigger selection: narrow
        // down now to that click's own resolved unit — the clicked
        // calligraphic patch in normal mode, or just one glyph/cluster
        // if we're inside fine-edit mode. Recomputed here (rather than
        // reusing whatever was resolved at pointerdown) so it still
        // reflects the fine-edit state at release time.
        scene.setSelection(scene.resolveClickTargets(pendingNarrowId));
      }
    }
    pendingNarrowId = null;
    dragIds = null;
    dragStart = null;
    dragSnapshot = null;
    dragMoved = false;
  });

  // If a second finger comes down mid-gesture (canvas.js owns pinch
  // detection), abort whatever single-pointer drag/marquee we started
  // from the first finger so the two don't fight over the same object.
  if (canvas.onGestureStart) {
    canvas.onGestureStart(() => {
      if (dragIds && dragSnapshot && dragMoved) scene.commitTransform(dragSnapshot);
      dragIds = null; dragStart = null; dragSnapshot = null; dragMoved = false;
      if (marqueeStart) { hideMarquee(); marqueeStart = null; marqueeActive = false; }
      if (drawState) { drawState = null; clearPreview(); }
    });
  }

  applyWorkspaceCursorClass();

  return {
    getActiveTool: () => activeTool,
    switchTool,
  };
}
