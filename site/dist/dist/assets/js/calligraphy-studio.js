/*
 * Arabic Calligraphy Studio — rendering engine.
 *
 * Pipeline:
 *   Arabic text input -> text state -> build an SVG <text> markup (this
 *   is what actually performs correct contextual joining AND real
 *   OpenType feature application — see "Why SVG, not Canvas 2D text"
 *   below) -> live preview (the SVG is inserted directly into the
 *   page) -> export (PNG/JPG/PDF rasterize that same SVG onto an
 *   offscreen canvas; SVG export serves the markup directly with the
 *   font embedded as base64).
 *
 * Why SVG, not Canvas 2D text
 * ----------------------------
 * Canvas 2D's fillText()/strokeText() has no API for OpenType feature
 * toggles (font-feature-settings) — see whatwg/html#4074. That means a
 * stylistic set or character variant selected in the UI would silently
 * fail to render on a <canvas>, even though the font genuinely supports
 * it: the preview and every export would just show the font's default
 * glyphs no matter which "variation" was picked. That would make the
 * whole point of this expansion (real per-font OpenType variations)
 * fake in practice, even though the underlying data is genuine.
 *
 * SVG <text> is regular CSS-styled text as far as the browser's layout
 * engine is concerned, so font-feature-settings on it works exactly
 * like it does on any HTML element, while Arabic contextual shaping
 * (letter joining) still happens natively via the browser's own text
 * engine (HarfBuzz in Chromium/Firefox) — nothing here is hand-rolled.
 *
 * This file has no framework dependency and no build step, matching
 * the rest of the site (plain script, loaded via <script defer>).
 */
