/*
 * Arabic Calligraphy Studio — interactive canvas editor.
 *
 * Phase 1 shipped: per-glyph/cluster object model, SVG stage, select,
 * move, delete, duplicate, pan, zoom (incl. pinch), layers, lock,
 * color/opacity, background, undo/redo.
 *
 * Phase 2 (this pass) adds: real rotation (drag handle, Shift-snap),
 * real resize (corner = proportional/uniform scale around the object's
 * own center; edge = free single-axis resize for shape objects, opposite
 * edge stays put), true multi-selection (marquee + shift/ctrl-click,
 * one combined selection boundary, group move/scale/rotate/color/
 * opacity/delete/duplicate), alignment + distribution, and the full
 * keyboard-shortcut set (arrows to nudge, Shift+arrow for a bigger
 * step, Escape to deselect, on top of the Phase 1 shortcuts).
 *
 * Phase 3 (this pass) adds real drawing-tool object types: pen
 * (freehand polyline), line, arrow, rect, circle — first-class scene
 * objects with the same move/rotate/scale/color/opacity/delete/undo
 * support as glyph objects, plus stroke width and fill.
 *
 * Phase 4 (this pass) adds canvas-aware export: exportSVGString() and
 * exportPNGBlob() serialize the *current* object array (post-edit —
 * every move/rotate/resize/recolor/opacity/delete/add-shape/background
 * change is reflected), not the original input text. Glyph objects are
 * already pure vector outlines (HarfBuzz glyphToPath() output, baked in
 * at generation time — see calligraphy-editor-app-init.js), so export needs
 * no embedded font file and no browser text-shaping step: it is a
 * direct, lossless serialization of the same path/shape data already
 * driving the on-screen render.
 *
 * Object model:
 *   Canvas
 *    ├── { id, type:'glyph', char, path, upem, x, y, rotation, scale,
 *    │     color, opacity, fontFile, variationId, zIndex, locked }
 *    ├── { id, type:'rect'|'circle', x, y, w, h, rotation, scale, color,
 *    │     fill, strokeWidth, opacity, locked }
 *    ├── { id, type:'line'|'arrow', x, y, length, rotation, scale,
 *    │     color, strokeWidth, opacity, locked }
 *    ├── { id, type:'path', x, y, points:[[x,y],...], rotation, scale,
 *    │     color, strokeWidth, opacity, locked }   -- pen/freehand
 *
 * `x,y` is each object's fixed local anchor (glyphs: HarfBuzz pen
 * origin/baseline-left, matching calligraphy-editor-app-init.js's layout
 * math; shapes/lines/paths: their own visual center). Rotation always
 * happens around the object's *visual* center regardless of where that
 * falls relative to `x,y` — see `_objTransform`/`_localCenter` below —
 * so a glyph rotates the way a person expects even though its anchor
 * isn't its center.
 *
 * Rendering: plain SVG. Each object is a
 * <g transform="translate(x,y) rotate(rotation,cx,cy)"> wrapping its
 * primitive. No <canvas> 2D, no <textarea>/contenteditable anywhere in
 * the stage: this file never creates a DOM node that can receive focus
 * or trigger a virtual keyboard. Text entry happens in a separate
 * dialog (see calligraphy-editor-app-init.js); by the time an object
 * reaches this module it is already shaped glyph data or drawn-shape
 * data, not editable text.
 *
 * History: undo/redo is a snapshot stack of the object array (deep
 * cloned on every committed change), independent of browser history.
 *
 * This file has no framework dependency, matches the rest of the site
 * (plain script, loaded via <script defer>).
 */
