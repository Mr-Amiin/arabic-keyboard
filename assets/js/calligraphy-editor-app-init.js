/*
 * /calligraphy-editor/ — dedicated full-viewport app shell wiring.
 *
 * This is a NEW file for the NEW route. It reuses, unmodified:
 *   - canvas-editor.js's CanvasEditor (object model, select/move/
 *     rotate/resize/multi-select/marquee/align/layers/undo-redo/export)
 *   - calligraphy-data.js's CalligraphyData (130 real, license-audited
 *     font families/variations — nothing added, nothing removed)
 *   - editor-core/glyph-shaper.bundle.js (real HarfBuzz WASM shaping),
 *     lazy-loaded exactly like the old /calligraphy/ editor tab did
 *
 * What's new here is only the *shell*: a four-corner Kaleam-style dock
 * layout instead of a sidebar-and-cards webpage, and an Add Text
 * popover (not a permanent on-page gallery) for font/variation choice.
 *
 * Mobile-keyboard rule (unchanged from before, just relocated): the
 * SVG stage (#cecStage) never contains a text input of any kind. The
 * only two text inputs on this entire page are inside the Add Text
 * popover (#capAddText — the phrase itself) — everything else is
 * button/range/color/checkbox, none of which can summon a soft
 * keyboard.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var stageSvg = document.getElementById("cecStage");
    if (!stageSvg || !window.CanvasEditor || !window.CalligraphyData) return;

    var $ = function (id) { return document.getElementById(id); };
    var els = {
      undo: $("capUndo"), redo: $("capRedo"),
      exportBtn: $("capExportBtn"), exportMenu: $("capExportMenu"),
      exportTransparent: $("capExportTransparent"),
      exportSvg: $("capExportSvg"), exportPng1: $("capExportPng1"), exportPng2: $("capExportPng2"),
      exportPng3: $("capExportPng3"), exportPng4: $("capExportPng4"), exportJpg: $("capExportJpg"),
      zoomOut: $("capZoomOut"), zoomIn: $("capZoomIn"), zoomLabel: $("capZoomLabel"), zoomFit: $("capZoomFit"),
      toolSelect: $("capToolSelect"), toolAddText: $("capToolAddText"),
      toolPen: $("capToolPen"), toolLine: $("capToolLine"), toolArrow: $("capToolArrow"),
      toolRect: $("capToolRect"), toolCircle: $("capToolCircle"), toolHand: $("capToolHand"),
      toolBackground: $("capToolBackground"), toolColor: $("capToolColor"),
      toolDuplicate: $("capToolDuplicate"), toolDelete: $("capToolDelete"),
      layerFront: $("capLayerFront"), layerForward: $("capLayerForward"),
      layerBackward: $("capLayerBackward"), layerBack: $("capLayerBack"), lock: $("capLock"),
      alignMenuBtn: $("capAlignMenuBtn"), alignMenu: $("capAlignMenu"),
      alignLeft: $("capAlignLeft"), alignRight: $("capAlignRight"), alignCenterH: $("capAlignCenterH"),
      alignTop: $("capAlignTop"), alignBottom: $("capAlignBottom"), alignMiddleV: $("capAlignMiddleV"),
      distributeH: $("capDistributeH"), distributeV: $("capDistributeV"), centerOnCanvas: $("capCenterOnCanvas"),
      inspector: $("capInspector"), inspectorTitle: $("capInspectorTitle"),
      color: $("capColor"), colorApplyAll: $("capColorApplyAll"), opacity: $("capOpacity"), rotation: $("capRotation"),
      shapeProps: $("capShapeProps"), fillProps: $("capFillProps"), fillEnabled: $("capFillEnabled"),
      fillColor: $("capFillColor"), strokeWidth: $("capStrokeWidth"),
      backgroundMenu: $("capBackgroundMenu"), bgTransparent: $("capBgTransparent"),
      bgWhite: $("capBgWhite"), bgCustom: $("capBgCustom"),
      status: $("capStatus"),
      addBackdrop: $("capAddPopoverBackdrop"), addClose: $("capAddPopoverClose"),
      addText: $("capAddText"), addCancel: $("capAddCancel"), addConfirm: $("capAddConfirm"),
      families: $("capFamilies"), familyTotal: $("capFamilyTotal"),
      variations: $("capVariations"), variationHint: $("capVariationHint")
    };

    var editor = new CanvasEditor(stageSvg, {
      width: 1200, height: 700,
      onChange: syncChrome,
      onSelectionChange: syncInspectorAndButtons
    });

    // ------------------------------------------------------------
    // Top bar: undo/redo, export
    // ------------------------------------------------------------
    function syncChrome() {
      if (els.undo) els.undo.disabled = editor.undoStack.length <= 1;
      if (els.redo) els.redo.disabled = editor.redoStack.length === 0;
      if (els.zoomLabel) els.zoomLabel.textContent = Math.round(editor.zoom * 100) + "%";
    }
    if (els.undo) els.undo.addEventListener("click", function () { editor.undo(); });
    if (els.redo) els.redo.addEventListener("click", function () { editor.redo(); });

    function closeExportMenu() { if (els.exportMenu) { els.exportMenu.hidden = true; els.exportBtn.setAttribute("aria-expanded", "false"); } }
    if (els.exportBtn) {
      els.exportBtn.addEventListener("click", function () {
        var willOpen = els.exportMenu.hidden;
        els.exportMenu.hidden = !willOpen;
        els.exportBtn.setAttribute("aria-expanded", String(willOpen));
      });
    }
    document.addEventListener("click", function (ev) {
      if (els.exportMenu && !els.exportMenu.hidden && els.exportBtn &&
          !els.exportMenu.contains(ev.target) && ev.target !== els.exportBtn && !els.exportBtn.contains(ev.target)) {
        closeExportMenu();
      }
    });

    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    if (els.exportSvg) els.exportSvg.addEventListener("click", function () {
      downloadBlob(editor.exportSVGBlob(), "calligraphy-composition.svg"); closeExportMenu();
    });
    [[els.exportPng1, 1], [els.exportPng2, 2], [els.exportPng3, 3], [els.exportPng4, 4]].forEach(function (pair) {
      var btn = pair[0], scale = pair[1];
      if (!btn) return;
      btn.addEventListener("click", function () {
        closeExportMenu();
        editor.exportPNGBlob({ scale: scale, transparent: els.exportTransparent ? els.exportTransparent.checked : true })
          .then(function (blob) { downloadBlob(blob, "calligraphy-composition-" + scale + "x.png"); })
          .catch(function (err) { console.error(err); window.showToast && window.showToast("تعذّر تصدير PNG"); });
      });
    });
    if (els.exportJpg) els.exportJpg.addEventListener("click", function () {
      closeExportMenu();
      editor.exportPNGBlob({ scale: 2, transparent: false, format: "jpeg" })
        .then(function (blob) { downloadBlob(blob, "calligraphy-composition.jpg"); })
        .catch(function (err) { console.error(err); window.showToast && window.showToast("تعذّر تصدير JPG"); });
    });

    // ------------------------------------------------------------
    // Zoom (bottom-left)
    // ------------------------------------------------------------
    if (els.zoomOut) els.zoomOut.addEventListener("click", function () { editor.setZoom(editor.zoom * 0.85); });
    if (els.zoomIn) els.zoomIn.addEventListener("click", function () { editor.setZoom(editor.zoom * 1.15); });
    if (els.zoomFit) els.zoomFit.addEventListener("click", function () { editor.fitToScreen(); });
    editor.fitToScreen();

    // ------------------------------------------------------------
    // Tool dock (bottom-center)
    // ------------------------------------------------------------
    var DRAW_TOOLS = { "draw-pen": els.toolPen, "draw-line": els.toolLine, "draw-arrow": els.toolArrow, "draw-rect": els.toolRect, "draw-circle": els.toolCircle };
    function setTool(tool) {
      editor.tool = tool;
      if (els.toolSelect) els.toolSelect.setAttribute("aria-pressed", String(tool === "select"));
      if (els.toolHand) els.toolHand.setAttribute("aria-pressed", String(tool === "hand"));
      Object.keys(DRAW_TOOLS).forEach(function (key) {
        var btn = DRAW_TOOLS[key];
        if (btn) btn.setAttribute("aria-pressed", String(tool === key));
      });
      stageSvg.classList.toggle("cec-stage--hand", tool === "hand");
      stageSvg.classList.toggle("cec-stage--draw", tool.indexOf("draw-") === 0);
    }
    if (els.toolSelect) els.toolSelect.addEventListener("click", function () { setTool("select"); });
    if (els.toolHand) els.toolHand.addEventListener("click", function () { setTool("hand"); });
    if (els.toolPen) els.toolPen.addEventListener("click", function () { setTool("draw-pen"); });
    if (els.toolLine) els.toolLine.addEventListener("click", function () { setTool("draw-line"); });
    if (els.toolArrow) els.toolArrow.addEventListener("click", function () { setTool("draw-arrow"); });
    if (els.toolRect) els.toolRect.addEventListener("click", function () { setTool("draw-rect"); });
    if (els.toolCircle) els.toolCircle.addEventListener("click", function () { setTool("draw-circle"); });
    setTool("select");
    var baseOnChange = syncChrome;
    editor.onChange = function () { setTool(editor.tool); baseOnChange(); };

    if (els.toolDuplicate) els.toolDuplicate.addEventListener("click", function () { editor.duplicateSelected(); });
    if (els.toolDelete) els.toolDelete.addEventListener("click", function () { editor.deleteSelected(); });

    // Quick color tool: a native color input triggered programmatically,
    // applies straight to the current selection (no popover needed).
    var quickColorInput = document.createElement("input");
    quickColorInput.type = "color"; quickColorInput.style.position = "fixed"; quickColorInput.style.opacity = "0";
    quickColorInput.style.pointerEvents = "none"; quickColorInput.style.left = "-9999px";
    document.body.appendChild(quickColorInput);
    quickColorInput.addEventListener("input", function () { editor.setPropertyOnSelected({ color: quickColorInput.value }); });
    if (els.toolColor) els.toolColor.addEventListener("click", function () {
      if (!editor.selectedIds.length) return;
      quickColorInput.value = (editor.getObject(editor.selectedIds[0]) || {}).color || "#1C2521";
      quickColorInput.click();
    });

    // Background popover (bottom-center-left mini menu)
    function closeAllMenus(except) {
      [els.backgroundMenu, els.alignMenu].forEach(function (m) { if (m && m !== except) m.hidden = true; });
    }
    if (els.toolBackground) {
      els.toolBackground.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var willOpen = els.backgroundMenu.hidden;
        closeAllMenus();
        els.backgroundMenu.hidden = !willOpen;
      });
    }
    function setBg(mode, color) {
      editor.setBackground(mode, color);
      if (els.bgTransparent) els.bgTransparent.setAttribute("aria-pressed", String(mode === "transparent"));
      if (els.bgWhite) els.bgWhite.setAttribute("aria-pressed", String(mode === "white"));
    }
    if (els.bgTransparent) els.bgTransparent.addEventListener("click", function () { setBg("transparent"); });
    if (els.bgWhite) els.bgWhite.addEventListener("click", function () { setBg("white"); });
    if (els.bgCustom) els.bgCustom.addEventListener("input", function () { setBg("custom", els.bgCustom.value); });

    // ------------------------------------------------------------
    // Right dock: layers, lock, align/distribute
    // ------------------------------------------------------------
    if (els.layerFront) els.layerFront.addEventListener("click", function () { editor.selectedIds.forEach(function (id) { editor.bringToFront(id); }); });
    if (els.layerForward) els.layerForward.addEventListener("click", function () { editor.selectedIds.forEach(function (id) { editor.bringForward(id); }); });
    if (els.layerBackward) els.layerBackward.addEventListener("click", function () { editor.selectedIds.forEach(function (id) { editor.sendBackward(id); }); });
    if (els.layerBack) els.layerBack.addEventListener("click", function () { editor.selectedIds.forEach(function (id) { editor.sendToBack(id); }); });
    if (els.lock) els.lock.addEventListener("click", function () { editor.toggleLockSelected(); });

    if (els.alignMenuBtn) {
      els.alignMenuBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var willOpen = els.alignMenu.hidden;
        closeAllMenus();
        els.alignMenu.hidden = !willOpen;
      });
    }
    if (els.alignLeft) els.alignLeft.addEventListener("click", function () { editor.alignSelected("left"); });
    if (els.alignRight) els.alignRight.addEventListener("click", function () { editor.alignSelected("right"); });
    if (els.alignCenterH) els.alignCenterH.addEventListener("click", function () { editor.alignSelected("center-h"); });
    if (els.alignTop) els.alignTop.addEventListener("click", function () { editor.alignSelected("top"); });
    if (els.alignBottom) els.alignBottom.addEventListener("click", function () { editor.alignSelected("bottom"); });
    if (els.alignMiddleV) els.alignMiddleV.addEventListener("click", function () { editor.alignSelected("middle-v"); });
    if (els.distributeH) els.distributeH.addEventListener("click", function () { editor.distributeSelected("h"); });
    if (els.distributeV) els.distributeV.addEventListener("click", function () { editor.distributeSelected("v"); });
    if (els.centerOnCanvas) els.centerOnCanvas.addEventListener("click", function () { editor.centerSelectedOnCanvas(); });

    document.addEventListener("click", function () { closeAllMenus(); });

    // ------------------------------------------------------------
    // Floating inspector (top-right): color/opacity/rotation/fill/stroke
    // ------------------------------------------------------------
    function syncInspectorAndButtons(selectedIds) {
      var hasSel = selectedIds.length > 0;
      [els.toolDuplicate, els.toolDelete, els.toolColor, els.layerFront, els.layerForward,
        els.layerBackward, els.layerBack, els.lock, els.alignMenuBtn].forEach(function (b) {
        if (b) b.disabled = !hasSel;
      });
      var distributeEnabled = selectedIds.length >= 3;
      [els.distributeH, els.distributeV].forEach(function (b) { if (b) b.disabled = !distributeEnabled; });

      if (els.inspector) els.inspector.hidden = !hasSel;
      if (!hasSel) return;
      var first = editor.getObject(selectedIds[0]);
      if (!first) return;
      if (els.inspectorTitle) {
        els.inspectorTitle.textContent = selectedIds.length > 1
          ? selectedIds.length + " عناصر محددة" : "عنصر محدد";
      }
      if (els.color) els.color.value = first.color;
      if (els.opacity) els.opacity.value = first.opacity;
      if (els.rotation) els.rotation.value = Math.round(first.rotation);
      if (els.lock) els.lock.setAttribute("aria-pressed", String(!!first.locked));
      var STROKE_TYPES = { rect: 1, circle: 1, line: 1, arrow: 1, path: 1 };
      var FILL_TYPES = { rect: 1, circle: 1 };
      var hasStroke = !!STROKE_TYPES[first.type];
      var hasFillType = !!FILL_TYPES[first.type];
      if (els.shapeProps) els.shapeProps.hidden = !hasStroke;
      if (els.fillProps) els.fillProps.hidden = !hasFillType;
      if (hasStroke && els.strokeWidth) els.strokeWidth.value = first.strokeWidth || 4;
      if (hasFillType) {
        var hasFill = !!(first.fill && first.fill !== "none");
        if (els.fillEnabled) els.fillEnabled.checked = hasFill;
        if (els.fillColor) els.fillColor.value = hasFill ? first.fill : "#1C2521";
      }
    }
    syncInspectorAndButtons([]);

    if (els.color) els.color.addEventListener("input", function () { editor.setPropertyOnSelected({ color: els.color.value }); });
    if (els.colorApplyAll) els.colorApplyAll.addEventListener("click", function () { editor.setPropertyOnAll({ color: els.color ? els.color.value : "#1C2521" }); });
    if (els.opacity) els.opacity.addEventListener("input", function () { editor.setPropertyOnSelected({ opacity: parseFloat(els.opacity.value) }); });
    if (els.rotation) {
      els.rotation.addEventListener("input", function () {
        var deg = parseFloat(els.rotation.value);
        editor.selectedIds.forEach(function (id) { var o = editor.getObject(id); if (o && !o.locked) o.rotation = deg; });
        editor.render();
      });
      els.rotation.addEventListener("change", function () { editor.commit(); });
    }
    if (els.fillEnabled) els.fillEnabled.addEventListener("change", function () {
      editor.setPropertyOnSelected({ fill: els.fillEnabled.checked ? (els.fillColor ? els.fillColor.value : "#1C2521") : "none" });
    });
    if (els.fillColor) els.fillColor.addEventListener("input", function () {
      if (els.fillEnabled && !els.fillEnabled.checked) return;
      editor.setPropertyOnSelected({ fill: els.fillColor.value });
    });
    if (els.strokeWidth) els.strokeWidth.addEventListener("input", function () { editor.setPropertyOnSelected({ strokeWidth: parseFloat(els.strokeWidth.value) }); });

    // ------------------------------------------------------------
    // Lazy-load the HarfBuzz/WASM shaping bundle (unchanged mechanism)
    // ------------------------------------------------------------
    var shaperReady = null;
    function ensureShaper() {
      if (shaperReady) return shaperReady;
      shaperReady = new Promise(function (resolve, reject) {
        if (window.GlyphShaper) return resolve(window.GlyphShaper);
        var s = document.createElement("script");
        s.type = "module";
        s.src = "../assets/js/editor-core/glyph-shaper.bundle.js";
        s.addEventListener("load", function () {
          if (window.GlyphShaper) resolve(window.GlyphShaper);
          else reject(new Error("glyph-shaper bundle loaded but did not register GlyphShaper"));
        });
        s.addEventListener("error", function () { reject(new Error("failed to load glyph-shaper bundle")); });
        document.head.appendChild(s);
      });
      return shaperReady;
    }

    // Every shaped glyph becomes its own independent CanvasEditor object
    // (type:"glyph") — see canvas-editor.js's object model. There is no
    // "text block" object type in this engine at all, so a shaped run
    // like "محمد" is never a single manipulable unit: each glyph/
    // ligature HarfBuzz returns is already a separate object the user
    // can select, move, rotate, resize, recolor, duplicate, delete,
    // lock, and reorder independently of its neighbors.
    function generateFromText(text, variation, opts) {
      opts = opts || {};
      var fontUrl = CalligraphyData.fontUrl(null, variation.file);
      var fontSizePx = opts.fontSizePx || 96;
      var lineHeight = fontSizePx * 1.5;
      if (els.status) els.status.textContent = "…جارٍ تشكيل الحروف عبر HarfBuzz";

      return ensureShaper().then(function (Shaper) {
        return Shaper.shapeLines(fontUrl, text, variation.features || []);
      }).then(function (lines) {
        var newObjects = [];
        var startY = editor.height / 2 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach(function (lineResult, li) {
          var y = startY + li * lineHeight;
          var unitsToPx = fontSizePx / lineResult.upem;
          var totalWidthPx = lineResult.totalAdvanceX * unitsToPx;
          var lineLeftX = editor.width / 2 - totalWidthPx / 2;
          lineResult.glyphs.forEach(function (g) {
            if (!g.path) return;
            newObjects.push({
              type: "glyph", char: g.char, path: g.path, upem: lineResult.upem,
              glyphAdvance: g.advanceX, fontSizePx: fontSizePx,
              fontFile: variation.file, variationId: variation.id,
              x: lineLeftX + g.x * unitsToPx, y: y - g.y * unitsToPx,
              rotation: 0, scale: 1, color: opts.color || "#1C2521", opacity: 1
            });
          });
        });
        editor.addObjects(newObjects);
        if (els.status) {
          els.status.textContent = newObjects.length
            ? "تمت إضافة " + newObjects.length + " عنصرًا قابلًا للتحرير بشكل مستقل"
            : "لم يُنتج النص أي حروف مرئية";
          setTimeout(function () { if (els.status) els.status.textContent = ""; }, 4000);
        }
        return newObjects;
      }).catch(function (err) {
        console.error(err);
        if (els.status) els.status.textContent = "تعذّر تشكيل الحروف — حاول مجددًا";
        window.showToast && window.showToast("تعذّر تشكيل الحروف — حاول مجددًا");
      });
    }

    // ------------------------------------------------------------
    // Add Text popover: text -> family -> variation -> add to canvas.
    // Font/variation browsing lives ENTIRELY inside this popover — it
    // opens over the canvas on demand and fully disappears afterward;
    // it never occupies permanent canvas/page space, unlike the old
    // always-visible sidebar gallery.
    // ------------------------------------------------------------
    var pickedVariationId = null;
    var variationSampleEls = [];
    var SAMPLE_MAX_FONT = 30, SAMPLE_MIN_FONT = 9;

    function fitSampleText(sampleEl) {
      var box = sampleEl.parentElement;
      if (!box || !sampleEl.textContent) return;
      var maxWidth = box.clientWidth - 4;
      if (maxWidth <= 0) return;
      sampleEl.style.fontSize = SAMPLE_MAX_FONT + "px";
      var natural = sampleEl.scrollWidth;
      if (natural > maxWidth) {
        var fitted = Math.max(SAMPLE_MIN_FONT, Math.floor(SAMPLE_MAX_FONT * (maxWidth / natural)));
        sampleEl.style.fontSize = fitted + "px";
      }
    }
    function currentPopoverText() {
      return ((els.addText && els.addText.value) || "").replace(/\n+/g, " ").trim();
    }
    function refreshVariationSamples() {
      var text = currentPopoverText() || " ";
      variationSampleEls.forEach(function (sampleEl) { sampleEl.textContent = text; fitSampleText(sampleEl); });
    }
    function loadSwatchFont(variation, sampleEl) {
      var family = "cap-" + variation.file.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      var url = CalligraphyData.fontUrl(null, variation.file);
      var ff = new FontFace(family, "url(" + url + ")", { weight: "100 900" });
      ff.load().then(function (loaded) {
        document.fonts.add(loaded);
        sampleEl.style.fontFamily = '"' + family + '"';
        sampleEl.style.fontWeight = variation.weight;
        fitSampleText(sampleEl);
      }).catch(function () {});
    }
    function selectVariation(id) {
      pickedVariationId = id;
      Array.prototype.forEach.call(els.variations.querySelectorAll(".cally-variation-card"), function (b) {
        var isActive = b.getAttribute("data-variation") === id;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });
    }
    function buildVariations(fam) {
      els.variations.innerHTML = "";
      variationSampleEls = [];
      if (els.variationHint) els.variationHint.textContent = fam.blurb;
      fam.variations.forEach(function (v, i) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "cally-variation-card";
        btn.setAttribute("data-variation", v.id); btn.setAttribute("role", "option"); btn.setAttribute("aria-selected", "false");
        var sampleBox = document.createElement("span"); sampleBox.className = "var-sample-box";
        var sampleEl = document.createElement("span"); sampleEl.className = "var-sample"; sampleEl.dir = "rtl"; sampleEl.lang = "ar";
        sampleEl.style.fontFeatureSettings = CalligraphyData.buildFeatureSettings(v.features);
        sampleBox.appendChild(sampleEl);
        var metaWrap = document.createElement("span"); metaWrap.className = "var-meta";
        var labelEl = document.createElement("span"); labelEl.className = "var-label"; labelEl.textContent = v.label;
        var descEl = document.createElement("span"); descEl.className = "var-desc"; descEl.textContent = v.meta;
        metaWrap.appendChild(labelEl); metaWrap.appendChild(descEl);
        btn.appendChild(sampleBox); btn.appendChild(metaWrap);
        btn.addEventListener("click", function () { selectVariation(v.id); });
        els.variations.appendChild(btn);
        variationSampleEls.push(sampleEl);
        loadSwatchFont(v, sampleEl);
        if (i === 0) selectVariation(v.id);
      });
      refreshVariationSamples();
    }
    function selectFamily(famId) {
      var fam = CalligraphyData.FAMILIES.filter(function (f) { return f.id === famId; })[0];
      if (!fam) return;
      Array.prototype.forEach.call(els.families.querySelectorAll(".cally-family-btn"), function (b) {
        b.classList.toggle("active", b.getAttribute("data-family") === famId);
      });
      if (fam.available && fam.variations.length) {
        buildVariations(fam);
      } else {
        if (els.variationHint) els.variationHint.textContent = "هذا الطراز غير متاح بعد بترخيص مفتوح موثّق.";
        els.variations.innerHTML = ""; variationSampleEls = []; pickedVariationId = null;
      }
    }
    function buildFamilies() {
      els.families.innerHTML = "";
      CalligraphyData.FAMILIES.forEach(function (fam) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "cally-family-btn" + (fam.available ? "" : " is-soon");
        btn.setAttribute("data-family", fam.id);
        btn.innerHTML = '<span class="fam-label">' + fam.label + '</span>' +
          (fam.available ? '<span class="fam-count">' + fam.variations.length + ' متغيّرًا</span>' : '<span class="fam-count">قريبًا</span>');
        btn.title = fam.blurb;
        btn.addEventListener("click", function () { selectFamily(fam.id); });
        els.families.appendChild(btn);
      });
      if (els.familyTotal) {
        els.familyTotal.textContent = CalligraphyData.totalVariationCount() + " متغيّرًا حقيقيًا عبر " +
          CalligraphyData.FAMILIES.filter(function (f) { return f.available; }).length + " عائلات متاحة";
      }
    }
    buildFamilies();
    selectFamily("naskh");
    if (els.addText) els.addText.addEventListener("input", refreshVariationSamples);

    function isAddPopoverOpen() { return !!(els.addBackdrop && !els.addBackdrop.hidden); }
    function openAddPopover() {
      if (!els.addBackdrop) return;
      els.addBackdrop.hidden = false;
      if (els.addText) { els.addText.focus(); els.addText.select(); }
    }
    function closeAddPopover() {
      if (!els.addBackdrop) return;
      els.addBackdrop.hidden = true;
      setTool("select");
      if (els.toolAddText) els.toolAddText.focus();
    }
    if (els.toolAddText) els.toolAddText.addEventListener("click", openAddPopover);
    if (els.addCancel) els.addCancel.addEventListener("click", closeAddPopover);
    if (els.addClose) els.addClose.addEventListener("click", closeAddPopover);
    if (els.addBackdrop) {
      els.addBackdrop.addEventListener("mousedown", function (ev) { if (ev.target === els.addBackdrop) closeAddPopover(); });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isAddPopoverOpen()) { ev.preventDefault(); ev.stopPropagation(); closeAddPopover(); }
    }, true);
    if (els.addConfirm) {
      els.addConfirm.addEventListener("click", function () {
        var text = (els.addText && els.addText.value) || "";
        var found = pickedVariationId && CalligraphyData.findVariation(pickedVariationId);
        closeAddPopover();
        if (!text.trim() || !found) return;
        generateFromText(text, found.variation, {});
      });
    }
  });
})();
