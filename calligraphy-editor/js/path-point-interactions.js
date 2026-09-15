// Pointer wiring for dragging a real anchor or Bézier control point
// while Edit Path is active (Phase 5). Lives in #selection-overlay,
// same convention as object-interactions.js's resize/rotate handles —
// a sibling listener rather than an addition to that file, since
// dragging a curve point is a materially different gesture (it mutates
// one glyph's own path data, not the object's transform) even though
// both start from a pointerdown on an overlay element.

import * as scene from './scene.js';

function toArtboardPoint(evt, workspaceEl, camera) {
  const rect = workspaceEl.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left - camera.x) / camera.scale,
    y: (evt.clientY - rect.top - camera.y) / camera.scale,
  };
}

export function createPathPointInteractions({ overlayEl, workspaceEl, canvas, getActiveTool }) {
  let dragging = null; // { id, pointRef, beforePathD }

  overlayEl.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-path-point-kind]');
    if (!target) return;
    // Phase 27 (full-editor audit): same bug class as
    // object-interactions.js's resize/rotate handles. Entering Edit Path
    // (via the inspector's Edit Path button) sets scene.getPathEditId(),
    // and switching the dock to a drawing tool afterward neither exits
    // Edit Path nor changes the selection -- so these anchor/control
    // point handles stay rendered and, without this guard, silently
    // hijacked a drag-to-draw gesture into mutating the glyph's existing
    // path instead of drawing a new shape (reproduced: countAfter stayed
    // equal to countBefore and the glyph's `path` string changed). Only
    // the select tool defers to these handles; every drawing tool's
    // pointerdown must fall through untouched to tools.js's own
    // workspaceEl handler, which is what actually starts the new shape.
    if (getActiveTool && getActiveTool() !== 'select') return;
    const id = scene.getPathEditId();
    const obj = id && scene.getObject(id);
    if (!obj || obj.locked) return;
    e.preventDefault();
    e.stopPropagation();

    dragging = {
      id,
      beforePathD: obj.path,
      pointRef: {
        subpathIndex: Number(target.getAttribute('data-subpath-index')),
        segmentIndex: Number(target.getAttribute('data-segment-index')),
        xField: target.getAttribute('data-x-field'),
        yField: target.getAttribute('data-y-field'),
      },
    };
    overlayEl.setPointerCapture(e.pointerId);
  });

  overlayEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const point = toArtboardPoint(e, workspaceEl, canvas.camera);
    scene.applyPathPointLive(dragging.id, dragging.pointRef, point.x, point.y);
  });

  function end() {
    if (!dragging) return;
    const obj = scene.getObject(dragging.id);
    if (obj) scene.commitPathPointEdit(dragging.id, dragging.beforePathD, obj.path);
    dragging = null;
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