(function (global) {
  "use strict";

  var TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
  var TATWEEL = "\u0640";
  // Letters that do NOT connect to the following letter — no kashida after these.
  var NON_JOINING_AFTER = "اأإآدذرزوؤء";

  function stripTashkeel(text) {
    return text.replace(TASHKEEL_RE, "");
  }

  function insertKashida(text, density) {
    // density: 1 = light, 2 = medium, 3 = heavy. Adds real tatweel (ـ)
    // characters between joining letter pairs — this is literally how
    // kashida elongation works in Arabic typesetting, not a fake effect.
    if (!density) return text;
    var reps = density; // how many tatweel chars to insert per gap
    var out = "";
    var chars = Array.from(text);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      out += ch;
      var next = chars[i + 1];
      var isArabicLetter = /[\u0621-\u064A]/.test(ch);
      var nextIsArabicLetter = next && /[\u0621-\u064A]/.test(next);
      if (isArabicLetter && nextIsArabicLetter && NON_JOINING_AFTER.indexOf(ch) === -1) {
        out += TATWEEL.repeat(reps);
      }
    }
    return out;
  }

  function escapeXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------
  // Font loading (FontFace API), used for the live preview so the SVG's
  // font-family reference resolves without re-fetching the WOFF2 per
  // render. Exports embed the font as base64 instead (see fontBytes),
  // so they're self-contained files that render identically anywhere.
  // ---------------------------------------------------------------------
  var loadedFonts = {}; // fileFamily -> Promise<FontFace>
  var fontBytesCache = {}; // file -> Promise<ArrayBuffer> (base64 embedding for export)

  function fileFamilyName(file) {
    return "cal-" + file.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  }

  function loadFontForVariation(variation) {
    var family = fileFamilyName(variation.file);
    if (loadedFonts[family]) return loadedFonts[family];
    var url = CalligraphyData.fontUrl(null, variation.file);
    var ff = new FontFace(family, "url(" + url + ")", { weight: "100 900", style: "normal" });
    var p = ff.load().then(function (loaded) {
      document.fonts.add(loaded);
      return loaded;
    });
    loadedFonts[family] = p;
    return p;
  }

  function fontBytes(file) {
    if (fontBytesCache[file]) return fontBytesCache[file];
    var url = CalligraphyData.fontUrl(null, file);
    var p = fetch(url).then(function (r) { return r.arrayBuffer(); });
    fontBytesCache[file] = p;
    return p;
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  // ---------------------------------------------------------------------
  // Studio: owns state + draws to a given "stage" container element.
  // ---------------------------------------------------------------------
  function CalligraphyStudio(stageEl) {
    this.stage = stageEl;
    this.state = {
      text: "بسم الله الرحمن الرحيم",
      variationId: "naskh-amiri",
      fontSize: 64,
      color: "#1C2521",
      bg: "#EEF0EA",
      transparentBg: false,
      letterSpacing: 0,
      lineSpacing: 1.4,
      align: "center", // start | center | end
      rtl: true,
      showTashkeel: true,
      kashida: 0, // 0..3
      outline: false,
      outlineColor: "#1C2521",
      outlineWidth: 2,
      shadow: false,
      shadowColor: "rgba(0,0,0,.35)",
      shadowBlur: 12,
      decorativeBg: false
    };
    this.baseW = 1200;
    this.baseH = 700;
    this.undoStack = [this.state.text];
    this.redoStack = [];
  }

  CalligraphyStudio.prototype.set = function (patch) {
    Object.assign(this.state, patch);
  };

  CalligraphyStudio.prototype.pushHistory = function () {
    var top = this.undoStack[this.undoStack.length - 1];
    if (top === this.state.text) return;
    this.undoStack.push(this.state.text);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  };

  CalligraphyStudio.prototype.undo = function () {
    if (this.undoStack.length <= 1) return false;
    this.redoStack.push(this.undoStack.pop());
    this.state.text = this.undoStack[this.undoStack.length - 1];
    return true;
  };

  CalligraphyStudio.prototype.redo = function () {
    if (!this.redoStack.length) return false;
    var v = this.redoStack.pop();
    this.undoStack.push(v);
    this.state.text = v;
    return true;
  };

  CalligraphyStudio.prototype.currentVariation = function () {
    var found = CalligraphyData.findVariation(this.state.variationId);
    return found ? found.variation : CalligraphyData.findVariation("naskh-amiri").variation;
  };

  function preparedLines(state) {
    var text = state.showTashkeel ? state.text : stripTashkeel(state.text);
    if (state.kashida) text = insertKashida(text, state.kashida);
    return text.split("\n");
  }

  // A simple, original geometric 8-point-star lattice — not a
  // reproduction of any existing artwork, just an algorithmic tiling —
  // expressed as an SVG <pattern> so it composites the same way in the
  // live preview, the raster exports, and the SVG export.
  function eightPointStarPath(cx, cy, r) {
    var spikes = 8, outer = r, inner = r * 0.5;
    var pts = [];
    for (var i = 0; i < spikes * 2; i++) {
      var rad = i % 2 === 0 ? outer : inner;
      var ang = (Math.PI / spikes) * i - Math.PI / 2;
      pts.push((cx + Math.cos(ang) * rad).toFixed(2) + "," + (cy + Math.sin(ang) * rad).toFixed(2));
    }
    return "M" + pts.join("L") + "Z";
  }

  function decorativePatternDefs(tint, w, h) {
    var step = Math.max(48, Math.min(w, h) / 10);
    var star = eightPointStarPath(step / 2, step / 2, step * 0.42);
    return '<pattern id="callyStarPattern" x="0" y="0" width="' + step + '" height="' + step +
      '" patternUnits="userSpaceOnUse">' +
      '<path d="' + star + '" fill="none" stroke="' + tint + '" stroke-width="1.5" opacity="0.14"/>' +
      "</pattern>";
  }

  // -----------------------------------------------------------------
  // Core SVG builder — shared by the live preview and every export
  // format, so what the user sees is always exactly what gets saved.
  // fontFaceCss is "" for the live preview (references the already
  // -registered FontFace by name) or a base64 @font-face <style> block
  // for exports (self-contained files).
  // -----------------------------------------------------------------
  function buildSvg(state, variation, fontFaceCss, w, h) {
    var lines = preparedLines(state);
    var lineHeight = state.fontSize * state.lineSpacing;
    var totalH = lineHeight * lines.length;
    var startY = h / 2 - totalH / 2 + lineHeight / 2 + state.fontSize * 0.32; // baseline correction

    var family = fileFamilyName(variation.file);
    var featureSettings = CalligraphyData.buildFeatureSettings(variation.features);

    var textAnchor = state.align === "center" ? "middle" :
      (state.rtl ? (state.align === "start" ? "end" : "start") : (state.align === "start" ? "start" : "end"));
    var anchorX = state.align === "center" ? w / 2 : (textAnchor === "end" ? w - 40 : 40);

    var defs = "<defs>" + fontFaceCss;
    var bgRect = state.transparentBg ? "" : '<rect width="' + w + '" height="' + h + '" fill="' + state.bg + '"/>';
    var decoRect = "";
    if (state.decorativeBg) {
      defs += decorativePatternDefs(state.color, w, h);
      decoRect = '<rect width="' + w + '" height="' + h + '" fill="url(#callyStarPattern)"/>';
    }
    var filterDef = "";
    var shadowAttr = "";
    if (state.shadow) {
      filterDef = '<filter id="callyShadowFilter" x="-50%" y="-50%" width="200%" height="200%">' +
        '<feDropShadow dx="0" dy="' + (state.shadowBlur / 4) + '" stdDeviation="' + (state.shadowBlur / 3) +
        '" flood-color="' + state.shadowColor + '"/></filter>';
      shadowAttr = ' filter="url(#callyShadowFilter)"';
    }
    defs += filterDef + "</defs>";

    var textStyle = "font-family:'" + family + "';font-weight:" + variation.weight +
      ";font-size:" + state.fontSize + "px;font-feature-settings:" + featureSettings +
      ";letter-spacing:" + state.letterSpacing + "px;";
    var strokeAttrs = state.outline ?
      ' stroke="' + state.outlineColor + '" stroke-width="' + state.outlineWidth + '" paint-order="stroke fill"' : "";

    var tspans = lines.map(function (line, i) {
      var y = startY + i * lineHeight;
      return '<text x="' + anchorX + '" y="' + y + '" style="' + textStyle + '" fill="' + state.color +
        '" text-anchor="' + textAnchor + '" direction="' + (state.rtl ? "rtl" : "ltr") +
        '" dir="' + (state.rtl ? "rtl" : "ltr") + '" lang="ar"' + strokeAttrs + shadowAttr + ">" +
        escapeXml(line) + "</text>";
    }).join("\n");

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + " " + h + '">\n' + defs + "\n" + bgRect + "\n" + decoRect + "\n" + tspans + "\n</svg>";
  }

  function svgToDataUrl(svgString) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  }

  // -----------------------------------------------------------------
  // Live preview: builds the SVG and inserts it directly into the DOM.
  // -----------------------------------------------------------------
  CalligraphyStudio.prototype.render = function (opts) {
    opts = opts || {};
    var state = this.state;
    var variation = this.currentVariation();
    var self = this;

    return loadFontForVariation(variation).then(function () {
      var w = self.baseW, h = self.baseH;
      var svg = buildSvg(state, variation, "", w, h);
      if (self.stage) {
        self.stage.innerHTML = svg;
        var svgEl = self.stage.querySelector("svg");
        if (svgEl) {
          svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svgEl.style.width = "100%";
          svgEl.style.height = "auto";
          svgEl.style.display = "block";
        }
      }
      return self.stage;
    });
  };

  // -----------------------------------------------------------------
  // Export helpers — build a self-contained SVG (font embedded as
  // base64) so the artwork is pixel/feature-identical wherever it's
  // opened, then rasterize it for PNG/JPG/PDF.
  // -----------------------------------------------------------------
  function buildExportSvg(state, variation, scale) {
    var w = 1200 * scale, h = 700 * scale;
    // Font size / spacing scale with the export multiplier so a 4x PNG
    // isn't just a blurry upscale of the 1x preview.
    var scaledState = Object.assign({}, state, {
      fontSize: state.fontSize * scale,
      letterSpacing: state.letterSpacing * scale,
      outlineWidth: state.outlineWidth * scale,
      shadowBlur: state.shadowBlur * scale
    });
    return fontBytes(variation.file).then(function (buf) {
      var b64 = arrayBufferToBase64(buf);
      var family = fileFamilyName(variation.file);
      var fontFaceCss = "<style>@font-face{font-family:\"" + family +
        "\";src:url(data:font/woff2;base64," + b64 + ") format(\"woff2\");font-weight:100 900;}</style>";
      return buildSvg(scaledState, variation, fontFaceCss, w, h);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  function rasterizeSvg(svgString, w, h, forceBg, bg) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = svgToDataUrl(svgString);
    }).then(function (img) {
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      if (forceBg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    });
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  CalligraphyStudio.prototype.exportRaster = function (format, multiplier) {
    var state = this.state;
    var variation = this.currentVariation();
    var type = format === "jpg" ? "image/jpeg" : "image/png";
    // JPEG has no alpha channel, so it always needs an opaque canvas
    // fill underneath. PNG relies on the SVG's own background rect
    // (present whenever transparentBg is false) — no separate fill.
    var forceBg = format === "jpg";
    var scale = (global.devicePixelRatio || 1) * multiplier;
    var w = Math.round(this.baseW * scale), h = Math.round(this.baseH * scale);

    return buildExportSvg(state, variation, scale).then(function (svg) {
      return rasterizeSvg(svg, w, h, forceBg, state.bg);
    }).then(function (canvas) {
      return canvasToBlob(canvas, type, 0.95);
    });
  };

  CalligraphyStudio.prototype.exportSvg = function () {
    var variation = this.currentVariation();
    return buildExportSvg(this.state, variation, 1).then(function (svg) {
      return new Blob([svg], { type: "image/svg+xml" });
    });
  };

  // Minimal single-page PDF wrapping a JPEG raster (DCTDecode XObject).
  // We deliberately export raster-in-PDF rather than converting glyphs
  // to vector paths: Arabic contextual shaping (letter joining) and the
  // OpenType feature applied by the selected variation both happen at
  // SVG-render time in the browser's own text engine; re-deriving vector
  // glyph outlines afterwards from a naive JS parser would risk breaking
  // either. A high-resolution embedded raster preserves the exact
  // preview appearance instead. See ARCHITECTURE.md.
  function buildPdfFromJpeg(jpegBuf, pxW, pxH) {
    var dpi = 144;
    var ptW = (pxW / dpi) * 72;
    var ptH = (pxH / dpi) * 72;
    var enc = new TextEncoder();
    var chunks = [];
    var offsets = [];
    var pos = 0;

    function push(bytesOrStr) {
      var bytes = typeof bytesOrStr === "string" ? enc.encode(bytesOrStr) : bytesOrStr;
      chunks.push(bytes);
      pos += bytes.length;
    }
    function beginObj(n) {
      offsets[n] = pos;
      push(n + " 0 obj\n");
    }

    push("%PDF-1.4\n");

    beginObj(1); push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    beginObj(2); push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    beginObj(3); push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + ptW.toFixed(2) + " " + ptH.toFixed(2) +
      "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n");
    beginObj(4);
    push("<< /Type /XObject /Subtype /Image /Width " + pxW + " /Height " + pxH +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpegBuf.byteLength + " >>\nstream\n");
    push(new Uint8Array(jpegBuf));
    push("\nendstream\nendobj\n");
    var content = "q " + ptW.toFixed(2) + " 0 0 " + ptH.toFixed(2) + " 0 0 cm /Im0 Do Q";
    beginObj(5);
    push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\nendobj\n");

    var xrefStart = pos;
    var xref = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) {
      xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    push(xref);
    push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF");

    return new Blob(chunks, { type: "application/pdf" });
  }

  CalligraphyStudio.prototype.exportPdf = function () {
    var state = this.state;
    var variation = this.currentVariation();
    var scale = 3;
    var w = Math.round(this.baseW * scale), h = Math.round(this.baseH * scale);
    return buildExportSvg(state, variation, scale)
      .then(function (svg) { return rasterizeSvg(svg, w, h, true, state.bg); })
      .then(function (canvas) {
        return canvasToBlob(canvas, "image/jpeg", 0.95).then(function (blob) {
          return blob.arrayBuffer().then(function (buf) {
            return buildPdfFromJpeg(buf, w, h);
          });
        });
      });
  };

  global.CalligraphyStudio = CalligraphyStudio;
  global.CalligraphyStudioUtils = { triggerDownload: triggerDownload, stripTashkeel: stripTashkeel };
})(window);
