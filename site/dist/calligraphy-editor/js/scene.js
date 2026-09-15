// The canvas's object model: real, independently selectable/movable/
// rotatable/resizable vector objects living inside #scene (the SVG
// already defined in the Phase 1 shell — this is NOT a second canvas).
//
// Object model (every field is real, not a placeholder):
//   { id, type, path, glyphScale, offsetX, offsetY,
//     x, y,                 // visual CENTER, in artboard px
//     rotation,             // degrees, around (x, y)
//     scaleX, scaleY,       // can be negative -> flip
//     localWidth, localHeight, // unrotated/unscaled footprint, for bbox math
//     fill, opacity, locked }
//
// x/y is deliberately the object's VISUAL CENTER (not a glyph's baseline
// anchor) so rotate/scale/flip all pivot around it with no special
// cases — this is what makes "rotate around visual center" and
// "flip is a real geometric transform" trivial instead of fiddly.

import { pushCommand } from './history.js';
import { rotateVec, DEG2RAD, arrowHeadPoints } from './geometry.js';
import { forwardJoins } from './arabic-joining.js';
import { toast } from './toast.js';
import { parsePath, serializePath, listEditablePoints, applyPointEdit } from './path-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ARTBOARD_W = 1600;
const ARTBOARD_H = 1000;

const objects = new Map(); // id -> object
const order = []; // render order, back to front
let selection = new Set();

let sceneEl = null;
let overlayEl = null;
let selectionListeners = new Set();
let changeListeners = new Set(); // fires on any render (move/rotate/scale/etc.)

// Populated fresh by every full render() — lets a live drag/rotate/
// resize/spacing/baseline/path-point gesture (Phase 6 performance pass)
// update just the DOM nodes that actually changed on every pointermove,
// instead of tearing down and rebuilding the whole scene (which forced
// a getBBox() layout per glyph and was the measured bottleneck once a
// composition had 100+ objects). Never read across a render() boundary
// without repopulating first — see render()'s own comment.
let gNodes = new Map(); // object id -> its <g> element
let patchHitRectNodes = new Map(); // patchId -> its catch-all hit <rect> (multi-glyph patches only)

let nextId = 1;
function makeId() {
  return `obj-${nextId++}-${Date.now().toString(36)}`;
}
function makeGroupId() {
  return `grp-${nextId++}-${Date.now().toString(36)}`;
}
function makePatchId() {
  return `pat-${nextId++}-${Date.now().toString(36)}`;
}

// ---- calligraphic composition hierarchy ----
//
// A HarfBuzz-shaped text run is not "N independent letters", and it is
// also not "one giant object" or "one object per word" — it is a
// composition made of visual calligraphic PATCHES: maximal runs of
// glyphs that a real Arabic joining chain actually connects, per
// arabic-joining.js's Unicode Joining_Type data (see computePatchIds()
// below for how patch boundaries are derived). This gives three tiers:
//
//   groupId  — the whole "Add to Canvas" composition (all patches)
//   patchId  — one calligraphic patch (the NORMAL editing unit: a
//              plain click selects/moves/rotates/recolors a whole
//              patch, e.g. "عيد" or "مبا", as a single rigid object)
//   cluster  — HarfBuzz's own cluster index within a patch (the
//              FINE-EDIT unit: a base letter + its diacritic share a
//              cluster and stay together even when drilling into a
//              patch's individual glyphs)
//
// None of these are separately-tracked registries — they're derived on
// demand from objects' own fields, which are already carried correctly
// through clone/undo/redo (those copy the whole object), so deleting/
// duplicating/undoing members keeps membership correct for free.
export function getGroupChildIds(groupId) {
  if (!groupId) return [];
  return order.filter((id) => objects.get(id)?.groupId === groupId);
}
export function getPatchChildIds(patchId) {
  if (!patchId) return [];
  return order.filter((id) => objects.get(id)?.patchId === patchId);
}

// Fine-edit mode: which PATCH (if any) is currently "entered" for
// individual glyph/cluster editing. Null = normal mode, where clicking
// any member of a patch selects the WHOLE patch as one coherent object
// (the calligraphic-patch default this model is built around). This is
// transient UI state, not an undoable action (entering/leaving a patch
// isn't a content change).
let fineEditPatchId = null;
let editModeListeners = new Set();
export function onEditModeChange(fn) {
  editModeListeners.add(fn);
  return () => editModeListeners.delete(fn);
}
function notifyEditMode() { editModeListeners.forEach((fn) => fn({ fineEditPatchId, pathEditId })); }
export function getFineEditPatchId() { return fineEditPatchId; }
export function enterFineEdit(patchId) { fineEditPatchId = patchId || null; notifyEditMode(); }
export function exitFineEdit() { fineEditPatchId = null; exitPathEdit(); notifyEditMode(); }

// Path-edit ("Edit Path"): a deeper level than Fine Edit, entered only
// for ONE already fine-edit-selected glyph/mark at a time. Like fine-
// edit itself, this is transient UI state (not undoable on its own) —
// but the point/curve DRAGS a user makes while it's active genuinely
// rewrite that glyph's own path data, and those ARE undoable (see
// commitPathEdit below).
let pathEditId = null;
export function getPathEditId() { return pathEditId; }
export function enterPathEdit(id) {
  const obj = objects.get(id);
  if (!obj || obj.type !== 'glyph') return false; // only real font outlines have a path to edit
  pathEditId = id;
  notifyEditMode();
  render();
  return true;
}
export function exitPathEdit() {
  if (!pathEditId) return;
  pathEditId = null;
  notifyEditMode();
  render();
}

// ---- Edit Path: real anchor/Bézier control-point editing ----
//
// A glyph's `path` is raw font-design-unit SVG data (y-up), rendered
// through TWO transforms (see addGlyphRun's big comment and
// renderDrawingObject's glyph branch in render()): an inner
// `translate(offsetX,offsetY) scale(glyphScale,-glyphScale)` (font
// units -> local px, flipping y for SVG), then the object's own outer
// `translate(x,y) rotate(rotation) scale(scaleX,scaleY)` (local px ->
// world/artboard px). These two functions are exact forward/inverse
// pairs of that whole pipeline, so a point dragged in world space maps
// back to the precise font-unit coordinate that reproduces it — no
// approximation, no separate "preview vs. real" geometry.
function glyphFontToWorld(obj, fx, fy) {
  const localX = obj.offsetX + fx * obj.glyphScale;
  const localY = obj.offsetY - fy * obj.glyphScale;
  const scaledX = localX * obj.scaleX;
  const scaledY = localY * obj.scaleY;
  const rotated = rotateVec(scaledX, scaledY, obj.rotation * DEG2RAD);
  return { x: obj.x + rotated.x, y: obj.y + rotated.y };
}
function worldToGlyphFont(obj, wx, wy) {
  const rel = { x: wx - obj.x, y: wy - obj.y };
  const unrotated = rotateVec(rel.x, rel.y, -obj.rotation * DEG2RAD);
  const localX = unrotated.x / obj.scaleX;
  const localY = unrotated.y / obj.scaleY;
  const fx = (localX - obj.offsetX) / obj.glyphScale;
  const fy = (obj.offsetY - localY) / obj.glyphScale;
  return { x: fx, y: fy };
}

// Returns every draggable anchor/control point of the currently
// path-edited glyph, already converted to WORLD (artboard) space for
// rendering, plus enough addressing info (subpathIndex/segmentIndex/
// field) to write a drag back into the real path. Returns null when
// path-edit isn't active or the object is gone.
export function getPathEditPoints() {
  const obj = pathEditId && objects.get(pathEditId);
  if (!obj || obj.type !== 'glyph') return null;
  const subpaths = parsePath(obj.path);
  const points = listEditablePoints(subpaths);
  return points.map((p) => ({
    ...p,
    world: glyphFontToWorld(obj, p.x, p.y),
    anchorWorld: p.kind === 'control' ? glyphFontToWorld(obj, p.anchorX, p.anchorY) : null,
  }));
}

// Live-drag preview: mutates the glyph's real `path` string (via the
// same parse/apply/serialize round-trip commit uses) and re-renders,
// but does NOT push an undo command yet — that happens once, on
// pointerup, via commitPathPointEdit, exactly like every other drag in
// this app (move/rotate/resize) snapshots once and commits once rather
// than spamming the undo stack on every pointermove.
export function applyPathPointLive(id, pointRef, worldX, worldY) {
  const obj = objects.get(id);
  if (!obj || obj.locked) return;
  const subpaths = parsePath(obj.path);
  const fontPt = worldToGlyphFont(obj, worldX, worldY);
  applyPointEdit(subpaths, pointRef, fontPt.x, fontPt.y);
  obj.path = serializePath(subpaths);
  updateLivePath(id);
}

export function commitPathPointEdit(id, beforePathD, afterPathD) {
  if (beforePathD === afterPathD) return;
  pushCommand({
    do() { const o = objects.get(id); if (o) { o.path = afterPathD; render(); } },
    undo() { const o = objects.get(id); if (o) { o.path = beforePathD; render(); } },
  });
}

// Given the id of the object a pointer event hit, resolve what should
// actually become selected:
//   - object with no patch (e.g. a future non-text shape) -> just itself
//   - patched object, not currently fine-editing that patch -> the
//     WHOLE patch (the calligraphic-patch default)
//   - patched object, fine-editing that exact patch -> just the glyphs
//     sharing its HarfBuzz cluster (so a base letter and its diacritic
//     move together, but the rest of the patch doesn't)
export function resolveClickTargets(hitId) {
  const obj = objects.get(hitId);
  if (!obj) return hitId ? [hitId] : [];
  if (obj.patchId && fineEditPatchId === obj.patchId) {
    // Phase 5: a diacritic mark can be drilled into on its own — it
    // never needs its base letter along for the ride to be moved/
    // recolored/deleted individually. A base letter (or anything that
    // isn't itself a mark) keeps the Phase-3-accepted behavior: the
    // whole HarfBuzz cluster (base + its attached marks) as one unit.
    if (obj.isMark) return [hitId];
    return getPatchChildIds(obj.patchId).filter((id) => objects.get(id)?.cluster === obj.cluster);
  }
  if (obj.patchId) return getPatchChildIds(obj.patchId);
  if (obj.groupId) return getGroupChildIds(obj.groupId);
  return [hitId];
}

// Marquee selection resolves the same way in normal mode (dragging a
// box over part of a composition selects whole PATCHES, not a jumble
// of individual glyphs — so a marquee over the entire phrase naturally
// selects every patch, which is how you deliberately select "the whole
// composition" under this model); inside fine-edit mode, glyphs
// belonging to the patch currently being fine-edited stay per-object so
// a deliberate multi-glyph marquee still works, while anything outside
// that patch still resolves at the patch level.
export function resolveMarqueeSelection(ids) {
  const resolved = new Set();
  for (const id of ids) {
    const obj = objects.get(id);
    if (fineEditPatchId && obj?.patchId === fineEditPatchId) {
      resolved.add(id);
    } else if (obj?.patchId) {
      getPatchChildIds(obj.patchId).forEach((cid) => resolved.add(cid));
    } else {
      resolved.add(id);
    }
  }
  return [...resolved];
}

export function init({ sceneEl: scene, overlayEl: overlay }) {
  sceneEl = scene;
  overlayEl = overlay;
}

export function artboardSize() {
  return { width: ARTBOARD_W, height: ARTBOARD_H };
}

export function onSelectionChange(fn) {
  selectionListeners.add(fn);
  return () => selectionListeners.delete(fn);
}
export function onChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
function notifySelection() { selectionListeners.forEach((fn) => fn([...selection])); }
function notifyChange() { changeListeners.forEach((fn) => fn()); }

export function getSelection() { return [...selection]; }
export function getUnlockedSelection() { return [...selection].filter((id) => !objects.get(id)?.locked); }
export function isSelected(id) { return selection.has(id); }
export function getObject(id) { return objects.get(id); }
export function getAllObjectIds() { return [...order]; }

export function setSelection(ids) {
  selection = new Set(ids.filter((id) => objects.has(id)));
  renderSelectionOverlay();
  notifySelection();
}
export function clearSelection() { setSelection([]); }

// Phase 7 Edit menu: Select All really does select every real object
// currently on the canvas (not a fake "select the visible viewport" or
// similar) — same setSelection() every other selection change uses, so
// it participates in the exact same overlay/inspector/undo-aware code
// paths as a manual click or marquee.
export function selectAll() { setSelection(getAllObjectIds()); }
export function toggleSelection(id) {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id); else next.add(id);
  setSelection([...next]);
}
export function addToSelection(ids) {
  setSelection([...new Set([...selection, ...ids])]);
}

// ---- geometry helpers ----

// Local (unrotated, unscaled) half-extents, in the object's own frame.
function localHalfExtents(obj) {
  return { hw: obj.localWidth / 2, hh: obj.localHeight / 2 };
}

// The object's 4 corners in world (artboard) space, honoring rotation
// and scale — this is the *oriented* box, used to draw a single
// selected object's own rotated selection frame.
export function getObjectOrientedCorners(id) {
  const obj = objects.get(id);
  if (!obj) return null;
  const { hw, hh } = localHalfExtents(obj);
  const rad = obj.rotation * DEG2RAD;
  const local = [
    { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh },
  ];
  return local.map((p) => {
    const scaled = { x: p.x * obj.scaleX, y: p.y * obj.scaleY };
    const rotated = rotateVec(scaled.x, scaled.y, rad);
    return { x: obj.x + rotated.x, y: obj.y + rotated.y };
  });
}

