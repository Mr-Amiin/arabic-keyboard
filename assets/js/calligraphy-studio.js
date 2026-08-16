/*
 * Arabic Calligraphy Studio — rendering engine.
 *
 * Pipeline (matches the architecture doc):
 *   Arabic text input -> text state -> Arabic shaping (native, via the
 *   browser's own text engine inside <canvas> / SVG <text>, which is
 *   what actually performs correct contextual joining — see
 *   ARCHITECTURE.md for why we deliberately do NOT hand-roll shaping)
 *   -> selected calligraphy font -> selected variation -> canvas
 *   renderer -> preview -> export (PNG/JPG/SVG/PDF).
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

  // ---------------------------------------------------------------------
  // Font loading (FontFace API). One FontFace per underlying file — a
  // variable font's different "variations" (regular/bold instances)
  // share a single registered FontFace with a weight axis range, so we
  // don't load the same bytes twice.
  // ---------------------------------------------------------------------
  var loadedFonts = {}; // fileFamily -> Promise<FontFace>
  var fontBytesCache = {}; // file -> Promise<ArrayBuffer> (for SVG export embedding)

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
  // Studio: owns state + draws to a given canvas.
  // ---------------------------------------------------------------------
  function CalligraphyStudio(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
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

  // Draws a simple, original geometric 8-point-star lattice — not a
  // reproduction of any existing artwork, just an algorithmic tiling.
  function drawDecorativeBackground(ctx, w, h, tint) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    var step = Math.max(48, Math.min(w, h) / 10);
    for (var y = -step; y < h + step; y += step) {
      for (var x = -step; x < w + step; x += step) {
        drawEightPointStar(ctx, x, y, step * 0.42);
      }
    }
    ctx.restore();
  }

  function drawEightPointStar(ctx, cx, cy, r) {
    var spikes = 8, outer = r, inner = r * 0.5;
    ctx.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var rad = i % 2 === 0 ? outer : inner;
      var ang = (Math.PI / spikes) * i - Math.PI / 2;
      var px = cx + Math.cos(ang) * rad;
      var py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  CalligraphyStudio.prototype.render = function (opts) {
    opts = opts || {};
    var scale = opts.scale || (global.devicePixelRatio || 1);
    var state = this.state;
    var variation = this.currentVariation();
    var self = this;

    return loadFontForVariation(variation).then(function () {
      var canvas = self.canvas;
      var w = self.baseW, h = self.baseH;
      canvas.width = w * scale;
      canvas.height = h * scale;
      canvas.style.width = "100%";
      var ctx = self.ctx;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!state.transparentBg || opts.forceBg) {
        ctx.fillStyle = state.bg;
        ctx.fillRect(0, 0, w, h);
      }
      if (state.decorativeBg) {
        drawDecorativeBackground(ctx, w, h, state.color);
      }

      var family = fileFamilyName(variation.file);
      var size = state.fontSize;
      ctx.font = variation.weight + " " + size + "px \"" + family + "\"";
      ctx.textBaseline = "middle";
      ctx.direction = state.rtl ? "rtl" : "ltr";
      if ("letterSpacing" in ctx) {
        try { ctx.letterSpacing = state.letterSpacing + "px"; } catch (e) {}
      }

      var lines = preparedLines(state);
      var lineHeight = size * state.lineSpacing;
      var totalH = lineHeight * lines.length;
      var startY = h / 2 - totalH / 2 + lineHeight / 2;

      var anchorX;
      var textAlign;
      if (state.align === "center") { textAlign = "center"; anchorX = w / 2; }
      else if (state.align === "start") { textAlign = state.rtl ? "right" : "left"; anchorX = state.rtl ? w - 40 : 40; }
      else { textAlign = state.rtl ? "left" : "right"; anchorX = state.rtl ? 40 : w - 40; }
      ctx.textAlign = textAlign;

      lines.forEach(function (line, i) {
        var y = startY + i * lineHeight;
        if (state.shadow) {
          ctx.shadowColor = state.shadowColor;
          ctx.shadowBlur = state.shadowBlur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = state.shadowBlur / 4;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }
        if (state.outline) {
          ctx.lineWidth = state.outlineWidth;
          ctx.strokeStyle = state.outlineColor;
          ctx.strokeText(line, anchorX, y);
        }
        ctx.fillStyle = state.color;
        ctx.fillText(line, anchorX, y);
      });

      return canvas;
    });
  };

  // -----------------------------------------------------------------
  // Export helpers
  // -----------------------------------------------------------------
  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
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
    var self = this;
    var type = format === "jpg" ? "image/jpeg" : "image/png";
    var forceBg = format === "jpg"; // JPEG has no alpha channel
    var savedW = this.baseW, savedH = this.baseH;
    return this.render({ scale: (global.devicePixelRatio || 1) * multiplier, forceBg: forceBg })
      .then(function (canvas) {
        return canvasToBlob(canvas, type, 0.95).then(function (blob) {
          // restore normal preview resolution
          return self.render({}).then(function () {
            return blob;
          });
        });
      });
  };

  CalligraphyStudio.prototype.exportSvg = function () {
    var state = this.state;
    var variation = this.currentVariation();
    var w = this.baseW, h = this.baseH;
    var lines = preparedLines(state);
    var lineHeight = state.fontSize * state.lineSpacing;
    var totalH = lineHeight * lines.length;
    var startY = h / 2 - totalH / 2 + lineHeight / 2 + state.fontSize * 0.32; // baseline correction

    return fontBytes(variation.file).then(function (buf) {
      var b64 = arrayBufferToBase64(buf);
      var family = fileFamilyName(variation.file);
      var anchor = state.align === "center" ? "middle" : (state.align === "start") === state.rtl ? "end" : "start";
      // simplified: center/start/end mapped consistently with canvas logic
      var textAnchor = state.align === "center" ? "middle" : (state.rtl ? (state.align === "start" ? "end" : "start") : (state.align === "start" ? "start" : "end"));
      var anchorX = state.align === "center" ? w / 2 : (textAnchor === "end" ? w - 40 : 40);

      var bgRect = state.transparentBg ? "" :
        '<rect width="' + w + '" height="' + h + '" fill="' + state.bg + '"/>';

      var tspans = lines.map(function (line, i) {
        var y = startY + i * lineHeight;
        var esc = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        var strokeAttr = state.outline ? ' stroke="' + state.outlineColor + '" stroke-width="' + state.outlineWidth + '" paint-order="stroke"' : "";
        return '<text x="' + anchorX + '" y="' + y + '" font-family="' + family + '" font-weight="' + variation.weight +
          '" font-size="' + state.fontSize + '" fill="' + state.color + '" text-anchor="' + textAnchor +
          '" direction="' + (state.rtl ? "rtl" : "ltr") + '" letter-spacing="' + state.letterSpacing + '"' + strokeAttr + '>' + esc + '</text>';
      }).join("\n");

      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
        '<defs><style>\n@font-face{font-family:"' + family + '";src:url(data:font/woff2;base64,' + b64 + ') format("woff2");}\n' +
        'text{font-synthesis:none;}\n</style></defs>\n' +
        bgRect + "\n" + tspans + "\n</svg>";
      return new Blob([svg], { type: "image/svg+xml" });
    });
  };

  // Minimal single-page PDF wrapping a JPEG raster (DCTDecode XObject).
  // We deliberately export raster-in-PDF rather than converting glyphs
  // to vector paths: Arabic contextual shaping (letter joining) is
  // performed by the browser's text engine at render time, and glyph
  // outlines extracted after the fact from a naive JS reshaper would
  // risk breaking that joining. A high-resolution embedded raster
  // preserves the exact preview appearance instead. See ARCHITECTURE.md.
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
    var self = this;
    return this.render({ scale: 3, forceBg: true }).then(function (canvas) {
      var w = canvas.width, h = canvas.height;
      return canvasToBlob(canvas, "image/jpeg", 0.95).then(function (blob) {
        return blob.arrayBuffer().then(function (buf) {
          return self.render({}).then(function () {
            return buildPdfFromJpeg(buf, w, h);
          });
        });
      });
    });
  };

  global.CalligraphyStudio = CalligraphyStudio;
  global.CalligraphyStudioUtils = { triggerDownload: triggerDownload, stripTashkeel: stripTashkeel };
})(window);
