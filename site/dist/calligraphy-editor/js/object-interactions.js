// Pointer wiring for the selection overlay's own handles: the rotate
// handle and the 8 resize handles. Uses event delegation on
// #selection-overlay so it keeps working across scene.js's full
// re-renders (new handle elements every time) without re-binding.
//
// Works identically for a single selected object (pivot = its own
// center, rotation-aware) and a multi-object selection (pivot = the
// group's axis-aligned bounding box, rotation always 0 for the group
// frame itself) — see scene.js's rotateAroundPivot/scaleAroundPivot.

import * as scene from './scene.js';
import { rotateVec, DEG2RAD, angleDeg, snapAngle } from './geometry.js';

const MIN_SCALE_MAG = 0.02;

function toArtboardPoint(evt, workspaceEl, camera) {
  const rect = workspaceEl.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left - camera.x) / camera.scale,
    y: (evt.clientY - rect.top - camera.y) / camera.scale,
  };
}

// Local (pre-scale) points for each handle, in a frame with half-width
// hw / half-height hh. Used for both the single-object (rotated) case
// and the group (unrotated) case.
function handleLocalPoint(handle, hw, hh) {
  switch (handle) {
    case 'resize-nw': return { x: -hw, y: -hh };
    case 'resize-ne': return { x: hw, y: -hh };
    case 'resize-se': return { x: hw, y: hh };
    case 'resize-sw': return { x: -hw, y: hh };
    case 'resize-n': return { x: 0, y: -hh };
    case 'resize-s': return { x: 0, y: hh };
    case 'resize-e': return { x: hw, y: 0 };
    case 'resize-w': return { x: -hw, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function axisModeFor(handle) {
  if (handle === 'resize-n' || handle === 'resize-s') return 'y';
  if (handle === 'resize-e' || handle === 'resize-w') return 'x';
  return 'both';
}

function withMinMagnitude(v) {
  if (Math.abs(v) >= MIN_SCALE_MAG) return v;
  return MIN_SCALE_MAG * (v < 0 ? -1 : 1);
}

export function createObjectInteractions({ overlayEl, workspaceEl, canvas, getActiveTool }) {
  let mode = null; // 'rotate' | 'resize' | null
  let currentHandle = null;
  let snapshot = null;
  let pivotWorld = null;
  let startAngleDeg = 0;
  let single = null; // rotation-aware single-object resize state
  let group = null; // axis-aligned group resize state

  function beginRotate(e) {
    const ids = scene.getUnlockedSelection();
    if (!ids.length) return false;
    snapshot = scene.snapshotTransforms(ids);
    if (ids.length === 1) {
      const obj = scene.getObject(ids[0]);
      pivotWorld = { x: obj.x, y: obj.y };
    } else {
      const b = scene.getSelectionWorldAABB(ids);
      pivotWorld = { x: b.cx, y: b.cy };
    }
    const startPoint = toArtboardPoint(e, workspaceEl, canvas.camera);
    startAngleDeg = angleDeg(pivotWorld, startPoint);
    return true;
  }

  function beginResize(handle, e) {
    const ids = scene.getUnlockedSelection();
    if (!ids.length) return false;
    snapshot = scene.snapshotTransforms(ids);

    if (ids.length === 1) {
      const obj = scene.getObject(ids[0]);
      const hw = obj.localWidth / 2, hh = obj.localHeight / 2;
      const handleLocal = handleLocalPoint(handle, hw, hh);
      const pivotLocal = { x: -handleLocal.x, y: -handleLocal.y };
      const rad = obj.rotation * DEG2RAD;
      const pivotOffset = rotateVec(pivotLocal.x * obj.scaleX, pivotLocal.y * obj.scaleY, rad);
      pivotWorld = { x: obj.x + pivotOffset.x, y: obj.y + pivotOffset.y };
      const handleOffset = rotateVec(handleLocal.x * obj.scaleX, handleLocal.y * obj.scaleY, rad);
      const refVec = { x: handleOffset.x - pivotOffset.x, y: handleOffset.y - pivotOffset.y };
      single = { pivotLocal, rotationRad: rad, refVec, origScaleX: obj.scaleX, origScaleY: obj.scaleY };
      group = null;
    } else {
      const b = scene.getSelectionWorldAABB(ids);
      const hw = b.width / 2, hh = b.height / 2;
      const handleLocal = handleLocalPoint(handle, hw, hh);
      const pivotLocal = { x: -handleLocal.x, y: -handleLocal.y };
      pivotWorld = { x: b.cx + pivotLocal.x, y: b.cy + pivotLocal.y };
      const refVec = { x: handleLocal.x - pivotLocal.x, y: handleLocal.y - pivotLocal.y };
      group = { refVec };
      single = null;
    }
    return true;
  }

  overlayEl.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-handle]');
    if (!target) return;
    // Phase 27 (full-editor audit): a still-selected object's resize/
    // rotate handles stay rendered on the overlay even after the user
    // switches to a drawing tool (switching tools never clears the
    // scene selection — see tools.js's switchTool). Without this guard,
    // a drag-to-draw gesture that happens to start on one of those
    // stale handles was silently hijacked into resizing/rotating the
    // OLD object instead of drawing the new shape the user explicitly
    // chose a drawing tool to create — confirmed reproducible before
    // this fix. Only the select tool defers to these handles; every
    // drawing tool's pointerdown must reach tools.js's own workspaceEl
    // handler untouched (that file's matching guard is what actually
    // starts the new shape once this listener steps aside).
    if (getActiveTool && getActiveTool() !== 'select') return;
    e.preventDefault();
    e.stopPropagation();

    const handle = target.getAttribute('data-handle');
    const started = handle === 'rotate' ? beginRotate(e) : beginResize(handle, e);
    if (!started) return;

    overlayEl.setPointerCapture(e.pointerId);
    mode = handle === 'rotate' ? 'rotate' : 'resize';
    currentHandle = handle;
  });

  overlayEl.addEventListener('pointermove', (e) => {
    if (!mode || !snapshot) return;
    const point = toArtboardPoint(e, workspaceEl, canvas.camera);

    if (mode === 'rotate') {
      let deltaDeg = angleDeg(pivotWorld, point) - startAngleDeg;
      if (e.shiftKey) deltaDeg = snapAngle(deltaDeg, 15);
      scene.rotateAroundPivot(snapshot, pivotWorld, deltaDeg);
      return;
    }

    // resize
    const axis = axisModeFor(currentHandle);

    if (single) {
      const rel = { x: point.x - pivotWorld.x, y: point.y - pivotWorld.y };
      const cur = rotateVec(rel.x, rel.y, -single.rotationRad);
      let fx = single.origScaleX;
      let fy = single.origScaleY;
      if (axis === 'both') {
        const refLen = Math.hypot(single.refVec.x, single.refVec.y) || 1;
        const factor = withMinMagnitude(Math.hypot(cur.x, cur.y) / refLen);
        fx = single.origScaleX * factor;
        fy = single.origScaleY * factor;
      } else if (axis === 'x' && single.refVec.x !== 0) {
        fx = single.origScaleX * withMinMagnitude(cur.x / single.refVec.x);
      } else if (axis === 'y' && single.refVec.y !== 0) {
        fy = single.origScaleY * withMinMagnitude(cur.y / single.refVec.y);
      }
      const newPivotOffset = rotateVec(single.pivotLocal.x * fx, single.pivotLocal.y * fy, single.rotationRad);
      const newCenter = { x: pivotWorld.x - newPivotOffset.x, y: pivotWorld.y - newPivotOffset.y };
      scene.applyTransformLive(snapshot, (o) => {
        o.x = newCenter.x; o.y = newCenter.y; o.scaleX = fx; o.scaleY = fy;
      });
    } else if (group) {
      const cur = { x: point.x - pivotWorld.x, y: point.y - pivotWorld.y };
      let fx = 1, fy = 1;
      if (axis === 'both') {
        const refLen = Math.hypot(group.refVec.x, group.refVec.y) || 1;
        const factor = withMinMagnitude(Math.hypot(cur.x, cur.y) / refLen);
        fx = factor; fy = factor;
      } else if (axis === 'x' && group.refVec.x !== 0) {
        fx = withMinMagnitude(cur.x / group.refVec.x);
      } else if (axis === 'y' && group.refVec.y !== 0) {
        fy = withMinMagnitude(cur.y / group.refVec.y);
      }
      scene.scaleAroundPivot(snapshot, pivotWorld, fx, fy);
    }
  });

  function end() {
    if (mode && snapshot) scene.commitTransform(snapshot);
    mode = null;
    currentHandle = null;
    snapshot = null;
    single = null;
    group = null;
  }

  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