// Axis-aligned bounding box of an object (post-rotation) — used for
// marquee selection, alignment, distribution, and multi-select bounds.
export function getObjectWorldAABB(id) {
  const corners = getObjectOrientedCorners(id);
  if (!corners) return null;
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// Partition a set of (unlocked) selected ids into "rigid units" for
// transforms that must preserve a composition's own internal
// arrangement (align/distribute/flip/duplicate): checked hierarchically
// so the transform always acts on the LARGEST intact unit each id is
// part of —
//   1. a whole GROUP (every patch of the composition present) moves as
//      ONE rigid block — e.g. selecting the entire phrase and aligning
//      it slides the whole thing, patches and all, without disturbing
//      their relative arrangement;
//   2. otherwise, a whole PATCH (every glyph of that calligraphic patch
//      present, e.g. all of "عيد") is ONE rigid block — the normal
//      case, since a patch is the default selection unit;
//   3. anything left over (a fine-edit selection of individual glyphs/
//      clusters that doesn't cover a whole patch) is its own unit,
//      exactly like today's per-glyph behavior.
function partitionIntoRigidUnits(ids) {
  const idSet = new Set(ids);
  const units = [];
  const consumed = new Set();

  const seenGroups = new Set();
  for (const id of ids) {
    const gid = objects.get(id)?.groupId;
    if (!gid || seenGroups.has(gid)) continue;
    seenGroups.add(gid);
    const full = getGroupChildIds(gid);
    if (full.length && full.every((cid) => idSet.has(cid))) {
      units.push({ ids: full });
      full.forEach((cid) => consumed.add(cid));
    }
  }

  const seenPatches = new Set();
  for (const id of ids) {
    if (consumed.has(id)) continue;
    const pid = objects.get(id)?.patchId;
    if (!pid || seenPatches.has(pid)) continue;
    seenPatches.add(pid);
    const full = getPatchChildIds(pid);
    if (full.length && full.every((cid) => idSet.has(cid))) {
      units.push({ ids: full });
      full.forEach((cid) => consumed.add(cid));
    }
  }

  for (const id of ids) {
    if (!consumed.has(id)) { units.push({ ids: [id] }); consumed.add(id); }
  }
  return units;
}

// How many independent "things" (whole compositions, whole patches, or
// lone fine-edit glyphs/clusters) the current selection represents —
// this is what align/distribute actually operate on, so UI enablement
// (e.g. the contextual panel's Distribute button, which needs >=3)
// should check this, not the raw glyph count.
export function countRigidUnits(ids = getUnlockedSelection()) {
  return partitionIntoRigidUnits(ids).length;
}

export function getSelectionWorldAABB(ids = getSelection()) {
  const boxes = ids.map(getObjectWorldAABB).filter(Boolean);
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function aabbIntersects(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function objectsIntersectingRect(rect) {
  const hits = [];
  for (const id of order) {
    const box = getObjectWorldAABB(id);
    if (box && aabbIntersects(box, rect)) hits.push(id);
  }
  return hits;
}

// ---- measuring a raw path's font-unit bbox (needs a live SVG) ----

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function measurePathBBox(d) {
  const probe = el('path', { d });
  sceneEl.appendChild(probe);
  let bbox;
  try { bbox = probe.getBBox(); } finally { sceneEl.removeChild(probe); }
  return bbox;
}

// Applies a real coordinate transform to every (x, y) point in an SVG
// path `d` string, by actually parsing the path grammar -- command
// letters, per-command argument arity, and implicit repeated argument
// groups -- rather than pattern-matching "any two consecutive numbers".
// That naive approach was tried first and was a real bug: this app's
// own real HarfBuzz-derived glyph/mark paths are NOT reliably
// whitespace-separated (e.g. a genuine extracted path reads
// "M354,1021Q379,1036 372,1011L362,979...", mixing commas and spaces
// between numbers), so "two numbers separated by whitespace" silently
// paired the trailing y of one coordinate with the leading x of the
// NEXT, unrelated coordinate wherever a space (rather than a comma)
// happened to separate them -- corrupting real glyph geometry (visibly:
// a doubled bounding-box width and an off-center insertion) without
// ever throwing an error. absolute commands (M/L/H/V/C/S/Q/T/A, upper-
// case) have their real coordinates transformed; relative (lowercase)
// commands encode DELTAS, which a uniform transform must leave
// untouched (translating/flipping a whole path doesn't change the
// vector between two of its own points).
function transformPathD(d, transformFn) {
  const ARITY = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7, H: 1, V: 1, Z: 0 };
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const isCmd = (t) => /^[MLHVCSQTAZmlhvcsqtaz]$/.test(t);
  const r2 = (n) => Math.round(n * 100) / 100;

  let out = '';
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i]; i++;
    out += cmd;
    const upper = cmd.toUpperCase();
    const absolute = cmd === upper;
    const arity = ARITY[upper];
    if (arity === 0) continue; // Z takes no arguments
    let firstGroup = true;
    // Per the SVG path grammar, further argument groups with no new
    // command letter between them implicitly repeat the same command.
    while (i < tokens.length && !isCmd(tokens[i])) {
      const args = tokens.slice(i, i + arity).map(Number);
      i += arity;
      if (!firstGroup) out += ' ';
      firstGroup = false;
      if (upper === 'H') {
        out += absolute ? `${r2(transformFn(args[0], 0)[0])}` : `${args[0]}`;
      } else if (upper === 'V') {
        out += absolute ? `${r2(transformFn(0, args[0])[1])}` : `${args[0]}`;
      } else if (upper === 'A') {
        const [rx, ry, rot, laf, sf, x, y] = args;
        const [nx, ny] = absolute ? transformFn(x, y) : [x, y];
        out += `${rx} ${ry} ${rot} ${laf} ${sf} ${r2(nx)} ${r2(ny)}`;
      } else {
        const parts = [];
        for (let p = 0; p < args.length; p += 2) {
          const [nx, ny] = absolute ? transformFn(args[p], args[p + 1]) : [args[p], args[p + 1]];
          parts.push(r2(nx), r2(ny));
        }
        out += parts.join(' ');
      }
    }
  }
  return out;
}

// Translate every real (absolute) coordinate in a path's `d` string by
// (dx, dy). Used only for 'path'-type objects whose visible content
// must be re-centered on local (0,0) before insertion -- see
// addTashkeelGlyphUndoable below for why.
function translatePathD(d, dx, dy) {
  return transformPathD(d, (x, y) => [x + dx, y + dy]);
}

// ---- building calligraphic PATCHES from the shaped run ----
//
// This is the heart of the composition object model: turning HarfBuzz's
// flat glyph list into visual calligraphic patches — maximal runs of
// glyphs that a real Arabic joining chain actually connects. A patch is
// NOT one Unicode character and NOT one whole word; it is exactly the
// span of letters that stays cursively connected before a genuine
// break (a non-connecting letter, or a word space).
//
// The rule (see arabic-joining.js): walking the shaped glyphs in the
// order HarfBuzz gives them (already the correct visual layout order),
// a patch boundary belongs between two adjacent glyphs whenever the
// EARLIER one in logical reading order (the smaller `cluster` value)
// does not extend a connecting stroke forward — i.e. its source
// character's Joining_Type isn't Dual. A space (empty glyph) is always
// a boundary. Diacritics/marks share their base letter's `cluster`
// value, so they can never start or end a patch on their own — they
// simply ride along with whichever patch their base lands in.
//
// This is purely a function of the shaped run + the original text, so
// it never needs per-word special-casing and generalizes to arbitrary
// Arabic input.
function computePatchIndices(text, glyphs) {
  const breaksAfter = new Set(); // glyph-array index i -> break belongs between i and i+1
  for (let i = 0; i < glyphs.length - 1; i++) {
    const a = glyphs[i];
    const b = glyphs[i + 1];
    if (a.empty || b.empty) { breaksAfter.add(i); continue; }
    if (a.cluster === b.cluster) continue; // same source cluster (mark + base) -> never break
    const earlierIndex = Math.min(a.cluster, b.cluster);
    const ch = text[earlierIndex];
    if (!forwardJoins(ch)) breaksAfter.add(i);
  }
  const patchIndexByGlyphIndex = [];
  let patchIndex = 0;
  for (let i = 0; i < glyphs.length; i++) {
    patchIndexByGlyphIndex[i] = patchIndex;
    if (breaksAfter.has(i)) patchIndex++;
  }
  return patchIndexByGlyphIndex;
}

// ---- creating glyph objects from a shaped run (glyph-shaper output) ----

/**
 * Lay out shaped glyphs (already in HarfBuzz's visual left-to-right
 * array order — true for both LTR and RTL runs) along a baseline,
 * centered in the artboard, and create one real scene object per
 * glyph that actually has ink (skips zero-path glyphs like spaces,
 * though their advance still moves the pen). `text` is the original
 * source string the glyphs were shaped from — needed to look up each
 * glyph's source character's Arabic joining behavior when building
 * calligraphic patches (see computePatchIndices above).
 */
// Per-group metadata (Phase 5): which font family/variation and source
// text a composition was actually shaped from. Not needed for basic
// rendering (every glyph already carries its own real path/position),
// but required honestly for two Phase 5 features that would otherwise
// have nothing but the shaped outlines to go on: "Change Font" (needs
// the original text to RE-shape, and the variation preview must stay
// driven by the user's real text, never a hardcoded phrase) and full
// project persistence (point 10 explicitly lists font IDs/variation
// IDs among what must be saved). Keyed by groupId; harmless to leave a
// stale entry behind when a group is fully replaced or deleted.
const groupMeta = new Map(); // groupId -> { text, familyId, variationId, fontSizePx }
export function getGroupMeta(groupId) { return groupMeta.get(groupId) || null; }
export function setGroupMeta(groupId, meta) { groupMeta.set(groupId, meta); }
export function getAllGroupMeta() { return [...groupMeta.entries()]; }

// ---- Project persistence (Phase 5, point 10) ----
//
// Every object field lives directly ON the plain object (see the model
// comment at the top of this file), so a full-fidelity save is just
// "every object, in order, plus the one side-table (groupMeta) that
// isn't on the objects themselves" — no separate reconstruction logic
// per feature, and nothing (a path edit, a lock, a diacritic's isMark
// flag, a patch/group id, stroke cap/join, font/variation ids via
// groupMeta) can be missed because it was never in its own registry to
// begin with. project-store.js only ever sees this plain JSON shape.
export const CURRENT_PROJECT_VERSION = 1;

export function serializeProject() {
  return {
    version: CURRENT_PROJECT_VERSION,
    order: [...order],
    objects: order.map((id) => ({ ...objects.get(id) })),
    groupMeta: [...groupMeta.entries()],
    nextId,
  };
}

// Phase 6, point 9: called BEFORE loadProjectScene ever touches the
// live scene, so a corrupt file, a hand-edited/truncated one, or one
// saved by a NEWER build of this editor can be rejected with a clear
// message while the user's current canvas stays completely untouched
// — never a silent wipe to blank just because the file we were about
// to load turned out to be garbage.
export function validateProjectData(data) {
  if (data == null) return { ok: true }; // null/undefined = an intentionally blank project (New)
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'ملف المشروع تالف (بنية غير متوقعة)' };
  }
  if (!Array.isArray(data.objects)) {
    return { ok: false, error: 'ملف المشروع تالف أو غير مكتمل' };
  }
  if (typeof data.version === 'number' && data.version > CURRENT_PROJECT_VERSION) {
    return { ok: false, error: 'هذا المشروع محفوظ بإصدار أحدث من إصدار المحرر الحالي' };
  }
  return { ok: true };
}

// Replaces the ENTIRE scene with `data` (from serializeProject(), or
// null/undefined for a blank project) — used by both "New" and "Open".
// nextId only ever moves forward, so freshly-created objects in this
// session can never collide with an id baked into the loaded project.
export function loadProjectScene(data) {
  objects.clear();
  order.length = 0;
  groupMeta.clear();
  // Phase 7 glyph-extension side tables key off patchId strings, which
  // are only ever unique within one session's objects -- clear them on
  // every New/Open exactly like groupMeta above, so nothing here can
  // ever be read against a completely different loaded project's data.
  patchExtensionCount.clear();
  patchOriginalTextCache.clear();
  selection = new Set();
  fineEditPatchId = null;
  pathEditId = null;

  if (data && Array.isArray(data.objects)) {
    for (const obj of data.objects) {
      if (!obj || !obj.id) continue;
      // Phase 8, point 6: a hand-edited or partially-corrupted saved
      // project can carry an object missing one of the transform
      // fields every real object always has (see addGlyphRun and every
      // other constructor above, which all set these explicitly). Left
      // undefined, transformAttr() below would emit an invalid SVG
      // transform (e.g. "translate(undefined undefined)"), which the
      // browser silently rejects but also logs as a console error on
      // every render. Default exactly the way every real constructor
      // already does, so malformed data degrades to "drawn at the
      // origin, unrotated, unscaled" instead of a broken attribute.
      const safe = { ...obj };
      if (!Number.isFinite(safe.x)) safe.x = 0;
      if (!Number.isFinite(safe.y)) safe.y = 0;
      if (!Number.isFinite(safe.rotation)) safe.rotation = 0;
      if (!Number.isFinite(safe.scaleX)) safe.scaleX = 1;
      if (!Number.isFinite(safe.scaleY)) safe.scaleY = 1;
      objects.set(obj.id, safe);
    }
  }
  if (data && Array.isArray(data.order)) {
    for (const id of data.order) if (objects.has(id)) order.push(id);
  } else {
    order.push(...objects.keys());
  }
  if (data && Array.isArray(data.groupMeta)) {
    for (const entry of data.groupMeta) {
      if (Array.isArray(entry) && entry.length === 2) groupMeta.set(entry[0], entry[1]);
    }
  }
  if (data && typeof data.nextId === 'number' && data.nextId > nextId) nextId = data.nextId;

  render();
  notifySelection();
  notifyEditMode();
}

export function addGlyphRun({ text = '', upem, glyphs, fontSizePx = 220, fill = '#161616', opacity = 1, familyId = null, variationId = null }) {
  const scale = fontSizePx / upem;

  let totalAdvance = 0;
  for (const g of glyphs) totalAdvance += g.xAdvance;
  const totalWidthPx = totalAdvance * scale;

  const startX = (ARTBOARD_W - totalWidthPx) / 2;
  const baselineY = ARTBOARD_H / 2;

  // The whole run is one composition (groupId) made of calligraphic
  // patches (patchId, per glyph-array index) — see computePatchIndices.
  // A patch is the NORMAL selectable/movable unit; the whole group only
  // matters when every one of its patches ends up selected together
  // (e.g. via a marquee spanning the entire phrase).
  const groupId = makeGroupId();
  const patchIndexByGlyphIndex = computePatchIndices(text, glyphs);
  const patchIdForIndex = new Map();
  function patchIdFor(patchIndex) {
    if (!patchIdForIndex.has(patchIndex)) patchIdForIndex.set(patchIndex, `${groupId}-p${patchIndex}`);
    return patchIdForIndex.get(patchIndex);
  }

  const created = [];
  let cursor = 0; // font units

  for (let gi = 0; gi < glyphs.length; gi++) {
    const g = glyphs[gi];
    if (!g.empty) {
      // The TRUE HarfBuzz-shaped position for this glyph's own path
      // origin — this is the point that must land exactly where
      // HarfBuzz's cursor + per-glyph xOffset/yOffset says it should,
      // preserving the real advance/kerning/mark-positioning the shaper
      // computed for the whole run. Do not derive this from any glyph's
      // bounding box.
      const trueOriginX = startX + (cursor + g.xOffset) * scale;
      const trueOriginY = baselineY - g.yOffset * scale;

      const bbox = measurePathBBox(g.path); // font units
      const cxFont = bbox.x + bbox.width / 2;
      const cyFont = bbox.y + bbox.height / 2;

      // The object's x/y is deliberately the glyph's own VISUAL CENTER
      // (not its HarfBuzz origin) so rotate/resize/flip all pivot
      // naturally — see the big comment at the top of the file. That
      // means x/y must be the true origin SHIFTED to the center, and
      // offsetX/offsetY must shift the rendered path back the other way
      // by the exact same amount, so the two cancel out and the glyph's
      // own path origin still lands on trueOriginX/trueOriginY in world
      // space. (Bug found via real-browser testing: this used to set
      // x/y to the true origin directly and ALSO apply the center
      // offset, double-counting a per-glyph-varying shift and silently
      // wrecking the real HarfBuzz advance-based spacing between
      // glyphs — every glyph drifted by its own bbox center instead of
      // sitting where HarfBuzz actually shaped it.)
      const offsetX = -cxFont * scale;
      const offsetY = cyFont * scale;

      const id = makeId();
      objects.set(id, {
        id,
        type: 'glyph',
        path: g.path,
        glyphScale: scale,
        offsetX,
        offsetY,
        x: trueOriginX - offsetX,
        y: trueOriginY - offsetY,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        localWidth: bbox.width * scale,
        localHeight: bbox.height * scale,
        fill,
        opacity,
        locked: false,
        // Composition membership, three tiers (see the big comment
        // above computePatchIndices): groupId = the whole composition;
        // patchId = this glyph's calligraphic patch (the NORMAL
        // selectable/movable unit); cluster = HarfBuzz's own shaped-
        // cluster index (the FINE-EDIT unit — a base letter and its
        // diacritic share one and stay together even when drilling
        // into a patch's individual glyphs).
        groupId,
        patchId: patchIdFor(patchIndexByGlyphIndex[gi]),
        cluster: g.cluster,
        // A real, HarfBuzz-derived signal (not a guess): a combining
        // Arabic diacritic (Fatha, Kasra, Shadda, Sukun, Tanween,
        // Madd...) is GPOS-attached to its base letter and consumes no
        // pen advance of its own, so HarfBuzz always shapes it with
        // xAdvance === 0. A base letter (even a zero-width one in some
        // fonts, which advances via a nonzero xAdvance for its cluster)
        // never does. Used to let Fine Edit mode select an individual
        // mark on its own (Phase 5) while a base letter's default click
        // still resolves to its whole cluster (base + marks together,
        // unchanged from Phase 3).
        isMark: g.xAdvance === 0,
      });
      order.push(id);
      created.push(id);
    }
    cursor += g.xAdvance;
  }

  groupMeta.set(groupId, { text, familyId, variationId, fontSizePx });
  render();
  return created;
}

