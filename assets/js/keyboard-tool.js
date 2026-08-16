/* ============================================================
   لوحة عربي — Arabic editor + virtual keyboard + transliteration
   Mounts onto any page containing the expected element IDs:
   #editor, #virtualKeyboard, #modeKeyboard, #modeTranslit, #modeHint
   Toolbar buttons are optional and wired only if present.

   ARCHITECTURE (mobile-safe by construction):
   The visible #editor is a plain, non-focusable <div> — never a
   <textarea>, never contenteditable, never given a tabindex that lets
   it receive keyboard focus. It is a pure DISPLAY SURFACE. Tapping it
   cannot open the Android/iOS system keyboard because it is never a
   native text-entry control in the first place.

   The only source of truth for the text is the in-memory `state`
   object below (state.text / state.cursor). Every input source —
   the virtual on-screen keyboard, the optional physical-keyboard
   listener, undo/redo, clear, paste — mutates that state object and
   then calls render(), which re-paints #editor's innerHTML from it.

     virtual key tap ─┐
     physical keydown ─┼─▶ state.text / state.cursor ─▶ render() ─▶ #editor
     undo/redo/clear ─┘

   No hidden/off-screen <input> or <textarea> is used to "catch" the
   virtual keyboard's output — that pattern is exactly what re-invites
   the OS IME. Arabic shaping/joining and RTL layout still work
   normally because the rendered content is normal Unicode Arabic
   text (direction:rtl; unicode-bidi:plaintext in CSS), not isolated
   glyphs.
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

  /* Combining diacritic range, used to detect and highlight Tashkeel in
     the rendered editor text (dynamic — re-derived on every render, from
     any input source, never hard-coded for sample text). */
  const TASHKEEL_RE = /[\u064B-\u0652\u0670]/g;

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

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

  /* A defensive, belt-and-suspenders layer only: if the visible editor
     were ever to receive native focus (e.g. a future markup change
     reintroduces a focusable attribute), blur it immediately so the
     system keyboard cannot linger. This is NOT the fix — the real fix
     is that #editor is never a native editable control to begin with —
     it just guards against regressions. Installed once, globally. */
  if (!window.__arabicEditorFocusGuardInstalled) {
    window.__arabicEditorFocusGuardInstalled = true;
    document.addEventListener("focusin", (event) => {
      if (event.target && event.target.closest && event.target.closest("#editor")) {
        event.target.blur();
      }
    });
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

    // Make absolutely sure the display surface can never become a native
    // editable/focusable control, no matter what the markup happened to
    // ship with (defensive — the templates already omit these).
    editor.removeAttribute("contenteditable");
    editor.removeAttribute("tabindex");
    if (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT") {
      // Should never happen with the current templates, but guarantees
      // this module never wires virtual-keyboard input into a native
      // field even if an older page markup is still cached somewhere.
      editor.readOnly = true;
      editor.setAttribute("readonly", "readonly");
      editor.setAttribute("inputmode", "none");
    }

    /* ---------------------------------------------------------------
       Single source of truth for the editor's text.
       Both the virtual keyboard and the optional physical-keyboard
       listener only ever mutate `state`; #editor only ever renders it.
       ------------------------------------------------------------- */
    const state = { text: "", cursor: 0 };
    let undoStack = [""], redoStack = [], suppressPush = false, translitOn = false, fontSize = 24;
    const placeholder = editor.getAttribute("data-placeholder") || editor.getAttribute("placeholder") || "";

    function clampCursor(pos) {
      return Math.max(0, Math.min(pos, state.text.length));
    }

    function render() {
      const text = state.text;
      if (!text) {
        editor.innerHTML =
          '<span class="editor-caret" aria-hidden="true"></span>' +
          '<span class="editor-placeholder">' + escapeHtml(placeholder) + "</span>";
        return;
      }
      const cursor = clampCursor(state.cursor);
      const before = escapeHtml(text.slice(0, cursor)).replace(TASHKEEL_RE, (m) => `<span class="tashkeel-mark">${m}</span>`);
      const after = escapeHtml(text.slice(cursor)).replace(TASHKEEL_RE, (m) => `<span class="tashkeel-mark">${m}</span>`);
      editor.innerHTML = before + '<span class="editor-caret" aria-hidden="true"></span>' + after;
    }

    function updateMeta() {
      const text = state.text;
      if (charCount) charCount.textContent = text.length + " حرف";
      if (wordCount) wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0) + " كلمة";
    }
    function updateDirIndicator() {
      if (dirIndicator) dirIndicator.textContent = editor.dir === "rtl" ? "→ RTL" : "LTR ←";
    }
    function pushUndo() {
      if (suppressPush) return;
      undoStack.push(state.text);
      if (undoStack.length > 100) undoStack.shift();
      redoStack = [];
    }

    /* Replaces the whole text (used by clear/undo/redo/paste flows that
       already know the full new string + desired cursor position). */
    function setText(newText, newCursor) {
      state.text = newText;
      state.cursor = newCursor == null ? newText.length : clampCursor(newCursor);
      render();
      updateMeta();
    }

    function insertAtCursor(str) {
      const pos = clampCursor(state.cursor);
      state.text = state.text.slice(0, pos) + str + state.text.slice(pos);
      state.cursor = pos + str.length;
      render();
      updateMeta();
      pushUndo();
    }

    function backspaceAtCursor() {
      const pos = clampCursor(state.cursor);
      if (pos <= 0) return;
      state.text = state.text.slice(0, pos - 1) + state.text.slice(pos);
      state.cursor = pos - 1;
      render();
      updateMeta();
      pushUndo();
    }

    function moveCursorTo(pos) {
      state.cursor = clampCursor(pos);
      render();
    }

    render();
    updateMeta();
    updateDirIndicator();

    /* ---------------------------------------------------------------
       Tap-to-place-caret: lets a user touch/click a spot in the
       rendered text to move the caret there, purely via geometry
       (caretRangeFromPoint / caretPositionFromPoint). This never
       focuses #editor and never turns it into a native field — it
       only recomputes state.cursor and re-renders. Falls back to
       "do nothing special" (caret stays put) on browsers without
       either API.
       ------------------------------------------------------------- */
    function textOffsetFromPoint(clientX, clientY) {
      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos && pos.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
        }
      }
      if (!range || !editor.contains(range.startContainer)) return null;
      let offset = 0;
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node === range.startContainer) return offset + range.startOffset;
        offset += node.textContent.length;
      }
      return null;
    }
    editor.addEventListener("click", (e) => {
      const off = textOffsetFromPoint(e.clientX, e.clientY);
      if (off != null) moveCursorTo(off);
    });

    function bind(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    }

    bind(opts.clearId || "btnClear", () => { setText("", 0); pushUndo(); window.showToast?.("تم مسح النص"); });
    bind(opts.undoId || "btnUndo", () => {
      if (undoStack.length > 1) { redoStack.push(undoStack.pop()); suppressPush = true; setText(undoStack[undoStack.length - 1]); suppressPush = false; }
    });
    bind(opts.redoId || "btnRedo", () => {
      if (redoStack.length) { const v = redoStack.pop(); undoStack.push(v); suppressPush = true; setText(v); suppressPush = false; }
    });
    bind(opts.copyId || "btnCopy", async () => {
      try { await navigator.clipboard.writeText(state.text); window.showToast?.("تم النسخ إلى الحافظة"); }
      catch (e) { window.showToast?.("تعذّر النسخ التلقائي"); }
    });
    bind(opts.pasteId || "btnPaste", async () => {
      try { const t = await navigator.clipboard.readText(); insertAtCursor(t); window.showToast?.("تم اللصق"); }
      catch (e) { window.showToast?.("تعذّر الوصول إلى الحافظة"); }
    });
    bind(opts.downloadId || "btnDownload", () => {
      const blob = new Blob([state.text], { type: "text/plain;charset=utf-8" });
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
      if (modeHint) modeHint.textContent = on ? "اكتب بأحرف لاتينية (a, b, 3, 7…) وسيتم تحويلها تلقائيًا" : "انقر الأزرار أو استخدم لوحة مفاتيحك الفعلية";
      if (kb) { kb.style.opacity = on ? "0.4" : "1"; kb.style.pointerEvents = on ? "none" : "auto"; }
    }
    if (modeKeyboard) modeKeyboard.addEventListener("click", () => setMode(false));
    if (modeTranslit) modeTranslit.addEventListener("click", () => setMode(true));

    /* ---------------------------------------------------------------
       Desktop physical-keyboard support (item 9 of the spec): a
       document-level listener, never a focus-dependent one, so #editor
       itself never needs to be focusable. Only fires when no other
       native editable field elsewhere on the page (a real
       <input>/<textarea>/contenteditable, like the transliteration or
       calligraphy tools) currently has focus, so it never steals
       keystrokes meant for those fields. Arabic keys typed directly
       are inserted as-is; when transliteration mode is on, Latin
       letters convert exactly like the virtual keyboard's translit
       mode always has. Mobile is untouched by this: on-screen virtual
       keys stay the only input path there, per the spec. ---------- */
    let translitBuffer = "";
    function isForeignEditableFocused() {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      if (el.closest && el.closest("#editor")) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }
    function handlePhysicalKeyboard(e) {
      if (isForeignEditableFocused()) return; // let other page fields work normally
      if (e.metaKey || e.ctrlKey || e.altKey) return; // don't hijack shortcuts (copy/paste/etc.)
      if (e.key === "Backspace") { e.preventDefault(); backspaceAtCursor(); translitBuffer = translitBuffer.slice(0, -1); return; }
      if (e.key === "Enter") { e.preventDefault(); insertAtCursor("\n"); translitBuffer = ""; return; }
      if (e.key === " ") { e.preventDefault(); insertAtCursor(" "); translitBuffer = ""; return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); moveCursorTo(state.cursor + (editor.dir === "rtl" ? 1 : -1)); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); moveCursorTo(state.cursor + (editor.dir === "rtl" ? -1 : 1)); return; }
      if (e.key.length !== 1) return; // ignore other control/function keys
      e.preventDefault();
      if (translitOn && /[a-zA-Z0-9']/.test(e.key)) {
        translitBuffer += e.key;
        // Re-derive the whole converted run so multi-letter digraphs
        // (th/kh/sh/gh) keep resolving correctly as more letters arrive.
        const pos = clampCursor(state.cursor);
        const already = translitBuffer.length - 1;
        const before = state.text.slice(0, pos - already);
        const after = state.text.slice(pos);
        const converted = transliterate(translitBuffer);
        state.text = before + converted + after;
        state.cursor = before.length + converted.length;
        render();
        updateMeta();
        pushUndo();
      } else {
        translitBuffer = "";
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
           letter row instead of getting their own row, so it isn't left
           as a lone 3-key row far narrower than the ones above it. */
        const isLastRow = i === ROWS.length - 1;
        const keys = isLastRow ? rowArr.concat(SPECIAL_LETTERS) : rowArr;
        const rowDiv = addRow(mainGroup);
        keys.forEach((ch) => {
          rowDiv.appendChild(makeKey(ch, HINTS[ch] || SPECIAL_HINTS[ch] || "", () => insertAtCursor(ch), null, true));
        });
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
      // Exposed for debugging/tests; not required for normal operation.
      getText: () => state.text,
      setText,
    };
  }

  return { init, transliterate, buildMapTable, TRANSLIT_MAP };
})();
