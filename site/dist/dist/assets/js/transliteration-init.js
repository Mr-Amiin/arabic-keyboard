/* Dedicated /transliteration/ page wiring: live convert box + mapping table */
document.addEventListener("DOMContentLoaded", () => {
  const T = window.ArabicKeyboardTool;
  T.buildMapTable("mapTableBody");

  const input = document.getElementById("translitInput");
  const output = document.getElementById("translitOutput");
  const btnConvert = document.getElementById("btnConvert");
  const btnClear = document.getElementById("btnClearT");
  const btnCopy = document.getElementById("btnCopyT");
  const btnDownload = document.getElementById("btnDownloadT");
  if (!input || !output) return;

  function convert() {
    output.textContent = T.transliterate(input.value) || "—";
  }
  input.addEventListener("input", convert);
  if (btnConvert) btnConvert.addEventListener("click", convert);
  if (btnClear) btnClear.addEventListener("click", () => { input.value = ""; output.textContent = "—"; input.focus(); });
  if (btnCopy) btnCopy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(output.textContent); window.showToast?.("تم نسخ الناتج"); }
    catch (e) { window.showToast?.("تعذّر النسخ التلقائي"); }
  });
  if (btnDownload) btnDownload.addEventListener("click", () => {
    const blob = new Blob([output.textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "تحويل-صوتي.txt"; a.click();
    URL.revokeObjectURL(url);
  });
});