export function insertGlyphRunUndoable(args) {
  const ids = addGlyphRun(args);
  const snapshot = ids.map((id) => ({ ...objects.get(id) }));

  pushCommand({
    do() {
      if (!objects.has(ids[0])) {
        for (const obj of snapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
        render();
      }
      setSelection(ids);
    },
    undo() {
      for (const id of ids) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return ids;
}

// Phase 5 point 7 — "Change Font / Change Variation" for an existing
// composition: re-runs the REAL HarfBuzz shaping pipeline against the
// group's own original text (never a substitute), then rigidly moves/
// rotates/scales the freshly shaped result to match the OLD group's
// aggregate center/rotation/scale, and carries over its color/opacity
// — "preserve the patch's approximate placement" per spec. Every new
// glyph is a genuinely new object (new outlines from the new font/
// variation); nothing here fakes a font swap by re-coloring or
// reusing the old outlines. `newRun` is the result of the SAME
// shapeText() call text-panel.js already uses, so this never
// invents its own shaping.
// `reshapedMarkGroups` (optional): Phase 7 critical addendum, points 7
// & 8 -- a font OR variation change must genuinely reshape any
// manually-attached Tashkeel marks too, never leave them wearing the
// old font's stale geometry. The caller (text-panel.js) real-probes
// each group from getAttachedTashkeelMarkGroups() against the NEW
// font/variation via the exact same HarfBuzz path the Tashkeel panel
// itself uses, and hands back one entry per group:
//   { patchIndex, cluster, fill, markChar, memberCount,
//     supported, members? }
// `supported` is true only when the new font's real shaping produced
// at least `memberCount` genuine non-empty zero-advance glyphs for
// that mark/combo; `members` (present only when supported) is
// `[{ path, upem, xOffset, yOffset }, ...]` straight from that probe.
// A group the new font doesn't genuinely support is dropped (never
// faked) with an honest toast naming how many were removed.
export function reshapeGroupUndoable(groupId, newRun, reshapedMarkGroups = []) {
  const oldIds = getGroupChildIds(groupId);
  if (!oldIds.length) return null;
  const oldSnapshot = oldIds.map((id) => ({ ...objects.get(id) }));
  const oldMeta = groupMeta.get(groupId) || null;

  const oldBox = getSelectionWorldAABB(oldIds);
  const first = objects.get(oldIds[0]);
  const oldCenter = { x: oldBox.cx, y: oldBox.cy };
  const oldRotation = first.rotation;
  const oldScaleX = first.scaleX;
  const oldScaleY = first.scaleY;
  const oldFill = first.fill;
  const oldOpacity = first.opacity;

  // Snapshot every manually-attached mark object that's about to be
  // reshaped/removed, BEFORE any mutation, so a failed reshape leaves
  // them completely untouched (same honesty guarantee the group reshape
  // itself already has).
  const prefix = `${groupId}-p`;
  const oldMarkSnapshot = [];
  for (const entry of reshapedMarkGroups) {
    const oldPatchId = `${prefix}${entry.patchIndex}`;
    for (const id of order) {
      const o = objects.get(id);
      if (o && o.isMark && o.groupId === null && o.patchId === oldPatchId && o.cluster === entry.cluster) {
        oldMarkSnapshot.push({ ...o });
      }
    }
  }

  // Build the new group's objects (starting fresh-centered on the
  // artboard, exactly like a brand-new Add Text), then rigidly carry
  // them onto the old group's placement — same math as a real
  // move+rotate+scale gesture, not a shortcut.
  for (const id of oldIds) removeObjectInternal(id);
  const newIds = addGlyphRun({
    text: newRun.text, upem: newRun.upem, glyphs: newRun.glyphs,
    fontSizePx: newRun.fontSizePx ?? 220, fill: oldFill, opacity: oldOpacity,
    familyId: newRun.familyId, variationId: newRun.variationId,
  });
  if (!newIds.length) {
    // Shaping produced nothing visible (e.g. an empty/invalid result) —
    // put the original group back rather than silently deleting it.
    // The attached marks were never touched, so nothing to restore there.
    for (const obj of oldSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
    render();
    return null;
  }
  const newGroupId = objects.get(newIds[0]).groupId;
  const newBox = getSelectionWorldAABB(newIds);
  const dx = oldCenter.x - newBox.cx;
  const dy = oldCenter.y - newBox.cy;
  for (const id of newIds) { const o = objects.get(id); o.x += dx; o.y += dy; }
  if (oldRotation) {
    const snap = snapshotTransforms(newIds);
    rotateAroundPivot(snap, oldCenter, oldRotation);
  }
  if (oldScaleX !== 1 || oldScaleY !== 1) {
    const snap2 = snapshotTransforms(newIds);
    scaleAroundPivot(snap2, oldCenter, oldScaleX, oldScaleY);
  }

  // Now that the new patches genuinely exist, remove the old-font mark
  // objects and create their new-font replacements (or drop them
  // honestly if unsupported) attached to the corresponding new patch.
  for (const obj of oldMarkSnapshot) removeObjectInternal(obj.id);
  const newMarkObjs = [];
  let droppedCount = 0;
  const newFontSizePx = newRun.fontSizePx ?? 220;
  for (const entry of reshapedMarkGroups) {
    if (!entry.supported || !entry.members || !entry.members.length) {
      droppedCount += entry.memberCount || 1;
      continue;
    }
    const newPatchId = `${newGroupId}-p${entry.patchIndex}`;
    const scale = newFontSizePx / entry.members[0].upem;
    const geo = entry.members.map((m) => {
      const bbox = measurePathBBox(m.path);
      const cxFont = bbox.x + bbox.width / 2;
      const cyFont = bbox.y + bbox.height / 2;
      return {
        path: m.path, glyphScale: scale,
        offsetX: -cxFont * scale, offsetY: cyFont * scale,
        localWidth: bbox.width * scale, localHeight: bbox.height * scale,
        xOffset: m.xOffset || 0, yOffset: m.yOffset || 0,
      };
    });
    const anchor = computeAttachedMarkAnchor(newPatchId, geo[0].localWidth, geo[0].localHeight, newFontSizePx);
    // Phase 10D: same real positioning-source distinction a fresh
    // combo insertion uses (placeComboMembers) — entry.positioningSource
    // comes from text-panel.js's reshape probe re-checking the NEW
    // font's own real GPOS/mkmk presence, never carried over from the
    // old font's.
    const positions = placeComboMembers(geo, anchor, scale, entry.positioningSource || 'gpos');
    geo.forEach((g, i) => {
      const { x, y } = positions[i];
      newMarkObjs.push({
        id: makeId(), type: 'glyph', path: g.path, glyphScale: g.glyphScale,
        offsetX: g.offsetX, offsetY: g.offsetY,
        x, y, rotation: anchor.rotation, scaleX: 1, scaleY: 1,
        localWidth: g.localWidth, localHeight: g.localHeight,
        fill: entry.fill, opacity: 1, locked: false,
        groupId: null, patchId: anchor.patchId, cluster: anchor.cluster, isMark: true,
        markChar: entry.markChar,
      });
    });
  }
  for (const o of newMarkObjs) { objects.set(o.id, { ...o }); order.push(o.id); }

  render();
  setSelection(newIds);

  // Deliberately NOT toasted here: text-panel.js's submit handler
  // already shows its own "تم تحديث الخط" success toast right after
  // this call returns, and the shared #toast element only ever shows
  // one message at a time (a second toast() call clobbers the first
  // before the user can read it — caught by real end-to-end testing).
  // So this only REPORTS the drop count on the return value, and the
  // caller composes one single, honest, combined message.
  newIds.droppedMarkCount = droppedCount;

  const newSnapshot = newIds.map((id) => ({ ...objects.get(id) }));
  const newMarkSnapshot = newMarkObjs.map((o) => ({ ...o }));
  const newMarkIds = newMarkObjs.map((o) => o.id);
  const oldMarkIds = oldMarkSnapshot.map((o) => o.id);

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) {
        for (const id of oldIds) removeObjectInternal(id);
        for (const id of oldMarkIds) removeObjectInternal(id);
        for (const obj of newSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
        for (const obj of newMarkSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
        groupMeta.set(newGroupId, { text: newRun.text, familyId: newRun.familyId, variationId: newRun.variationId, fontSizePx: newFontSizePx });
        render();
      }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      for (const id of newMarkIds) removeObjectInternal(id);
      for (const obj of oldSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
      for (const obj of oldMarkSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
      if (oldMeta) groupMeta.set(groupId, oldMeta);
      render();
      setSelection(oldIds);
    },
  });
  return newIds;
}

// Phase 7, point 12: "genuine glyph extension" (Arabic kashida/tatweel
// letter-extension), investigated and implemented ONLY where our real
// font assets genuinely support it -- see probeGlyphExtension() below.
// The only typographically honest way to extend a connector is the
// same one real Arabic typesetting has always used: insert an actual
// U+0640 ARABIC TATWEEL character at a real internal join within the
// patch's own text and re-shape through HarfBuzz, so the FONT's own
// joining glyphs produce the wider connector -- never a fake stretch
// of an existing glyph's geometry (explicitly forbidden by the spec,
// and the same "connector decomposition" limitation already documented
// in the Phase 6 report means we have no independent connector
// geometry to stretch even if we wanted to).
const TATWEEL = 'ـ';
const patchExtensionCount = new Map(); // patchId -> how many tatweels already inserted
// patchId -> the patch's ORIGINAL (pre-any-extension) text, cached the
// first time it's derived. This anchor is deliberately never recomputed
// from a patch's CURRENT member glyphs after the first extension: once
// extended, those objects' own `cluster` values come from HarfBuzz
// re-shaping the ALREADY-EXTENDED text, so they are indices into that
// extended string, not into the parent composition's original `text` —
// re-deriving from them at that point would slice the wrong substring.
// Every repeat extension instead rebuilds from this one stable anchor
// plus the current tatweel count, which is exactly why it has to be
// cached rather than recomputed.
const patchOriginalTextCache = new Map();

// Real (non-mark) HarfBuzz-shaped base-letter members of a patch, in
// their own cluster order -- excludes any manually-attached Tashkeel
// mark (Phase 7 point 1), which always carries a synthetic NEGATIVE
// cluster specifically so it can never be mistaken for one of these.
function patchBaseLetterMembers(patchId) {
  return getPatchChildIds(patchId)
    .map((id) => objects.get(id))
    .filter((o) => o && o.type === 'glyph' && o.cluster != null && o.cluster >= 0)
    .sort((a, b) => a.cluster - b.cluster);
}

// Resolves the patch's ORIGINAL (never-extended) text plus its parent
// group's font metadata. First call derives the substring from the
// patch's real members' own HarfBuzz cluster indices (character
// offsets into groupMeta's `text`) and caches it; every later call for
// the same patchId reuses that cached anchor instead of re-deriving it
// (see patchOriginalTextCache's comment for why re-deriving would be
// wrong once the patch has actually been extended once).
function getPatchTextRange(patchId) {
  const members = patchBaseLetterMembers(patchId);
  if (members.length < 2) return null; // need >=2 letters for an internal join to exist
  const groupId = members[0].groupId;
  const meta = groupId ? groupMeta.get(groupId) : null;
  if (!meta || !meta.text) return null;
  if (patchOriginalTextCache.has(patchId)) {
    return { groupId, meta, patchText: patchOriginalTextCache.get(patchId) };
  }
  const clusters = members.map((m) => m.cluster);
  const startIdx = Math.min(...clusters);
  const endIdx = Math.max(...clusters) + 1;
  const patchText = meta.text.slice(startIdx, endIdx);
  patchOriginalTextCache.set(patchId, patchText);
  return { groupId, meta, patchText };
}

// Structural (synchronous, no shaping) check: is there even a
// plausible internal join to extend? A real per-font support check
// still has to happen via probeGlyphExtension() before actually
// offering this — a font can genuinely lack a usable joining glyph at
// this exact position even though the letters do join.
export function canExtendPatch(patchId) {
  const range = getPatchTextRange(patchId);
  if (!range) return false;
  for (let i = 0; i < range.patchText.length - 1; i++) {
    if (forwardJoins(range.patchText[i])) return true;
  }
  return false;
}

// Real, per-font probe: actually shapes the patch's own text with one
// more tatweel inserted at the first real internal join, through the
// SAME HarfBuzz pipeline every glyph in this app goes through, and
// checks the font produced a genuinely wider result (one extra real,
// non-empty, non-zero-advance glyph) rather than silently ignoring the
// tatweel or substituting an empty placeholder. Returns the ready-to-
// commit shaped run when supported, or null when this font genuinely
// doesn't support it here -- the caller (inspector-panel.js) uses null
// to grey out/hide the control rather than ever faking the effect.
export async function probeGlyphExtension(patchId, shapeTextFn) {
  const range = getPatchTextRange(patchId);
  if (!range) return null;
  const joinIdx = [...range.patchText].findIndex((ch, i) => i < range.patchText.length - 1 && forwardJoins(ch));
  if (joinIdx === -1) return null;

  const count = (patchExtensionCount.get(patchId) || 0) + 1;
  const extendedText = range.patchText.slice(0, joinIdx + 1) + TATWEEL.repeat(count) + range.patchText.slice(joinIdx + 1);

  const registry = await import('./font-registry.js');
  const found = range.meta.variationId ? registry.findVariation(range.meta.variationId) : null;
  if (!found) return null;
  const { variation } = found;
  const shapingUrl = registry.fontShapingUrl(variation.file);
  const features = variation.features || [];
  const weight = variation.weight || 400;

  // Compared against the run with ONE FEWER tatweel (the previous
  // extension step, or the un-extended original for the first click) —
  // never always against the un-extended original. Real-browser
  // probing (see /tmp/debug_double_tatweel.js in the dev log) found
  // that at least one bundled font genuinely SUPPORTS repeated
  // extension but does it by substituting one progressively WIDER
  // kashida-ligature glyph for a run of consecutive tatweels, rather
  // than adding one more separate glyph per tatweel — so glyph COUNT
  // is not a reliable signal past the first click. What is reliable,
  // and what a user actually cares about, is real width: "genuinely
  // supported" means this click's extra tatweel produced strictly more
  // real advance (the word visibly got wider) than the previous step.
  const priorText = count > 1
    ? range.patchText.slice(0, joinIdx + 1) + TATWEEL.repeat(count - 1) + range.patchText.slice(joinIdx + 1)
    : range.patchText;
  const priorRun = await shapeTextFn({ shapingUrl, text: priorText, features, weight });
  const extRun = await shapeTextFn({ shapingUrl, text: extendedText, features, weight });
  const extGlyphCount = extRun.glyphs.filter((g) => !g.empty).length;
  const priorAdvance = priorRun.glyphs.reduce((s, g) => s + g.xAdvance, 0);
  const extAdvance = extRun.glyphs.reduce((s, g) => s + g.xAdvance, 0);
  const genuinelySupported = extGlyphCount > 0 && extAdvance > priorAdvance + 1;
  if (!genuinelySupported) return null;

  return {
    text: extendedText, upem: extRun.upem, glyphs: extRun.glyphs,
    fontSizePx: range.meta.fontSizePx, familyId: range.meta.familyId, variationId: range.meta.variationId,
    _count: count,
  };
}

// Commits an already-shaped extension run (from probeGlyphExtension)
// as a real, undoable in-place replacement of just this ONE patch's
// base-letter objects — same "preserve the old placement rigidly"
// recipe as reshapeGroupUndoable above, just scoped to a patch instead
// of a whole group, and reusing the SAME groupId/patchId (and leaving
// any manually-attached Tashkeel marks on this patch completely
// untouched) so the patch stays exactly where it is in the composition.
export function applyGlyphExtensionUndoable(patchId, newRun) {
  const oldIds = patchBaseLetterMembers(patchId).map((o) => o.id);
  if (!oldIds.length) return null;
  const oldSnapshot = oldIds.map((id) => ({ ...objects.get(id) }));
  const first = objects.get(oldIds[0]);
  const groupId = first.groupId;
  const oldBox = getSelectionWorldAABB(oldIds);
  const oldCenter = { x: oldBox.cx, y: oldBox.cy };
  const oldRotation = first.rotation;
  const oldScaleX = first.scaleX;
  const oldScaleY = first.scaleY;
  const oldFill = first.fill;
  const oldOpacity = first.opacity;
  const prevCount = patchExtensionCount.get(patchId) || 0;

  // Lay the freshly-shaped run out on its own temporary local baseline
  // (identical math to addGlyphRun's per-glyph loop) so every new
  // glyph's own path/offset/localWidth is correct, then rigidly carry
  // the WHOLE new patch onto the old patch's exact world placement —
  // never left at whatever arbitrary spot the temporary layout used.
  const scale = (newRun.fontSizePx ?? 220) / newRun.upem;
  let cursor = 0;
  const newIds = [];
  const newObjs = [];
  for (const g of newRun.glyphs) {
    if (!g.empty) {
      const trueOriginX = (cursor + g.xOffset) * scale;
      const trueOriginY = -g.yOffset * scale;
      const bbox = measurePathBBox(g.path);
      const cxFont = bbox.x + bbox.width / 2;
      const cyFont = bbox.y + bbox.height / 2;
      const offsetX = -cxFont * scale;
      const offsetY = cyFont * scale;
      const id = makeId();
      const obj = {
        id, type: 'glyph', path: g.path, glyphScale: scale, offsetX, offsetY,
        x: trueOriginX - offsetX, y: trueOriginY - offsetY,
        rotation: 0, scaleX: 1, scaleY: 1,
        localWidth: bbox.width * scale, localHeight: bbox.height * scale,
        fill: oldFill, opacity: oldOpacity, locked: false,
        groupId, patchId, cluster: g.cluster, isMark: g.xAdvance === 0,
      };
      newIds.push(id);
      newObjs.push(obj);
    }
    cursor += g.xAdvance;
  }
  if (!newIds.length) return null;

  for (const obj of newObjs) objects.set(obj.id, obj); // temporary, for AABB measurement only
  const newBox = getSelectionWorldAABB(newIds);
  const dx = oldCenter.x - newBox.cx;
  const dy = oldCenter.y - newBox.cy;
  for (const obj of newObjs) { obj.x += dx; obj.y += dy; }
  for (const id of newIds) objects.delete(id); // undo the temporary insert; pushCommand.do() below does the real one

  function placeNew() {
    for (const obj of newObjs) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
    if (oldRotation) { const snap = snapshotTransforms(newIds); rotateAroundPivot(snap, oldCenter, oldRotation); }
    if (oldScaleX !== 1 || oldScaleY !== 1) { const snap2 = snapshotTransforms(newIds); scaleAroundPivot(snap2, oldCenter, oldScaleX, oldScaleY); }
  }

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) {
        for (const id of oldIds) removeObjectInternal(id);
        placeNew();
        patchExtensionCount.set(patchId, newRun._count);
        render();
      }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      for (const obj of oldSnapshot) { objects.set(obj.id, { ...obj }); order.push(obj.id); }
      if (prevCount > 0) patchExtensionCount.set(patchId, prevCount); else patchExtensionCount.delete(patchId);
      render();
      setSelection(oldIds);
    },
  });
  return newIds;
}

// ---- drawing tools (Phase 4): rect/ellipse/triangle/diamond/line/
// arrow/path (pen + decorations) as real scene objects ----
//
// These are plain objects in the SAME generic model as a glyph — same
// x/y/rotation/scaleX/scaleY/opacity/locked fields, no groupId/patchId
// (they never belong to a calligraphic composition) — which is exactly
// why every existing operation (move/rotate/resize/recolor/opacity/
// duplicate/delete/lock/layers/align/distribute/flip/undo/redo) already
// works on them with zero extra code: none of those functions ever
// look at `type`. The only genuinely new work per type is (a) how it's
// created here and (b) how it's drawn in render() below.
function pushCreateCommand(obj) {
  const id = obj.id;
  pushCommand({
    do() {
      if (!objects.has(id)) { objects.set(id, { ...obj }); order.push(id); render(); }
      setSelection([id]);
    },
    undo() {
      removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return id;
}

function baseShapeFields({ x, y, localWidth, localHeight, fill, stroke, strokeWidth }) {
  return {
    x, y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    localWidth,
    localHeight,
    fill: fill ?? '#2b8a3e',
    stroke: stroke ?? '#161616',
    strokeWidth: strokeWidth ?? 3,
    strokeCap: 'round',
    strokeJoin: 'miter',
    opacity: 1,
    locked: false,
    groupId: null,
    patchId: null,
  };
}

export function addRectUndoable({ x, y, width, height, fill, stroke, strokeWidth }) {
  const id = makeId();
  const obj = { id, type: 'rect', ...baseShapeFields({ x, y, localWidth: Math.max(width, 1), localHeight: Math.max(height, 1), fill, stroke, strokeWidth }) };
  return pushCreateCommand(obj);
}

export function addEllipseUndoable({ x, y, width, height, fill, stroke, strokeWidth }) {
  const id = makeId();
  const obj = { id, type: 'ellipse', ...baseShapeFields({ x, y, localWidth: Math.max(width, 1), localHeight: Math.max(height, 1), fill, stroke, strokeWidth }) };
  return pushCreateCommand(obj);
}

export function addTriangleUndoable({ x, y, width, height, fill, stroke, strokeWidth }) {
  const id = makeId();
  const obj = { id, type: 'triangle', ...baseShapeFields({ x, y, localWidth: Math.max(width, 1), localHeight: Math.max(height, 1), fill, stroke, strokeWidth }) };
  return pushCreateCommand(obj);
}

export function addDiamondUndoable({ x, y, width, height, fill, stroke, strokeWidth }) {
  const id = makeId();
  const obj = { id, type: 'diamond', ...baseShapeFields({ x, y, localWidth: Math.max(width, 1), localHeight: Math.max(height, 1), fill, stroke, strokeWidth }) };
  return pushCreateCommand(obj);
}

// Line/arrow store their two endpoints as LOCAL points relative to the
// object's own center (x,y = the segment's midpoint), so rotate/resize
// pivot naturally around the center exactly like every other object —
// no special-casing anywhere else in the transform code.
function lineFields(x1, y1, x2, y2) {
  const x = (x1 + x2) / 2;
  const y = (y1 + y2) / 2;
  return { x, y, localP1: { x: x1 - x, y: y1 - y }, localP2: { x: x2 - x, y: y2 - y } };
}

export function addLineUndoable({ x1, y1, x2, y2, stroke, strokeWidth }) {
  const id = makeId();
  const { x, y, localP1, localP2 } = lineFields(x1, y1, x2, y2);
  const dx = x2 - x1, dy = y2 - y1;
  const obj = {
    id, type: 'line', x, y, localP1, localP2,
    rotation: 0, scaleX: 1, scaleY: 1,
    localWidth: Math.max(Math.abs(dx), 1), localHeight: Math.max(Math.abs(dy), 1),
    fill: 'none', stroke: stroke ?? '#161616', strokeWidth: strokeWidth ?? 4,
    strokeCap: 'round', strokeJoin: 'miter',
    opacity: 1, locked: false, groupId: null, patchId: null,
  };
  return pushCreateCommand(obj);
}

export function addArrowUndoable({ x1, y1, x2, y2, stroke, strokeWidth }) {
  const id = makeId();
  const { x, y, localP1, localP2 } = lineFields(x1, y1, x2, y2);
  const dx = x2 - x1, dy = y2 - y1;
  const obj = {
    id, type: 'arrow', x, y, localP1, localP2,
    rotation: 0, scaleX: 1, scaleY: 1,
    localWidth: Math.max(Math.abs(dx), 1), localHeight: Math.max(Math.abs(dy), 1),
    fill: 'none', stroke: stroke ?? '#161616', strokeWidth: strokeWidth ?? 4,
    strokeCap: 'round', strokeJoin: 'miter',
    opacity: 1, locked: false, groupId: null, patchId: null,
  };
  return pushCreateCommand(obj);
}

// Pen strokes and decorations are both the same underlying object type
// (a real vector path) — a pen stroke is one drawn freehand by the
// user (stroke-only, unfilled); a decoration is one whose `d` was
// authored ahead of time and dropped onto the canvas at a fixed size
// (some filled, some stroke-only). `points` are world/artboard-space
// {x,y} pairs; this computes the path's own bounding box and re-bases
// the path into LOCAL coordinates (relative to that box's center) —
// same convention as every other object type, so x/y is a true visual
// center and rotate/resize pivot correctly with no special-casing.
export function addPathFromPointsUndoable({ points, fill, stroke, strokeWidth }) {
  if (!points || points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - cx).toFixed(2)} ${(p.y - cy).toFixed(2)}`).join(' ');
  const id = makeId();
  const obj = {
    id, type: 'path', x: cx, y: cy, d,
    rotation: 0, scaleX: 1, scaleY: 1,
    localWidth: Math.max(maxX - minX, 1), localHeight: Math.max(maxY - minY, 1),
    fill: fill ?? 'none', stroke: stroke ?? '#161616', strokeWidth: strokeWidth ?? 4,
    strokeCap: 'round', strokeJoin: 'round',
    opacity: 1, locked: false, groupId: null, patchId: null,
  };
  return pushCreateCommand(obj);
}

// Decorations: same 'path' object type, but the `d` is pre-authored
// (already centered on its own bbox) and dropped at a target center
// and target size rather than traced from user input. `d`/`viewW`/
// `viewH` describe the shape in its own authoring units; it's scaled
// uniformly to `targetSize` (the larger of localWidth/localHeight).
export function addDecorationUndoable({ d, viewW, viewH, targetSize = 90, x, y, fill, stroke, strokeWidth }) {
  const id = makeId();
  const scale = targetSize / Math.max(viewW, viewH);
  const obj = {
    id, type: 'path', x, y, d,
    rotation: 0, scaleX: scale, scaleY: scale,
    localWidth: viewW, localHeight: viewH,
    fill: fill ?? '#161616', stroke: stroke ?? 'none', strokeWidth: strokeWidth ?? 0,
    strokeCap: 'round', strokeJoin: 'round',
    opacity: 1, locked: false, groupId: null, patchId: null,
  };
  return pushCreateCommand(obj);
}

// Phase 7, "عناصر / Elements": deliberately the SAME underlying
// primitive as addDecorationUndoable above (a real vector `path`
// object) -- Elements is a separate library/panel with its own new
// original artwork, but there is no reason to invent a second scene
// mutation for "insert one real vector path object at a point". Kept
// as its own exported name so call sites read clearly and so this is
// never mistaken for editing decorations-library.js/decorations-
// panel.js, which Phase 7 explicitly leaves untouched.
export function addElementUndoable({ d, viewW, viewH, targetSize = 90, x, y, fill, stroke, strokeWidth }) {
  return addDecorationUndoable({ d, viewW, viewH, targetSize, x, y, fill, stroke, strokeWidth });
}

// Phase 15: the Tashkeel panel's "calligraphic glyph library" (Category
// B -- see tashkeel-calligraphic-library.js). Deliberately NOT the same
// call as addTashkeelMarkUndoable/addTashkeelComboUndoable above: those
// exist specifically for real font-driven OpenType diacritics that
// attach to a target patch's Fine-Edit group with real GPOS/editor
// positioning math. A Category-B library item is a freestanding
// original vector ornament (or a real small-letter font glyph reused
// decoratively) -- it does not attach to a base letter's cluster, so
// it is dropped at a given world point exactly like Elements/Designs
// already do, via the same real 'path'-or-'glyph' scene primitives.
// Kept as its own exported name (never routed through
// addElementUndoable) so this is never mistaken for editing the
// Elements library, per the Phase 15 spec's explicit "do not confuse
// Tashkeel with decorative elements" instruction -- and so every
// inserted object below carries its own tashkeelStyleId/tashkeelItemId/
// tashkeelSource provenance fields Category-A marks and Elements
// objects don't have, keeping the three families cleanly distinguishable
// in tests, save/load, and export.
//
// Deliberately ALWAYS type: 'path' -- never 'glyph', even for a real
// font-derived letter outline (`upem` is accepted and ignored for
// scale purposes beyond being informational; the real bbox measured
// below is what actually drives sizing). Reusing 'glyph' was tried and
// reverted: this app's Group/Ungroup guard (containsGlyphOrPatchMember)
// and several other "is this a real text-composition member" checks
// key off type==='glyph' specifically, and would incorrectly treat a
// freestanding decorative ornament as part of a calligraphic
// composition (e.g. refusing to let the user Group two inserted
// ornaments together). A Category-B item is structurally an Elements-
// style free vector object that merely happens to have real font-glyph
// or original-vector geometry -- 'path' is the correct, honest type.
//
// Real-bbox centering (via measurePathBBox, the same technique this
// file already uses for Category-A marks and tashkeel-panel.js already
// uses for every preview) is required here because every OTHER 'path'-
// type object in this app (Elements, Designs, drawings) is authored
// pre-centered on local (0,0) -- the hit-rect/selection-frame/resize-
// handle math (localHalfExtents) assumes it. A raw font glyph's own
// design-space box is never centered on its origin (the baseline sits
// at y=0, not at the glyph's vertical center), so its `d` is
// re-centered via translatePathD before being stored, exactly once,
// at insertion time -- never repeated, never re-measured afterward.
// `flipY`: real font-glyph/font-mark `d` data (HarfBuzz's own output)
// is in y-up font-design units, exactly like every Category-A mark
// already handled elsewhere in this file -- but unlike those, a
// Category-B item is stored as a generic y-down 'path' object, not
// rendered through a dedicated y-up-aware renderer. Rather than negate
// every y-coordinate in the `d` STRING (tried first, and a real bug:
// see transformPathD's own comment -- string-level coordinate surgery
// on real font path data is fragile even when done correctly, and
// pointlessly so here), this reuses a feature this file's object model
// already documents and supports natively: scaleX/scaleY "can be
// negative -> flip". A negative scaleY flips the glyph at render time
// through the exact same transform pipeline every other object already
// uses, with zero string manipulation of the real path data itself --
// the stored `d` stays byte-identical (after re-centering only) to
// what HarfBuzz produced.
export function addTashkeelGlyphUndoable({
  d, targetSize = 90, x, y, fill = '#161616', rotationDeg = 0, flipY = false,
  tashkeelItemId = null, tashkeelStyleId = null, tashkeelSource = null,
}) {
  const bbox = measurePathBBox(d);
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const centeredD = translatePathD(d, -cx, -cy);
  const w = Math.max(bbox.width, 0.01);
  const h = Math.max(bbox.height, 0.01);
  const scale = targetSize / Math.max(w, h);
  const id = makeId();
  const obj = {
    id, type: 'path', x, y, d: centeredD,
    rotation: rotationDeg, scaleX: scale, scaleY: flipY ? -scale : scale,
    localWidth: w, localHeight: h,
    fill, stroke: 'none', strokeWidth: 0,
    strokeCap: 'round', strokeJoin: 'round',
    opacity: 1, locked: false, groupId: null, patchId: null,
    tashkeelItemId, tashkeelStyleId, tashkeelSource,
  };
  return pushCreateCommand(obj);
}

// Phase 7, "تصاميم / Designs": a design is a small library of REAL
// vector compositions (several path objects arranged relative to one
// another), inserted as ONE undo step and sharing a fresh groupId so
// the whole thing behaves like a single coherent object immediately
// after insertion (click any part -> the whole design is selected,
// exactly like resolveClickTargets already does for any other
// groupId) while still being made of ordinary, fully-editable path
// objects underneath -- Ungroup (below) breaks it back into its
// individual pieces for detailed editing, never a flattened image.
export function insertDesignUndoable({ pieces, x, y, targetSize = 260 }) {
  if (!pieces || !pieces.length) return null;
  // Normalize every piece's own little 0..100-ish authoring box onto one
  // shared design-space bounding box, then scale THE WHOLE design (not
  // each piece independently) to targetSize, so relative proportions
  // and positions between pieces are preserved exactly as authored.
  const minX = Math.min(...pieces.map((p) => p.boxX ?? 0));
  const minY = Math.min(...pieces.map((p) => p.boxY ?? 0));
  const maxX = Math.max(...pieces.map((p) => (p.boxX ?? 0) + p.viewW));
  const maxY = Math.max(...pieces.map((p) => (p.boxY ?? 0) + p.viewH));
  const designW = Math.max(maxX - minX, 1);
  const designH = Math.max(maxY - minY, 1);
  const scale = targetSize / Math.max(designW, designH);
  const designCx = (minX + maxX) / 2;
  const designCy = (minY + maxY) / 2;

  const groupId = makeGroupId();
  const newIds = [];
  const objs = pieces.map((p) => {
    const pieceCx = (p.boxX ?? 0) + p.viewW / 2;
    const pieceCy = (p.boxY ?? 0) + p.viewH / 2;
    const id = makeId();
    newIds.push(id);
    return {
      id, type: 'path', d: p.d,
      x: x + (pieceCx - designCx) * scale,
      y: y + (pieceCy - designCy) * scale,
      rotation: 0, scaleX: scale, scaleY: scale,
      localWidth: p.viewW, localHeight: p.viewH,
      fill: p.fill ?? '#161616', stroke: p.stroke ?? 'none', strokeWidth: p.strokeWidth ?? 0,
      strokeCap: 'round', strokeJoin: 'round',
      opacity: 1, locked: false, groupId, patchId: null,
    };
  });

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) { for (const o of objs) { objects.set(o.id, { ...o }); order.push(o.id); } render(); }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return newIds;
}

// Phase 19: the two-dot/three-dot Category-B Tashkeel items are
// genuinely compound -- multiple copies of one verified primitive
// (a plain rhombus), not a single glyph outline -- so unlike every
// other Category-B item above (one real path via
// addTashkeelGlyphUndoable), these insert as a real GROUP of several
// ordinary path objects sharing one groupId, exactly like
// insertDesignUndoable's "تصاميم / Designs" pattern (click any piece
// selects the whole construction; Ungroup breaks it back into its
// individual dots; one undo step removes/restores all of them
// together). Deliberately its OWN function rather than reusing
// insertDesignUndoable directly, so every resulting piece still
// carries the same tashkeelItemId/tashkeelStyleId/tashkeelSource
// provenance fields every other Tashkeel-library object carries --
// insertDesignUndoable's generic Design pieces intentionally don't
// have those fields, and dropping them here would make a compound
// Tashkeel item untraceable to its library entry in tests, export, or
// future provenance audits.
//
// IMPORTANT authoring rule for `pieces`: each piece's own `d` MUST
// already be centered on its own local origin (span roughly
// [-viewW/2, viewW/2] x [-viewH/2, viewH/2]), with `boxX`/`boxY` set
// so that `boxX + viewW/2` / `boxY + viewH/2` gives that piece's
// intended center in the shared design space. This function does NOT
// auto-recenter `d` the way addTashkeelGlyphUndoable does for
// font-derived outlines -- an off-center piece (the convention several
// of this codebase's pre-existing Elements/Decorations entries
// actually use, e.g. a "0..100 box with content centered at 50,50")
// renders visibly offset from its own selection frame, confirmed by
// direct rendering during Phase 19's implementation. Every Phase 19
// compound piece below was authored pre-centered specifically to avoid
// inheriting that pre-existing quirk.
export function addTashkeelCompoundUndoable({
  pieces, x, y, targetSize = 90,
  tashkeelItemId = null, tashkeelStyleId = null, tashkeelSource = null,
}) {
  if (!pieces || !pieces.length) return null;
  const minX = Math.min(...pieces.map((p) => p.boxX ?? 0));
  const minY = Math.min(...pieces.map((p) => p.boxY ?? 0));
  const maxX = Math.max(...pieces.map((p) => (p.boxX ?? 0) + p.viewW));
  const maxY = Math.max(...pieces.map((p) => (p.boxY ?? 0) + p.viewH));
  const designW = Math.max(maxX - minX, 1);
  const designH = Math.max(maxY - minY, 1);
  const scale = targetSize / Math.max(designW, designH);
  const designCx = (minX + maxX) / 2;
  const designCy = (minY + maxY) / 2;

  const groupId = makeGroupId();
  const newIds = [];
  const objs = pieces.map((p) => {
    const pieceCx = (p.boxX ?? 0) + p.viewW / 2;
    const pieceCy = (p.boxY ?? 0) + p.viewH / 2;
    const id = makeId();
    newIds.push(id);
    return {
      id, type: 'path', d: p.d,
      x: x + (pieceCx - designCx) * scale,
      y: y + (pieceCy - designCy) * scale,
      rotation: 0, scaleX: scale, scaleY: scale,
      localWidth: p.viewW, localHeight: p.viewH,
      fill: p.fill ?? '#161616', stroke: p.stroke ?? 'none', strokeWidth: p.strokeWidth ?? 0,
      strokeCap: 'round', strokeJoin: 'round',
      opacity: 1, locked: false, groupId, patchId: null,
      tashkeelItemId, tashkeelStyleId, tashkeelSource,
    };
  });

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) { for (const o of objs) { objects.set(o.id, { ...o }); order.push(o.id); } render(); }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return newIds;
}

// Phase 7, "تشكيل / Tashkeel": a real, independently-placeable
// diacritic mark. Unlike a decoration/element (a hand-authored path),
// a Tashkeel mark's outline comes from the SAME licensed font +
// HarfBuzz pipeline every other glyph in this editor already uses --
// tashkeel-panel.js shapes the single diacritic codepoint through
// glyph-shaper.js exactly like text-panel.js shapes a whole phrase,
// then hands the resulting real path/bbox in here. This is a `glyph`
// object (not `path`), so it participates in the exact same Fine-Edit,
// selection, and rendering code every shaped letter/diacritic already
// does.
//
// If `targetPatchId` names an existing whole patch, the mark JOINS
// that patch (patchId set) so normal-mode click/move/rotate treats the
// whole patch (letters + this mark) as one rigid unit -- exactly the
// "attached diacritics stay with their patch" requirement -- while
// `isMark: true` (the same real signal HarfBuzz-shaped marks already
// carry, see addGlyphRun above) lets Fine Edit still select and edit
// this one mark on its own. A synthetic negative `cluster` value is
// used so this manually-placed mark can never coincide with a real
// HarfBuzz cluster index from that patch's own shaping (those are
// always >= 0), which would otherwise wrongly fuse it to an unrelated
// base letter in Fine Edit.
//
// Real (if modest) collision avoidance: if the naive placement point
// overlaps another mark ALREADY attached to this same patch, the new
// mark is stepped further away (in the patch's own local "above the
// baseline" direction) until its bounding box clears every existing
// mark's — never silently stacked exactly on top of one another.
//
// Factored out of addTashkeelMarkUndoable so addTashkeelComboUndoable
// (a combo's FIRST member only — see below) and the font-change
// reshape path (reshapeGroupUndoable) can share the exact same real
// placement/collision logic instead of re-deriving it.
function computeAttachedMarkAnchor(targetPatchId, localWidth, localHeight, fontSizePx) {
  let x = null, y = null, rotation = 0, patchId = null, cluster = null;

  if (targetPatchId) {
    const memberIds = getPatchChildIds(targetPatchId);
    const patchBox = getSelectionWorldAABB(memberIds);
    const anchorObj = objects.get(memberIds[0]);
    if (patchBox && anchorObj) {
      rotation = anchorObj.rotation || 0;
      const rad = rotation * DEG2RAD;
      let standoff = patchBox.height / 2 + fontSizePx * 0.3;
      const existingMarks = memberIds.map((mid) => objects.get(mid)).filter((o) => o && o.isMark);

      // Step outward (away from the patch, along its own "up" axis)
      // until the proposed box no longer overlaps any existing mark's
      // own box on this patch -- real AABB overlap checking, not a
      // fixed guess.
      for (let attempt = 0; attempt < 12; attempt++) {
        const localOffset = { x: 0, y: -standoff };
        const worldOffset = rotateVec(localOffset.x, localOffset.y, rad);
        const cx = patchBox.cx + worldOffset.x;
        const cy = patchBox.cy + worldOffset.y;
        const half = Math.max(localWidth, localHeight) / 2;
        const overlaps = existingMarks.some((m) => {
          const dx = Math.abs(m.x - cx);
          const dy = Math.abs(m.y - cy);
          const mHalf = Math.max(m.localWidth || 0, m.localHeight || 0) / 2;
          return dx < half + mHalf && dy < half + mHalf;
        });
        if (!overlaps) { x = cx; y = cy; break; }
        standoff += Math.max(localHeight, 10) * 0.85;
      }
      if (x == null) {
        const localOffset = { x: 0, y: -standoff };
        const worldOffset = rotateVec(localOffset.x, localOffset.y, rad);
        x = patchBox.cx + worldOffset.x;
        y = patchBox.cy + worldOffset.y;
      }
      patchId = targetPatchId;
      cluster = -nextId; // synthetic, always negative -> never a real HarfBuzz cluster index
    }
  }
  if (x == null) { x = ARTBOARD_W / 2; y = ARTBOARD_H / 2; }
  return { x, y, rotation, patchId, cluster };
}

// Phase 10D: real per-member positions for a genuinely-supported
// Tashkeel combo (Phase 7's shadda+vowel/tanwin whitelist). Member 0
// always sits at the patch's own anchor (computeAttachedMarkAnchor,
// unchanged). For every member after it, `positioningSource` says
// which of two real, honest strategies places it — decided by the
// caller from the font's own actual GPOS/mkmk table presence
// (tashkeel-probe.js's probeCombo), never guessed from the offsets
// themselves:
//
//  - 'gpos': trust the font's own real HarfBuzz-reported relative
//    offset (this member's xOffset/yOffset minus member 0's) — the
//    font's own genuine mark-to-mark positioning data. Exactly the
//    math this function always used before Phase 10D.
//
//  - 'editor': this font has no usable mark-to-mark GPOS (Phase 10C's
//    Layla Thuluth finding: its xOffset/yOffset are always 0,0, which
//    would otherwise make every member land exactly on top of member
//    0). Instead, each member is stacked further outward along the
//    patch's own local "up" axis — the same direction
//    computeAttachedMarkAnchor already steps a single mark along to
//    clear another mark already on the patch — far enough to clear
//    every member already placed in this same combo, using ONLY that
//    member's own real shaped bounding box plus a small deterministic
//    spacing margin. This never fabricates a glyph, never alters one,
//    and never hardcodes a per-font coordinate: the only inputs are
//    each member's own genuine outline dimensions.
function placeComboMembers(geo, anchor, scale, positioningSource) {
  const rad = anchor.rotation * DEG2RAD;
  // Local (pre-rotation) Y and half-height of every member placed so
  // far, member 0 first — local Y is measured along the patch's own
  // "up" axis, with 0 at the anchor itself.
  const placedLocal = [{ y: 0, halfHeight: geo[0].localHeight / 2 }];
  const positions = [{ x: anchor.x, y: anchor.y }];
  for (let i = 1; i < geo.length; i++) {
    const g = geo[i];
    let localX = 0, localY;
    if (positioningSource === 'gpos') {
      localX = (g.xOffset - geo[0].xOffset) * scale;
      localY = -(g.yOffset - geo[0].yOffset) * scale;
    } else {
      const margin = Math.max(g.localHeight, 10) * 0.18;
      let standoff = margin;
      for (const p of placedLocal) {
        standoff = Math.max(standoff, -p.y + p.halfHeight + g.localHeight / 2 + margin);
      }
      localY = -standoff;
    }
    const world = rotateVec(localX, localY, rad);
    positions.push({ x: anchor.x + world.x, y: anchor.y + world.y });
    placedLocal.push({ y: localY, halfHeight: g.localHeight / 2 });
  }
  return positions;
}

export function addTashkeelMarkUndoable({ path, upem, fontSizePx = 220, fill = '#161616', targetPatchId = null, markChar = null }) {
  const scale = fontSizePx / upem;
  const bbox = measurePathBBox(path);
  const cxFont = bbox.x + bbox.width / 2;
  const cyFont = bbox.y + bbox.height / 2;
  const offsetX = -cxFont * scale;
  const offsetY = cyFont * scale;
  const localWidth = bbox.width * scale;
  const localHeight = bbox.height * scale;

  const anchor = computeAttachedMarkAnchor(targetPatchId, localWidth, localHeight, fontSizePx);

  // isMark is a property of WHAT this object is (a diacritic mark),
  // not of whether it happens to be attached to a patch right now -- a
  // freestanding mark dropped with no target patch is exactly as much
  // a real mark as one attached to a word, so it gets the same real
  // signal Fine Edit and click-resolution already use for every other
  // diacritic in this app. `markChar` is the real Unicode combining
  // character this mark represents (or, for a combo member, the full
  // combo's chars string) -- carried so a later font/variation change
  // can genuinely re-probe and re-shape THIS mark, not merely leave
  // its old-font geometry attached (Phase 7 critical addendum, see
  // reshapeGroupUndoable below).
  const id = makeId();
  const obj = {
    id, type: 'glyph', path, glyphScale: scale, offsetX, offsetY,
    x: anchor.x, y: anchor.y, rotation: anchor.rotation, scaleX: 1, scaleY: 1,
    localWidth, localHeight,
    fill, opacity: 1, locked: false,
    groupId: null, patchId: anchor.patchId, cluster: anchor.cluster, isMark: true,
    markChar,
  };
  return pushCreateCommand(obj);
}

// Phase 7 critical addendum, point 5: a genuinely COMBINED Tashkeel
// mark (e.g. shadda+fatha) is not one path — it is however many real,
// individually-positioned glyphs the font's own shaping produced for
// that combined sequence (tashkeel-panel.js's shapeCombo() only offers
// a combo when the font actually produced >= 2 such glyphs). Each
// glyph becomes its own real scene object (so Fine Edit can still
// select/edit one at a time), all sharing one synthetic cluster (so
// normal patch mode and click-resolution treat the whole combo as one
// unit, exactly like a real HarfBuzz base+mark cluster). Only the
// FIRST member goes through the real collision-avoiding patch
// placement; every other member is placed at its own real HarfBuzz
// xOffset/yOffset relative to the first (rotated into the patch's own
// world orientation) -- i.e. the font's own genuine mark-to-mark GPOS
// arrangement, never an invented stack of generic icons.
export function addTashkeelComboUndoable({ members, fontSizePx = 220, fill = '#161616', targetPatchId = null, comboChars = null, positioningSource = 'gpos' }) {
  if (!members || !members.length) return null;
  const scale = fontSizePx / members[0].upem;

  const geo = members.map((m) => {
    const bbox = measurePathBBox(m.path);
    const cxFont = bbox.x + bbox.width / 2;
    const cyFont = bbox.y + bbox.height / 2;
    return {
      path: m.path, glyphScale: scale,
      offsetX: -cxFont * scale, offsetY: cyFont * scale,
      localWidth: bbox.width * scale, localHeight: bbox.height * scale,
      xOffset: m.xOffset || 0, yOffset: m.yOffset || 0,
    };
  });

  const anchor = computeAttachedMarkAnchor(targetPatchId, geo[0].localWidth, geo[0].localHeight, fontSizePx);
  const positions = placeComboMembers(geo, anchor, scale, positioningSource);

  const objs = geo.map((g, i) => {
    const { x, y } = positions[i];
    return {
      id: makeId(), type: 'glyph', path: g.path, glyphScale: g.glyphScale,
      offsetX: g.offsetX, offsetY: g.offsetY,
      x, y, rotation: anchor.rotation, scaleX: 1, scaleY: 1,
      localWidth: g.localWidth, localHeight: g.localHeight,
      fill, opacity: 1, locked: false,
      groupId: null, patchId: anchor.patchId, cluster: anchor.cluster, isMark: true,
      markChar: comboChars,
    };
  });

  const newIds = objs.map((o) => o.id);
  pushCommand({
    do() {
      if (!objects.has(newIds[0])) { for (const o of objs) { objects.set(o.id, { ...o }); order.push(o.id); } render(); }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return newIds;
}

// Phase 7 critical addendum, point 9 support: finds every manually-
// placed Tashkeel mark (single or combo) currently attached to a
// patch that belongs to this composition (groupId), grouped by which
// real insertion event created it (patchIndex + the shared synthetic
// cluster every member of one insertion carries). The caller (text-
// panel.js's "Change Font/Variation" flow) uses this to know exactly
// which marks must be genuinely re-probed and re-shaped against the
// NEW font before reshapeGroupUndoable runs -- never left silently
// attached with stale old-font geometry.
export function getAttachedTashkeelMarkGroups(groupId) {
  const prefix = `${groupId}-p`;
  const map = new Map();
  for (const id of order) {
    const o = objects.get(id);
    if (!o || !o.isMark || o.groupId !== null || !o.markChar || !o.patchId) continue;
    if (!o.patchId.startsWith(prefix)) continue;
    const patchIndex = Number(o.patchId.slice(prefix.length));
    if (!Number.isFinite(patchIndex)) continue;
    const key = `${patchIndex}|${o.cluster}`;
    if (!map.has(key)) map.set(key, { patchIndex, cluster: o.cluster, markChar: o.markChar, fill: o.fill, memberCount: 0 });
    map.get(key).memberCount++;
  }
  return Array.from(map.values());
}

// Phase 7, "Trace Image": a reference raster layer -- see the render()
// branch above (`obj.type === 'image'`) and export.js (which strips
// any node flagged `data-export-exclude`, which render() sets whenever
// `excludeFromExport` is true, unless the user explicitly opts in via
// the Trace Image panel). `naturalW`/`naturalH` size the object so it
// starts at a sane on-canvas scale instead of the raw pixel dimensions
// of whatever photo/scan the user imported.
export function addImageUndoable({ imageHref, naturalW, naturalH, x, y, targetSize = 500 }) {
  const id = makeId();
  const scale = targetSize / Math.max(naturalW, naturalH, 1);
  const obj = {
    id, type: 'image', imageHref,
    x, y, rotation: 0, scaleX: 1, scaleY: 1,
    localWidth: naturalW * scale, localHeight: naturalH * scale,
    opacity: 0.6, locked: false, groupId: null, patchId: null,
    excludeFromExport: true, hidden: false,
  };
  return pushCreateCommand(obj);
}

// Toggles whether a selected reference image is included the next time
// SVG/PNG/JPG/Outline-SVG/PDF export runs (default: excluded — see
// addImageUndoable). Undoable like any other object-field edit.
export function setExcludeFromExportForSelection(exclude) {
  const ids = getSelection().filter((id) => objects.get(id)?.type === 'image');
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, v: objects.get(id).excludeFromExport }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.excludeFromExport = exclude; } render(); },
    undo() { for (const { id, v } of before) { const o = objects.get(id); if (o) o.excludeFromExport = v; } render(); },
  });
}

// Phase 7, Trace Image "hide/show reference": a real, undoable
// viewport-only visibility toggle — the object stays in the scene
// model and in project save/load exactly as before, only its render()
// output gets display:none, so a hidden reference photo still exists
// for a later "show reference" without needing to re-import it. Scoped
// to type==='image' for the same reason setExcludeFromExportForSelection
// is: this is a Trace Image concept, not a generic "hide any object"
// feature the rest of the spec never asked for.
export function setHiddenForSelection(hiddenFlag) {
  const ids = getSelection().filter((id) => objects.get(id)?.type === 'image');
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, v: objects.get(id).hidden }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.hidden = hiddenFlag; } render(); },
    undo() { for (const { id, v } of before) { const o = objects.get(id); if (o) o.hidden = v; } render(); },
  });
}

function removeObjectInternal(id) {
  objects.delete(id);
  const idx = order.indexOf(id);
  if (idx !== -1) order.splice(idx, 1);
  selection.delete(id);
}

export function deleteSelection() {
  const ids = getSelection();
  if (!ids.length) return false;
  const snapshots = ids.map((id) => ({ ...objects.get(id) }));
  const originalOrder = [...order];
  pushCommand({
    do() {
      for (const id of ids) removeObjectInternal(id);
      clearSelection();
      render();
    },
    undo() {
      for (const snap of snapshots) objects.set(snap.id, { ...snap });
      order.length = 0;
      order.push(...originalOrder);
      render();
      setSelection(ids);
    },
  });
  return true;
}

// ---- duplicate ----

export function duplicateSelection(offset = 28) {
  const ids = getSelection();
  if (!ids.length) return [];

  // Hierarchy-aware clone, checked the same way partitionIntoRigidUnits
  // is: if every member of a glyph's whole GROUP is included, the clone
  // stays one coherent composition (fresh groupId, and each of its
  // patches gets its own fresh patchId too); else if every member of
  // just a PATCH is included, the clone stays that one calligraphic
  // patch (fresh patchId, no group); otherwise (a fine-edit duplicate
  // of individual glyphs/clusters) the clone breaks free entirely as
  // independent objects rather than half-joining the original.
  const idSet = new Set(ids);
  const newGroupIdFor = new Map(); // original groupId -> fresh groupId, only for fully-covered groups
  const newPatchIdFor = new Map(); // original patchId -> fresh patchId, only for fully-covered patches
  for (const id of ids) {
    const gid = objects.get(id)?.groupId;
    if (!gid || newGroupIdFor.has(gid)) continue;
    const full = getGroupChildIds(gid);
    if (full.length && full.every((cid) => idSet.has(cid))) newGroupIdFor.set(gid, makeGroupId());
  }
  for (const id of ids) {
    const pid = objects.get(id)?.patchId;
    if (!pid || newPatchIdFor.has(pid)) continue;
    const full = getPatchChildIds(pid);
    if (full.length && full.every((cid) => idSet.has(cid))) newPatchIdFor.set(pid, makePatchId());
  }

  const newIds = [];
  const clones = ids.map((id) => {
    const src = objects.get(id);
    const clone = {
      ...src,
      id: makeId(),
      x: src.x + offset,
      y: src.y + offset,
      groupId: src.groupId && newGroupIdFor.has(src.groupId) ? newGroupIdFor.get(src.groupId) : null,
      patchId: src.patchId && newPatchIdFor.has(src.patchId) ? newPatchIdFor.get(src.patchId) : null,
    };
    newIds.push(clone.id);
    return clone;
  });

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) {
        for (const clone of clones) { objects.set(clone.id, { ...clone }); order.push(clone.id); }
        render();
      }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return newIds;
}

// ---- Phase 7 Edit menu: real clipboard (in-memory only — never
// written to disk/localStorage, so it never leaks into a saved project
// or across browser tabs; that would be a much bigger, riskier feature
// than "Copy/Paste inside this one editor session" actually calls
// for). Paste reuses EXACTLY duplicateSelection's own hierarchy-aware
// cloning rule (a fully-covered group/patch stays one coherent unit
// with fresh ids; a partial selection breaks free), just sourced from
// the clipboard snapshot instead of the live selection. ----
let clipboard = null; // Array<object> snapshot, or null

export function copySelectionToClipboard() {
  const ids = getSelection();
  if (!ids.length) return false;
  clipboard = ids.map((id) => ({ ...objects.get(id) }));
  return true;
}

export function hasClipboardContent() { return !!(clipboard && clipboard.length); }

export function pasteClipboardUndoable(offset = 28) {
  if (!clipboard || !clipboard.length) return [];
  const srcIds = new Set(clipboard.map((o) => o.id));

  // Same "was every member of the original group/patch also copied"
  // check duplicateSelection performs against the LIVE scene, computed
  // here against the static clipboard snapshot itself instead.
  const newGroupIdFor = new Map();
  const newPatchIdFor = new Map();
  for (const src of clipboard) {
    if (src.groupId && !newGroupIdFor.has(src.groupId)) {
      const groupMembersInClipboard = clipboard.filter((o) => o.groupId === src.groupId);
      const liveGroupSize = getGroupChildIds(src.groupId).length;
      if (liveGroupSize && groupMembersInClipboard.length === liveGroupSize) newGroupIdFor.set(src.groupId, makeGroupId());
    }
    if (src.patchId && !newPatchIdFor.has(src.patchId)) {
      const patchMembersInClipboard = clipboard.filter((o) => o.patchId === src.patchId);
      const livePatchSize = getPatchChildIds(src.patchId).length;
      if (livePatchSize && patchMembersInClipboard.length === livePatchSize) newPatchIdFor.set(src.patchId, makePatchId());
    }
  }

  const newIds = [];
  const clones = clipboard.map((src) => {
    const clone = {
      ...src,
      id: makeId(),
      x: src.x + offset,
      y: src.y + offset,
      groupId: src.groupId && newGroupIdFor.has(src.groupId) ? newGroupIdFor.get(src.groupId) : null,
      patchId: src.patchId && newPatchIdFor.has(src.patchId) ? newPatchIdFor.get(src.patchId) : null,
    };
    newIds.push(clone.id);
    return clone;
  });

  pushCommand({
    do() {
      if (!objects.has(newIds[0])) { for (const clone of clones) { objects.set(clone.id, { ...clone }); order.push(clone.id); } render(); }
      setSelection(newIds);
    },
    undo() {
      for (const id of newIds) removeObjectInternal(id);
      clearSelection();
      render();
    },
  });
  return newIds;
}

// ---- Phase 7 Arrange menu: Group / Ungroup for freeform elements ----
//
// Deliberately reuses the SAME `groupId` field a HarfBuzz text
// composition already uses (resolveClickTargets and
// isCoherentGroupSelection above already treat "shares a groupId" as
// one coherent clickable/selectable unit for ANY object type, not just
// glyphs) rather than inventing a second, parallel "UI group" concept.
// The one rule that keeps this safe for the frozen patch/composition
// model: Group/Ungroup both REFUSE outright the moment any involved
// object is a glyph or already belongs to a calligraphic patch — a
// real text composition's groupId is load-bearing for Change Font/
// reshapeGroupUndoable and must never be reassigned or cleared by a
// generic "Group" action.
function containsGlyphOrPatchMember(ids) {
  return ids.some((id) => { const o = objects.get(id); return !o || o.type === 'glyph' || !!o.patchId; });
}

export function groupSelectionUndoable() {
  const ids = getUnlockedSelection();
  if (ids.length < 2) { toast('حدّد عنصرين على الأقل لتجميعهما'); return false; }
  if (containsGlyphOrPatchMember(ids)) {
    toast('لا يمكن تجميع تركيبات النصوص الخطية — التجميع متاح للعناصر الحرة فقط');
    return false;
  }
  const newGid = makeGroupId();
  const before = ids.map((id) => ({ id, groupId: objects.get(id).groupId }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.groupId = newGid; } render(); setSelection(ids); },
    undo() { for (const { id, groupId } of before) { const o = objects.get(id); if (o) o.groupId = groupId; } render(); setSelection(ids); },
  });
  return true;
}

export function ungroupSelectionUndoable() {
  const ids = getSelection();
  if (!ids.length) return false;
  const gid = objects.get(ids[0])?.groupId;
  if (!gid) { toast('التحديد ليس مجموعة'); return false; }
  const full = getGroupChildIds(gid);
  if (!full.length || full.length !== ids.length || !ids.every((id) => objects.get(id)?.groupId === gid)) {
    toast('حدّد المجموعة كاملة لفكّها');
    return false;
  }
  if (containsGlyphOrPatchMember(full)) {
    toast('لا يمكن فكّ تجميع تركيبة نصية خطية');
    return false;
  }
  const before = full.map((id) => ({ id, groupId: objects.get(id).groupId }));
  pushCommand({
    do() { for (const id of full) { const o = objects.get(id); if (o) o.groupId = null; } render(); setSelection(full); },
    undo() { for (const { id, groupId } of before) { const o = objects.get(id); if (o) o.groupId = groupId; } render(); setSelection(full); },
  });
  return true;
}

export function canGroupSelection() {
  const ids = getUnlockedSelection();
  return ids.length >= 2 && !containsGlyphOrPatchMember(ids);
}

export function canUngroupSelection() {
  const ids = getSelection();
  if (!ids.length) return false;
  const gid = objects.get(ids[0])?.groupId;
  if (!gid) return false;
  const full = getGroupChildIds(gid);
  return full.length > 0 && full.length === ids.length && ids.every((id) => objects.get(id)?.groupId === gid) && !containsGlyphOrPatchMember(full);
}

// ---- generic transform transactions (move / rotate / resize share this) ----

export function snapshotTransforms(ids) {
  const map = new Map();
  for (const id of ids) {
    const o = objects.get(id);
    if (o) map.set(id, { x: o.x, y: o.y, rotation: o.rotation, scaleX: o.scaleX, scaleY: o.scaleY });
  }
  return map;
}

export function commitTransform(snapshot) {
  const before = snapshot;
  const after = new Map();
  for (const [id] of before) {
    const o = objects.get(id);
    if (o) after.set(id, { x: o.x, y: o.y, rotation: o.rotation, scaleX: o.scaleX, scaleY: o.scaleY });
  }
  const changed = [...after].some(([id, v]) => {
    const b = before.get(id);
    return !b || b.x !== v.x || b.y !== v.y || b.rotation !== v.rotation || b.scaleX !== v.scaleX || b.scaleY !== v.scaleY;
  });
  if (!changed) return;
  pushCommand({
    do() { for (const [id, v] of after) { const o = objects.get(id); if (o) Object.assign(o, v); } render(); },
    undo() { for (const [id, v] of before) { const o = objects.get(id); if (o) Object.assign(o, v); } render(); },
  });
}

export function applyTransformLive(snapshot, mutate) {
  const movedIds = [];
  for (const [id, orig] of snapshot) {
    const o = objects.get(id);
    if (o && !o.locked) { mutate(o, orig); movedIds.push(id); }
  }
  updateLiveTransforms(movedIds);
}

export function nudgeSelection(dx, dy) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const snap = snapshotTransforms(ids);
  for (const id of ids) { const o = objects.get(id); o.x += dx; o.y += dy; }
  render();
  commitTransform(snap);
}

// ---- Arabic composition controls (Phase 5, point 6): horizontal
// spacing + baseline offset for a selected whole patch ----
//
// Deliberately NOT the same code path as rotate/resize: those move
// each glyph's OWN scaleX/scaleY/rotation too (a true rigid-body
// transform of the whole patch). Spacing/baseline instead only ever
// change each glyph's POSITION, never its own scale/rotation/path — so
// the original HarfBuzz-shaped letterforms are never stretched,
// skewed, or reshaped, only spread apart (or squeezed together) and
// shifted along the patch's own baseline. That is the real, literal
// meaning of "adjust the composition without altering the original
// HarfBuzz shaping" for these two controls.
//
// Both take a `baseSnapshot` — the patch's own layout captured ONCE
// (by getPatchLayoutSnapshot) when the inspector first shows the
// sliders for this patch — so repeated slider ticks during one drag
// are computed fresh from that fixed reference (never compounding
// drift), and commitPatchLayout turns the whole gesture into one
// undo/redo step, same convention as every other drag in this app.
export function getPatchLayoutSnapshot(patchId) {
  return getPatchChildIds(patchId).map((id) => {
    const o = objects.get(id);
    return { id, x: o.x, y: o.y, rotation: o.rotation };
  });
}

export function applyPatchSpacingLive(baseSnapshot, factor) {
  if (!baseSnapshot || !baseSnapshot.length) return;
  const rad = baseSnapshot[0].rotation * DEG2RAD;
  const cx = baseSnapshot.reduce((s, p) => s + p.x, 0) / baseSnapshot.length;
  const cy = baseSnapshot.reduce((s, p) => s + p.y, 0) / baseSnapshot.length;
  for (const orig of baseSnapshot) {
    const o = objects.get(orig.id);
    if (!o || o.locked) continue;
    const rel = rotateVec(orig.x - cx, orig.y - cy, -rad);
    rel.x *= factor; // spacing = distance along the patch's OWN baseline axis only
    const back = rotateVec(rel.x, rel.y, rad);
    o.x = cx + back.x;
    o.y = cy + back.y;
  }
  updateLiveTransforms(baseSnapshot.map((p) => p.id));
}

export function applyPatchBaselineLive(baseSnapshot, deltaPx) {
  if (!baseSnapshot || !baseSnapshot.length) return;
  const rad = baseSnapshot[0].rotation * DEG2RAD;
  const offset = rotateVec(0, deltaPx, rad); // perpendicular to the patch's own baseline axis
  for (const orig of baseSnapshot) {
    const o = objects.get(orig.id);
    if (!o || o.locked) continue;
    o.x = orig.x + offset.x;
    o.y = orig.y + offset.y;
  }
  updateLiveTransforms(baseSnapshot.map((p) => p.id));
}

export function commitPatchLayout(baseSnapshot) {
  if (!baseSnapshot || !baseSnapshot.length) return;
  const ids = baseSnapshot.map((p) => p.id);
  const before = new Map(baseSnapshot.map((p) => [p.id, { x: p.x, y: p.y }]));
  const after = new Map(ids.map((id) => { const o = objects.get(id); return [id, { x: o.x, y: o.y }]; }));
  const changed = ids.some((id) => {
    const b = before.get(id), a = after.get(id);
    return !a || Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6;
  });
  if (!changed) return;
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); const v = after.get(id); if (o) { o.x = v.x; o.y = v.y; } } render(); },
    undo() { for (const id of ids) { const o = objects.get(id); const v = before.get(id); if (o) { o.x = v.x; o.y = v.y; } } render(); },
  });
}

// Rotate every (id, origTransform) in `snapshot` by `deltaDeg` around
// `pivot` ({x,y} in artboard space). Works for both a single selected
// object (pivot = its own center -> position doesn't move, only its
// own rotation changes) and a group (pivot = group center -> members
// revolve around it too).
export function rotateAroundPivot(snapshot, pivot, deltaDeg) {
  applyTransformLive(snapshot, (o, orig) => {
    const rel = rotateVec(orig.x - pivot.x, orig.y - pivot.y, deltaDeg * DEG2RAD);
    o.x = pivot.x + rel.x;
    o.y = pivot.y + rel.y;
    o.rotation = orig.rotation + deltaDeg;
  });
}

// Scale every (id, origTransform) in `snapshot` by (fx, fy) around
// `pivot`. Same dual use as rotateAroundPivot.
export function scaleAroundPivot(snapshot, pivot, fx, fy) {
  applyTransformLive(snapshot, (o, orig) => {
    o.x = pivot.x + (orig.x - pivot.x) * fx;
    o.y = pivot.y + (orig.y - pivot.y) * fy;
    o.scaleX = orig.scaleX * fx;
    o.scaleY = orig.scaleY * fy;
  });
}

// ---- flip (a real geometric transform: negate scale around center) ----

export function flipSelection(axis) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const units = partitionIntoRigidUnits(ids);
  const snap = snapshotTransforms(ids);
  for (const unit of units) {
    if (unit.ids.length === 1) {
      // Lone object (or a fine-edit single glyph/cluster): flip its own
      // shape in place, exactly as before.
      const o = objects.get(unit.ids[0]);
      if (axis === 'x') o.scaleX *= -1; else o.scaleY *= -1;
      continue;
    }
    // A whole coherent composition: a real mirror image, not just each
    // letter flipped in place — every member's own center reflects
    // across the unit's center too, so the reading order/arrangement
    // mirrors along with each glyph's shape.
    const bounds = getSelectionWorldAABB(unit.ids);
    for (const id of unit.ids) {
      const o = objects.get(id);
      if (axis === 'x') { o.x = 2 * bounds.cx - o.x; o.scaleX *= -1; }
      else { o.y = 2 * bounds.cy - o.y; o.scaleY *= -1; }
    }
  }
  render();
  commitTransform(snap);
}

// ---- Phase 7 Transform menu: discrete one-shot rotate/scale/reset,
// each a real single-undo-step transform through the SAME
// rotateAroundPivot/scaleAroundPivot engine drag gestures already use
// (never a CSS-only rotate/scale). Pivot is always the selection's own
// current world center, matching how the rotate/resize handles behave
// for a selection. ----
export function rotateSelectionByDegrees(deltaDeg) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const box = getSelectionWorldAABB(ids);
  if (!box) return;
  const snap = snapshotTransforms(ids);
  rotateAroundPivot(snap, { x: box.cx, y: box.cy }, deltaDeg);
  commitTransform(snap);
}

export function scaleSelectionByFactor(factor) {
  const ids = getUnlockedSelection();
  if (!ids.length || factor <= 0) return;
  const box = getSelectionWorldAABB(ids);
  if (!box) return;
  const snap = snapshotTransforms(ids);
  scaleAroundPivot(snap, { x: box.cx, y: box.cy }, factor, factor);
  commitTransform(snap);
}

// Rotation back to 0 and scale back to 1 (also clears any Flip) — the
// literal meaning of "reset transform": undo every rotate/resize/flip
// this object has accumulated, keeping only its position.
export function resetTransformForSelection() {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const before = ids.map((id) => { const o = objects.get(id); return { id, rotation: o.rotation, scaleX: o.scaleX, scaleY: o.scaleY }; });
  const isIdentity = before.every((b) => b.rotation === 0 && b.scaleX === 1 && b.scaleY === 1);
  if (isIdentity) return;
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) { o.rotation = 0; o.scaleX = 1; o.scaleY = 1; } } render(); },
    undo() { for (const { id, rotation, scaleX, scaleY } of before) { const o = objects.get(id); if (o) { o.rotation = rotation; o.scaleX = scaleX; o.scaleY = scaleY; } } render(); },
  });
}

// ---- color / opacity ----

export function setFillForSelection(hex) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, fill: objects.get(id).fill }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.fill = hex; } render(); },
    undo() { for (const { id, fill } of before) { const o = objects.get(id); if (o) o.fill = fill; } render(); },
  });
}

export function setOpacityForSelection(value) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, opacity: objects.get(id).opacity }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.opacity = value; } render(); },
    undo() { for (const { id, opacity } of before) { const o = objects.get(id); if (o) o.opacity = opacity; } render(); },
  });
}

// Stroke color/width only ever apply to drawing objects (rect/ellipse/
// triangle/diamond/line/arrow/path) — glyphs have no `stroke` field at
// all, so they're filtered out here rather than relying on the caller
// (inspector-panel.js) to already know which kind of object is selected.
export function setStrokeForSelection(hex) {
  const ids = getUnlockedSelection().filter((id) => 'stroke' in (objects.get(id) || {}));
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, stroke: objects.get(id).stroke }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.stroke = hex; } render(); },
    undo() { for (const { id, stroke } of before) { const o = objects.get(id); if (o) o.stroke = stroke; } render(); },
  });
}

export function setStrokeWidthForSelection(value) {
  const ids = getUnlockedSelection().filter((id) => 'strokeWidth' in (objects.get(id) || {}));
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, strokeWidth: objects.get(id).strokeWidth }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.strokeWidth = value; } render(); },
    undo() { for (const { id, strokeWidth } of before) { const o = objects.get(id); if (o) o.strokeWidth = strokeWidth; } render(); },
  });
}

// Cap/join (Phase 5, point 4): real SVG stroke-linecap/stroke-linejoin
// values, only ever offered on objects that genuinely have stroke
// geometry (see DRAWING_TYPES below) — never on a font-derived filled
// glyph outline, which has no stroke field at all to set.
export function setStrokeCapForSelection(cap) {
  const ids = getUnlockedSelection().filter((id) => 'strokeCap' in (objects.get(id) || {}));
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, strokeCap: objects.get(id).strokeCap }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.strokeCap = cap; } render(); },
    undo() { for (const { id, strokeCap } of before) { const o = objects.get(id); if (o) o.strokeCap = strokeCap; } render(); },
  });
}
export function setStrokeJoinForSelection(join) {
  const ids = getUnlockedSelection().filter((id) => 'strokeJoin' in (objects.get(id) || {}));
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, strokeJoin: objects.get(id).strokeJoin }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.strokeJoin = join; } render(); },
    undo() { for (const { id, strokeJoin } of before) { const o = objects.get(id); if (o) o.strokeJoin = strokeJoin; } render(); },
  });
}

// Used by the inspector to decide which controls to show for the
// current selection, without hardcoding a type list in inspector-panel.js.
export const DRAWING_TYPES = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'line', 'arrow', 'path']);
export function selectionKind() {
  const ids = getSelection();
  if (!ids.length) return 'none';
  const hasGlyph = ids.some((id) => objects.get(id)?.type === 'glyph');
  const hasDrawing = ids.some((id) => DRAWING_TYPES.has(objects.get(id)?.type));
  if (hasGlyph && !hasDrawing) return 'glyph';
  if (hasDrawing && !hasGlyph) return 'drawing';
  return 'mixed';
}
// Line/arrow have no visible fill (fill:'none') — only their stroke is
// the visible "color" a user would want to change.
export function selectionIsStrokeOnly() {
  const ids = getSelection();
  return ids.length > 0 && ids.every((id) => { const t = objects.get(id)?.type; return t === 'line' || t === 'arrow'; });
}

// ---- lock ----

export function setLockedForSelection(locked) {
  const ids = getSelection();
  if (!ids.length) return;
  const before = ids.map((id) => ({ id, locked: objects.get(id).locked }));
  pushCommand({
    do() { for (const id of ids) { const o = objects.get(id); if (o) o.locked = locked; } render(); notifySelection(); },
    undo() { for (const { id, locked: l } of before) { const o = objects.get(id); if (o) o.locked = l; } render(); notifySelection(); },
  });
}

// ---- layer order ----

function reorder(newOrder) {
  const before = [...order];
  pushCommand({
    do() { order.length = 0; order.push(...newOrder); render(); },
    undo() { order.length = 0; order.push(...before); render(); },
  });
}

export function bringToFront(ids = getSelection()) {
  if (!ids.length) return;
  const set = new Set(ids);
  reorder([...order.filter((id) => !set.has(id)), ...order.filter((id) => set.has(id))]);
}
export function sendToBack(ids = getSelection()) {
  if (!ids.length) return;
  const set = new Set(ids);
  reorder([...order.filter((id) => set.has(id)), ...order.filter((id) => !set.has(id))]);
}
export function bringForward(ids = getSelection()) {
  if (!ids.length) return;
  const next = [...order];
  for (let i = next.length - 2; i >= 0; i--) {
    if (ids.includes(next[i]) && !ids.includes(next[i + 1])) {
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
  }
  reorder(next);
}
export function sendBackward(ids = getSelection()) {
  if (!ids.length) return;
  const next = [...order];
  for (let i = 1; i < next.length; i++) {
    if (ids.includes(next[i]) && !ids.includes(next[i - 1])) {
      [next[i], next[i - 1]] = [next[i - 1], next[i]];
    }
  }
  reorder(next);
}

// ---- alignment / distribution / center-in-view ----

export function alignSelection(edge) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  // Align by rigid unit: a whole coherent composition moves as ONE
  // block against the reference edge (never each of its glyphs aligning
  // its own edge independently, which would instantly shatter it) — a
  // lone fine-edit glyph/cluster still aligns exactly as before.
  const units = partitionIntoRigidUnits(ids);
  const ref = units.length >= 2
    ? getSelectionWorldAABB(ids)
    : { minX: 0, minY: 0, maxX: ARTBOARD_W, maxY: ARTBOARD_H, cx: ARTBOARD_W / 2, cy: ARTBOARD_H / 2 };

  const snap = snapshotTransforms(ids);
  for (const unit of units) {
    const box = getSelectionWorldAABB(unit.ids);
    let dx = 0, dy = 0;
    switch (edge) {
      case 'left': dx = ref.minX - box.minX; break;
      case 'right': dx = ref.maxX - box.maxX; break;
      case 'centerX': dx = ref.cx - box.cx; break;
      case 'top': dy = ref.minY - box.minY; break;
      case 'bottom': dy = ref.maxY - box.maxY; break;
      case 'centerY': dy = ref.cy - box.cy; break;
      default: break;
    }
    for (const id of unit.ids) { const o = objects.get(id); o.x += dx; o.y += dy; }
  }
  render();
  commitTransform(snap);
}

export function distributeSelection(axis) {
  const ids = getUnlockedSelection();
  const units = partitionIntoRigidUnits(ids);
  if (units.length < 3) return;
  const boxed = units.map((unit) => ({ unit, box: getSelectionWorldAABB(unit.ids) }));
  const key = axis === 'x' ? 'cx' : 'cy';
  boxed.sort((a, b) => a.box[key] - b.box[key]);

  const first = boxed[0].box[key];
  const last = boxed[boxed.length - 1].box[key];
  const step = (last - first) / (boxed.length - 1);

  const snap = snapshotTransforms(ids);
  boxed.forEach((entry, i) => {
    const target = first + step * i;
    const delta = target - entry.box[key];
    for (const id of entry.unit.ids) {
      const o = objects.get(id);
      if (axis === 'x') o.x += delta; else o.y += delta;
    }
  });
  render();
  commitTransform(snap);
}

export function centerSelectionIn(targetCx, targetCy) {
  const ids = getUnlockedSelection();
  if (!ids.length) return;
  const box = getSelectionWorldAABB(ids);
  if (!box) return;
  const dx = targetCx - box.cx;
  const dy = targetCy - box.cy;
  const snap = snapshotTransforms(ids);
  for (const id of ids) { const o = objects.get(id); o.x += dx; o.y += dy; }
  render();
  commitTransform(snap);
}

// ---- rendering ----

export function render() {
  if (!sceneEl) return;
  sceneEl.textContent = '';
  gNodes.clear();
  patchHitRectNodes.clear();

  // Per-patch catch-all hit-areas, added FIRST so every individual
  // glyph's own (more precise) hit-rect, added afterward below, wins
  // hit-testing at any point it covers. Real connected Arabic letters
  // routinely leave a concave gap between two glyphs' own bounding
  // boxes (e.g. where one stroke curves under another) that neither
  // glyph's own hit-rect reaches — without this, clicking in the
  // middle of a multi-letter patch like "مبا" can land on none of its
  // glyphs and silently miss the patch entirely. This closes that gap
  // by making the whole patch's silhouette clickable, while leaving
  // fine-edit's per-glyph precision untouched (a glyph's own hit-rect,
  // painted after this and thus on top, still wins wherever it exists).
  const patchIdsSeen = new Set();
  for (const id of order) {
    const obj = objects.get(id);
    if (!obj || !obj.patchId || patchIdsSeen.has(obj.patchId)) continue;
    patchIdsSeen.add(obj.patchId);
    try {
      const memberIds = getPatchChildIds(obj.patchId);
      if (memberIds.length < 2) continue; // single-glyph patch: its own hit-rect already covers it fully
      const patchBox = getSelectionWorldAABB(memberIds);
      if (!patchBox) continue;
      const patchHitRect = el('rect', {
        x: patchBox.minX, y: patchBox.minY,
        width: Math.max(patchBox.width, 0.001), height: Math.max(patchBox.height, 0.001),
        'data-object-id': memberIds[0],
        fill: 'transparent',
        'pointer-events': 'all',
      });
      sceneEl.appendChild(patchHitRect);
      patchHitRectNodes.set(obj.patchId, patchHitRect);
    } catch (err) {
      // A malformed member (Phase 6, point 9) must not stop every OTHER
      // patch's hit-rect from being built -- the per-glyph hit-rects
      // built below still work fine even if this one patch's catch-all
      // rect is skipped.
      console.error('[calligraphy-editor] Skipped a malformed patch hit-rect:', obj.patchId, err);
    }
  }

  // Phase 6, point 9: a project file can arrive corrupted, hand-edited,
  // or from a future/older app version -- one object with a missing or
  // malformed field (e.g. a line/arrow with no localP1/localP2, a
  // glyph with a non-string path) must never be allowed to throw
  // partway through this loop and abort rendering of every object
  // still to come. Each object gets its own try/catch so one bad
  // object degrades to "silently skipped" (logged for developers,
  // summarized once for the user below) rather than turning the whole
  // canvas blank.
  let skippedObjectCount = 0;
  for (const id of order) {
    const obj = objects.get(id);
    if (!obj) continue;
    try {
      const gAttrs = {
        'data-object-id': obj.id,
        class: 'scene-object' + (obj.locked ? ' locked' : ''),
        transform: transformAttr(obj),
      };
      // Phase 7, Trace Image: a reference image is real scene state (it
      // renders, moves, rotates, resizes like everything else) but is
      // never part of the actual artwork -- export.js strips any node
      // carrying this attribute unless the user explicitly opts in via
      // the Trace Image panel's "include in export" toggle, which just
      // flips obj.excludeFromExport and re-renders.
      if (obj.type === 'image' && obj.excludeFromExport) gAttrs['data-export-exclude'] = 'true';
      // Phase 7, Trace Image "hide/show reference": display:none is a
      // pure viewport toggle -- the object, and everything about it
      // (position, scale, lock state, exclude-from-export), stays
      // exactly as-is in the scene model and in project save/load;
      // only whether it's currently painted changes. A hidden image's
      // own pointer-events are also inert this way (no separate hit-
      // testing exclusion needed), same as any other display:none node.
      //
      // Phase 31 (deployment hardening): this used to be an inline
      // gAttrs.style = 'display:none' (a real style="..." attribute on
      // the rendered <g>), which a strict style-src CSP blocks. The
      // ".scene-object-hidden { display: none; }" class in editor.css
      // does the exact same thing with no inline style at all.
      if (obj.type === 'image' && obj.hidden) gAttrs.class += ' scene-object-hidden';
      const g = el('g', gAttrs);
      gNodes.set(obj.id, g);
      if (obj.type === 'glyph') {
        const innerTransform = `translate(${obj.offsetX} ${obj.offsetY}) scale(${obj.glyphScale} ${-obj.glyphScale})`;
        const path = el('path', {
          d: obj.path,
          transform: innerTransform,
          fill: obj.fill,
          opacity: String(obj.opacity),
          'pointer-events': 'none', // the hit-rect below owns clicks
        });
        g.appendChild(path);
        sceneEl.appendChild(g);

        // Invisible hit-rect covering the glyph's full visual footprint —
        // many Arabic letterforms are thin, hooked, or hollow (especially
        // geometric scripts like Kufi), so requiring a click on the exact
        // painted pixel would make them nearly unselectable.
        let bbox;
        try { bbox = path.getBBox(); } catch { bbox = null; }
        if (bbox) {
          const hitRect = el('rect', {
            x: bbox.x, y: bbox.y, width: bbox.width || 0.001, height: bbox.height || 0.001,
            transform: innerTransform,
            fill: 'transparent',
            'pointer-events': 'all',
          });
          g.insertBefore(hitRect, path);
        }
      } else {
        renderDrawingObject(g, obj);
        sceneEl.appendChild(g);
      }
    } catch (err) {
      skippedObjectCount++;
      gNodes.delete(obj.id);
      console.error('[calligraphy-editor] Skipped a malformed object while rendering:', id, err);
    }
  }
  if (skippedObjectCount > 0) {
    toast(skippedObjectCount === 1
      ? 'تعذّر عرض عنصر واحد تالف في هذا المشروع — تم تخطّيه'
      : `تعذّر عرض ${skippedObjectCount} عناصر تالفة في هذا المشروع — تم تخطّيها`);
  }
  renderSelectionOverlay();
  notifyChange();
}

// ---- cheap live-update path (Phase 6 performance pass) ----
//
// During a live drag/rotate/resize/spacing/baseline/path-point gesture,
// the full render() above is far more work than necessary: it tears
// down and rebuilds every object's DOM node and calls the layout-
// forcing path.getBBox() once per glyph, on every single pointermove.
// A rigid transform (translate/rotate/scale of an object's outer <g>)
// never changes that object's own local/font-unit geometry, so the
// only thing that actually needs to change on-screen is the <g>'s own
// transform attribute (plus, for multi-glyph patches, the catch-all
// hit-rect's box, which IS affected by member positions and is cheap
// to recompute via the existing pure-math getSelectionWorldAABB). Both
// gNodes and patchHitRectNodes are populated fresh by every render(),
// so a call here is only ever valid until the next add/remove-object
// full render() — exactly the lifetime these live-drag gestures run
// within (they begin after a render() has already happened, and are
// followed by a single commit that itself triggers a full render()).

function transformAttr(obj) {
  return `translate(${obj.x} ${obj.y}) rotate(${obj.rotation}) scale(${obj.scaleX} ${obj.scaleY})`;
}

// Called on every pointermove of a live move/rotate/resize/spacing/
// baseline gesture instead of render(). Updates only the <g transform>
// of each moved object and the hit-rect box of any multi-glyph patch
// it belongs to, then preserves render()'s existing side effects
// (selection overlay sync + change notification for the inspector and
// project dirty-tracking) exactly as before.
function updateLiveTransforms(ids) {
  const patchIds = new Set();
  for (const id of ids) {
    const obj = objects.get(id);
    const g = gNodes.get(id);
    if (!obj || !g) continue;
    g.setAttribute('transform', transformAttr(obj));
    if (obj.patchId) patchIds.add(obj.patchId);
  }
  for (const patchId of patchIds) {
    const rectEl = patchHitRectNodes.get(patchId);
    if (!rectEl) continue;
    const memberIds = getPatchChildIds(patchId);
    const box = getSelectionWorldAABB(memberIds);
    if (!box) continue;
    rectEl.setAttribute('x', box.minX);
    rectEl.setAttribute('y', box.minY);
    rectEl.setAttribute('width', Math.max(box.width, 0.001));
    rectEl.setAttribute('height', Math.max(box.height, 0.001));
  }
  renderSelectionOverlay();
  notifyChange();
}

// Called on every pointermove of a live path-point drag instead of
// render(). Updates only the edited glyph's visible <path d>; its
// hit-rect is intentionally left as-is until the gesture's single
// commit (which runs a full render()) — exactly the same "reconcile
// fully once, on commit" tradeoff Phase 5's commitPathPointEdit already
// relies on for undo/redo, so no new staleness is introduced beyond
// what already existed for the duration of one in-progress drag.
function updateLivePath(id) {
  const g = gNodes.get(id);
  const obj = objects.get(id);
  if (!obj || !g) return;
  const pathEl = g.querySelector('path');
  if (pathEl) pathEl.setAttribute('d', obj.path);
  renderSelectionOverlay();
  notifyChange();
}

// Draws one Phase-4 drawing object (rect/ellipse/triangle/diamond/
// line/arrow/path) into its already-positioned `<g>`. Every one of
// these follows the same two-layer pattern as a glyph: the VISIBLE
// element(s) are pointer-events:none, and a single invisible rect
// covering the object's own local bounding box (localWidth/
// localHeight, already used generically for the selection frame and
// resize handles) owns clicks — so a thin stroke, an unfilled shape,
// or an open freehand path are all reliably clickable anywhere inside
// their bounding box, exactly like a hollow Kufi letterform already is.
function renderDrawingObject(g, obj) {
  const hw = obj.localWidth / 2;
  const hh = obj.localHeight / 2;
  const cap = obj.strokeCap || 'round';
  const join = obj.strokeJoin || 'miter';
  const common = { fill: obj.fill, stroke: obj.stroke, 'stroke-width': obj.strokeWidth, 'stroke-linecap': cap, 'stroke-linejoin': join, opacity: String(obj.opacity), 'pointer-events': 'none' };

  if (obj.type === 'rect') {
    g.appendChild(el('rect', { x: -hw, y: -hh, width: hw * 2, height: hh * 2, ...common }));
  } else if (obj.type === 'ellipse') {
    g.appendChild(el('ellipse', { cx: 0, cy: 0, rx: hw, ry: hh, ...common }));
  } else if (obj.type === 'triangle') {
    g.appendChild(el('polygon', { points: `0,${-hh} ${-hw},${hh} ${hw},${hh}`, ...common }));
  } else if (obj.type === 'diamond') {
    g.appendChild(el('polygon', { points: `0,${-hh} ${hw},0 0,${hh} ${-hw},0`, ...common }));
  } else if (obj.type === 'line' || obj.type === 'arrow') {
    const { localP1: p1, localP2: p2 } = obj;
    g.appendChild(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: obj.stroke, 'stroke-width': obj.strokeWidth, 'stroke-linecap': cap,
      opacity: String(obj.opacity), 'pointer-events': 'none',
    }));
    if (obj.type === 'arrow') {
      // A real computed arrowhead — a triangle whose own geometry is
      // derived from the actual line direction and stroke width, not a
      // fixed decal — so it always points the right way even after the
      // line's own endpoints change. Shared with tools.js's live drag
      // preview via geometry.js so the two never diverge.
      const [tip, left, right] = arrowHeadPoints(p1, p2, obj.strokeWidth);
      g.appendChild(el('polygon', {
        points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
        fill: obj.stroke, opacity: String(obj.opacity), 'pointer-events': 'none',
      }));
    }
  } else if (obj.type === 'path') {
    g.appendChild(el('path', { d: obj.d, ...common }));
  } else if (obj.type === 'image') {
    // Trace Image reference layer: a real <image> object with the exact
    // same generic x/y/rotation/scaleX/scaleY/localWidth/localHeight
    // fields every other drawing object has, so it gets move/rotate/
    // resize/opacity/lock for free from this same generic renderer and
    // from object-interactions.js's handle system -- nothing type-
    // specific was needed there. Only the visible element differs.
    g.appendChild(el('image', {
      x: -hw, y: -hh, width: hw * 2, height: hh * 2,
      href: obj.imageHref, 'xlink:href': obj.imageHref,
      opacity: String(obj.opacity), preserveAspectRatio: 'none',
      'pointer-events': 'none',
    }));
  } else {
    return; // unknown type: nothing to draw, but keep the object selectable-by-id-free rather than throwing
  }

  const hitRect = el('rect', {
    x: -hw, y: -hh, width: Math.max(hw * 2, 0.001), height: Math.max(hh * 2, 0.001),
    fill: 'transparent', 'pointer-events': 'all',
  });
  g.insertBefore(hitRect, g.firstChild);
}

function box(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  node.className = className;
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES = ['n', 'e', 's', 'w'];

function renderHandles(container) {
  for (const h of CORNER_HANDLES) {
    container.appendChild(box('div', `handle handle-corner handle-${h}`, { 'data-handle': `resize-${h}` }));
  }
  for (const h of EDGE_HANDLES) {
    container.appendChild(box('div', `handle handle-edge handle-${h}`, { 'data-handle': `resize-${h}` }));
  }
  const rotateHandle = box('div', 'handle handle-rotate', { 'data-handle': 'rotate' });
  const rotateStem = box('div', 'handle-rotate-stem');
  container.appendChild(rotateStem);
  container.appendChild(rotateHandle);
}

// True when `ids` is EXACTLY one intact patch's full membership (the
// normal case — e.g. selecting "عيد" as a whole), OR one intact whole
// GROUP's full membership (every patch of the composition selected
// together, e.g. via a marquee spanning the entire phrase) — i.e. the
// selection is one coherent calligraphic unit, not an ad-hoc
// multi-select. Drives the selection overlay: a coherent unit gets ONE
// clean frame (like a single object), never the per-glyph boxes that
// would make it look like a pile of separate letters.
function isCoherentGroupSelection(ids) {
  if (ids.length < 2) return false;
  const first = objects.get(ids[0]);
  if (!first) return false;
  const gid = first.groupId;
  if (gid && ids.every((id) => objects.get(id)?.groupId === gid)) {
    const full = getGroupChildIds(gid);
    if (full.length === ids.length) return true;
  }
  const pid = first.patchId;
  if (pid && ids.every((id) => objects.get(id)?.patchId === pid)) {
    const full = getPatchChildIds(pid);
    if (full.length === ids.length) return true;
  }
  return false;
}

// Path-edit's own overlay: real anchor points (small circles) and real
// Bézier control points (small diamonds, each joined to the anchor it
// influences by a thin dashed guide line so the curve handle reads as a
// handle, not a floating dot) — replaces the normal resize/rotate
// frame entirely while active, since dragging a curve point and
// dragging a resize handle are two different gestures that shouldn't
// compete for the same screen space.
function renderPathEditOverlay() {
  const points = getPathEditPoints();
  if (!points) return;
  for (const p of points) {
    if (p.kind === 'control' && p.anchorWorld) {
      const guide = box('div', 'path-edit-guide');
      const dx = p.world.x - p.anchorWorld.x;
      const dy = p.world.y - p.anchorWorld.y;
      const len = Math.hypot(dx, dy);
      guide.style.left = `${p.anchorWorld.x}px`;
      guide.style.top = `${p.anchorWorld.y}px`;
      guide.style.width = `${len}px`;
      guide.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      overlayEl.appendChild(guide);
    }
  }
  for (const p of points) {
    const dot = box('div', p.kind === 'anchor' ? 'path-edit-anchor' : 'path-edit-control', {
      'data-path-point-kind': p.kind,
      'data-subpath-index': String(p.subpathIndex),
      'data-segment-index': String(p.segmentIndex),
      'data-x-field': p.xField,
      'data-y-field': p.yField,
    });
    dot.style.left = `${p.world.x}px`;
    dot.style.top = `${p.world.y}px`;
    overlayEl.appendChild(dot);
  }
}

function renderSelectionOverlay() {
  if (!overlayEl) return;
  overlayEl.textContent = '';
  const ids = getSelection().filter((id) => objects.has(id));
  if (!ids.length) return;

  if (pathEditId && ids.length === 1 && ids[0] === pathEditId) {
    renderPathEditOverlay();
    return;
  }

  const anyUnlocked = ids.some((id) => !objects.get(id).locked);
  const coherentGroup = isCoherentGroupSelection(ids);

  if (ids.length === 1) {
    const obj = objects.get(ids[0]);
    const { hw, hh } = localHalfExtents(obj);
    const w = hw * 2 * Math.abs(obj.scaleX);
    const h = hh * 2 * Math.abs(obj.scaleY);
    const frame = box('div', 'selection-frame' + (obj.locked ? ' locked' : ''), {
      'data-object-id': obj.id,
    });
    frame.style.left = `${obj.x - w / 2}px`;
    frame.style.top = `${obj.y - h / 2}px`;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `rotate(${obj.rotation}deg)`;
    if (!obj.locked) renderHandles(frame);
    overlayEl.appendChild(frame);
  } else {
    const b = getSelectionWorldAABB(ids);
    if (!b) return;
    // Coherent group (a whole composition, selected as itself) reads as
    // ONE object: the same solid frame style as a single-object
    // selection, no dashed "these are several things" styling and no
    // per-glyph member boxes. A genuine ad-hoc multi-select (fine-edit
    // mode, or objects from different groups/ungrouped) keeps the
    // dashed group frame plus member markers so it's clear several
    // distinct pieces are selected together.
    const frameClass = coherentGroup
      ? 'selection-frame' + (anyUnlocked ? '' : ' locked')
      : 'selection-frame selection-frame-group' + (anyUnlocked ? '' : ' locked');
    const frame = box('div', frameClass);
    frame.style.left = `${b.minX}px`;
    frame.style.top = `${b.minY}px`;
    frame.style.width = `${b.width}px`;
    frame.style.height = `${b.height}px`;
    if (anyUnlocked) renderHandles(frame);
    overlayEl.appendChild(frame);

    if (!coherentGroup) {
      for (const id of ids) {
        const box2 = getObjectWorldAABB(id);
        const marker = box('div', 'selection-member');
        marker.style.left = `${box2.minX}px`;
        marker.style.top = `${box2.minY}px`;
        marker.style.width = `${box2.width}px`;
        marker.style.height = `${box2.height}px`;
        overlayEl.appendChild(marker);
      }
    }
  }
}

// ---- hit testing ----

export function objectIdAtEvent(evt) {
  const target = evt.target.closest ? evt.target.closest('[data-object-id]') : null;
  return target ? target.getAttribute('data-object-id') : null;
}
