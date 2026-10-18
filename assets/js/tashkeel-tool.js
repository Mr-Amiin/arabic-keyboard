/* ============================================================
   لوحة عربي — Tashkeel tool (UI)

   Real automatic diacritization. The Ichkil model (MIT) runs in the
   visitor's browser through ONNX Runtime Web; the text never leaves
   the device. Engine: assets/js/tashkeel-engine.js
   Model + runtime are self-hosted under assets/vendor/.
   ============================================================ */
window.ArabicTashkeel = (function () {
  "use strict";

  const MAX_CHARS = 50000;
  const SIZES = { runtime: 14239897, model: 5068871 };   // decoded bytes, for the progress bar
  const EXAMPLES = [
    "محمد قرأ الكتاب في المدرسة",
    "اللغة العربية من أقدم اللغات الحية في العالم، ويتحدث بها مئات الملايين من الناس.\nوهي لغة القرآن الكريم، ولها مكانة عظيمة في الثقافة والتاريخ.",
    "العلم نور والجهل ظلمة"
  ];
  const MSG = {
    empty: "اكتب أو الصق نصًا عربيًا أولاً.",
    noArabic: "لم أجد حروفًا عربية في النص. اكتب نصًا عربيًا ثم أعد المحاولة.",
    tooLong: "النص أطول من الحد المسموح (" + MAX_CHARS.toLocaleString("ar-EG") + " حرف). قسّمه إلى أجزاء أصغر — لن نقصّه بصمت.",
    FETCH_FAILED: "تعذّر تحميل نموذج التشكيل. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.",
    RUNTIME_LOAD_FAILED: "تعذّر تحميل مكوّن التشغيل. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.",
    CHECKSUM_FAILED: "ملف النموذج المحمَّل تالف أو غير مطابق. أعد المحاولة؛ وإن تكرر الخطأ فحدّث الصفحة (Ctrl+F5).",
    CONFIG_INVALID: "ملف إعدادات النموذج غير صالح. أعد المحاولة أو حدّث الصفحة.",
    SESSION_FAILED: "تعذّر تشغيل النموذج في هذا المتصفح. جرّب متصفحًا حديثًا (Chrome أو Edge أو Firefox أو Safari).",
    INFERENCE_FAILED: "حدث خطأ أثناء معالجة النص. أعد المحاولة.",
    INTEGRITY: "أوقفنا العملية لأن الناتج كان سيغيّر النص الأصلي. لم يُعرض أي ناتج. أعد المحاولة.",
    generic: "حدث خطأ غير متوقع. أعد المحاولة."
  };

  const nf = (n) => Number(n).toLocaleString("ar-EG");

  function countOf(text) {
    const chars = Array.from(text).length;
    const words = (text.trim().match(/\S+/g) || []).length;
    return { chars, words };
  }

  function init(opts) {
    opts = opts || {};
    const $ = (id) => document.getElementById(id);
    const el = {
      input: $(opts.inputId || "tashkeelIn"),
      output: $(opts.outputId || "tashkeelOut"),
      run: $(opts.runId || "tashkeelRun"),
      example: $("tashkeelExample"),
      clear: $("tashkeelClear"),
      copy: $("tashkeelCopy"),
      counts: $("tashkeelCounts"),
      status: $("tashkeelStatus"),
      bar: $("tashkeelBar"),
      progress: $("tashkeelProgress"),
      error: $("tashkeelError"),
      errorMsg: $("tashkeelErrorMsg"),
      retry: $("tashkeelRetry")
    };
    if (!el.input || !el.output || !el.run) return null;

    const base = opts.vendorBase || "../assets/vendor/";
    const abs = (p) => new URL(p, document.baseURI).href;
    const cfg = {
      ortUrl: abs(base + "onnxruntime-web/ort.wasm.min.js"),
      wasmBase: abs(base + "onnxruntime-web/"),
      wasmUrl: abs(base + "onnxruntime-web/ort-wasm-simd-threaded.wasm"),
      modelUrl: abs(base + "ichkil/model.onnx"),
      configUrl: abs(base + "ichkil/config.json"),
      sizes: SIZES
    };

    let enginePromise = null;   // cached: the model is downloaded/initialised once per page
    let busy = false;
    let exampleIdx = 0;
    let lastResult = "";

    /* ---------- UI helpers ---------- */
    function setStatus(text, kind) {
      if (!el.status) return;
      if (!text) { el.status.hidden = true; el.status.textContent = ""; return; }
      el.status.hidden = false;
      el.status.textContent = text;
      el.status.dataset.kind = kind || "info";
    }
    function setProgress(frac) {            // frac: 0..1, or null to hide, -1 = indeterminate
      if (!el.progress || !el.bar) return;
      if (frac === null) { el.progress.hidden = true; return; }
      el.progress.hidden = false;
      el.progress.classList.toggle("indeterminate", frac < 0);
      if (frac >= 0) {
        const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
        el.bar.style.width = pct + "%";
        el.progress.setAttribute("aria-valuenow", String(pct));
      } else {
        el.bar.style.width = "";
        el.progress.removeAttribute("aria-valuenow");
      }
    }
    function showError(msg) {
      if (!el.error) return;
      el.errorMsg.textContent = msg;
      el.error.hidden = false;
    }
    function hideError() { if (el.error) el.error.hidden = true; }
    function setBusy(b) {
      busy = b;
      el.run.disabled = b;
      el.run.setAttribute("aria-busy", b ? "true" : "false");
      if (el.example) el.example.disabled = b;
      if (el.clear) el.clear.disabled = b;
      if (el.retry) el.retry.disabled = b;
    }
    function updateCounts() {
      const c = countOf(el.input.value);
      if (el.counts) el.counts.textContent = nf(c.chars) + " حرف · " + nf(c.words) + " كلمة";
      if (el.counts) el.counts.classList.toggle("over", c.chars > MAX_CHARS);
    }
    function setOutput(text) {
      lastResult = text;
      el.output.textContent = text || "—";
      el.output.classList.toggle("has-result", !!text);
      if (el.copy) el.copy.disabled = !text;
    }

    /* ---------- engine loading (once, retry-safe) ---------- */
    function getEngine() {
      if (enginePromise) return enginePromise;
      const dl = { runtime: 0, model: 0 };
      const p = window.IchkilTashkeel.load(Object.assign({}, cfg, {
        onStatus: (s) => {
          if (s.phase === "runtime") { setStatus("جارٍ تحميل مكوّن التشغيل…", "info"); setProgress(-1); }
          else if (s.phase === "download" && (s.label === "runtime" || s.label === "model")) {
            dl[s.label] = s.loaded;
            const frac = (dl.runtime + dl.model) / (SIZES.runtime + SIZES.model);
            const mb = ((dl.runtime + dl.model) / 1048576).toFixed(1);
            setStatus("جارٍ تحميل نموذج التشكيل لأول مرة (نحو 19 ميغابايت، يُحفظ بعدها في متصفحك)… " + mb + " م.ب", "info");
            setProgress(Math.min(0.99, frac));
          } else if (s.phase === "verify") { setStatus("جارٍ التحقق من سلامة النموذج…", "info"); setProgress(-1); }
          else if (s.phase === "init") { setStatus("جارٍ تهيئة النموذج…", "info"); setProgress(-1); }
        }
      }));
      enginePromise = p;
      p.catch(() => { if (enginePromise === p) enginePromise = null; });   // allow a clean retry
      return p;
    }

    /* ---------- main action ---------- */
    async function run() {
      if (busy) return;
      hideError();
      const text = el.input.value;
      if (!text.trim()) { setStatus(MSG.empty, "warn"); setProgress(null); el.input.focus(); return; }
      if (Array.from(text).length > MAX_CHARS) { setStatus(MSG.tooLong, "warn"); setProgress(null); return; }
      if (!/[\u0621-\u064A]/.test(text)) { setStatus(MSG.noArabic, "warn"); setProgress(null); return; }
      if (!window.IchkilTashkeel) { showError(MSG.generic); setStatus("", ""); return; }

      setBusy(true);
      setOutput("");
      try {
        setStatus("جارٍ تجهيز النموذج…", "info"); setProgress(-1);
        const engine = await getEngine();
        setStatus("جارٍ التشكيل…", "info"); setProgress(0);
        const res = await engine.diacritize(text, {
          detailed: true,
          onProgress: (done, total) => {
            setProgress(total ? done / total : 1);
            if (total > 1) setStatus("جارٍ التشكيل… (" + nf(done) + " من " + nf(total) + ")", "info");
          }
        });
        setOutput(res.text);
        setProgress(null);
        setStatus("تم التشكيل ✓ — أُضيفت " + nf(res.marksAdded) + " علامة. راجع النتيجة قبل استخدامها.", "ok");
        window.showToast?.("تم تشكيل النص");
      } catch (e) {
        setProgress(null);
        setStatus("", "");
        const code = e && e.code;
        showError(MSG[code] || MSG.generic);
        if (window.console) console.error("[tashkeel]", e);
      } finally {
        setBusy(false);
      }
    }

    /* ---------- copy ---------- */
    async function copy() {
      if (!lastResult) return;
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(lastResult);
        else {
          const ta = document.createElement("textarea");
          ta.value = lastResult; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          if (!ok) throw new Error("execCommand failed");
        }
        window.showToast?.("تم نسخ النص المشكول");
        setStatus("تم نسخ النص المشكول ✓", "ok");
      } catch (e) {
        setStatus("تعذّر النسخ تلقائيًا. حدّد النص في خانة الناتج وانسخه يدويًا.", "warn");
      }
    }

    /* ---------- wiring ---------- */
    el.run.addEventListener("click", run);
    if (el.retry) el.retry.addEventListener("click", run);
    if (el.copy) el.copy.addEventListener("click", copy);
    if (el.example) el.example.addEventListener("click", () => {
      el.input.value = EXAMPLES[exampleIdx++ % EXAMPLES.length];
      hideError(); setStatus("", ""); setProgress(null); setOutput(""); updateCounts(); el.input.focus();
    });
    if (el.clear) el.clear.addEventListener("click", () => {
      el.input.value = ""; hideError(); setStatus("", ""); setProgress(null); setOutput(""); updateCounts(); el.input.focus();
    });
    el.input.addEventListener("input", () => { updateCounts(); if (el.status && el.status.dataset.kind === "warn") setStatus("", ""); });
    updateCounts(); setOutput("");
    return { run, getEngine };
  }

  return { init, _countOf: countOf };
})();