(function (global) {
  "use strict";

  var HANDLE_SIZE = 9; // px, screen space (unscaled by zoom, see render)
  var ROTATE_HANDLE_OFFSET = 34; // px, screen space, above the top edge
  var MIN_SHAPE_DIM = 6; // px, local units — floor for free-resize/creation

  function uid() {
    return "o" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function deepCloneObjects(objs) {
    return objs.map(function (o) {
      var c = Object.assign({}, o);
      if (o.points) c.points = o.points.map(function (p) { return [p[0], p[1]]; });
      return c;
    });
  }

  // -- pure geometry helpers (all angles in degrees) --------------------
  function toRad(deg) { return (deg * Math.PI) / 180; }
  function toDeg(rad) { return (rad * 180) / Math.PI; }
  function rotateVec(x, y, deg) {
    var r = toRad(deg);
    var c = Math.cos(r), s = Math.sin(r);
    return { x: x * c - y * s, y: x * s + y * c };
  }
  function angleOf(vx, vy) { return toDeg(Math.atan2(vy, vx)); }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function snapAngle(deg, step) { return Math.round(deg / step) * step; }
  function normalizeAngle(deg) {
    var a = deg % 360;
    if (a < 0) a += 360;
    return a;
  }

  // -----------------------------------------------------------------
  // CanvasEditor
  // -----------------------------------------------------------------
  function CanvasEditor(svgEl, opts) {
    opts = opts || {};
    this.svg = svgEl;
    this.width = opts.width || 1200;
    this.height = opts.height || 700;
    this.onChange = opts.onChange || function () {};
    this.onSelectionChange = opts.onSelectionChange || function () {};

    this.objects = []; // z-order = array order (last = topmost)
    this.selectedIds = [];
    this.tool = "select"; // 'select' | 'hand' | 'draw-rect' | 'draw-circle' | 'draw-line' | 'draw-arrow' | 'draw-pen'
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.background = { mode: "transparent", color: "#EEF0EA" };
    this.drawDefaults = { color: "#1C2521", fill: "none", strokeWidth: 4 };

    this.undoStack = [deepCloneObjects(this.objects)];
    this.redoStack = [];

    this._buildDom();
    this._wireEvents();
    this.render();
  }

  // --- DOM scaffold ---------------------------------------------------
  CanvasEditor.prototype._buildDom = function () {
    var svg = this.svg;
    svg.setAttribute("viewBox", "0 0 " + this.width + " " + this.height);
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.innerHTML =
      '<defs>' +
      '<pattern id="cecCheckerboard" width="20" height="20" patternUnits="userSpaceOnUse">' +
      '<rect width="20" height="20" fill="#ffffff"/><rect width="10" height="10" fill="#d9dcd4"/>' +
      '<rect x="10" y="10" width="10" height="10" fill="#d9dcd4"/></pattern>' +
      '</defs>' +
      '<rect class="cec-bg" x="0" y="0" width="' + this.width + '" height="' + this.height + '"/>' +
      '<g class="cec-world">' +
      '<g class="cec-objects"></g>' +
      '<g class="cec-selection-overlay"></g>' +
      '<g class="cec-marquee-layer"></g>' +
      '</g>';
    this.bgRect = svg.querySelector(".cec-bg");
    this.worldG = svg.querySelector(".cec-world");
    this.objectsG = svg.querySelector(".cec-objects");
    this.overlayG = svg.querySelector(".cec-selection-overlay");
    this.marqueeG = svg.querySelector(".cec-marquee-layer");
    // Never editable: no contenteditable, no tabindex that opens a
    // soft keyboard, no <input>/<textarea> descendants.
    svg.setAttribute("tabindex", "0");
    svg.style.touchAction = "none"; // we own panning/zooming ourselves
  };

  // --- Object CRUD -----------------------------------------------------
  CanvasEditor.prototype.addObject = function (obj, opts) {
    opts = opts || {};
    var full = Object.assign({
      id: uid(),
      rotation: 0,
      scale: 1,
      opacity: 1,
      color: "#1C2521",
      locked: false
    }, obj);
    this.objects.push(full);
    this.render();
    if (!opts.silent) this.commit();
    return full;
  };

  CanvasEditor.prototype.addObjects = function (objs) {
    var self = this;
    objs.forEach(function (o) { self.addObject(o, { silent: true }); });
    this.commit();
  };

  CanvasEditor.prototype.getObject = function (id) {
    return this.objects.find(function (o) { return o.id === id; });
  };

  CanvasEditor.prototype.deleteSelected = function () {
    if (!this.selectedIds.length) return false;
    var selected = this.selectedIds.slice();
    this.objects = this.objects.filter(function (o) {
      return selected.indexOf(o.id) === -1 || o.locked;
    });
    this.selectedIds = this.selectedIds.filter(function (id) {
      var o = this.getObject(id);
      return o && o.locked;
    }, this);
    this.render();
    this.commit();
    this.onSelectionChange(this.selectedIds);
    return true;
  };

  CanvasEditor.prototype.duplicateSelected = function () {
    if (!this.selectedIds.length) return;
    var self = this;
    var newIds = [];
    this.selectedIds.forEach(function (id) {
      var o = self.getObject(id);
      if (!o) return;
      var copy = Object.assign({}, o, { id: uid(), x: o.x + 24, y: o.y + 24, locked: false });
      if (o.points) copy.points = o.points.map(function (p) { return [p[0], p[1]]; });
      self.objects.push(copy);
      newIds.push(copy.id);
    });
    this.selectedIds = newIds;
    this.render();
    this.commit();
    this.onSelectionChange(this.selectedIds);
  };

  CanvasEditor.prototype.clear = function () {
    this.objects = [];
    this.selectedIds = [];
    this.render();
    this.commit();
  };

  // --- Selection ---------------------------------------------------
  CanvasEditor.prototype.select = function (ids) {
    this.selectedIds = (ids || []).filter(function (id) { return this.getObject(id); }, this);
    this.render();
    this.onSelectionChange(this.selectedIds);
  };

  CanvasEditor.prototype.selectAll = function () {
    this.select(this.objects.map(function (o) { return o.id; }));
  };

  CanvasEditor.prototype.clearSelection = function () {
    this.select([]);
  };

  // --- Layer ordering -----------------------------------------------
  CanvasEditor.prototype._moveInArray = function (id, fn) {
    var idx = this.objects.findIndex(function (o) { return o.id === id; });
    if (idx === -1) return;
    var obj = this.objects[idx];
    this.objects.splice(idx, 1);
    var newIdx = fn(idx, this.objects.length);
    this.objects.splice(clamp(newIdx, 0, this.objects.length), 0, obj);
    this.render();
    this.commit();
  };
  CanvasEditor.prototype.bringToFront = function (id) { this._moveInArray(id, function (i, len) { return len; }); };
  CanvasEditor.prototype.sendToBack = function (id) { this._moveInArray(id, function () { return 0; }); };
  CanvasEditor.prototype.bringForward = function (id) { this._moveInArray(id, function (i) { return i + 1; }); };
  CanvasEditor.prototype.sendBackward = function (id) { this._moveInArray(id, function (i) { return i - 1; }); };

  // --- Property edits (color etc.) -----------------------------------
  CanvasEditor.prototype.setPropertyOnSelected = function (patch) {
    var selected = this.selectedIds;
    if (!selected.length) return;
    this.objects.forEach(function (o) {
      if (selected.indexOf(o.id) !== -1 && !o.locked) Object.assign(o, patch);
    });
    this.render();
    this.commit();
  };

  CanvasEditor.prototype.setPropertyOnAll = function (patch) {
    this.objects.forEach(function (o) { if (!o.locked) Object.assign(o, patch); });
    this.render();
    this.commit();
  };

  CanvasEditor.prototype.toggleLockSelected = function () {
    var selected = this.selectedIds;
    this.objects.forEach(function (o) {
      if (selected.indexOf(o.id) !== -1) o.locked = !o.locked;
    });
    this.render();
    this.commit();
  };

  // --- History ---------------------------------------------------------
  CanvasEditor.prototype.commit = function () {
    var top = this.undoStack[this.undoStack.length - 1];
    var snap = deepCloneObjects(this.objects);
    if (JSON.stringify(top) === JSON.stringify(snap)) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.onChange();
  };

  CanvasEditor.prototype.undo = function () {
    if (this.undoStack.length <= 1) return false;
    this.redoStack.push(this.undoStack.pop());
    this.objects = deepCloneObjects(this.undoStack[this.undoStack.length - 1]);
    this.selectedIds = this.selectedIds.filter(function (id) { return this.getObject(id); }, this);
    this.render();
    this.onChange();
    this.onSelectionChange(this.selectedIds);
    return true;
  };

  CanvasEditor.prototype.redo = function () {
    if (!this.redoStack.length) return false;
    var snap = this.redoStack.pop();
    this.undoStack.push(snap);
    this.objects = deepCloneObjects(snap);
    this.selectedIds = this.selectedIds.filter(function (id) { return this.getObject(id); }, this);
    this.render();
    this.onChange();
    this.onSelectionChange(this.selectedIds);
    return true;
  };

  // --- Viewport ----------------------------------------------------
  CanvasEditor.prototype.setZoom = function (zoom, centerX, centerY) {
    var oldZoom = this.zoom;
    var z = clamp(zoom, 0.1, 8);
    if (centerX === undefined) { centerX = this.width / 2; centerY = this.height / 2; }
    // Keep the point under (centerX, centerY) stable while zooming.
    this.panX = centerX - ((centerX - this.panX) * (z / oldZoom));
    this.panY = centerY - ((centerY - this.panY) * (z / oldZoom));
    this.zoom = z;
    this._applyViewportTransform();
    this.render(); // handle sizes are screen-space (see _renderSelectionOverlay) so re-render on zoom
    this.onChange();
  };

  CanvasEditor.prototype.pan = function (dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this._applyViewportTransform();
  };

  CanvasEditor.prototype.fitToScreen = function () {
    var rect = this.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) { this.resetZoom(); return; }
    var scale = Math.min(rect.width / this.width, rect.height / this.height) * 0.92;
    this.zoom = clamp(scale, 0.1, 8);
    this.panX = (this.width - this.width * this.zoom) / 2;
    this.panY = (this.height - this.height * this.zoom) / 2;
    this._applyViewportTransform();
    this.render();
    this.onChange();
  };

  CanvasEditor.prototype.resetZoom = function () {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this._applyViewportTransform();
    this.render();
    this.onChange();
  };

  CanvasEditor.prototype._applyViewportTransform = function () {
    this.worldG.setAttribute("transform",
      "translate(" + this.panX + "," + this.panY + ") scale(" + this.zoom + ")");
  };

  // --- Rendering -----------------------------------------------------
  CanvasEditor.prototype.setBackground = function (mode, color) {
    this.background = { mode: mode, color: color || this.background.color };
    this.render();
  };

  // Local-space center of an object's bounding box, i.e. the point (in
  // the object's own unrotated coordinate frame, relative to its x,y
  // anchor) that rotation and proportional scaling both pivot around.
  // For rect/circle/line/arrow/path this is always (0,0) because those
  // types already anchor at their own visual center; only glyphs (which
  // anchor at the HarfBuzz pen origin/baseline) have a non-zero offset.
  CanvasEditor.prototype._localCenter = function (o) {
    var b = this._bbox(o);
    return { x: b.x0 + b.w / 2, y: b.y0 + b.h / 2 };
  };

  // World-space position of that same pivot point. Because rotate(angle,
  // cx,cy) rotates *around* (cx,cy), the pivot itself never moves under
  // rotation — it only moves when x/y (the anchor) or the object's scale
  // (which the local center is proportional to) change. See the derivation
  // in ARCHITECTURE.md "Phase 2 rotation/resize math".
  CanvasEditor.prototype._worldCenter = function (o) {
    var c = this._localCenter(o);
    return { x: o.x + c.x, y: o.y + c.y };
  };

  CanvasEditor.prototype._objTransform = function (o) {
    var c = this._localCenter(o);
    return "translate(" + o.x + "," + o.y + ") rotate(" + o.rotation + "," + c.x + "," + c.y + ")";
  };

  // World-space axis-aligned bounding box of one object (accounts for
  // its own rotation by transforming all 4 local corners).
  CanvasEditor.prototype._worldBBoxOf = function (o) {
    var b = this._bbox(o);
    var c = this._localCenter(o);
    var wc = this._worldCenter(o);
    var corners = [
      [b.x0, b.y0], [b.x0 + b.w, b.y0], [b.x0, b.y0 + b.h], [b.x0 + b.w, b.y0 + b.h]
    ];
    var xs = [], ys = [];
    corners.forEach(function (pt) {
      var rel = rotateVec(pt[0] - c.x, pt[1] - c.y, o.rotation);
      xs.push(wc.x + rel.x);
      ys.push(wc.y + rel.y);
    });
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
      minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
  };

  // Combined world-space bounding box across several objects (by id).
  CanvasEditor.prototype._combinedBBox = function (ids) {
    var self = this;
    var boxes = ids.map(function (id) { return self._worldBBoxOf(self.getObject(id)); }).filter(Boolean);
    if (!boxes.length) return null;
    return boxes.reduce(function (acc, b) {
      return {
        minX: Math.min(acc.minX, b.minX), maxX: Math.max(acc.maxX, b.maxX),
        minY: Math.min(acc.minY, b.minY), maxY: Math.max(acc.maxY, b.maxY)
      };
    });
  };

  CanvasEditor.prototype._renderBackground = function () {
    var bg = this.background;
    if (bg.mode === "transparent") {
      this.bgRect.setAttribute("fill", "url(#cecCheckerboard)");
      this.bgRect.dataset.transparent = "1";
    } else {
      this.bgRect.setAttribute("fill", bg.mode === "white" ? "#ffffff" : bg.color);
      this.bgRect.dataset.transparent = "0";
    }
  };

  // Builds the inner SVG markup for one object (used by both live
  // rendering and export, so the two can never drift apart).
  CanvasEditor.prototype._buildObjectInner = function (doc, o) {
    var inner = null;
    if (o.type === "glyph") {
      inner = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      inner.setAttribute("d", o.path || "");
      inner.setAttribute("fill", o.color);
      // Font units -> px, and flip Y (glyph paths are y-up, SVG is y-down).
      var s = (o.scale * (o.fontSizePx || 64)) / (o.upem || 1000);
      inner.setAttribute("transform", "scale(" + s + "," + (-s) + ")");
    } else if (o.type === "rect") {
      inner = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      inner.setAttribute("x", -o.w / 2); inner.setAttribute("y", -o.h / 2);
      inner.setAttribute("width", o.w); inner.setAttribute("height", o.h);
      inner.setAttribute("fill", o.fill && o.fill !== "none" ? o.fill : "none");
      inner.setAttribute("stroke", o.color);
      inner.setAttribute("stroke-width", o.strokeWidth || 4);
      inner.setAttribute("transform", "scale(" + o.scale + ")");
    } else if (o.type === "circle") {
      inner = doc.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      inner.setAttribute("rx", o.w / 2); inner.setAttribute("ry", o.h / 2);
      inner.setAttribute("fill", o.fill && o.fill !== "none" ? o.fill : "none");
      inner.setAttribute("stroke", o.color);
      inner.setAttribute("stroke-width", o.strokeWidth || 4);
      inner.setAttribute("transform", "scale(" + o.scale + ")");
    } else if (o.type === "line" || o.type === "arrow") {
      inner = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      inner.setAttribute("transform", "scale(" + o.scale + ")");
      var line = doc.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", -o.length / 2); line.setAttribute("y1", 0);
      line.setAttribute("x2", o.length / 2); line.setAttribute("y2", 0);
      line.setAttribute("stroke", o.color);
      line.setAttribute("stroke-width", o.strokeWidth || 4);
      line.setAttribute("stroke-linecap", "round");
      inner.appendChild(line);
      if (o.type === "arrow") {
        var head = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        var hs = (o.strokeWidth || 4) * 2.6;
        var hx = o.length / 2;
        head.setAttribute("d", "M " + hx + " 0 L " + (hx - hs) + " " + (-hs * 0.6) +
          " L " + (hx - hs) + " " + (hs * 0.6) + " Z");
        head.setAttribute("fill", o.color);
        inner.appendChild(head);
      }
    } else if (o.type === "path") {
      inner = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      inner.setAttribute("d", this._pathD(o));
      inner.setAttribute("fill", "none");
      inner.setAttribute("stroke", o.color);
      inner.setAttribute("stroke-width", o.strokeWidth || 4);
      inner.setAttribute("stroke-linecap", "round");
      inner.setAttribute("stroke-linejoin", "round");
      inner.setAttribute("transform", "scale(" + o.scale + ")");
    }
    return inner;
  };

  // Freehand (pen) points are stored relative to the object's own local
  // center (see addFreehandObject), so the path data never needs to be
  // rewritten when the object is moved/rotated/scaled — only its <g>
  // transform changes, same as every other object type.
  CanvasEditor.prototype._pathD = function (o) {
    var pts = o.points || [];
    if (!pts.length) return "";
    var d = "M " + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < pts.length; i++) d += " L " + pts[i][0] + " " + pts[i][1];
    return d;
  };

  CanvasEditor.prototype.render = function () {
    this._renderBackground();
    this._applyViewportTransform();

    var self = this;
    this.objectsG.innerHTML = "";
    this.objects.forEach(function (o) {
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-id", o.id);
      g.setAttribute("class", "cec-obj" + (o.locked ? " cec-obj--locked" : ""));
      g.setAttribute("transform", self._objTransform(o));
      g.style.opacity = o.opacity;
      var inner = self._buildObjectInner(document, o);
      if (inner) g.appendChild(inner);
      self.objectsG.appendChild(g);
    });

    this._renderSelectionOverlay();
  };

  // Returns a local-space box { x0, y0, w, h } for the selection outline,
  // in the object's own (pre-scale-flip) coordinate space, i.e. relative
  // to the same origin its <g transform="translate(x,y) ..."> uses.
  // Glyphs anchor at their natural HarfBuzz pen-origin (left edge,
  // baseline y=0) rather than a centered point — see calligraphy-editor-
  // init.js generateFromText(), which positions objects the same way.
  CanvasEditor.prototype._bbox = function (o) {
    if (o.type === "glyph") {
      var s = (o.scale * (o.fontSizePx || 64)) / (o.upem || 1000);
      var w = (o.glyphAdvance || o.upem * 0.6) * s;
      var h = (o.fontSizePx || 64) * o.scale;
      // A little slack on the left/top for negative side-bearings and
      // ascenders/marks that draw slightly outside the advance box.
      return { x0: -h * 0.12, y0: -h * 1.05, w: Math.max(w, 8) + h * 0.24, h: h * 1.2 };
    }
    if (o.type === "rect" || o.type === "circle") {
      var bw = o.w * o.scale, bh = o.h * o.scale;
      return { x0: -bw / 2, y0: -bh / 2, w: bw, h: bh };
    }
    if (o.type === "line" || o.type === "arrow") {
      var lw = o.length * o.scale, lh = Math.max(24, (o.strokeWidth || 4) * o.scale * 3);
      return { x0: -lw / 2, y0: -lh / 2, w: lw, h: lh };
    }
    if (o.type === "path") {
      var pts = o.points || [[0, 0]];
      var xs = pts.map(function (p) { return p[0]; });
      var ys = pts.map(function (p) { return p[1]; });
      var pad = Math.max(6, (o.strokeWidth || 4));
      var x0 = Math.min.apply(null, xs) * o.scale - pad, x1 = Math.max.apply(null, xs) * o.scale + pad;
      var y0 = Math.min.apply(null, ys) * o.scale - pad, y1 = Math.max.apply(null, ys) * o.scale + pad;
      return { x0: x0, y0: y0, w: Math.max(x1 - x0, 4), h: Math.max(y1 - y0, 4) };
    }
    return { x0: -20, y0: -20, w: 40, h: 40 };
  };

  // Whether an object type supports independent (non-uniform) edge
  // resize in addition to proportional corner resize.
  CanvasEditor.prototype._supportsEdgeResize = function (o) {
    return o.type === "rect" || o.type === "circle";
  };
  CanvasEditor.prototype._supportsEndpointResize = function (o) {
    return o.type === "line" || o.type === "arrow";
  };

  CanvasEditor.prototype._renderSelectionOverlay = function () {
    var self = this;
    this.overlayG.innerHTML = "";
    var invZoom = 1 / this.zoom;
    var ids = this.selectedIds.filter(function (id) { return self.getObject(id); });
    if (!ids.length) return;

    var anyUnlocked = ids.some(function (id) { return !self.getObject(id).locked; });
    var pad = 6;

    function addHandle(g, cx, cy, cls, extraAttrs) {
      var h = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      h.setAttribute("cx", cx); h.setAttribute("cy", cy);
      h.setAttribute("r", HANDLE_SIZE * invZoom / 2);
      h.setAttribute("class", "cec-handle " + cls);
      h.setAttribute("vector-effect", "non-scaling-stroke");
      if (extraAttrs) Object.keys(extraAttrs).forEach(function (k) { h.setAttribute(k, extraAttrs[k]); });
      g.appendChild(h);
      return h;
    }

    if (ids.length === 1) {
      var o = this.getObject(ids[0]);
      var bbox = this._bbox(o);
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "cec-sel");
      g.setAttribute("transform", this._objTransform(o));

      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", bbox.x0 - pad);
      rect.setAttribute("y", bbox.y0 - pad);
      rect.setAttribute("width", bbox.w + pad * 2);
      rect.setAttribute("height", bbox.h + pad * 2);
      rect.setAttribute("class", "cec-sel-box" + (o.locked ? " cec-sel-box--locked" : ""));
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(rect);

      if (!o.locked) {
        var x0 = bbox.x0 - pad, y0 = bbox.y0 - pad, x1 = bbox.x0 + bbox.w + pad, y1 = bbox.y0 + bbox.h + pad;
        var corners = [
          { pos: [x0, y0], id: "nw" }, { pos: [x1, y0], id: "ne" },
          { pos: [x0, y1], id: "sw" }, { pos: [x1, y1], id: "se" }
        ];
        corners.forEach(function (c) {
          addHandle(g, c.pos[0], c.pos[1], "cec-handle-corner", { "data-handle": "scale-corner-" + c.id, "data-id": o.id });
        });

        if (self._supportsEdgeResize(o)) {
          var mids = [
            { pos: [(x0 + x1) / 2, y0], id: "top" }, { pos: [(x0 + x1) / 2, y1], id: "bottom" },
            { pos: [x0, (y0 + y1) / 2], id: "left" }, { pos: [x1, (y0 + y1) / 2], id: "right" }
          ];
          mids.forEach(function (m) {
            addHandle(g, m.pos[0], m.pos[1], "cec-handle-edge cec-handle-edge--" + m.id,
              { "data-handle": "scale-edge-" + m.id, "data-id": o.id });
          });
        } else if (self._supportsEndpointResize(o)) {
          [{ x: x0, id: "left" }, { x: x1, id: "right" }].forEach(function (m) {
            addHandle(g, m.x, (y0 + y1) / 2, "cec-handle-edge cec-handle-edge--" + m.id,
              { "data-handle": "scale-edge-" + m.id, "data-id": o.id });
          });
        }

        // Rotation handle: a short stalk above the top-center, ending in
        // a round grip. Drawn in the object's own (rotated) local space,
        // same as the rest of the overlay, so it visually tracks the
        // object's current rotation like every real design tool.
        var topMidX = (x0 + x1) / 2;
        var stalkLen = ROTATE_HANDLE_OFFSET * invZoom;
        var stalk = document.createElementNS("http://www.w3.org/2000/svg", "line");
        stalk.setAttribute("x1", topMidX); stalk.setAttribute("y1", y0);
        stalk.setAttribute("x2", topMidX); stalk.setAttribute("y2", y0 - stalkLen);
        stalk.setAttribute("class", "cec-rotate-stalk");
        stalk.setAttribute("vector-effect", "non-scaling-stroke");
        g.appendChild(stalk);
        addHandle(g, topMidX, y0 - stalkLen, "cec-handle-rotate", { "data-handle": "rotate", "data-id": o.id });
      }
      this.overlayG.appendChild(g);
      return;
    }

    // Multi-selection: one combined (axis-aligned, world-space) boundary
    // plus group handles, per the brief ("show one combined selection
    // boundary ... scale/rotate the selection as a group").
    var box = this._combinedBBox(ids);
    if (!box) return;
    var gg = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gg.setAttribute("class", "cec-sel cec-sel--group");
    var grect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    grect.setAttribute("x", box.minX - pad);
    grect.setAttribute("y", box.minY - pad);
    grect.setAttribute("width", (box.maxX - box.minX) + pad * 2);
    grect.setAttribute("height", (box.maxY - box.minY) + pad * 2);
    grect.setAttribute("class", "cec-sel-box cec-sel-box--group");
    grect.setAttribute("vector-effect", "non-scaling-stroke");
    gg.appendChild(grect);

    if (anyUnlocked) {
      var gx0 = box.minX - pad, gy0 = box.minY - pad, gx1 = box.maxX + pad, gy1 = box.maxY + pad;
      [[gx0, gy0, "nw"], [gx1, gy0, "ne"], [gx0, gy1, "sw"], [gx1, gy1, "se"]].forEach(function (c) {
        addHandle(gg, c[0], c[1], "cec-handle-corner", { "data-handle": "scale-corner-group-" + c[2] });
      });
      var gTopMidX = (gx0 + gx1) / 2;
      var gStalkLen = ROTATE_HANDLE_OFFSET * invZoom;
      var gStalk = document.createElementNS("http://www.w3.org/2000/svg", "line");
      gStalk.setAttribute("x1", gTopMidX); gStalk.setAttribute("y1", gy0);
      gStalk.setAttribute("x2", gTopMidX); gStalk.setAttribute("y2", gy0 - gStalkLen);
      gStalk.setAttribute("class", "cec-rotate-stalk");
      gStalk.setAttribute("vector-effect", "non-scaling-stroke");
      gg.appendChild(gStalk);
      addHandle(gg, gTopMidX, gy0 - gStalkLen, "cec-handle-rotate", { "data-handle": "rotate-group" });
    }
    this.overlayG.appendChild(gg);

    // Faint per-object outlines so it's clear *which* objects are in the
    // group, without implying they can be manipulated individually while
    // the group handles are active.
    ids.forEach(function (id) {
      var oo = self.getObject(id);
      var b = self._bbox(oo);
      var og = document.createElementNS("http://www.w3.org/2000/svg", "g");
      og.setAttribute("transform", self._objTransform(oo));
      var r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", b.x0 - 3); r.setAttribute("y", b.y0 - 3);
      r.setAttribute("width", b.w + 6); r.setAttribute("height", b.h + 6);
      r.setAttribute("class", "cec-sel-box cec-sel-box--member");
      r.setAttribute("vector-effect", "non-scaling-stroke");
      og.appendChild(r);
      self.overlayG.appendChild(og);
    });
  };

  // --- Alignment / distribution ---------------------------------------
  // All operate on the current selection's world-space bounding boxes
  // and only translate objects (x/y), never touch rotation or scale, so
  // they compose cleanly with everything else and are fully undoable
  // (one commit per call).
  CanvasEditor.prototype._eachSelected = function (fn) {
    var self = this;
    this.selectedIds.forEach(function (id) {
      var o = self.getObject(id);
      if (o && !o.locked) fn(o);
    });
  };

  CanvasEditor.prototype.alignSelected = function (edge) {
    if (this.selectedIds.length < 1) return;
    var group = this._combinedBBox(this.selectedIds);
    if (!group) return;
    var self = this;
    var cx = (group.minX + group.maxX) / 2, cy = (group.minY + group.maxY) / 2;
    this._eachSelected(function (o) {
      var b = self._worldBBoxOf(o);
      var dx = 0, dy = 0;
      if (edge === "left") dx = group.minX - b.minX;
      else if (edge === "right") dx = group.maxX - b.maxX;
      else if (edge === "center-h") dx = cx - (b.minX + b.maxX) / 2;
      else if (edge === "top") dy = group.minY - b.minY;
      else if (edge === "bottom") dy = group.maxY - b.maxY;
      else if (edge === "middle-v") dy = cy - (b.minY + b.maxY) / 2;
      o.x += dx; o.y += dy;
    });
    this.render();
    this.commit();
  };

  CanvasEditor.prototype.distributeSelected = function (axis) {
    if (this.selectedIds.length < 3) return; // distribution needs >=3 to mean anything
    var self = this;
    var items = this.selectedIds
      .map(function (id) { return self.getObject(id); })
      .filter(function (o) { return o && !o.locked; })
      .map(function (o) {
        var b = self._worldBBoxOf(o);
        return { o: o, center: axis === "h" ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2 };
      })
      .sort(function (a, b) { return a.center - b.center; });
    if (items.length < 3) return;
    var first = items[0].center, last = items[items.length - 1].center;
    var step = (last - first) / (items.length - 1);
    items.forEach(function (item, i) {
      var target = first + step * i;
      var delta = target - item.center;
      if (axis === "h") item.o.x += delta; else item.o.y += delta;
    });
    this.render();
    this.commit();
  };

  CanvasEditor.prototype.centerSelectedOnCanvas = function () {
    if (!this.selectedIds.length) return;
    var group = this._combinedBBox(this.selectedIds);
    if (!group) return;
    var dx = this.width / 2 - (group.minX + group.maxX) / 2;
    var dy = this.height / 2 - (group.minY + group.maxY) / 2;
    this._eachSelected(function (o) { o.x += dx; o.y += dy; });
    this.render();
    this.commit();
  };

  // --- Pointer / interaction ------------------------------------------
  CanvasEditor.prototype._svgPoint = function (clientX, clientY) {
    var rect = this.svg.getBoundingClientRect();
    var vb = this.svg.viewBox.baseVal;
    var x = ((clientX - rect.left) / rect.width) * vb.width + vb.x;
    var y = ((clientY - rect.top) / rect.height) * vb.height + vb.y;
    return { x: x, y: y };
  };

  CanvasEditor.prototype._worldToObjectSpace = function (pt) {
    return { x: (pt.x - this.panX) / this.zoom, y: (pt.y - this.panY) / this.zoom };
  };

  CanvasEditor.prototype._wireEvents = function () {
    var self = this;
    var pointers = new Map(); // pointerId -> {x,y}
    var dragMode = null;
    var dragStart = null; // world (object-space) point at drag start
    var objStart = null; // snapshot of {id: {x,y}} at move-objects drag start
    var pinchStartDist = null;
    var pinchStartZoom = null;
    var didDrag = false;
    var marqueeRect = null;
    var marqueeStart = null;
    var handleState = null; // per-handle-drag snapshot, shape depends on mode
    var drawState = null; // in-progress shape/pen creation

    function topElementAt(clientX, clientY) {
      return document.elementFromPoint(clientX, clientY);
    }

    function findAncestorWithClass(el, cls) {
      while (el && el !== self.svg) {
        if (el.classList && el.classList.contains(cls)) return el;
        el = el.parentNode;
      }
      return null;
    }

    function topHitObjectAt(clientX, clientY) {
      var el = findAncestorWithClass(topElementAt(clientX, clientY), "cec-obj");
      return el ? el.getAttribute("data-id") : null;
    }

    function topHitHandleAt(clientX, clientY) {
      var el = topElementAt(clientX, clientY);
      if (el && el.getAttribute && el.getAttribute("data-handle")) {
        return { handle: el.getAttribute("data-handle"), id: el.getAttribute("data-id") };
      }
      return null;
    }

    // -- rotation (single + group) --
    function beginRotate(worldPt, pivot, ids) {
      handleState = {
        mode: ids.length > 1 || pivot.group ? "rotate-group" : "rotate-single",
        pivot: pivot,
        startAngle: angleOf(worldPt.x - pivot.x, worldPt.y - pivot.y),
        items: ids.map(function (id) {
          var o = self.getObject(id);
          var wc = self._worldCenter(o);
          return { id: id, rotation: o.rotation, x: o.x, y: o.y, worldCenter: wc, localCenter: self._localCenter(o) };
        })
      };
    }
    function updateRotate(worldPt, shiftKey) {
      var pivot = handleState.pivot;
      var now = angleOf(worldPt.x - pivot.x, worldPt.y - pivot.y);
      var delta = now - handleState.startAngle;
      if (shiftKey) {
        var proposed = handleState.items[0].rotation + delta;
        delta = snapAngle(proposed, 15) - handleState.items[0].rotation;
      }
      handleState.items.forEach(function (item) {
        var o = self.getObject(item.id);
        if (!o) return;
        o.rotation = normalizeAngle(item.rotation + delta);
        if (handleState.mode === "rotate-group") {
          var rel = rotateVec(item.worldCenter.x - pivot.x, item.worldCenter.y - pivot.y, delta);
          var newWorldCenter = { x: pivot.x + rel.x, y: pivot.y + rel.y };
          o.x = newWorldCenter.x - item.localCenter.x;
          o.y = newWorldCenter.y - item.localCenter.y;
        }
      });
      self.render();
    }

    // -- proportional (uniform) corner scale, single or group --
    function beginScaleCorner(worldPt, ids, groupPivot) {
      var pivot = groupPivot || self._worldCenter(self.getObject(ids[0]));
      handleState = {
        mode: groupPivot ? "scale-corner-group" : "scale-corner-single",
        pivot: pivot,
        startDist: Math.max(1, dist(worldPt.x, worldPt.y, pivot.x, pivot.y)),
        items: ids.map(function (id) {
          var o = self.getObject(id);
          return {
            id: id, scale: o.scale, x: o.x, y: o.y,
            localCenter: self._localCenter(o), worldCenter: self._worldCenter(o)
          };
        })
      };
    }
    function updateScaleCorner(worldPt) {
      var pivot = handleState.pivot;
      var factor = clamp(Math.max(1, dist(worldPt.x, worldPt.y, pivot.x, pivot.y)) / handleState.startDist, 0.05, 40);
      handleState.items.forEach(function (item) {
        var o = self.getObject(item.id);
        if (!o) return;
        var newScale = Math.max(0.02, item.scale * factor);
        var newLocalCenter = { x: item.localCenter.x * (newScale / item.scale), y: item.localCenter.y * (newScale / item.scale) };
        var newWorldCenter = {
          x: pivot.x + (item.worldCenter.x - pivot.x) * factor,
          y: pivot.y + (item.worldCenter.y - pivot.y) * factor
        };
        o.scale = newScale;
        o.x = newWorldCenter.x - newLocalCenter.x;
        o.y = newWorldCenter.y - newLocalCenter.y;
      });
      self.render();
    }

    // -- free single-axis edge resize (rect/circle w/h, line/arrow length) --
    function beginScaleEdge(edge, id) {
      var o = self.getObject(id);
      handleState = {
        mode: "scale-edge", edge: edge, id: id,
        rotation: o.rotation, scale: o.scale, x: o.x, y: o.y,
        w: o.w, h: o.h, length: o.length
      };
    }
    function updateScaleEdge(worldPt) {
      var o = self.getObject(handleState.id);
      if (!o) return;
      var rel = rotateVec(worldPt.x - handleState.x, worldPt.y - handleState.y, -handleState.rotation);
      var scale = handleState.scale || 1;
      if (o.type === "rect" || o.type === "circle") {
        if (handleState.edge === "left" || handleState.edge === "right") {
          var oldHalfW = (handleState.w * scale) / 2;
          var sign = handleState.edge === "right" ? 1 : -1;
          var newHalfW = Math.max(MIN_SHAPE_DIM / 2, sign * rel.x);
          var deltaLocal = { x: sign * (newHalfW - oldHalfW), y: 0 };
          var shift = rotateVec(deltaLocal.x, deltaLocal.y, handleState.rotation);
          o.w = (newHalfW * 2) / scale;
          o.x = handleState.x + shift.x; o.y = handleState.y + shift.y;
        } else {
          var oldHalfH = (handleState.h * scale) / 2;
          var signY = handleState.edge === "bottom" ? 1 : -1;
          var newHalfH = Math.max(MIN_SHAPE_DIM / 2, signY * rel.y);
          var deltaLocalY = { x: 0, y: signY * (newHalfH - oldHalfH) };
          var shiftY = rotateVec(deltaLocalY.x, deltaLocalY.y, handleState.rotation);
          o.h = (newHalfH * 2) / scale;
          o.x = handleState.x + shiftY.x; o.y = handleState.y + shiftY.y;
        }
      } else if (o.type === "line" || o.type === "arrow") {
        var oldHalfLen = (handleState.length * scale) / 2;
        var signL = handleState.edge === "right" ? 1 : -1;
        var newHalfLen = Math.max(MIN_SHAPE_DIM, signL * rel.x);
        var deltaLen = { x: signL * (newHalfLen - oldHalfLen), y: 0 };
        var shiftL = rotateVec(deltaLen.x, deltaLen.y, handleState.rotation);
        o.length = (newHalfLen * 2) / scale;
        o.x = handleState.x + shiftL.x; o.y = handleState.y + shiftL.y;
      }
      self.render();
    }

    // -- marquee selection --
    function updateMarquee(world) {
      var x0 = Math.min(marqueeStart.x, world.x), y0 = Math.min(marqueeStart.y, world.y);
      var w = Math.abs(world.x - marqueeStart.x), h = Math.abs(world.y - marqueeStart.y);
      if (!marqueeRect) {
        marqueeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        marqueeRect.setAttribute("class", "cec-marquee");
        marqueeRect.setAttribute("vector-effect", "non-scaling-stroke");
        self.marqueeG.appendChild(marqueeRect);
      }
      marqueeRect.setAttribute("x", x0); marqueeRect.setAttribute("y", y0);
      marqueeRect.setAttribute("width", w); marqueeRect.setAttribute("height", h);
      return { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h };
    }
    function finishMarquee(box, additive) {
      if (marqueeRect) { marqueeRect.remove(); marqueeRect = null; }
      if (!box || (box.maxX - box.minX < 2 && box.maxY - box.minY < 2)) return;
      var hitIds = self.objects.filter(function (o) {
        var b = self._worldBBoxOf(o);
        return b.minX <= box.maxX && b.maxX >= box.minX && b.minY <= box.maxY && b.maxY >= box.minY;
      }).map(function (o) { return o.id; });
      if (additive) {
        var merged = self.selectedIds.slice();
        hitIds.forEach(function (id) { if (merged.indexOf(id) === -1) merged.push(id); });
        self.select(merged);
      } else {
        self.select(hitIds);
      }
    }

    // -- shape/pen drawing tools (Phase 3) --
    function shapeTypeForTool(tool) {
      if (tool === "draw-rect") return "rect";
      if (tool === "draw-circle") return "circle";
      if (tool === "draw-line") return "line";
      if (tool === "draw-arrow") return "arrow";
      return null;
    }
    function beginDraw(world) {
      var shapeType = shapeTypeForTool(self.tool);
      if (self.tool === "draw-pen") {
        drawState = { type: "path", points: [[0, 0]], origin: world };
        var obj = self.addObject({
          type: "path", x: world.x, y: world.y, points: [[0, 0]],
          color: self.drawDefaults.color, strokeWidth: self.drawDefaults.strokeWidth
        }, { silent: true });
        drawState.id = obj.id;
        return;
      }
      if (!shapeType) return;
      var base = {
        type: shapeType, x: world.x, y: world.y,
        color: self.drawDefaults.color, strokeWidth: self.drawDefaults.strokeWidth,
        rotation: 0, scale: 1
      };
      if (shapeType === "rect" || shapeType === "circle") {
        Object.assign(base, { w: MIN_SHAPE_DIM, h: MIN_SHAPE_DIM, fill: self.drawDefaults.fill });
      } else {
        Object.assign(base, { length: MIN_SHAPE_DIM });
      }
      var created = self.addObject(base, { silent: true });
      drawState = { type: shapeType, id: created.id, origin: world };
    }
    function updateDraw(world) {
      if (!drawState) return;
      var o = self.getObject(drawState.id);
      if (!o) return;
      if (drawState.type === "path") {
        var rel = { x: world.x - drawState.origin.x, y: world.y - drawState.origin.y };
        var pts = o.points;
        var last = pts[pts.length - 1];
        if (dist(last[0], last[1], rel.x, rel.y) > 2) pts.push([rel.x, rel.y]);
        self.render();
        return;
      }
      if (drawState.type === "rect" || drawState.type === "circle") {
        var dx = world.x - drawState.origin.x, dy = world.y - drawState.origin.y;
        o.w = Math.max(MIN_SHAPE_DIM, Math.abs(dx));
        o.h = Math.max(MIN_SHAPE_DIM, Math.abs(dy));
        o.x = drawState.origin.x + dx / 2;
        o.y = drawState.origin.y + dy / 2;
      } else { // line/arrow
        var lx = world.x - drawState.origin.x, ly = world.y - drawState.origin.y;
        o.length = Math.max(MIN_SHAPE_DIM, Math.hypot(lx, ly));
        o.rotation = angleOf(lx, ly);
        o.x = (drawState.origin.x + world.x) / 2;
        o.y = (drawState.origin.y + world.y) / 2;
      }
      self.render();
    }
    function finishDraw() {
      if (!drawState) return;
      var o = self.getObject(drawState.id);
      // Recenter freehand points around their own centroid so the
      // object's x/y anchor matches every other type's "visual center"
      // convention (needed for the shared rotate/scale-around-center math).
      if (drawState.type === "path" && o && o.points.length > 1) {
        var xs = o.points.map(function (p) { return p[0]; });
        var ys = o.points.map(function (p) { return p[1]; });
        var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        var cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
        o.points = o.points.map(function (p) { return [p[0] - cx, p[1] - cy]; });
        o.x += cx; o.y += cy;
      }
      var keep = o && (drawState.type === "path" ? o.points.length > 1 : true);
      if (!keep && o) self.objects = self.objects.filter(function (x) { return x.id !== o.id; });
      self.commit();
      if (keep && o) self.select([o.id]);
      drawState = null;
      self.tool = "select";
      self.onChange();
    }

    this.svg.addEventListener("pointerdown", function (ev) {
      self.svg.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      didDrag = false;

      if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartZoom = self.zoom;
        dragMode = "pinch";
        return;
      }

      var world = self._svgPoint(ev.clientX, ev.clientY);
      dragStart = world;

      if (self.tool === "hand") { dragMode = "pan"; return; }

      if (self.tool && self.tool.indexOf("draw-") === 0) {
        dragMode = "draw";
        beginDraw(world);
        return;
      }

      var hitHandle = topHitHandleAt(ev.clientX, ev.clientY);
      if (hitHandle) {
        var hType = hitHandle.handle;
        if (hType === "rotate") {
          var o1 = self.getObject(hitHandle.id);
          beginRotate(world, self._worldCenter(o1), [hitHandle.id]);
          dragMode = "rotate";
        } else if (hType === "rotate-group") {
          var groupBox = self._combinedBBox(self.selectedIds);
          var pivot = { x: (groupBox.minX + groupBox.maxX) / 2, y: (groupBox.minY + groupBox.maxY) / 2, group: true };
          beginRotate(world, pivot, self.selectedIds);
          dragMode = "rotate";
        } else if (hType.indexOf("scale-corner-group") === 0) {
          var gbox = self._combinedBBox(self.selectedIds);
          var gpivot = { x: (gbox.minX + gbox.maxX) / 2, y: (gbox.minY + gbox.maxY) / 2 };
          beginScaleCorner(world, self.selectedIds, gpivot);
          dragMode = "scale-corner";
        } else if (hType.indexOf("scale-corner") === 0) {
          beginScaleCorner(world, [hitHandle.id]);
          dragMode = "scale-corner";
        } else if (hType.indexOf("scale-edge") === 0) {
          var edge = hType.replace("scale-edge-", "");
          beginScaleEdge(edge, hitHandle.id);
          dragMode = "scale-edge";
        }
        return;
      }

      var hitId = topHitObjectAt(ev.clientX, ev.clientY);
      if (hitId) {
        var isMulti = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        var alreadySelected = self.selectedIds.indexOf(hitId) !== -1;
        if (isMulti) {
          var next = alreadySelected
            ? self.selectedIds.filter(function (id) { return id !== hitId; })
            : self.selectedIds.concat([hitId]);
          self.select(next);
        } else if (!alreadySelected) {
          self.select([hitId]);
        }
        var obj = self.getObject(hitId);
        if (obj && !obj.locked && self.selectedIds.indexOf(hitId) !== -1) {
          dragMode = "move-objects";
          objStart = {};
          self.selectedIds.forEach(function (id) {
            var o = self.getObject(id);
            if (o) objStart[id] = { x: o.x, y: o.y };
          });
        } else {
          dragMode = null;
        }
      } else {
        if (!(ev.shiftKey || ev.metaKey || ev.ctrlKey)) self.clearSelection();
        dragMode = "marquee";
        marqueeStart = world;
      }
    });

    this.svg.addEventListener("pointermove", function (ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (dragMode === "pinch" && pointers.size === 2) {
        var pts = Array.from(pointers.values());
        var pdist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        var midWorld = self._svgPoint(mid.x, mid.y);
        self.setZoom(pinchStartZoom * (pdist / pinchStartDist), midWorld.x, midWorld.y);
        return;
      }

      if (!dragStart) return;
      var world = self._svgPoint(ev.clientX, ev.clientY);
      var dxWorld = world.x - dragStart.x;
      var dyWorld = world.y - dragStart.y;
      if (Math.abs(dxWorld) + Math.abs(dyWorld) > 1) didDrag = true;

      if (dragMode === "pan") {
        self.pan(dxWorld, dyWorld);
        dragStart = world;
      } else if (dragMode === "move-objects") {
        var dxObj = dxWorld / self.zoom;
        var dyObj = dyWorld / self.zoom;
        self.selectedIds.forEach(function (id) {
          var o = self.getObject(id);
          var s = objStart[id];
          if (o && s) { o.x = s.x + dxObj; o.y = s.y + dyObj; }
        });
        self.render();
      } else if (dragMode === "rotate") {
        updateRotate(world, ev.shiftKey);
      } else if (dragMode === "scale-corner") {
        updateScaleCorner(world);
      } else if (dragMode === "scale-edge") {
        updateScaleEdge(world);
      } else if (dragMode === "marquee") {
        updateMarquee(world);
      } else if (dragMode === "draw") {
        updateDraw(world);
      }
    });

    function endPointer(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) { pinchStartDist = null; }
      if (pointers.size === 0) {
        if ((dragMode === "move-objects" || dragMode === "rotate" || dragMode === "scale-corner" || dragMode === "scale-edge") && didDrag) {
          self.commit();
        } else if (dragMode === "marquee") {
          var box = marqueeRect ? {
            minX: parseFloat(marqueeRect.getAttribute("x")), minY: parseFloat(marqueeRect.getAttribute("y")),
            maxX: parseFloat(marqueeRect.getAttribute("x")) + parseFloat(marqueeRect.getAttribute("width")),
            maxY: parseFloat(marqueeRect.getAttribute("y")) + parseFloat(marqueeRect.getAttribute("height"))
          } : null;
          finishMarquee(box, ev.shiftKey || ev.metaKey || ev.ctrlKey);
        } else if (dragMode === "draw") {
          finishDraw();
        }
        dragMode = null;
        dragStart = null;
        objStart = null;
        handleState = null;
      }
    }
    this.svg.addEventListener("pointerup", endPointer);
    this.svg.addEventListener("pointercancel", endPointer);

    // Desktop wheel = zoom (ctrl/cmd or plain wheel), matching common
    // design-tool convention; shift+wheel is left as browser default
    // horizontal scroll since the stage isn't a scroll container.
    this.svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var world = self._svgPoint(ev.clientX, ev.clientY);
      var factor = Math.exp(-ev.deltaY * 0.0015);
      self.setZoom(self.zoom * factor, world.x, world.y);
    }, { passive: false });

    // Keyboard: only active while the SVG stage itself has focus (via
    // its tabindex), never a text field, so this can never collide
    // with typing in the separate text-entry dialog.
    this.svg.addEventListener("keydown", function (ev) {
      var arrowDeltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        self.deleteSelected();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) self.redo(); else self.undo();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        self.redo();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "d") {
        ev.preventDefault();
        self.duplicateSelected();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        self.clearSelection();
      } else if (arrowDeltas[ev.key] && self.selectedIds.length) {
        ev.preventDefault();
        var step = ev.shiftKey ? 10 : 1;
        var d = arrowDeltas[ev.key];
        self._eachSelected(function (o) { o.x += d[0] * step; o.y += d[1] * step; });
        self.render();
        self.commit();
      }
    });
  };

  // --- Export (Phase 4) ------------------------------------------------
  // Serializes the *current* object array — every edit the user made —
  // into a standalone SVG string. Glyph paths are already pure vector
  // outlines baked in at generation time (see calligraphy-editor-app-init.js
  // / glyph-shaper.bundle.js), so, unlike the static preview's export
  // pipeline in calligraphy-studio.js, no font file needs to be embedded
  // here: the export is a direct, lossless re-serialization of the same
  // path/shape data already driving the on-screen render, not a
  // re-render of the original input text.
  CanvasEditor.prototype.exportSVGString = function () {
    var doc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
    var svg = doc.documentElement;
    svg.setAttribute("viewBox", "0 0 " + this.width + " " + this.height);
    svg.setAttribute("width", this.width);
    svg.setAttribute("height", this.height);

    if (this.background.mode !== "transparent") {
      var bg = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", 0); bg.setAttribute("y", 0);
      bg.setAttribute("width", this.width); bg.setAttribute("height", this.height);
      bg.setAttribute("fill", this.background.mode === "white" ? "#ffffff" : this.background.color);
      svg.appendChild(bg);
    }

    var self = this;
    this.objects.forEach(function (o) {
      var g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", self._objTransform(o));
      if (o.opacity !== 1) g.setAttribute("opacity", o.opacity);
      var inner = self._buildObjectInner(doc, o);
      if (inner) g.appendChild(inner);
      svg.appendChild(g);
    });

    return new XMLSerializer().serializeToString(doc);
  };

  CanvasEditor.prototype.exportSVGBlob = function () {
    return new Blob([this.exportSVGString()], { type: "image/svg+xml" });
  };

  function svgToDataUrl(svgString) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  }

  // opts: { scale: 1|2|3|4, transparent: bool, format: 'png'|'jpeg', bg: '#rrggbb' }
  CanvasEditor.prototype.exportPNGBlob = function (opts) {
    opts = opts || {};
    var scale = (opts.scale || 1) * (global.devicePixelRatio || 1);
    var transparent = opts.transparent !== false && this.background.mode === "transparent";
    var w = Math.round(this.width * scale), h = Math.round(this.height * scale);
    var svgString = this.exportSVGString();
    var format = opts.format === "jpeg" ? "image/jpeg" : "image/png";

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = svgToDataUrl(svgString);
    }).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      if (!transparent) {
        ctx.fillStyle = opts.bg || (format === "image/jpeg" ? "#ffffff" : "#ffffff");
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      return new Promise(function (resolve2) {
        canvas.toBlob(function (blob) { resolve2(blob); }, format, 0.95);
      });
    });
  };

  global.CanvasEditor = CanvasEditor;
})(window);
