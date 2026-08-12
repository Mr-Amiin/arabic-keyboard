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

  function speak(ch) {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(ch);
      u.lang = "ar-SA";
      speechSynthesis.speak(u);
      return true;
    }
    return false;
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
        speakBtn.addEventListener("click", () => {
          if (!speak(ch)) window.showToast?.("النطق الصوتي غير مدعوم في هذا المتصفح");
        });
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

    return { LETTERS, speak };
  }

  return { init, LETTERS };
})();
