// Small, framework-free 2D math helpers shared by scene.js (the data
// model) and object-interactions.js (handle dragging). Kept separate
// so neither of those files has to duplicate this arithmetic.

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function rotateVec(x, y, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Angle (degrees) from `center` to `point`, in the same screen/artboard
// coordinate system (y-down). Used for rotate-handle dragging.
export function angleDeg(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x) * RAD2DEG;
}

export function snapAngle(deg, step) {
  return Math.round(deg / step) * step;
}

// Real arrowhead geometry computed from the actual segment direction
// and stroke width (never a fixed decal) — shared by scene.js's
// permanent arrow rendering and tools.js's live drag preview, so the
// preview an in-progress arrow shows during the drag is pixel-for-pixel
// the same shape the committed object renders with afterward.
export function arrowHeadPoints(p1, p2, strokeWidth) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const headLen = Math.max(14, strokeWidth * 4);
  const headWidth = Math.max(10, strokeWidth * 3);
  const backX = p2.x - ux * headLen, backY = p2.y - uy * headLen;
  const left = { x: backX + nx * (headWidth / 2), y: backY + ny * (headWidth / 2) };
  const right = { x: backX - nx * (headWidth / 2), y: backY - ny * (headWidth / 2) };
  return [p2, left, right];
}
