// Canvas viewport: pan + zoom over a fixed-size logical artboard.
//
// The artboard (#artboard, defined in CSS as 1600x1000 logical px) sits
// inside #world. #world's CSS transform is the camera: translate(x, y)
// scale(scale), where x/y are the artboard's screen-space offset from
// the top-left of #workspace. Zooming keeps the point under the cursor
// (or the workspace center, for the toolbar buttons) visually fixed.
//
// Also owns two-finger pinch-to-zoom (touch): tracks every active
// pointer itself, and — the moment a second finger comes down — tells
// tools.js's select/hand-tool drag to abort via onGestureStart, so a
// single-finger object drag doesn't fight a pinch that starts mid-drag.

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ARTBOARD_W = 1600;
const ARTBOARD_H = 1000;
const FIT_PADDING = 64; // px of breathing room around the artboard when fitting

export function createCanvasController({ workspaceEl, worldEl, onZoomChange }) {
  const camera = { x: 0, y: 0, scale: 1 };
  const gestureStartListeners = new Set();
  // Phase 7, View menu "Show/Hide grid": real toggle over the grid
  // overlay <svg> declared in index.html — a sibling of #scene, so
  // toggling it can never touch the actual object model, save/load, or
  // any export path.
  // Real-browser testing found the `.hidden` IDL property is not
  // reliably reflected on a root <svg> element (unlike the plain <div>
  // elements the rest of this app toggles that way) -- it can read
  // back `undefined` even though the "hidden" content attribute is
  // genuinely present, which would silently break both the visibility
  // read AND the toggle. Using getAttribute/setAttribute/removeAttribute
  // directly avoids depending on that IDL reflection at all.
  const gridEl = document.getElementById('grid-overlay');
  function isGridVisible() { return !!gridEl && !gridEl.hasAttribute('hidden'); }
  function setGridVisible(v) {
    if (!gridEl) return;
    if (v) gridEl.removeAttribute('hidden'); else gridEl.setAttribute('hidden', '');
  }
  function toggleGrid() { setGridVisible(!isGridVisible()); }

  function apply() {
    worldEl.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
    if (onZoomChange) onZoomChange(camera.scale);
  }

  function clampScale(s) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  // Zoom while keeping (screenX, screenY) — coordinates relative to
  // #workspace's own top-left — visually anchored under the cursor.
  function zoomAt(screenX, screenY, nextScale) {
    const target = clampScale(nextScale);
    const worldX = (screenX - camera.x) / camera.scale;
    const worldY = (screenY - camera.y) / camera.scale;
    camera.scale = target;
    camera.x = screenX - worldX * target;
    camera.y = screenY - worldY * target;
    apply();
  }

  function zoomByFactor(factor) {
    const rect = workspaceEl.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, camera.scale * factor);
  }

  function zoomIn() { zoomByFactor(1.2); }
  function zoomOut() { zoomByFactor(1 / 1.2); }

  function fit() {
    const rect = workspaceEl.getBoundingClientRect();
    const availW = Math.max(1, rect.width - FIT_PADDING * 2);
    const availH = Math.max(1, rect.height - FIT_PADDING * 2);
    const scale = clampScale(Math.min(availW / ARTBOARD_W, availH / ARTBOARD_H, 1));
    camera.scale = scale;
    camera.x = (rect.width - ARTBOARD_W * scale) / 2;
    camera.y = (rect.height - ARTBOARD_H * scale) / 2;
    apply();
  }

  function resetTo100() {
    const rect = workspaceEl.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, 1);
  }

  // Phase 7 View menu, "Fit Selection": identical math to fit() above,
  // just against an arbitrary world-space box (the current selection's
  // real AABB from scene.getSelectionWorldAABB()) instead of the fixed
  // artboard size — so selecting one small glyph and choosing Fit
  // Selection genuinely zooms/centers on THAT object, not the whole
  // artboard.
  function fitBox(box, padding = FIT_PADDING) {
    if (!box || !(box.width > 0) || !(box.height > 0)) return;
    const rect = workspaceEl.getBoundingClientRect();
    const availW = Math.max(1, rect.width - padding * 2);
    const availH = Math.max(1, rect.height - padding * 2);
    const scale = clampScale(Math.min(availW / box.width, availH / box.height));
    camera.scale = scale;
    camera.x = rect.width / 2 - (box.minX + box.width / 2) * scale;
    camera.y = rect.height / 2 - (box.minY + box.height / 2) * scale;
    apply();
  }

  // Phase 7 View menu, "Fullscreen where supported": real Fullscreen
  // API, feature-detected — never a fake CSS "pretend fullscreen" that
  // just hides chrome, and never presented as available where the
  // browser/sandbox has disabled it (some embedded/iframed contexts
  // block requestFullscreen entirely).
  function isFullscreenSupported() {
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  }
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  async function toggleFullscreen(targetEl) {
    if (!isFullscreenSupported()) return false;
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        const el = targetEl || document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
      return true;
    } catch (err) {
      console.error('[calligraphy-editor] Fullscreen request failed:', err);
      return false;
    }
  }

  // ---- wheel = zoom toward cursor ----
  workspaceEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = workspaceEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(sx, sy, camera.scale * factor);
  }, { passive: false });

  // ---- hand tool / single-finger drag-to-pan ----
  let panning = false;
  let panStart = null;

  function beginPan(clientX, clientY) {
    panning = true;
    panStart = { clientX, clientY, x: camera.x, y: camera.y };
    workspaceEl.classList.add('panning');
  }
  function movePan(clientX, clientY) {
    if (!panning || !panStart) return;
    camera.x = panStart.x + (clientX - panStart.clientX);
    camera.y = panStart.y + (clientY - panStart.clientY);
    apply();
  }
  function endPan() {
    panning = false;
    panStart = null;
    workspaceEl.classList.remove('panning');
  }

  // ---- two-finger pinch-to-zoom (touch) ----
  const activePointers = new Map(); // pointerId -> {x, y}
  let pinch = null; // { startDist, startMid, startScale }

  function onGestureStart(fn) { gestureStartListeners.add(fn); return () => gestureStartListeners.delete(fn); }

  function pointerArray() { return [...activePointers.values()]; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  workspaceEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const rect = workspaceEl.getBoundingClientRect();
    activePointers.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (activePointers.size === 2) {
      if (panning) endPan();
      gestureStartListeners.forEach((fn) => fn());
      const [a, b] = pointerArray();
      pinch = { startDist: dist(a, b) || 1, startMid: mid(a, b), startScale: camera.scale, startCameraX: camera.x, startCameraY: camera.y };
    }
  }, { capture: true });

  workspaceEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !activePointers.has(e.pointerId)) return;
    const rect = workspaceEl.getBoundingClientRect();
    activePointers.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (pinch && activePointers.size === 2) {
      const [a, b] = pointerArray();
      const newDist = dist(a, b) || 1;
      const newMid = mid(a, b);
      const scale = clampScale(pinch.startScale * (newDist / pinch.startDist));
      // keep the pinch midpoint visually anchored, same idea as zoomAt,
      // plus carry through any midpoint translation (two-finger pan).
      const worldX = (pinch.startMid.x - pinch.startCameraX) / pinch.startScale;
      const worldY = (pinch.startMid.y - pinch.startCameraY) / pinch.startScale;
      camera.scale = scale;
      camera.x = newMid.x - worldX * scale;
      camera.y = newMid.y - worldY * scale;
      apply();
    }
  }, { capture: true });

  function releasePointer(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinch = null;
  }
  workspaceEl.addEventListener('pointerup', releasePointer, { capture: true });
  workspaceEl.addEventListener('pointercancel', releasePointer, { capture: true });

  return {
    camera,
    apply,
    zoomIn,
    zoomOut,
    zoomAt,
    fit,
    fitBox,
    resetTo100,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    isGridVisible,
    toggleGrid,
    setGridVisible,
    beginPan,
    movePan,
    endPan,
    isPanning: () => panning,
    onGestureStart,
    isPinching: () => !!pinch,
  };
}
