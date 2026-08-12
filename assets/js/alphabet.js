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

  /* ------------------------------------------------------------
     Speech: pronounce the letter using the Web Speech API.

     Two things make the previous version silent in practice:

     1. It spoke the bare glyph (e.g. "ب") on its own. An isolated
        Arabic consonant has no vowel to voice, so most speech
        engines either skip it or render nothing audible. We speak
        the letter's *name* instead (e.g. "باء" for ب) — that is
        exactly how a person pronounces an Arabic letter out loud,
        and it's a real word every Arabic voice can render.
     2. It called speechSynthesis.speak() without ever selecting an
        Arabic voice or waiting for the voice list to load. On many
        browsers getVoices() returns an empty array until the async
        'voiceschanged' event fires, so `u.lang = "ar-SA"` alone
        silently falls back to whatever the default (often
        non-Arabic) voice is — or nothing at all.
     ------------------------------------------------------------ */
  let cachedVoices = [];
  let voicesReady = false;

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    const list = window.speechSynthesis.getVoices();
    if (list && list.length) {
      cachedVoices = list;
      voicesReady = true;
    }
  }

  function pickArabicVoice() {
    refreshVoices();
    if (!cachedVoices.length) return null;
    // Prefer an exact/regional Arabic match, then any ar-* voice.
    return (
      cachedVoices.find((v) => /^ar-SA$/i.test(v.lang)) ||
      cachedVoices.find((v) => /^ar[_-]/i.test(v.lang) || /^ar$/i.test(v.lang)) ||
      cachedVoices.find((v) => /arabic/i.test(v.name || "")) ||
      null
    );
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    // Voice list loads asynchronously in most browsers (Chrome in
    // particular); this event fires once it's actually populated.
    window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }

  function speak(text, callbacks) {
    callbacks = callbacks || {};
    const onStatus = callbacks.onStatus || function () {};
    if (!("speechSynthesis" in window)) {
      onStatus("unsupported");
      return false;
    }
    // Stop anything currently queued/speaking so rapid clicks (on the
    // same letter or a different one) don't pile up utterances that
    // play back-to-back after the fact.
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickArabicVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      // No dedicated Arabic voice found on this device/browser — still
      // set the language so the engine at least attempts it with
      // whatever default voice it has, instead of doing nothing.
      utter.lang = "ar-SA";
    }
    utter.rate = 0.85;
    utter.pitch = 1;
    utter.volume = 1;

    // The button must not be able to silently do nothing: we actively
    // confirm playback actually started. Most engines fire `onstart`
    // within a few ms; if neither `onstart` nor `onerror` fires within
    // this window, speech never really began (a known failure mode on
    // some Chrome builds/platforms with no Arabic voice installed —
    // speak() is accepted but nothing plays and no error is raised).
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      onStatus("timeout");
    }, 1500);

    utter.onstart = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      onStatus("ok");
    };
    utter.onerror = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      onStatus("error", e);
    };

    try {
      window.speechSynthesis.speak(utter);
      // Some browsers (notably Chrome) can leave the queue paused;
      // resuming here is a known workaround so speak() reliably fires.
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (e) {
      clearTimeout(watchdog);
      onStatus("error", e);
      return false;
    }
    return true;
  }

  const NO_ARABIC_VOICE_MSG = "لا يبدو أن هذا الجهاز أو المتصفح يوفر نطقًا صوتيًا للعربية. جرّب متصفح Chrome على جهاز آخر، أو راجع إعدادات أصوات القراءة في نظامك.";
  const UNSUPPORTED_MSG = "النطق الصوتي غير مدعوم في هذا المتصفح.";

  function speakLetter(row, statusEl) {
    const [ch, name] = row;
    const setStatus = (msg, isError) => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("is-error", !!isError);
    };
    setStatus(""); // clear any previous status before trying again
    // Speak the letter's *name* (its real, audible pronunciation) —
    // e.g. "جيم" for ج — not the bare glyph. An isolated consonant has
    // no vowel to voice, so speech engines render nothing for it; the
    // name is a real word every Arabic voice can actually pronounce,
    // and is exactly how a person says an Arabic letter aloud.
    return speak(name || ch, {
      onStatus: (status) => {
        if (status === "unsupported") {
          setStatus("🔇 " + UNSUPPORTED_MSG, true);
          window.showToast?.(UNSUPPORTED_MSG);
        } else if (status === "timeout" || status === "error") {
          setStatus("🔇 " + NO_ARABIC_VOICE_MSG, true);
          window.showToast?.("تعذّر تشغيل الصوت — قد لا يوفر جهازك نطقًا عربيًا");
        } else if (status === "ok") {
          setStatus("");
        }
      }
    });
  }

  function init(opts) {
    opts = opts || {};
    const grid = document.getElementById(opts.gridId || "alphaGrid");
    if (!grid) return null;
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
          <span id="speakStatus" class="speak-status" role="status" aria-live="polite"></span>
        </div>
        <div class="form-grid">
          <div class="form-item"><div class="glyph">${ch}</div><div class="lbl lang-en">Isolated</div></div>
          <div class="form-item"><div class="glyph">${initial}</div><div class="lbl lang-en">Initial</div></div>
          <div class="form-item"><div class="glyph">${medial}</div><div class="lbl lang-en">Medial</div></div>
          <div class="form-item"><div class="glyph">${final}</div><div class="lbl lang-en">Final</div></div>
        </div>`;
      detail.classList.add("show");
      const speakBtn = document.getElementById("detailSpeak");
      const statusEl = document.getElementById("speakStatus");
      // Bound directly to the click event (a genuine user gesture),
      // which is what lets speechSynthesis.speak() play despite
      // browser autoplay-restriction policies.
      if (speakBtn) speakBtn.addEventListener("click", () => speakLetter(row, statusEl));
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    LETTERS.forEach((row) => {
      const [ch, name, translit] = row;
      const div = document.createElement("button");
      div.type = "button";
      div.className = "letter-card";
      div.innerHTML = `<div class="big">${ch}</div><div class="translit lang-en">${translit}</div>`;
      div.setAttribute("aria-label", name + " — " + translit);
      // Selecting a letter opens/updates its detail card; the استماع
      // button inside that card is what plays the sound (see spec).
      div.addEventListener("click", () => {
        // Switching letters stops any pronunciation still in progress
        // from the previously selected letter, so a stale word never
        // plays after the panel has already moved on.
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        grid.querySelectorAll(".letter-card.selected").forEach((el) => el.classList.remove("selected"));
        div.classList.add("selected");
        showDetail(row);
      });
      grid.appendChild(div);
    });

    return { LETTERS, speak: speakLetter };
  }

  return { init, LETTERS, speak: speakLetter };
})();
