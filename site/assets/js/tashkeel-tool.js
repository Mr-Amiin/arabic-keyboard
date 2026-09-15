/* ============================================================
   لوحة عربي — Tashkeel (diacritization) preview component
   IMPORTANT: this is a lightweight, rule-of-thumb heuristic that
   appends a fatha after most consonants. It is a UI PREVIEW, not
   a real morphological diacritization engine. A production build
   should call a real NLP service for this — see the "planned"
   badge in the UI, which this file's markup should keep honest.
   ============================================================ */
window.ArabicTashkeel = (function () {
  "use strict";

  const TASHKEEL_MAP = { "ب": "بَ", "ت": "تَ", "ث": "ثَ", "ج": "جَ", "ح": "حَ", "خ": "خَ", "د": "دَ", "ذ": "ذَ", "ر": "رَ", "ز": "زَ", "س": "سَ", "ش": "شَ", "ص": "صَ", "ض": "ضَ", "ط": "طَ", "ظ": "ظَ", "ع": "عَ", "غ": "غَ", "ف": "فَ", "ق": "قَ", "ك": "كَ", "ل": "لَ", "م": "مَ", "ن": "نَ", "ه": "هَ", "ي": "يَ" };

  function quickTashkeel(text) {
    return text.split("").map((ch) => TASHKEEL_MAP[ch] || ch).join("");
  }

  function init(opts) {
    opts = opts || {};
    const input = document.getElementById(opts.inputId || "tashkeelIn");
    const output = document.getElementById(opts.outputId || "tashkeelOut");
    const runBtn = document.getElementById(opts.runId || "tashkeelRun");
    if (!input || !output || !runBtn) return null;
    runBtn.addEventListener("click", () => {
      const val = input.value.trim();
      if (!val) { output.textContent = "اكتب نصًا أولاً…"; return; }
      output.textContent = quickTashkeel(val);
      window.showToast?.("تمت إضافة تشكيل تقريبي");
    });
    return { quickTashkeel };
  }

  return { init, quickTashkeel };
})();
