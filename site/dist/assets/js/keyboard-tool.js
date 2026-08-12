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

  /* Main Arabic letter rows — standard Arabic keyboard layout */
  const ROWS = [
    ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د", "ذ"],
    ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
    ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ"]
  ];
  const HINTS = { "ض": "D", "ص": "S", "ث": "Th", "ق": "Q", "ف": "F", "غ": "Gh", "ع": "3", "ه": "H", "خ": "Kh", "ح": "7", "ج": "J", "د": "D", "ذ": "Dh", "ش": "Sh", "س": "S", "ي": "Y", "ب": "B", "ل": "L", "ا": "A", "ت": "T", "ن": "N", "م": "M", "ك": "K", "ط": "6", "ئ": "'", "ء": "'", "ؤ": "'", "ر": "R", "لا": "La", "ى": "A", "ة": "H", "و": "W", "ز": "Z", "ظ": "Z" };

  /* Special Arabic letter forms not on the main rows (hamza-carrying alefs) */
  const SPECIAL_LETTERS = ["أ", "إ", "آ"];
  const SPECIAL_HINTS = { "أ": "A'", "إ": "I'", "آ": "Aa" };

  /* Arabic-Indic numerals, paired with their Western digit equivalents */
  const NUMERALS = [
    ["١", "1"], ["٢", "2"], ["٣", "3"], ["٤", "4"], ["٥", "5"],
    ["٦", "6"], ["٧", "7"], ["٨", "8"], ["٩", "9"], ["٠", "0"]
  ];

  /* Arabic punctuation and common symbols */
  const PUNCTUATION = ["،", "؛", "؟", "!", ".", ":", "\"", "«", "»", "(", ")", "-", "/", "٪", "~"];
  const PUNCT_HINTS = { "،": ",", "؛": ";", "؟": "?", "!": "!", ".": ".", ":": ":", "\"": "\"", "«": "\u201c", "»": "\u201d", "(": "(", ")": ")", "-": "-", "/": "/", "٪": "%", "~": "~" };

  /* Arabic diacritics (Tashkeel) — combining marks, shown over a dotted circle for visibility */
  const DIACRITICS = [
    { mark: "\u064E", name: "فتحة" },      // fatha
    { mark: "\u064B", name: "تنوين فتح" }, // fathatan
    { mark: "\u064F", name: "ضمة" },       // damma
    { mark: "\u064C", name: "تنوين ضم" },  // dammatan
    { mark: "\u0650", name: "كسرة" },      // kasra
    { mark: "\u064D", name: "تنوين كسر" }, // kasratan
    { mark: "\u0652", name: "سكون" },      // sukun
    { mark: "\u0651", name: "شدة" },       // shadda
    { mark: "\u0670", name: "ألف خنجرية" } // dagger alif
  ];
  const DOTTED_CIRCLE = "\u25CC";

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
    if (kb) {
      // Google Translate (and similar page-translation tools) must never rewrite
      // the virtual keyboard's characters, hints, or controls. Belt-and-suspenders:
      // the container already carries notranslate/translate="no" in the static
      // markup, but since this whole subtree is rebuilt by JS, re-assert it here
      // too so the protection holds even if the markup ever changes.
      kb.classList.add("notranslate");
      kb.setAttribute("translate", "no");
    }
    const modeKeyboard = document.getElementById(opts.modeKeyboardId || "modeKeyboard");
    const modeTranslit = document.getElementById(opts.modeTranslitId || "modeTranslit");
    const modeHint = document.getElementById(opts.modeHintId || "modeHint");
    const charCount = document.getElementById(opts.charCountId || "charCount");
    const wordCount = document.getElementById(opts.wordCountId || "wordCount");
    const dirIndicator = document.getElementById(opts.dirIndicatorId || "dirIndicator");

    let undoStack = [""], redoStack = [], suppressPush = false, translitOn = false, fontSize = 24;

    function updateMeta() {
      const text = editor.value;
      if (charCount) charCount.textContent = text.length + " حرف";
      if (wordCount) wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0) + " كلمة";
    }
    function updateDirIndicator() {
      if (dirIndicator) dirIndicator.textContent = editor.dir === "rtl" ? "→ RTL" : "LTR ←";
    }
    function pushUndo() {
      if (suppressPush) return;
      undoStack.push(editor.value);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }
    editor.addEventListener("input", () => { updateMeta(); pushUndo(); });
    updateMeta();
    updateDirIndicator();

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
      updateDirIndicator();
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
      function makeKey(label, hintText, onClick, extraClass) {
        const btn = document.createElement("button");
        btn.className = "key notranslate" + (hintText ? " has-alt" : "") + (extraClass ? " " + extraClass : "");
        btn.type = "button";
        btn.setAttribute("aria-label", label);
        btn.setAttribute("translate", "no");
        btn.innerHTML = `<span class="dot"></span><span class="key-main">${label}</span><span class="hint lang-en">${hintText || ""}</span>`;
        btn.addEventListener("click", () => { onClick(); btn.classList.add("pressed"); setTimeout(() => btn.classList.remove("pressed"), 120); });
        return btn;
      }

      function addGroup(labelText, extraClass) {
        const group = document.createElement("div");
        group.className = "kb-group notranslate" + (extraClass ? " " + extraClass : "");
        group.setAttribute("translate", "no");
        if (labelText) {
          const label = document.createElement("div");
          label.className = "kb-group-label";
          label.textContent = labelText;
          group.appendChild(label);
        }
        kb.appendChild(group);
        return group;
      }

      function addRow(group) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "kb-row notranslate";
        rowDiv.setAttribute("translate", "no");
        group.appendChild(rowDiv);
        return rowDiv;
      }

      /* --- 1. Numbers (Arabic-Indic, TOP) --- */
      const numGroup = addGroup(null, "kb-group-numerals");
      const numRow = addRow(numGroup);
      NUMERALS.forEach(([ar, western]) => {
        numRow.appendChild(makeKey(ar, western, () => insertAtCursor(ar)));
      });

      /* --- 2. Arabic letters (BELOW numbers) — special hamza forms are part of
         this same section, on their own row, so they're always visible with
         the rest of the alphabet rather than hidden behind a separate tab.
         No text heading; the special forms row gets a thin top divider
         instead of a label so the grouping is still visually clear. --- */
      const mainGroup = addGroup(null);
      ROWS.forEach((rowArr) => {
        const rowDiv = addRow(mainGroup);
        rowArr.forEach((ch) => {
          rowDiv.appendChild(makeKey(ch, HINTS[ch] || "", () => insertAtCursor(ch)));
        });
      });
      const specialRow = addRow(mainGroup);
      specialRow.classList.add("kb-row-divider");
      SPECIAL_LETTERS.forEach((ch) => {
        specialRow.appendChild(makeKey(ch, SPECIAL_HINTS[ch] || "", () => insertAtCursor(ch)));
      });

      /* --- 3. Symbols / punctuation --- */
      const punctGroup = addGroup(null, "kb-group-punct");
      const punctRow = addRow(punctGroup);
      PUNCTUATION.forEach((ch) => {
        punctRow.appendChild(makeKey(ch, PUNCT_HINTS[ch] || "", () => insertAtCursor(ch)));
      });

      /* --- 4. Tashkeel / diacritics (BELOW the letters) --- */
      const diacGroup = addGroup(null, "kb-group-diacritics");
      const diacRow = addRow(diacGroup);
      DIACRITICS.forEach(({ mark, name }) => {
        const btn = document.createElement("button");
        btn.className = "key key-diacritic notranslate";
        btn.type = "button";
        btn.setAttribute("aria-label", name);
        btn.setAttribute("translate", "no");
        btn.innerHTML = `<span class="key-main diacritic-preview">${DOTTED_CIRCLE}${mark}</span><span class="hint">${name}</span>`;
        btn.addEventListener("click", () => { insertAtCursor(mark); btn.classList.add("pressed"); setTimeout(() => btn.classList.remove("pressed"), 120); });
        diacRow.appendChild(btn);
      });

      /* --- 5. Enter / Space / Delete (BOTTOM) --- */
      const controlGroup = addGroup(null, "kb-group-controls");
      const lastRow = addRow(controlGroup);
      const spaceBtn = document.createElement("button");
      spaceBtn.className = "key space notranslate"; spaceBtn.type = "button"; spaceBtn.textContent = "مسافة";
      spaceBtn.setAttribute("aria-label", "مسافة");
      spaceBtn.setAttribute("translate", "no");
      spaceBtn.addEventListener("click", () => insertAtCursor(" "));
      const backBtn = document.createElement("button");
      backBtn.className = "key wide notranslate"; backBtn.type = "button"; backBtn.textContent = "⌫ حذف";
      backBtn.setAttribute("aria-label", "حذف الحرف الأخير");
      backBtn.setAttribute("translate", "no");
      backBtn.addEventListener("click", () => {
        const pos = editor.selectionStart ?? editor.value.length;
        if (pos > 0) { editor.value = editor.value.slice(0, pos - 1) + editor.value.slice(pos); editor.selectionStart = editor.selectionEnd = pos - 1; updateMeta(); pushUndo(); }
        editor.focus();
      });
      const enterBtn = document.createElement("button");
      enterBtn.className = "key wide notranslate"; enterBtn.type = "button"; enterBtn.textContent = "↵ سطر جديد";
      enterBtn.setAttribute("aria-label", "سطر جديد");
      enterBtn.setAttribute("translate", "no");
      enterBtn.addEventListener("click", () => insertAtCursor("\n"));
      lastRow.appendChild(enterBtn); lastRow.appendChild(spaceBtn); lastRow.appendChild(backBtn);
    }

    return { editor, insertAtCursor, transliterate };
  }

  return { init, transliterate, buildMapTable, TRANSLIT_MAP };
})();
