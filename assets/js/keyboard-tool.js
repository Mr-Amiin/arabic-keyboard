/* ============================================================
   لوحة عربي — Arabic editor + virtual keyboard + transliteration
   Mounts onto any page containing the expected element IDs:
   #editor, #virtualKeyboard, #modeKeyboard, #modeTranslit, #modeHint
   Toolbar buttons are optional and wired only if present.

   ARCHITECTURE (mobile-keyboard fix)
   -------------------------------------------------------------
   #editor is a plain, non-editable <div> (no contenteditable, no
   tabindex, never a <textarea>/<input>). It is a *display surface*
   only — it can never become a native text-entry field, so it can
   never trigger Android/Gboard (or any other on-screen IME).

   There is exactly one source of truth for the text:

       editorState = { text: "", cursor: 0 }

   The virtual keyboard (and, on desktop, an optional physical
   keyboard listener) both mutate editorState directly. Every
   mutation calls render(), which re-draws #editor from
   editorState.text. Nothing ever focuses a hidden input/textarea to
   receive input — insertion happens straight into the JS string.

       virtual key tap → editorState.text/.cursor → render()
       physical keydown (desktop) → editorState.text/.cursor → render()
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
  const TASHKEEL_RE = /[\u064B-\u0652\u0670]/g; // fatha/tanween/damma/tanween/kasra/tanween/sukun/shadda + dagger alif

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

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const placeholderText = editor.getAttribute("data-placeholder") || "";

    /* ---------------------------------------------------------------
       #editor is a non-editable display surface. It must NEVER become
       a native text-entry field (no contenteditable, no textarea/input,
       no tabindex that lets it receive keyboard focus). It cannot open
       Android/Gboard or any other on-screen IME because the browser
       never treats it as an editable control in the first place.
       ------------------------------------------------------------- */
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-readonly", "true");
    editor.setAttribute("aria-multiline", "true");
    if (editor.hasAttribute("contenteditable")) editor.removeAttribute("contenteditable");
    if (editor.hasAttribute("tabindex")) editor.removeAttribute("tabindex");

    /* Single source of truth for the text. Both the virtual keyboard
       and the optional desktop physical-keyboard listener mutate this
       object; #editor only ever renders it. */
    const editorState = { text: "", cursor: 0 };

    let undoStack = [""], redoStack = [], suppressPush = false, translitOn = false, fontSize = 24;

    function markupFor(segment) {
      return escapeHtml(segment).replace(TASHKEEL_RE, (m) => `<span class="tashkeel-mark">${m}</span>`);
    }

    /* Re-draws #editor from editorState.text/.cursor. This is the only
       place that writes into #editor's DOM — everything else (virtual
       keys, undo/redo, paste, physical typing) goes through
       editorState first and then calls render(). */
    function render() {
      const text = editorState.text;
      const cursor = Math.max(0, Math.min(editorState.cursor, text.length));
      const before = markupFor(text.slice(0, cursor));
      const after = markupFor(text.slice(cursor));
      editor.innerHTML = before + '<span class="editor-caret" aria-hidden="true"></span>' + after;
      editor.classList.toggle("is-empty", text.length === 0);
      updateMeta();
    }

    function setText(newText, newCursor, opts2) {
      opts2 = opts2 || {};
      editorState.text = newText;
      editorState.cursor = newCursor == null ? newText.length : newCursor;
      render();
      if (!opts2.skipUndo) pushUndo();
    }

    function insertAtCursor(str) {
      const pos = Math.max(0, Math.min(editorState.cursor, editorState.text.length));
      const before = editorState.text.slice(0, pos);
      const after = editorState.text.slice(pos);
      editorState.text = before + str + after;
      editorState.cursor = pos + str.length;
      render();
      pushUndo();
    }

    function backspaceAtCursor() {
      const pos = Math.max(0, Math.min(editorState.cursor, editorState.text.length));
      if (pos <= 0) return;
      editorState.text = editorState.text.slice(0, pos - 1) + editorState.text.slice(pos);
      editorState.cursor = pos - 1;
      render();
      pushUndo();
    }

    /* Best-effort: tapping/clicking inside the display surface moves
       the caret to the tapped character, the way a real text field
       would — without ever making #editor itself editable/focusable. */
    function offsetFromPoint(x, y) {
      let range = null;
      try {
        if (document.caretRangeFromPoint) {
          range = document.caretRangeFromPoint(x, y);
        } else if (document.caretPositionFromPoint) {
          const pos = document.caretPositionFromPoint(x, y);
          if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
        }
      } catch (e) { return null; }
      if (!range || !editor.contains(range.startContainer)) return null;

      let total = 0, found = false;
      (function walk(node) {
        if (found) return;
        if (node === range.startContainer && node.nodeType === Node.TEXT_NODE) {
          total += range.startOffset; found = true; return;
        }
        if (node.nodeType === Node.TEXT_NODE) { total += node.textContent.length; return; }
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains("editor-caret")) {
          if (node === range.startContainer) found = true;
          return; // caret marker contributes no characters
        }
        for (let i = 0; i < node.childNodes.length; i++) { walk(node.childNodes[i]); if (found) return; }
      })(editor);
      return found ? total : null;
    }
    editor.addEventListener("click", (e) => {
      const off = offsetFromPoint(e.clientX, e.clientY);
      if (off != null) { editorState.cursor = off; render(); }
    });

    /* Defensive layer only: #editor should never be focusable in the
       first place, but if anything (an extension, a future markup
       change, autofill, etc.) ever manages to focus it or a child of
       it, immediately blur so no IME can attach. */
    document.addEventListener("focusin", (event) => {
      if (event.target.closest && event.target.closest("#" + editor.id)) {
        event.target.blur();
      }
    });

    function updateMeta() {
      const text = editorState.text;
      if (charCount) charCount.textContent = text.length + " حرف";
      if (wordCount) wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0) + " كلمة";
    }
    function updateDirIndicator() {
      if (dirIndicator) dirIndicator.textContent = editor.dir === "rtl" ? "→ RTL" : "LTR ←";
    }
    function pushUndo() {
      if (suppressPush) return;
      undoStack.push(editorState.text);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }

    render();
    updateDirIndicator();

    function bind(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    }

    bind(opts.clearId || "btnClear", () => { setText("", 0); window.showToast?.("تم مسح النص"); });
    bind(opts.undoId || "btnUndo", () => {
      if (undoStack.length > 1) {
        redoStack.push(undoStack.pop());
        suppressPush = true;
        setText(undoStack[undoStack.length - 1]);
        suppressPush = false;
      }
    });
    bind(opts.redoId || "btnRedo", () => {
      if (redoStack.length) {
        const v = redoStack.pop();
        undoStack.push(v);
        suppressPush = true;
        setText(v);
        suppressPush = false;
      }
    });
    bind(opts.copyId || "btnCopy", async () => {
      try { await navigator.clipboard.writeText(editorState.text); window.showToast?.("تم النسخ إلى الحافظة"); }
      catch (e) {
        // Fallback for browsers without Clipboard API access: briefly
        // select the rendered text so the OS "copy" affordance works,
        // without ever making #editor an editable/focusable field.
        try {
          const range = document.createRange();
          range.selectNodeContents(editor);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("copy");
          sel.removeAllRanges();
          window.showToast?.("تم النسخ");
        } catch (e2) { window.showToast?.("تعذّر النسخ التلقائي"); }
      }
    });
    bind(opts.pasteId || "btnPaste", async () => {
      try { const t = await navigator.clipboard.readText(); insertAtCursor(t); window.showToast?.("تم اللصق"); }
      catch (e) { window.showToast?.("تعذّر الوصول إلى الحافظة — استخدم زر اللصق في متصفحك"); }
    });
    bind(opts.downloadId || "btnDownload", () => {
      const blob = new Blob([editorState.text], { type: "text/plain;charset=utf-8" });
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

    /* mode switch */
    function setMode(on) {
      translitOn = on;
      if (modeKeyboard) { modeKeyboard.classList.toggle("active", !on); modeKeyboard.setAttribute("aria-selected", String(!on)); }
      if (modeTranslit) { modeTranslit.classList.toggle("active", on); modeTranslit.setAttribute("aria-selected", String(on)); }
      if (modeHint) modeHint.textContent = on ? "اكتب بأحرف لاتينية (a, b, 3, 7…) وسيتم تحويلها تلقائيًا عبر لوحة مفاتيحك الفعلية" : "انقر الأزرار أو استخدم لوحة مفاتيحك الفعلية";
      if (kb) { kb.style.opacity = on ? "0.4" : "1"; kb.style.pointerEvents = on ? "none" : "auto"; }
    }
    if (modeKeyboard) modeKeyboard.addEventListener("click", () => setMode(false));
    if (modeTranslit) modeTranslit.addEventListener("click", () => setMode(true));

    /* ---------------------------------------------------------------
       Optional desktop physical-keyboard input. #editor is never a
       native field, so there is no browser focus to hook into — this
       is a document-level listener (per requirement 9) that maps
       physical key presses into the SAME editorState used by the
       virtual keyboard. It backs off whenever a real editable field
       elsewhere on the page (a form input, another contenteditable,
       etc.) has focus, so it never hijacks typing outside this tool. */
    function nativeFieldFocused() {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function handlePhysicalKeyboard(e) {
      if (nativeFieldFocused()) return;           // don't steal typing from a real field elsewhere
      if (e.ctrlKey || e.metaKey || e.altKey) return; // preserve browser/OS shortcuts

      if (e.key === "Backspace") { e.preventDefault(); backspaceAtCursor(); return; }
      if (e.key === "Enter") { e.preventDefault(); insertAtCursor("\n"); return; }
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); insertAtCursor(" "); return; }
      if (e.key === "ArrowLeft") { editorState.cursor = Math.max(0, editorState.cursor - 1); render(); return; }
      if (e.key === "ArrowRight") { editorState.cursor = Math.min(editorState.text.length, editorState.cursor + 1); render(); return; }

      if (e.key.length === 1) {
        if (translitOn && /[a-zA-Z0-9']/.test(e.key)) {
          // Build up the in-progress Latin "word" ending at the cursor so
          // multi-letter sequences (sh, th, kh, gh) convert correctly,
          // then replace it with its Arabic transliteration.
          const pos = editorState.cursor;
          const before = editorState.text.slice(0, pos);
          const after = editorState.text.slice(pos);
          const match = (before + e.key).match(/[a-zA-Z0-9']+$/);
          if (match) {
            const latinRun = match[0];
            const runStart = before.length + 1 - latinRun.length;
            const converted = transliterate(latinRun);
            const newBefore = before.slice(0, runStart) + converted;
            e.preventDefault();
            editorState.text = newBefore + after;
            editorState.cursor = newBefore.length;
            render();
            pushUndo();
            return;
          }
        }
        e.preventDefault();
        insertAtCursor(e.key);
      }
    }
    document.addEventListener("keydown", handlePhysicalKeyboard);

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
        // Virtual key taps go straight into editorState — never into a
        // hidden input/textarea. #editor is only ever a render target.
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
      backBtn.addEventListener("click", backspaceAtCursor);
      const enterBtn = document.createElement("button");
      enterBtn.className = "key wide notranslate"; enterBtn.type = "button"; enterBtn.textContent = "↵ سطر جديد";
      enterBtn.setAttribute("aria-label", "سطر جديد");
      enterBtn.setAttribute("translate", "no");
      enterBtn.addEventListener("click", () => insertAtCursor("\n"));
      lastRow.appendChild(enterBtn); lastRow.appendChild(spaceBtn); lastRow.appendChild(backBtn);
    }

    return {
      editor,
      insertAtCursor,
      transliterate,
      getText: () => editorState.text,
      setText: (t) => setText(t, t.length)
    };
  }

  return { init, transliterate, buildMapTable, TRANSLIT_MAP };
})();
