(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var canvas = document.getElementById("callyCanvas");
    if (!canvas || !window.CalligraphyStudio || !window.CalligraphyData) return;

    var studio = new CalligraphyStudio(canvas);
    var $ = function (id) { return document.getElementById(id); };

    var els = {
      text: $("callyText"),
      families: $("callyFamilies"),
      variations: $("callyVariations"),
      variationHint: $("callyVariationHint"),
      size: $("callySize"),
      sizeOut: $("callySizeOut"),
      letterSpacing: $("callyLetterSpacing"),
      lineSpacing: $("callyLineSpacing"),
      color: $("callyColor"),
      bg: $("callyBg"),
      transparentBg: $("callyTransparentBg"),
      align: $("callyAlign"),
      rtl: $("callyRtl"),
      tashkeel: $("callyTashkeel"),
      kashida: $("callyKashida"),
      outline: $("callyOutline"),
      outlineColor: $("callyOutlineColor"),
      outlineWidth: $("callyOutlineWidth"),
      shadow: $("callyShadow"),
      decorativeBg: $("callyDecorativeBg"),
      reset: $("callyReset"),
      undo: $("callyUndo"),
      redo: $("callyRedo"),
      phrases: $("callyPhrases"),
      downloadBtns: document.querySelectorAll("[data-cally-export]")
    };

    var defaultState = Object.assign({}, studio.state);
    var renderQueued = false;
    function queueRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(function () {
        renderQueued = false;
        studio.render().catch(function (err) { console.error(err); });
      });
    }

    // ---------------- Family + variation galleries ----------------
    function buildFamilies() {
      els.families.innerHTML = "";
      CalligraphyData.FAMILIES.forEach(function (fam) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cally-family-btn" + (fam.available ? "" : " is-soon");
        btn.setAttribute("data-family", fam.id);
        btn.innerHTML = '<span class="fam-label">' + fam.label + '</span>' +
          (fam.available ? '<span class="fam-count">' + fam.variations.length + ' نمط</span>' : '<span class="fam-count">قريبًا</span>');
        btn.title = fam.blurb;
        btn.addEventListener("click", function () { selectFamily(fam.id); });
        els.families.appendChild(btn);
      });
    }

    var currentFamilyId = "naskh";

    function selectFamily(famId) {
      var fam = CalligraphyData.FAMILIES.filter(function (f) { return f.id === famId; })[0];
      if (!fam) return;
      currentFamilyId = famId;
      Array.prototype.forEach.call(els.families.querySelectorAll(".cally-family-btn"), function (b) {
        b.classList.toggle("active", b.getAttribute("data-family") === famId);
      });
      buildVariations(fam);
      if (fam.available && fam.variations.length) {
        selectVariation(fam.variations[0].id);
      } else {
        els.variationHint.textContent = "هذا الطراز غير متاح بعد بترخيص مفتوح موثّق — راجع fonts/LICENSES.md.";
        els.variations.innerHTML = "";
      }
    }

    function buildVariations(fam) {
      els.variations.innerHTML = "";
      els.variationHint.textContent = fam.blurb;
      fam.variations.forEach(function (v) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cally-variation-btn";
        btn.setAttribute("data-variation", v.id);
        btn.innerHTML = '<span class="var-sample">' + v.sample + '</span><span class="var-label">' + v.label + "</span>";
        btn.addEventListener("click", function () { selectVariation(v.id); });
        els.variations.appendChild(btn);
        // Progressively apply the real font to its own swatch once loaded.
        CalligraphyStudio && loadSwatchFont(v, btn.querySelector(".var-sample"));
      });
    }

    function loadSwatchFont(variation, sampleEl) {
      // Reuses the studio's internal loader indirectly by triggering a
      // tiny FontFace load through the browser font loading API so the
      // swatch shows the *real* glyph shapes, not a placeholder font.
      var family = "cal-" + variation.file.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      var url = CalligraphyData.fontUrl(null, variation.file);
      var ff = new FontFace(family, "url(" + url + ")", { weight: "100 900" });
      ff.load().then(function (loaded) {
        document.fonts.add(loaded);
        sampleEl.style.fontFamily = '"' + family + '"';
        sampleEl.style.fontWeight = variation.weight;
      }).catch(function () {});
    }

    function selectVariation(id) {
      studio.set({ variationId: id });
      Array.prototype.forEach.call(els.variations.querySelectorAll(".cally-variation-btn"), function (b) {
        b.classList.toggle("active", b.getAttribute("data-variation") === id);
      });
      queueRender();
    }

    // ---------------- Controls ----------------
    function bindRange(el, key, out, fmt) {
      if (!el) return;
      el.addEventListener("input", function () {
        var v = parseFloat(el.value);
        var patch = {}; patch[key] = v;
        studio.set(patch);
        if (out) out.textContent = fmt ? fmt(v) : v;
        queueRender();
      });
    }
    bindRange(els.size, "fontSize", els.sizeOut, function (v) { return v + "px"; });
    bindRange(els.letterSpacing, "letterSpacing");
    bindRange(els.lineSpacing, "lineSpacing");
    bindRange(els.outlineWidth, "outlineWidth");

    if (els.color) els.color.addEventListener("input", function () { studio.set({ color: els.color.value }); queueRender(); });
    if (els.bg) els.bg.addEventListener("input", function () { studio.set({ bg: els.bg.value }); queueRender(); });
    if (els.outlineColor) els.outlineColor.addEventListener("input", function () { studio.set({ outlineColor: els.outlineColor.value }); queueRender(); });

    if (els.transparentBg) els.transparentBg.addEventListener("change", function () { studio.set({ transparentBg: els.transparentBg.checked }); queueRender(); });
    if (els.rtl) els.rtl.addEventListener("change", function () { studio.set({ rtl: els.rtl.checked }); queueRender(); });
    if (els.tashkeel) els.tashkeel.addEventListener("change", function () { studio.set({ showTashkeel: els.tashkeel.checked }); queueRender(); });
    if (els.outline) els.outline.addEventListener("change", function () { studio.set({ outline: els.outline.checked }); queueRender(); });
    if (els.shadow) els.shadow.addEventListener("change", function () { studio.set({ shadow: els.shadow.checked }); queueRender(); });
    if (els.decorativeBg) els.decorativeBg.addEventListener("change", function () { studio.set({ decorativeBg: els.decorativeBg.checked }); queueRender(); });
    if (els.align) els.align.addEventListener("change", function () { studio.set({ align: els.align.value }); queueRender(); });
    if (els.kashida) els.kashida.addEventListener("change", function () { studio.set({ kashida: parseInt(els.kashida.value, 10) }); queueRender(); });

    // ---------------- Text input (real <textarea> — Android IME appears
    // here as expected; the canvas below is never focusable, so the
    // system keyboard never appears when touching the artwork). ----------------
    var typingTimer = null;
    if (els.text) {
      els.text.value = studio.state.text;
      els.text.addEventListener("input", function () {
        studio.set({ text: els.text.value });
        queueRender();
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () { studio.pushHistory(); }, 500);
      });
    }

    if (els.undo) els.undo.addEventListener("click", function () {
      if (studio.undo()) { els.text.value = studio.state.text; queueRender(); }
    });
    if (els.redo) els.redo.addEventListener("click", function () {
      if (studio.redo()) { els.text.value = studio.state.text; queueRender(); }
    });
    if (els.reset) els.reset.addEventListener("click", function () {
      studio.state = Object.assign({}, defaultState);
      syncControlsFromState();
      studio.pushHistory();
      queueRender();
      window.showToast && window.showToast("تمت إعادة الضبط");
    });

    function syncControlsFromState() {
      var s = studio.state;
      if (els.text) els.text.value = s.text;
      if (els.size) { els.size.value = s.fontSize; els.sizeOut.textContent = s.fontSize + "px"; }
      if (els.letterSpacing) els.letterSpacing.value = s.letterSpacing;
      if (els.lineSpacing) els.lineSpacing.value = s.lineSpacing;
      if (els.color) els.color.value = s.color;
      if (els.bg) els.bg.value = s.bg;
      if (els.transparentBg) els.transparentBg.checked = s.transparentBg;
      if (els.align) els.align.value = s.align;
      if (els.rtl) els.rtl.checked = s.rtl;
      if (els.tashkeel) els.tashkeel.checked = s.showTashkeel;
      if (els.kashida) els.kashida.value = s.kashida;
      if (els.outline) els.outline.checked = s.outline;
      if (els.outlineColor) els.outlineColor.value = s.outlineColor;
      if (els.outlineWidth) els.outlineWidth.value = s.outlineWidth;
      if (els.shadow) els.shadow.checked = s.shadow;
      if (els.decorativeBg) els.decorativeBg.checked = s.decorativeBg;
      selectFamily("naskh");
      selectVariation(s.variationId);
    }

    // ---------------- Ready-made phrases ----------------
    if (els.phrases) {
      CalligraphyData.PHRASES.forEach(function (phrase) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cally-phrase-btn";
        btn.textContent = phrase;
        btn.addEventListener("click", function () {
          studio.set({ text: phrase });
          els.text.value = phrase;
          studio.pushHistory();
          queueRender();
        });
        els.phrases.appendChild(btn);
      });
    }

    // ---------------- Download ----------------
    function filenameFor(ext) {
      var base = (studio.state.text.trim().slice(0, 24) || "calligraphy").replace(/\s+/g, "-");
      return "arabic-calligraphy-" + base + "." + ext;
    }

    Array.prototype.forEach.call(els.downloadBtns, function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-cally-export");
        btn.disabled = true;
        var original = btn.textContent;
        btn.textContent = "…جارٍ التجهيز";
        var task;
        if (kind === "png1" || kind === "png2" || kind === "png3" || kind === "png4") {
          var mult = parseInt(kind.slice(3), 10);
          task = studio.exportRaster("png", mult).then(function (blob) {
            CalligraphyStudioUtils.triggerDownload(blob, filenameFor(mult + "x.png"));
          });
        } else if (kind === "jpg") {
          task = studio.exportRaster("jpg", 2).then(function (blob) {
            CalligraphyStudioUtils.triggerDownload(blob, filenameFor("jpg"));
          });
        } else if (kind === "svg") {
          task = studio.exportSvg().then(function (blob) {
            CalligraphyStudioUtils.triggerDownload(blob, filenameFor("svg"));
          });
        } else if (kind === "pdf") {
          task = studio.exportPdf().then(function (blob) {
            CalligraphyStudioUtils.triggerDownload(blob, filenameFor("pdf"));
          });
        } else {
          task = Promise.resolve();
        }
        task.catch(function (err) {
          console.error(err);
          window.showToast && window.showToast("تعذّر إنشاء الملف — حاول مجددًا");
        }).then(function () {
          btn.disabled = false;
          btn.textContent = original;
        });
      });
    });

    // ---------------- Init ----------------
    buildFamilies();
    selectFamily("naskh");
    studio.pushHistory();
    queueRender();
    window.addEventListener("resize", queueRender);
  });
})();
