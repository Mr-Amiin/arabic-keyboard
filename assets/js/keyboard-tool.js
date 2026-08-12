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

  /* Main Arabic letter rows — standard Arabic keyboard layout.
     Each array is a fixed logical row: on the mobile keyboard these
     render as a single CSS Grid row (see .kb-row / addRow below) so the
     12/12/10 key counts below always stay together on one line and are
     never broken up by responsive wrapping. */
  const ROWS = [
    ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
    ["ذ", "ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
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

    /* ---------------------------------------------------------------
       Tashkeel highlight overlay
       -------------------------------------------------------------
       The editor stays a plain <textarea> so every native behaviour —
       typing, physical/virtual keyboard input, paste, undo/redo,
       selection, copy, cursor movement, Arabic shaping and RTL layout —
       keeps working exactly as before, completely untouched by this
       feature. A separate, non-interactive <div> is layered directly
       behind the textarea and kept in sync with its value, size and
       position on every change. The textarea's own glyphs are made
       transparent (only its caret stays visible) so the overlay's
       colored copy of the text shows through in the same place. Only
       Tashkeel (diacritic) characters are wrapped in a red span in the
       overlay; every base letter and everything else keeps the
       editor's existing text color. This is dynamic (re-rendered from
       editor.value on every change, from any input source) rather than
       hard-coded for sample text. */
    const TASHKEEL_RE = /[\u064B-\u0652\u0670]/g; // fatha/tanween/damma/tanween/kasra/tanween/sukun/shadda + dagger alif
    let highlightEl = null;
    if (editor.tagName === "TEXTAREA" && editor.parentElement) {
      const host = editor.parentElement;
      highlightEl = document.createElement("div");
      highlightEl.className = "editor editor-highlight notranslate";
      highlightEl.setAttribute("aria-hidden", "true");
      highlightEl.setAttribute("translate", "no");
      highlightEl.dir = editor.dir;
      host.insertBefore(highlightEl, editor);
      editor.classList.add("editor--highlighted");
    }
    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function renderHighlight() {
      if (!highlightEl) return;
      const text = editor.value;
      const escaped = escapeHtml(text).replace(TASHKEEL_RE, (m) => `<span class="tashkeel-mark">${m}</span>`);
      // A trailing newline needs a placeholder character, or the overlay's
      // last (empty) line collapses and its height stops matching the
      // textarea's.
      highlightEl.innerHTML = escaped + (/\n$/.test(text) ? "\u200b" : "");
    }
    function syncHighlightBox() {
      if (!highlightEl) return;
      highlightEl.style.width = editor.offsetWidth + "px";
      highlightEl.style.height = editor.offsetHeight + "px";
      highlightEl.style.top = editor.offsetTop + "px";
      highlightEl.style.left = editor.offsetLeft + "px";
      highlightEl.style.fontSize = getComputedStyle(editor).fontSize;
      highlightEl.scrollTop = editor.scrollTop;
      highlightEl.scrollLeft = editor.scrollLeft;
    }
    if (highlightEl) {
      renderHighlight();
      syncHighlightBox();
      editor.addEventListener("scroll", syncHighlightBox);
      if (window.ResizeObserver) {
        new ResizeObserver(syncHighlightBox).observe(editor);
      } else {
        window.addEventListener("resize", syncHighlightBox);
      }
    }

    function updateMeta() {
      const text = editor.value;
      if (charCount) charCount.textContent = text.length + " حرف";
      if (wordCount) wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0) + " كلمة";
      renderHighlight();
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
      if (highlightEl) highlightEl.dir = editor.dir;
      updateDirIndicator();
      window.showToast?.("الاتجاه: " + (editor.dir === "rtl" ? "من اليمين لليسار" : "من اليسار لليمين"));
    });
    bind(opts.fontMinusId || "btnFontMinus", () => { fontSize = Math.max(14, fontSize - 2); editor.style.fontSize = fontSize + "px"; syncHighlightBox(); });
    bind(opts.fontPlusId || "btnFontPlus", () => { fontSize = Math.min(40, fontSize + 2); editor.style.fontSize = fontSize + "px"; syncHighlightBox(); });

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
      function makeKey(label, hintText, onClick, extraClass, isPrimaryArabic) {
        const btn = document.createElement("button");
        btn.className = "key notranslate" + (extraClass ? " " + extraClass : "");
        btn.type = "button";
        btn.setAttribute("aria-label", label);
        btn.setAttribute("translate", "no");
        // isPrimaryArabic adds the dedicated .arabic-glyph class to just the
        // glyph span (never the button/hint) so only the main Arabic letter
        // or numeral goes red+bold; the transliteration hint is untouched.
        const glyphClass = "key-main" + (isPrimaryArabic ? " arabic-glyph" : "");
        btn.innerHTML = `<span class="${glyphClass}">${label}</span><span class="hint lang-en">${hintText || ""}</span>`;
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

      /* Each row is given an explicit CSS Grid column template matching
         its own key count (or a custom template, e.g. for the space bar
         row). This is the data-defined row structure: the row's contents
         decide how the row is divided, and the row is never allowed to
         reflow its own keys onto a second line — see .kb-row in
         styles.css, which uses `display:grid` with no wrapping mechanism
         at all on mobile, instead of flex-wrap. `gridTemplate` is applied
         as an inline style so it has no effect on the desktop flex
         layout, which is untouched. */
      function addRow(group, gridTemplate, extraClass) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "kb-row notranslate" + (extraClass ? " " + extraClass : "");
        rowDiv.setAttribute("translate", "no");
        if (gridTemplate) rowDiv.style.gridTemplateColumns = gridTemplate;
        group.appendChild(rowDiv);
        return rowDiv;
      }
      const equalCols = (n) => `repeat(${n}, minmax(0, 1fr))`;

      /* --- 1. Numbers (Arabic-Indic, TOP) --- */
      const numGroup = addGroup(null, "kb-group-numerals");
      const numRow = addRow(numGroup, equalCols(NUMERALS.length));
      NUMERALS.forEach(([ar, western]) => {
        numRow.appendChild(makeKey(ar, western, () => insertAtCursor(ar), null, true));
      });

      /* --- 2. Arabic letters (BELOW numbers) — special hamza forms are part of
         this same section, on their own row, so they're always visible with
         the rest of the alphabet rather than hidden behind a separate tab.
         No text heading; the special forms row gets a thin top divider
         instead of a label so the grouping is still visually clear. --- */
      const mainGroup = addGroup(null);
      ROWS.forEach((rowArr, i) => {
        /* The 3 hamza-carrying alef forms (SPECIAL_LETTERS) join the last
           letter row instead of getting their own row. A standalone
           3-key row would always render far narrower than the 12-key
           rows above it — full-width grid columns at 1/3 the item count
           means huge empty space either around it (centered) or between
           the keys (spread out), so it reads as a disconnected floating
           group rather than part of one keyboard. Folding them onto the
           end of the last row keeps every row's total key count (and so
           its rendered width) in the same ballpark, which is how real
           Arabic keyboards place these alternate alef forms anyway —
           grouped with the rest of the alphabet, not off on their own. */
        const isLastRow = i === ROWS.length - 1;
        const keys = isLastRow ? rowArr.concat(SPECIAL_LETTERS) : rowArr;
        const rowDiv = addRow(mainGroup, equalCols(keys.length));
        keys.forEach((ch) => {
          rowDiv.appendChild(makeKey(ch, HINTS[ch] || SPECIAL_HINTS[ch] || "", () => insertAtCursor(ch), null, true));
        });
      });

      /* --- 3. Symbols / punctuation --- */
      const punctGroup = addGroup(null, "kb-group-punct");
      const punctRow = addRow(punctGroup, equalCols(PUNCTUATION.length));
      PUNCTUATION.forEach((ch) => {
        punctRow.appendChild(makeKey(ch, PUNCT_HINTS[ch] || "", () => insertAtCursor(ch)));
      });

      /* --- 4. Tashkeel / diacritics (BELOW the letters) — kept as a
         single logical row via the same fixed grid-column approach, so
         the marks never scatter onto a second line by accident. --- */
      const diacGroup = addGroup(null, "kb-group-diacritics");
      const diacRow = addRow(diacGroup, equalCols(DIACRITICS.length));
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
      const lastRow = addRow(controlGroup, "minmax(0, 1.4fr) minmax(0, 5fr) minmax(0, 1.4fr)");
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
