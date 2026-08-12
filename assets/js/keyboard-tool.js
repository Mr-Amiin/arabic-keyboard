/* ============================================================
   لوحة عربي — Arabic editor + virtual keyboard + transliteration
   Mounts onto any page containing the expected element IDs:
   #editor, #virtualKeyboard, #modeKeyboard, #modeTranslit, #modeHint
   Toolbar buttons are optional and wired only if present.
   ============================================================ */
window.ArabicKeyboardTool = (function () {
  "use strict";

  const TRANSLIT_MAP = [
    ["a", "ا"], ["b", "ب"], ["t", "ت"], ["th", "ث"], ["j", "ج"], ["7", "ح"], ["kh", "خ"], ["5", "خ"],
    ["d", "د"], ["r", "ر"], ["z", "ز"], ["s", "س"], ["sh", "ش"], ["9", "ص"], ["6", "ط"],
    ["3", "ع"], ["gh", "غ"], ["f", "ف"], ["q", "ق"], ["2", "ق"],
    ["k", "ك"], ["l", "ل"], ["m", "م"], ["n", "ن"], ["h", "ه"], ["w", "و"], ["o", "و"],
    ["y", "ي"], ["i", "ي"], ["e", "ي"], ["u", "و"], ["'", "ء"]
  ];
  const DIGRAPHS = { th: "ث", kh: "خ", sh: "ش", gh: "غ" };
  const SINGLE = { a: "ا", b: "ب", t: "ت", j: "ج", 7: "ح", 5: "خ", d: "د", r: "ر", z: "ز", s: "س", 9: "ص", 6: "ط", 3: "ع", f: "ف", q: "ق", 2: "ق", k: "ك", l: "ل", m: "م", n: "ن", h: "ه", w: "و", o: "و", y: "ي", i: "ي", e: "ي", u: "و", "'": "ء" };

  function transliterate(input) {
    let out = "", i = 0;
    const lower = input.toLowerCase();
    while (i < lower.length) {
      const two = lower.substr(i, 2);
      if (DIGRAPHS[two]) { out += DIGRAPHS[two]; i += 2; continue; }
      const one = lower[i];
      if (SINGLE[one]) out += SINGLE[one];
      else if (/\s|[.,!?]/.test(one)) out += one;
      else out += input[i];
      i++;
    }
    return out;
  }

  const ROWS = [
    ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
    ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
    ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ"]
  ];
  const HINTS = { "ض": "D", "ص": "S", "ث": "Th", "ق": "Q", "ف": "F", "غ": "Gh", "ع": "3", "ه": "H", "خ": "Kh", "ح": "7", "ج": "J", "د": "D", "ش": "Sh", "س": "S", "ي": "Y", "ب": "B", "ل": "L", "ا": "A", "ت": "T", "ن": "N", "م": "M", "ك": "K", "ط": "6", "ئ": "'", "ء": "'", "ؤ": "'", "ر": "R", "لا": "La", "ى": "A", "ة": "H", "و": "W", "ز": "Z", "ظ": "Z" };

  function buildMapTable(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const seen = new Set(), uniq = [];
    TRANSLIT_MAP.forEach(([lat, ar]) => {
      if (!seen.has(ar + lat)) { seen.add(ar + lat); uniq.push([lat, ar]); }
    });
    let rows = "";
    for (let i = 0; i < uniq.length; i += 3) {
      rows += "<tr>";
      for (let j = 0; j < 3; j++) {
        const pair = uniq[i + j];
        rows += pair ? `<td class="lat">${pair[0]}</td><td>${pair[1]}</td>` : "<td></td><td></td>";
      }
      rows += "</tr>";
    }
    tbody.innerHTML = rows;
  }

  function init(opts) {
    opts = opts || {};
    const editor = document.getElementById(opts.editorId || "editor");
    if (!editor) return null;
    const kb = document.getElementById(opts.keyboardId || "virtualKeyboard");
    const modeKeyboard = document.getElementById(opts.modeKeyboardId || "modeKeyboard");
    const modeTranslit = document.getElementById(opts.modeTranslitId || "modeTranslit");
    const modeHint = document.getElementById(opts.modeHintId || "modeHint");
    const charCount = document.getElementById(opts.charCountId || "charCount");
    const wordCount = document.getElementById(opts.wordCountId || "wordCount");

    let undoStack = [""], redoStack = [], suppressPush = false, translitOn = false, fontSize = 24;

    function updateMeta() {
      const text = editor.value;
      if (charCount) charCount.textContent = text.length + " حرف";
      if (wordCount) wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0) + " كلمة";
    }
    function pushUndo() {
      if (suppressPush) return;
      undoStack.push(editor.value);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }
    editor.addEventListener("input", () => { updateMeta(); pushUndo(); });
    updateMeta();

    function bind(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    }

    bind(opts.clearId || "btnClear", () => { editor.value = ""; updateMeta(); pushUndo(); window.showToast?.("تم مسح النص"); editor.focus(); });
    bind(opts.undoId || "btnUndo", () => {
      if (undoStack.length > 1) { redoStack.push(undoStack.pop()); suppressPush = true; editor.value = undoStack[undoStack.length - 1]; suppressPush = false; updateMeta(); }
    });
    bind(opts.redoId || "btnRedo", () => {
      if (redoStack.length) { const v = redoStack.pop(); undoStack.push(v); suppressPush = true; editor.value = v; suppressPush = false; updateMeta(); }
    });
    bind(opts.copyId || "btnCopy", async () => {
      try { await navigator.clipboard.writeText(editor.value); window.showToast?.("تم النسخ إلى الحافظة"); }
      catch (e) { editor.select(); document.execCommand("copy"); window.showToast?.("تم النسخ"); }
    });
    bind(opts.pasteId || "btnPaste", async () => {
      try { const t = await navigator.clipboard.readText(); editor.value += t; updateMeta(); pushUndo(); window.showToast?.("تم اللصق"); }
      catch (e) { window.showToast?.("تعذّر الوصول إلى الحافظة — الصق يدويًا (Ctrl+V)"); editor.focus(); }
    });
    bind(opts.downloadId || "btnDownload", () => {
      const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "نص-عربي.txt"; a.click();
      URL.revokeObjectURL(url);
      window.showToast?.("جارٍ تنزيل الملف");
    });
    bind(opts.printId || "btnPrint", () => window.print());
    bind(opts.dirId || "btnDir", () => {
      editor.dir = editor.dir === "rtl" ? "ltr" : "rtl";
      window.showToast?.("الاتجاه: " + (editor.dir === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين"));
    });
    bind(opts.fontMinusId || "btnFontMinus", () => { fontSize = Math.max(14, fontSize - 2); editor.style.fontSize = fontSize + "px"; });
    bind(opts.fontPlusId || "btnFontPlus", () => { fontSize = Math.min(40, fontSize + 2); editor.style.fontSize = fontSize + "px"; });

    function insertAtCursor(str) {
      const pos = editor.selectionStart ?? editor.value.length;
      editor.value = editor.value.slice(0, pos) + str + editor.value.slice(pos);
      editor.selectionStart = editor.selectionEnd = pos + str.length;
      editor.focus();
      updateMeta(); pushUndo();
    }

    /* mode switch */
    function setMode(on) {
      translitOn = on;
      if (modeKeyboard) { modeKeyboard.classList.toggle("active", !on); modeKeyboard.setAttribute("aria-selected", String(!on)); }
      if (modeTranslit) { modeTranslit.classList.toggle("active", on); modeTranslit.setAttribute("aria-selected", String(on)); }
      if (modeHint) modeHint.textContent = on ? "اكتب بأحرف لاتينية (a, b, 3, 7…) وسيتم تحويلها تلقائيًا" : "انقر الأزرار أو استخدم لوحة مفاتيحك الفعلية";
      if (kb) { kb.style.opacity = on ? "0.4" : "1"; kb.style.pointerEvents = on ? "none" : "auto"; }
    }
    if (modeKeyboard) modeKeyboard.addEventListener("click", () => setMode(false));
    if (modeTranslit) modeTranslit.addEventListener("click", () => setMode(true));

    editor.addEventListener("keyup", (e) => {
      if (!translitOn) return;
      if (e.key.length === 1 && /[a-zA-Z0-9']/.test(e.key)) {
        const pos = editor.selectionStart;
        const before = editor.value.slice(0, pos);
        const after = editor.value.slice(pos);
        const match = before.match(/[a-zA-Z0-9']+$/);
        if (match) {
          const converted = transliterate(match[0]);
          const newBefore = before.slice(0, before.length - match[0].length) + converted;
          editor.value = newBefore + after;
          editor.selectionStart = editor.selectionEnd = newBefore.length;
          updateMeta();
        }
      }
    });

    /* build virtual keyboard */
    if (kb) {
      ROWS.forEach((rowArr) => {
        const rowDiv = document.createElement("div");
        rowDiv.className = "kb-row";
        rowArr.forEach((ch) => {
          const btn = document.createElement("button");
          btn.className = "key" + (HINTS[ch] ? " has-alt" : "");
          btn.type = "button";
          btn.setAttribute("aria-label", "حرف " + ch);
          btn.innerHTML = `<span class="dot"></span>${ch}<span class="hint lang-en">${HINTS[ch] || ""}</span>`;
          btn.addEventListener("click", () => { insertAtCursor(ch); btn.classList.add("pressed"); setTimeout(() => btn.classList.remove("pressed"), 120); });
          rowDiv.appendChild(btn);
        });
        kb.appendChild(rowDiv);
      });
      const lastRow = document.createElement("div");
      lastRow.className = "kb-row";
      const spaceBtn = document.createElement("button");
      spaceBtn.className = "key space"; spaceBtn.type = "button"; spaceBtn.textContent = "مسافة";
      spaceBtn.setAttribute("aria-label", "مسافة");
      spaceBtn.addEventListener("click", () => insertAtCursor(" "));
      const backBtn = document.createElement("button");
      backBtn.className = "key wide"; backBtn.type = "button"; backBtn.textContent = "⌫ حذف";
      backBtn.setAttribute("aria-label", "حذف الحرف الأخير");
      backBtn.addEventListener("click", () => {
        const pos = editor.selectionStart ?? editor.value.length;
        if (pos > 0) { editor.value = editor.value.slice(0, pos - 1) + editor.value.slice(pos); editor.selectionStart = editor.selectionEnd = pos - 1; updateMeta(); pushUndo(); }
        editor.focus();
      });
      const enterBtn = document.createElement("button");
      enterBtn.className = "key wide"; enterBtn.type = "button"; enterBtn.textContent = "↵ سطر";
      enterBtn.setAttribute("aria-label", "سطر جديد");
      enterBtn.addEventListener("click", () => insertAtCursor("\n"));
      lastRow.appendChild(backBtn); lastRow.appendChild(spaceBtn); lastRow.appendChild(enterBtn);
      kb.appendChild(lastRow);
    }

    return { editor, insertAtCursor, transliterate };
  }

  return { init, transliterate, buildMapTable, TRANSLIT_MAP };
})();
