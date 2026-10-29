/* ============================================================
   لوحة عربي — Arabic alphabet learning component
   Data: [letter, name, transliteration, initial, medial, final, example]
   Mounts onto #alphaGrid and (optionally) #letterDetail
   ============================================================ */
window.ArabicAlphabet = (function () {
  "use strict";

  const LETTERS = [
    ["ا", "ألف", "Alif", "ا", "ـا", "ـا", "أَسَد — أسد"],
    ["ب", "باء", "Ba", "بـ", "ـبـ", "ـب", "بَيْت — بيت"],
    ["ت", "تاء", "Ta", "تـ", "ـتـ", "ـت", "تُفَّاح — تفاح"],
    ["ث", "ثاء", "Tha", "ثـ", "ـثـ", "ـث", "ثَعْلَب — ثعلب"],
    ["ج", "جيم", "Jim", "جـ", "ـجـ", "ـج", "جَمَل — جمل"],
    ["ح", "حاء", "Ha (7)", "حـ", "ـحـ", "ـح", "حِصَان — حصان"],
    ["خ", "خاء", "Kha (5)", "خـ", "ـخـ", "ـخ", "خُبْز — خبز"],
    ["د", "دال", "Dal", "د", "ـد", "ـد", "دَار — دار"],
    ["ذ", "ذال", "Dhal", "ذ", "ـذ", "ـذ", "ذَهَب — ذهب"],
    ["ر", "راء", "Ra", "ر", "ـر", "ـر", "رَجُل — رجل"],
    ["ز", "زاي", "Zay", "ز", "ـز", "ـز", "زَهْرَة — زهرة"],
    ["س", "سين", "Sin", "سـ", "ـسـ", "ـس", "سَمَك — سمك"],
    ["ش", "شين", "Shin", "شـ", "ـشـ", "ـش", "شَمْس — شمس"],
    ["ص", "صاد", "Sad (9)", "صـ", "ـصـ", "ـص", "صَبَاح — صباح"],
    ["ض", "ضاد", "Dad", "ضـ", "ـضـ", "ـض", "ضَوْء — ضوء"],
    ["ط", "طاء", "Ta (6)", "طـ", "ـطـ", "ـط", "طَائِر — طائر"],
    ["ظ", "ظاء", "Za", "ظـ", "ـظـ", "ـظ", "ظِل — ظل"],
    ["ع", "عين", "Ayn (3)", "عـ", "ـعـ", "ـع", "عَيْن — عين"],
    ["غ", "غين", "Ghayn", "غـ", "ـغـ", "ـغ", "غَابَة — غابة"],
    ["ف", "فاء", "Fa", "فـ", "ـفـ", "ـف", "فِيل — فيل"],
    ["ق", "قاف", "Qaf", "قـ", "ـقـ", "ـق", "قَمَر — قمر"],
    ["ك", "كاف", "Kaf", "كـ", "ـكـ", "ـك", "كِتَاب — كتاب"],
    ["ل", "لام", "Lam", "لـ", "ـلـ", "ـل", "لَيْل — ليل"],
    ["م", "ميم", "Mim", "مـ", "ـمـ", "ـم", "مَاء — ماء"],
    ["ن", "نون", "Nun", "نـ", "ـنـ", "ـن", "نَجْمَة — نجمة"],
    ["ه", "هاء", "Ha", "هـ", "ـهـ", "ـه", "هِلَال — هلال"],
    ["و", "واو", "Waw", "و", "ـو", "ـو", "وَرْد — ورد"],
    ["ي", "ياء", "Ya", "يـ", "ـيـ", "ـي", "يَد — يد"]
  ];

  /* ---------- Spoken letter names ----------
     What is sent to the speech engine for each displayed letter. A bare glyph such as "ب"
     carries no vowels and no word context, so a text-to-speech engine has to guess how to
     read it and typically produces a syllable instead of the letter's name. These are the
     standard Arabic letter names, fully vowelled (fatha U+064E, kasra U+0650, damma U+064F,
     sukun U+0652) so the engine does not have to guess. Keys are the displayed letters and
     must stay in the same order as LETTERS. Edit this table only after listening to the
     result on a real voice: tests/arabic-alphabet/pronunciation-check.html. */
  const SPOKEN_NAMES = {
    "ا": "أَلِف",
    "ب": "بَاء",
    "ت": "تَاء",
    "ث": "ثَاء",
    "ج": "جِيم",
    "ح": "حَاء",
    "خ": "خَاء",
    "د": "دَال",
    "ذ": "ذَال",
    "ر": "رَاء",
    "ز": "زَاي",
    "س": "سِين",
    "ش": "شِين",
    "ص": "صَاد",
    "ض": "ضَاد",
    "ط": "طَاء",
    "ظ": "ظَاء",
    "ع": "عَيْن",
    "غ": "غَيْن",
    "ف": "فَاء",
    "ق": "قَاف",
    "ك": "كَاف",
    "ل": "لَام",
    "م": "مِيم",
    "ن": "نُون",
    "ه": "هَاء",
    "و": "وَاو",
    "ي": "يَاء"
  };

  function spokenNameFor(ch) {
    return Object.prototype.hasOwnProperty.call(SPOKEN_NAMES, ch) ? SPOKEN_NAMES[ch] : null;
  }

  /* ---------- Pronunciation (Web Speech API) ----------
     The page ships no audio files: every sound comes from the browser's own
     speech voices. Phones bundle an Arabic voice; many desktop browsers
     (Chrome/Edge on Windows or Linux without a language pack) have none, so a
     bare speak() with lang "ar-SA" produced silence and no error. This code
     picks an installed Arabic voice explicitly and tells the visitor when
     there is none, instead of failing silently. */
  const MSG_UNSUPPORTED = "النطق الصوتي غير مدعوم في هذا المتصفح";
  const MSG_NO_VOICE = "لا يتوفر صوت عربي في هذا الجهاز أو المتصفح — ثبّت حزمة صوت عربية أو جرّب متصفحًا آخر";
  const MSG_FAILED = "تعذّر تشغيل النطق — حاول مرة أخرى";
  const START_TIMEOUT_MS = 2500;

  let current = null;          // keeps the utterance referenced (Chrome may GC it mid-speech)
  let watchdog = 0;

  function notify(msg) { window.showToast?.(msg); }

  function pickArabicVoice() {
    let voices = [];
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { return { voices: [], voice: null }; }
    const isAr = (v) => /^ar([-_]|$)/i.test(v.lang || "");
    const voice = voices.find((v) => /^ar[-_]SA$/i.test(v.lang || ""))
      || voices.find(isAr) || null;
    return { voices, voice };
  }

  // Voices load asynchronously in Chromium; touching getVoices() early and listening
  // for "voiceschanged" makes sure the list is populated by the first click.
  function warmVoices() {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener?.("voiceschanged", () => { speechSynthesis.getVoices(); });
    } catch (e) { /* ignore */ }
  }

  // Must run synchronously inside the click/keypress handler so the browser counts
  // it as a user-initiated playback (autoplay policy).
  // Returns "ok" | "unsupported" | "no-voice" | "error".
  function speak(ch) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      notify(MSG_UNSUPPORTED);
      return "unsupported";
    }
    const text = spokenNameFor(ch);
    if (!text) { notify(MSG_FAILED); return "error"; }   // never speak a bare glyph
    const { voices, voice } = pickArabicVoice();
    // A loaded voice list with no Arabic entry means we cannot pronounce the letter.
    // An empty list is ambiguous (not loaded yet / not exposed), so we still try.
    if (voices.length && !voice) {
      notify(MSG_NO_VOICE);
      return "no-voice";
    }
    try {
      clearTimeout(watchdog);
      // Drop anything still queued so rapid clicks always speak the latest letter.
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      if (speechSynthesis.paused) speechSynthesis.resume();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice ? voice.lang : "ar-SA";
      if (voice) u.voice = voice;
      current = u;

      let settled = false;
      u.onstart = () => { settled = true; clearTimeout(watchdog); };
      u.onend = () => { settled = true; clearTimeout(watchdog); };
      u.onerror = (ev) => {
        settled = true; clearTimeout(watchdog);
        // "canceled"/"interrupted" just mean a newer click replaced this utterance.
        if (ev && (ev.error === "canceled" || ev.error === "interrupted")) return;
        if (current === u) notify(ev && ev.error === "language-unavailable" ? MSG_NO_VOICE : MSG_FAILED);
      };
      speechSynthesis.speak(u);
      // If the engine never starts (no usable voice), say so instead of staying silent.
      watchdog = setTimeout(() => { if (!settled && current === u) notify(voice ? MSG_FAILED : MSG_NO_VOICE); }, START_TIMEOUT_MS);
      return "ok";
    } catch (e) {
      notify(MSG_FAILED);
      return "error";
    }
  }

  function init(opts) {
    opts = opts || {};
    const grid = document.getElementById(opts.gridId || "alphaGrid");
    if (!grid) return null;
    warmVoices();
    const detail = document.getElementById(opts.detailId || "letterDetail");

    function showDetail(row) {
      if (!detail) return;
      const [ch, name, translit, initial, medial, final, example] = row;
      detail.innerHTML = `
        <div style="display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
          <div style="font-size:56px; font-family:var(--font-ar-display);">${ch}</div>
          <div>
            <h3 style="font-size:22px;">${name} <span class="lang-en" style="color:var(--ink-soft); font-size:14px;">(${translit})</span></h3>
            <p style="color:var(--ink-soft); margin:6px 0 0; font-size:14px;">مثال: ${example}</p>
          </div>
          <button class="btn sm" type="button" id="detailSpeak" aria-label="نطق الحرف">🔊 استماع</button>
        </div>
        <div class="form-grid">
          <div class="form-item"><div class="glyph">${ch}</div><div class="lbl lang-en">Isolated</div></div>
          <div class="form-item"><div class="glyph">${initial}</div><div class="lbl lang-en">Initial</div></div>
          <div class="form-item"><div class="glyph">${medial}</div><div class="lbl lang-en">Medial</div></div>
          <div class="form-item"><div class="glyph">${final}</div><div class="lbl lang-en">Final</div></div>
        </div>`;
      detail.classList.add("show");
      const speakBtn = document.getElementById("detailSpeak");
      if (speakBtn) {
        speakBtn.addEventListener("click", () => { speak(ch); });
      }
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    LETTERS.forEach((row) => {
      const [ch, name, translit] = row;
      const div = document.createElement("button");
      div.type = "button";
      div.className = "letter-card";
      div.innerHTML = `<div class="big">${ch}</div><div class="translit lang-en">${translit}</div>`;
      div.setAttribute("aria-label", name + " — " + translit);
      div.addEventListener("click", () => { speak(ch); showDetail(row); });
      grid.appendChild(div);
    });

    return { LETTERS, SPOKEN_NAMES, spokenNameFor, speak };
  }

  return { init, LETTERS, SPOKEN_NAMES, spokenNameFor, speak, pickArabicVoice };
})();
