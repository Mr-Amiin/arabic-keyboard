/*
 * Arabic Calligraphy Studio — font & family registry.
 *
 * This file is the single source of truth for which calligraphy
 * families exist, which genuine variations each one offers, and where
 * the underlying WOFF2 lives. Nothing here is fabricated: every
 * "variation" below is either a distinct real font file (a different
 * type design released under an open license) or a real named
 * instance of a variable font (an actual weight axis position the
 * font ships, not a CSS filter dressed up as a new style).
 *
 * To add a family or variation later: see fonts/LICENSES.md
 * ("Adding a new family later"), then extend CALLIGRAPHY_FAMILIES.
 *
 * Each variation entry:
 *   id            unique id, used as <style> family name + storage key
 *   label         Arabic label shown in the UI
 *   file          path under assets/fonts/calligraphy/<familyId>/
 *   weight        CSS font-weight to request (matches the static/instance)
 *
 * Note: there is intentionally no "sample" field here. Swatch/gallery
 * previews always render the user's live studioState.text (see
 * calligraphy-init.js: refreshVariationSamples) — never a hardcoded
 * per-variation demo word.
 */
(function (global) {
  "use strict";

  var FONT_BASE = (global.CALLIGRAPHY_ASSET_BASE || "../assets/") + "fonts/calligraphy/";

  var CALLIGRAPHY_FAMILIES = [
    {
      id: "naskh",
      label: "نسخ",
      labelEn: "Naskh",
      blurb: "الخط الأكثر انتشارًا، واضح ومتوازن ومناسب للنصوص الطويلة.",
      available: true,
      variations: [
        { id: "naskh-amiri", label: "أميري", file: "amiri/Amiri-Regular.woff2", weight: 400 },
        { id: "naskh-amiri-bold", label: "أميري عريض", file: "amiri/Amiri-Bold.woff2", weight: 700 },
        { id: "naskh-scheherazade", label: "شهرزاد", file: "scheherazadenew/ScheherazadeNew-Regular.woff2", weight: 400 },
        { id: "naskh-scheherazade-bold", label: "شهرزاد عريض", file: "scheherazadenew/ScheherazadeNew-Bold.woff2", weight: 700 },
        { id: "naskh-noto", label: "نوتو نسخ", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 400 },
        { id: "naskh-noto-bold", label: "نوتو نسخ عريض", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 700 },
        { id: "naskh-lateef", label: "لطيف", file: "lateef/Lateef-Regular.woff2", weight: 400 },
        { id: "naskh-harmattan", label: "هرمتان", file: "harmattan/Harmattan-Regular.woff2", weight: 400 },
        { id: "naskh-elmessiri", label: "المسيري", file: "elmessiri/ElMessiri-Variable.woff2", weight: 400 },
        { id: "naskh-elmessiri-bold", label: "المسيري عريض", file: "elmessiri/ElMessiri-Variable.woff2", weight: 700 },
        { id: "naskh-markazi", label: "مركزي", file: "markazitext/MarkaziText-Variable.woff2", weight: 500 }
      ]
    },
    {
      id: "kufi",
      label: "كوفي",
      labelEn: "Kufi",
      blurb: "خط هندسي بزوايا مستقيمة، مثالي للشعارات والعناوين.",
      available: true,
      variations: [
        { id: "kufi-reem", label: "ريم كوفي", file: "reemkufi/ReemKufi-Variable.woff2", weight: 400 },
        { id: "kufi-reem-bold", label: "ريم كوفي عريض", file: "reemkufi/ReemKufi-Variable.woff2", weight: 700 },
        { id: "kufi-reem-ink", label: "ريم كوفي إنك", file: "reemkufiink/ReemKufiInk-Regular.woff2", weight: 400 },
        { id: "kufi-noto", label: "نوتو كوفي", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 400 },
        { id: "kufi-noto-bold", label: "نوتو كوفي عريض", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 700 },
        { id: "kufi-mada", label: "مدى", file: "mada/Mada-Variable.woff2", weight: 500 },
        { id: "kufi-mada-bold", label: "مدى عريض", file: "mada/Mada-Variable.woff2", weight: 700 },
        { id: "kufi-katibeh", label: "كاتبة", file: "katibeh/Katibeh-Regular.woff2", weight: 400 }
      ]
    },
    {
      id: "ruqaa",
      label: "رقعة",
      labelEn: "Ruqaa",
      blurb: "خط سريع الكتابة بحروف مضغوطة، شائع في الاستخدام اليومي.",
      available: true,
      variations: [
        { id: "ruqaa-aref", label: "عارف رقعة", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400 },
        { id: "ruqaa-aref-bold", label: "عارف رقعة عريض", file: "arefruqaa/ArefRuqaa-Bold.woff2", weight: 700 },
        { id: "ruqaa-aref-ink", label: "عارف رقعة إنك", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400 },
        { id: "ruqaa-aref-ink-bold", label: "عارف رقعة إنك عريض", file: "arefruqaaink/ArefRuqaaInk-Bold.woff2", weight: 700 }
      ]
    },
    {
      id: "nastaliq",
      label: "نستعليق",
      labelEn: "Nastaliq",
      blurb: "خط مائل انسيابي شائع في الفارسية والأردية، بحروف متدلية.",
      available: true,
      variations: [
        { id: "nastaliq-noto", label: "نوتو نستعليق", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 400 },
        { id: "nastaliq-noto-bold", label: "نوتو نستعليق عريض", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 700 },
        { id: "nastaliq-gulzar", label: "گلزار", file: "gulzar/Gulzar-Regular.woff2", weight: 400 }
      ]
    },
    {
      id: "decorative",
      label: "زخرفي وعريض",
      labelEn: "Decorative / Bold calligraphic",
      blurb: "خطوط جريئة ذات طابع فني، مناسبة للعناوين والملصقات — بأسمائها الحقيقية، وليست بديلاً عن الديواني أو الثلث.",
      available: true,
      variations: [
        { id: "deco-blaka", label: "بلاكا", file: "blaka/Blaka-Regular.woff2", weight: 400 },
        { id: "deco-blaka-ink", label: "بلاكا إنك", file: "blakaink/BlakaInk-Regular.woff2", weight: 400 },
        { id: "deco-jomhuria", label: "جمهورية", file: "jomhuria/Jomhuria-Regular.woff2", weight: 400 },
        { id: "deco-rakkas", label: "رقّاص", file: "rakkas/Rakkas-Regular.woff2", weight: 400 }
      ]
    },
    {
      id: "thuluth",
      label: "ثلث",
      labelEn: "Thuluth",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    },
    {
      id: "jali-diwani",
      label: "ديواني جلي",
      labelEn: "Jali Diwani",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    },
    {
      id: "diwani",
      label: "ديواني",
      labelEn: "Diwani",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    },
    {
      id: "ijazah",
      label: "إجازة",
      labelEn: "Ijazah",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    },
    {
      id: "shikasta",
      label: "شكسته",
      labelEn: "Shikasta",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    },
    {
      id: "andalusi",
      label: "أندلسي",
      labelEn: "Andalusi",
      blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع.",
      available: false,
      variations: []
    }
  ];

  var READY_PHRASES = [
    "بسم الله الرحمن الرحيم",
    "الحمد لله",
    "سبحان الله",
    "الله أكبر",
    "لا إله إلا الله",
    "محمد رسول الله",
    "ما شاء الله",
    "إن شاء الله",
    "السلام عليكم",
    "رمضان كريم",
    "عيد مبارك"
  ];

  function fontUrl(familyId, file) {
    return FONT_BASE + file;
  }

  function findVariation(id) {
    for (var i = 0; i < CALLIGRAPHY_FAMILIES.length; i++) {
      var fam = CALLIGRAPHY_FAMILIES[i];
      for (var j = 0; j < fam.variations.length; j++) {
        if (fam.variations[j].id === id) return { family: fam, variation: fam.variations[j] };
      }
    }
    return null;
  }

  global.CalligraphyData = {
    FAMILIES: CALLIGRAPHY_FAMILIES,
    PHRASES: READY_PHRASES,
    fontUrl: fontUrl,
    findVariation: findVariation
  };
})(window);
