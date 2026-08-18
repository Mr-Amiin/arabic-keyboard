/*
 * Arabic Calligraphy Studio — font & family registry.
 *
 * This file is the single source of truth for calligraphy families,
 * fonts, and variations. It is generated from a real audit pass (see
 * fonts/LICENSES.md "Audit methodology" and ARCHITECTURE.md), never
 * hand-guessed:
 *
 *   1. Every font file in assets/fonts/calligraphy/ was inspected with
 *      fontTools to list every OpenType GSUB feature it registers for
 *      the Arabic ('arab') script — not just what a spec sheet claims.
 *   2. Every one of those candidate features (ss01-ss10, cv01-cv99,
 *      salt, swsh, dlig, jalt, cswh, ...) was then actually applied
 *      through HarfBuzz (the real shaping engine, the same family used
 *      inside browsers) against four Arabic test phrases, and the
 *      resulting glyph-ID sequence was diffed against the feature-off
 *      baseline.
 *   3. A feature only appears below as a "variation" if that diff
 *      found a genuine glyph difference on at least one test phrase.
 *      Features that are present in the font's feature list but never
 *      change a single glyph on real Arabic text (e.g. digit/fraction
 *      features that don't touch Arabic letters at all) are excluded,
 *      not silently included with a fake label.
 *   4. Weight "variations" are real named instances of a variable
 *      font's wght axis (or genuinely separate static font files) —
 *      never a CSS font-weight or transform applied to a font that
 *      doesn't actually ship that weight.
 *
 * Every "variation" entry below is therefore either:
 *   (a) a distinct real font file (different type design), or
 *   (b) a real named instance of a variable font's weight axis, or
 *   (c) a real OpenType feature (stylistic set / character variant /
 *       stylistic alternate / discretionary ligature / justification
 *       alternate) confirmed via (2) above to change actual glyphs.
 *
 * `features` on a variation is the literal list of OpenType feature
 * tags to switch on (via CSS font-feature-settings) to render it — see
 * calligraphy-studio.js buildFeatureSettings(). An empty array means
 * "the font/weight's default shaping, no extra feature toggled."
 *
 * `meta` / `metaEn` are the real, feature-accurate labels shown in the
 * gallery (see prompt requirement: never "Variation 3", always the
 * actual OpenType feature name).
 *
 * To add a family or variation later: re-run the audit described in
 * fonts/LICENSES.md, then extend CALLIGRAPHY_FAMILIES below — the UI
 * (calligraphy-init.js) generates every selector from this file
 * automatically, nothing about a new family needs to be hand-wired
 * elsewhere.
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
          { id: "naskh-amiri", label: "أميري", file: "amiri/Amiri-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-amiri-ss01", label: "أميري — طقم 01", file: "amiri/Amiri-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "naskh-amiri-ss06", label: "أميري — طقم 06", file: "amiri/Amiri-Regular.woff2", weight: 400, features: ["ss06"], meta: "طقم أسلوبي 06", metaEn: "Stylistic Set 06" },
          { id: "naskh-amiri-bold", label: "أميري عريض", file: "amiri/Amiri-Bold.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-scheherazade", label: "شهرزاد", file: "scheherazadenew/ScheherazadeNew-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-scheherazade-cv44", label: "شهرزاد — متغيّر 44", file: "scheherazadenew/ScheherazadeNew-Regular.woff2", weight: 400, features: ["cv44"], meta: "متغيّر حرف 44", metaEn: "Character Variant 44" },
          { id: "naskh-scheherazade-cv48", label: "شهرزاد — متغيّر 48", file: "scheherazadenew/ScheherazadeNew-Regular.woff2", weight: 400, features: ["cv48"], meta: "متغيّر حرف 48", metaEn: "Character Variant 48" },
          { id: "naskh-scheherazade-bold", label: "شهرزاد عريض", file: "scheherazadenew/ScheherazadeNew-Bold.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-noto-regular", label: "نوتو نسخ — الوزن: عادي (400)", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-noto-medium", label: "نوتو نسخ — الوزن: متوسط (500)", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-noto-semibold", label: "نوتو نسخ — الوزن: شبه عريض (600)", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-noto-bold", label: "نوتو نسخ — الوزن: عريض (700)", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-noto-dlig", label: "نوتو نسخ — روابط اختيارية", file: "notonaskharabic/NotoNaskhArabic-Variable.woff2", weight: 400, features: ["dlig"], meta: "روابط اختيارية (Discretionary Ligatures)", metaEn: "Discretionary Ligatures" },
          { id: "naskh-lateef", label: "لطيف", file: "lateef/Lateef-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-lateef-cv44", label: "لطيف — متغيّر 44", file: "lateef/Lateef-Regular.woff2", weight: 400, features: ["cv44"], meta: "متغيّر حرف 44", metaEn: "Character Variant 44" },
          { id: "naskh-lateef-cv48", label: "لطيف — متغيّر 48", file: "lateef/Lateef-Regular.woff2", weight: 400, features: ["cv48"], meta: "متغيّر حرف 48", metaEn: "Character Variant 48" },
          { id: "naskh-harmattan", label: "هرمتان", file: "harmattan/Harmattan-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-harmattan-cv08", label: "هرمتان — متغيّر 08", file: "harmattan/Harmattan-Regular.woff2", weight: 400, features: ["cv08"], meta: "متغيّر حرف 08", metaEn: "Character Variant 08" },
          { id: "naskh-harmattan-cv12", label: "هرمتان — متغيّر 12", file: "harmattan/Harmattan-Regular.woff2", weight: 400, features: ["cv12"], meta: "متغيّر حرف 12", metaEn: "Character Variant 12" },
          { id: "naskh-harmattan-cv44", label: "هرمتان — متغيّر 44", file: "harmattan/Harmattan-Regular.woff2", weight: 400, features: ["cv44"], meta: "متغيّر حرف 44", metaEn: "Character Variant 44" },
          { id: "naskh-harmattan-cv48", label: "هرمتان — متغيّر 48", file: "harmattan/Harmattan-Regular.woff2", weight: 400, features: ["cv48"], meta: "متغيّر حرف 48", metaEn: "Character Variant 48" },
          { id: "naskh-elmessiri-regular", label: "المسيري — الوزن: عادي (400)", file: "elmessiri/ElMessiri-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-elmessiri-medium", label: "المسيري — الوزن: متوسط (500)", file: "elmessiri/ElMessiri-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-elmessiri-semibold", label: "المسيري — الوزن: شبه عريض (600)", file: "elmessiri/ElMessiri-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-elmessiri-bold", label: "المسيري — الوزن: عريض (700)", file: "elmessiri/ElMessiri-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-markazi-regular", label: "مركزي — الوزن: عادي (400)", file: "markazitext/MarkaziText-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-markazi-medium", label: "مركزي — الوزن: متوسط (500)", file: "markazitext/MarkaziText-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-markazi-semibold", label: "مركزي — الوزن: شبه عريض (600)", file: "markazitext/MarkaziText-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-markazi-bold", label: "مركزي — الوزن: عريض (700)", file: "markazitext/MarkaziText-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-mirza-regular", label: "ميرزا — الوزن: عادي (400)", file: "mirza/Mirza-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-mirza-dlig", label: "ميرزا — روابط اختيارية", file: "mirza/Mirza-Regular.woff2", weight: 400, features: ["dlig"], meta: "روابط اختيارية (Discretionary Ligatures)", metaEn: "Discretionary Ligatures" },
          { id: "naskh-mirza-ss01", label: "ميرزا — طقم 01", file: "mirza/Mirza-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "naskh-mirza-medium", label: "ميرزا — الوزن: متوسط (500)", file: "mirza/Mirza-Medium.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-mirza-semibold", label: "ميرزا — الوزن: شبه عريض (600)", file: "mirza/Mirza-SemiBold.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "naskh-mirza-bold", label: "ميرزا — الوزن: عريض (700)", file: "mirza/Mirza-Bold.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" }
        ]
      },
      {
        id: "kufi",
        label: "كوفي",
        labelEn: "Kufi",
        blurb: "خط هندسي بزوايا مستقيمة، مثالي للشعارات والعناوين.",
        available: true,
        variations: [
          { id: "kufi-reem-regular", label: "ريم كوفي — الوزن: عادي (400)", file: "reemkufi/ReemKufi-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-reem-medium", label: "ريم كوفي — الوزن: متوسط (500)", file: "reemkufi/ReemKufi-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-reem-semibold", label: "ريم كوفي — الوزن: شبه عريض (600)", file: "reemkufi/ReemKufi-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-reem-bold", label: "ريم كوفي — الوزن: عريض (700)", file: "reemkufi/ReemKufi-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-reem-cv01", label: "ريم كوفي — متغيّر 01", file: "reemkufi/ReemKufi-Variable.woff2", weight: 400, features: ["cv01"], meta: "متغيّر حرف 01", metaEn: "Character Variant 01" },
          { id: "kufi-reem-cv02", label: "ريم كوفي — متغيّر 02", file: "reemkufi/ReemKufi-Variable.woff2", weight: 400, features: ["cv02"], meta: "متغيّر حرف 02", metaEn: "Character Variant 02" },
          { id: "kufi-reem-cv03", label: "ريم كوفي — متغيّر 03", file: "reemkufi/ReemKufi-Variable.woff2", weight: 400, features: ["cv03"], meta: "متغيّر حرف 03", metaEn: "Character Variant 03" },
          { id: "kufi-reemink", label: "ريم كوفي إنك", file: "reemkufiink/ReemKufiInk-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-reemink-cv01", label: "ريم كوفي إنك — متغيّر 01", file: "reemkufiink/ReemKufiInk-Regular.woff2", weight: 400, features: ["cv01"], meta: "متغيّر حرف 01", metaEn: "Character Variant 01" },
          { id: "kufi-reemink-cv02", label: "ريم كوفي إنك — متغيّر 02", file: "reemkufiink/ReemKufiInk-Regular.woff2", weight: 400, features: ["cv02"], meta: "متغيّر حرف 02", metaEn: "Character Variant 02" },
          { id: "kufi-reemink-cv03", label: "ريم كوفي إنك — متغيّر 03", file: "reemkufiink/ReemKufiInk-Regular.woff2", weight: 400, features: ["cv03"], meta: "متغيّر حرف 03", metaEn: "Character Variant 03" },
          { id: "kufi-noto-regular", label: "نوتو كوفي — الوزن: عادي (400)", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-noto-medium", label: "نوتو كوفي — الوزن: متوسط (500)", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-noto-semibold", label: "نوتو كوفي — الوزن: شبه عريض (600)", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-noto-bold", label: "نوتو كوفي — الوزن: عريض (700)", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-noto-black", label: "نوتو كوفي — الوزن: أسود (900)", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 900, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-noto-dlig", label: "نوتو كوفي — روابط اختيارية", file: "notokufiarabic/NotoKufiArabic-Variable.woff2", weight: 400, features: ["dlig"], meta: "روابط اختيارية (Discretionary Ligatures)", metaEn: "Discretionary Ligatures" },
          { id: "kufi-mada-regular", label: "مدى — الوزن: عادي (400)", file: "mada/Mada-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-mada-medium", label: "مدى — الوزن: متوسط (500)", file: "mada/Mada-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-mada-semibold", label: "مدى — الوزن: شبه عريض (600)", file: "mada/Mada-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-mada-bold", label: "مدى — الوزن: عريض (700)", file: "mada/Mada-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-mada-black", label: "مدى — الوزن: أسود (900)", file: "mada/Mada-Variable.woff2", weight: 900, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-mada-ss04", label: "مدى — طقم 04", file: "mada/Mada-Variable.woff2", weight: 400, features: ["ss04"], meta: "طقم أسلوبي 04", metaEn: "Stylistic Set 04" },
          { id: "kufi-katibeh", label: "كاتبة", file: "katibeh/Katibeh-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-katibeh-dlig", label: "كاتبة — روابط اختيارية", file: "katibeh/Katibeh-Regular.woff2", weight: 400, features: ["dlig"], meta: "روابط اختيارية (Discretionary Ligatures)", metaEn: "Discretionary Ligatures" },
          { id: "kufi-katibeh-ss01", label: "كاتبة — طقم 01", file: "katibeh/Katibeh-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "kufi-qahiri", label: "قاهري", file: "qahiri/Qahiri-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "kufi-qahiri-salt", label: "قاهري — بدائل تصميمية", file: "qahiri/Qahiri-Regular.woff2", weight: 400, features: ["salt"], meta: "بدائل تصميمية (Stylistic Alternates)", metaEn: "Stylistic Alternates" },
          { id: "kufi-qahiri-ss01", label: "قاهري — طقم 01", file: "qahiri/Qahiri-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "kufi-qahiri-ss02", label: "قاهري — طقم 02", file: "qahiri/Qahiri-Regular.woff2", weight: 400, features: ["ss02"], meta: "طقم أسلوبي 02", metaEn: "Stylistic Set 02" },
          { id: "kufi-qahiri-ss03", label: "قاهري — طقم 03", file: "qahiri/Qahiri-Regular.woff2", weight: 400, features: ["ss03"], meta: "طقم أسلوبي 03", metaEn: "Stylistic Set 03" }
        ]
      },
      {
        id: "ruqaa",
        label: "رقعة",
        labelEn: "Ruq'ah",
        blurb: "خط سريع الكتابة بحروف مضغوطة، شائع في الاستخدام اليومي.",
        available: true,
        variations: [
          { id: "ruqaa-aref-regular", label: "عارف رقعة", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "ruqaa-aref-jalt", label: "عارف رقعة — بدائل التسطير", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: ["jalt"], meta: "بدائل المدّ للتسطير (Justification Alternates)", metaEn: "Justification Alternates" },
          { id: "ruqaa-aref-ss01", label: "عارف رقعة — طقم 01", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "ruqaa-aref-ss02", label: "عارف رقعة — طقم 02", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: ["ss02"], meta: "طقم أسلوبي 02", metaEn: "Stylistic Set 02" },
          { id: "ruqaa-aref-ss03", label: "عارف رقعة — طقم 03", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: ["ss03"], meta: "طقم أسلوبي 03", metaEn: "Stylistic Set 03" },
          { id: "ruqaa-aref-ss04", label: "عارف رقعة — طقم 04", file: "arefruqaa/ArefRuqaa-Regular.woff2", weight: 400, features: ["ss04"], meta: "طقم أسلوبي 04", metaEn: "Stylistic Set 04" },
          { id: "ruqaa-aref-bold", label: "عارف رقعة عريض", file: "arefruqaa/ArefRuqaa-Bold.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "ruqaa-arefink-regular", label: "عارف رقعة إنك", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "ruqaa-arefink-jalt", label: "عارف رقعة إنك — بدائل التسطير", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: ["jalt"], meta: "بدائل المدّ للتسطير (Justification Alternates)", metaEn: "Justification Alternates" },
          { id: "ruqaa-arefink-ss01", label: "عارف رقعة إنك — طقم 01", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "ruqaa-arefink-ss02", label: "عارف رقعة إنك — طقم 02", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: ["ss02"], meta: "طقم أسلوبي 02", metaEn: "Stylistic Set 02" },
          { id: "ruqaa-arefink-ss03", label: "عارف رقعة إنك — طقم 03", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: ["ss03"], meta: "طقم أسلوبي 03", metaEn: "Stylistic Set 03" },
          { id: "ruqaa-arefink-ss04", label: "عارف رقعة إنك — طقم 04", file: "arefruqaaink/ArefRuqaaInk-Regular.woff2", weight: 400, features: ["ss04"], meta: "طقم أسلوبي 04", metaEn: "Stylistic Set 04" },
          { id: "ruqaa-arefink-bold", label: "عارف رقعة إنك عريض", file: "arefruqaaink/ArefRuqaaInk-Bold.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" }
        ]
      },
      {
        id: "nastaliq",
        label: "نستعليق",
        labelEn: "Nastaliq",
        blurb: "خط مائل انسيابي شائع في الفارسية والأردية، بحروف متدلية.",
        available: true,
        variations: [
          { id: "nastaliq-noto-regular", label: "نوتو نستعليق — الوزن: عادي (400)", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "nastaliq-noto-medium", label: "نوتو نستعليق — الوزن: متوسط (500)", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "nastaliq-noto-semibold", label: "نوتو نستعليق — الوزن: شبه عريض (600)", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "nastaliq-noto-bold", label: "نوتو نستعليق — الوزن: عريض (700)", file: "notonastaliqurdu/NotoNastaliqUrdu-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "nastaliq-gulzar", label: "گلزار", file: "gulzar/Gulzar-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "nastaliq-gulzar-ss01", label: "گلزار — طقم 01", file: "gulzar/Gulzar-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" },
          { id: "nastaliq-gulzar-ss02", label: "گلزار — طقم 02", file: "gulzar/Gulzar-Regular.woff2", weight: 400, features: ["ss02"], meta: "طقم أسلوبي 02", metaEn: "Stylistic Set 02" },
          { id: "nastaliq-gulzar-ss03", label: "گلزار — طقم 03", file: "gulzar/Gulzar-Regular.woff2", weight: 400, features: ["ss03"], meta: "طقم أسلوبي 03", metaEn: "Stylistic Set 03" },
          { id: "nastaliq-iran", label: "نستعليق إيران", file: "irannastaliq/IranNastaliq-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" }
        ]
      },
      {
        id: "decorative",
        label: "زخرفي ومعاصر",
        labelEn: "Decorative / Contemporary Display",
        blurb: "خطوط جريئة ذات طابع فني وخطوط عرض معاصرة، مناسبة للعناوين والملصقات — بأسمائها الحقيقية، وليست بديلاً عن الديواني أو الثلث.",
        available: true,
        variations: [
          { id: "deco-blaka", label: "بلاكا", file: "blaka/Blaka-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-blaka-ink", label: "بلاكا إنك", file: "blakaink/BlakaInk-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-jomhuria", label: "جمهورية", file: "jomhuria/Jomhuria-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-rakkas", label: "رقّاص", file: "rakkas/Rakkas-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-rakkas-ss03", label: "رقّاص — طقم 03", file: "rakkas/Rakkas-Regular.woff2", weight: 400, features: ["ss03"], meta: "طقم أسلوبي 03", metaEn: "Stylistic Set 03" },
          { id: "deco-rakkas-ss08", label: "رقّاص — طقم 08", file: "rakkas/Rakkas-Regular.woff2", weight: 400, features: ["ss08"], meta: "طقم أسلوبي 08", metaEn: "Stylistic Set 08" },
          { id: "deco-cortoba", label: "قرطبة", file: "cortoba/Cortoba-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-vibes", label: "فايبز", file: "vibes/Vibes-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lalezar", label: "لاله‌زار", file: "lalezar/Lalezar-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lemonada-light", label: "ليمونادا — الوزن: رفيع (300)", file: "lemonada/Lemonada-Variable.woff2", weight: 300, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lemonada-regular", label: "ليمونادا — الوزن: عادي (400)", file: "lemonada/Lemonada-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lemonada-medium", label: "ليمونادا — الوزن: متوسط (500)", file: "lemonada/Lemonada-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lemonada-semibold", label: "ليمونادا — الوزن: شبه عريض (600)", file: "lemonada/Lemonada-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-lemonada-bold", label: "ليمونادا — الوزن: عريض (700)", file: "lemonada/Lemonada-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-baloo-regular", label: "بالو بهيجان 2 — الوزن: عادي (400)", file: "baloobhaijaan2/BalooBhaijaan2-Variable.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-baloo-medium", label: "بالو بهيجان 2 — الوزن: متوسط (500)", file: "baloobhaijaan2/BalooBhaijaan2-Variable.woff2", weight: 500, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-baloo-semibold", label: "بالو بهيجان 2 — الوزن: شبه عريض (600)", file: "baloobhaijaan2/BalooBhaijaan2-Variable.woff2", weight: 600, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-baloo-bold", label: "بالو بهيجان 2 — الوزن: عريض (700)", file: "baloobhaijaan2/BalooBhaijaan2-Variable.woff2", weight: 700, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "deco-baloo-extrabold", label: "بالو بهيجان 2 — الوزن: عريض إضافي (800)", file: "baloobhaijaan2/BalooBhaijaan2-Variable.woff2", weight: 800, features: [], meta: "افتراضي", metaEn: "Default" }
        ]
      },
      {
        id: "thuluth",
        label: "ثلث",
        labelEn: "Thuluth",
        blurb: "خط الثلث بحروفه المنحنية الانسيابية، أقدم أشكاله الرقمية المتوفرة برخصة مفتوحة موثّقة (GPL v2، مشروع Khotot). لا توجد فيه طقوم أسلوبية OpenType حقيقية — لذلك يظهر بمتغيّر افتراضي واحد بأمانة بدلًا من اختلاق متغيّرات.",
        available: true,
        variations: [
          { id: "thuluth-tholoth", label: "ثلث (Khotot)", file: "tholoth/Tholoth-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" }
        ]
      },
      {
        id: "quranic",
        label: "قرآني",
        labelEn: "Quranic / Tajweed-oriented Naskh",
        blurb: "نسخ مخصّص للنصوص القرآنية بتناسب حروف وتشكيل دقيق، مبني على نفس عائلة أميري.",
        available: true,
        variations: [
          { id: "quranic-amiri", label: "أميري قرآن", file: "quranic/AmiriQuran-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "quranic-amiri-ss01", label: "أميري قرآن — طقم 01", file: "quranic/AmiriQuran-Regular.woff2", weight: 400, features: ["ss01"], meta: "طقم أسلوبي 01", metaEn: "Stylistic Set 01" }
        ]
      },
      {
        id: "ajami",
        label: "الأجامي (كانو)",
        labelEn: "Ajami / Kano (Hausa calligraphic tradition)",
        blurb: "طراز خط مغاير اكتُشف أثناء البحث عن هذه الدفعة — تقليد \"العجمي\" في منطقة كانو (نيجيريا/النيجر)، بسِمات بصرية مختلفة تمامًا عن النسخ والكوفي وغيرهما. مُدرَج باسمه الحقيقي، وليس بديلاً عن الأندلسي أو المغربي (وكلاهما لا يزال بلا خط رقمي مرخّص مفتوح — انظر أدناه).",
        available: true,
        variations: [
          { id: "ajami-alkalami", label: "ألكلامي", file: "alkalami/Alkalami-Regular.woff2", weight: 400, features: [], meta: "افتراضي", metaEn: "Default" },
          { id: "ajami-alkalami-salt", label: "ألكلامي — بدائل تصميمية", file: "alkalami/Alkalami-Regular.woff2", weight: 400, features: ["salt"], meta: "بدائل تصميمية (Stylistic Alternates)", metaEn: "Stylistic Alternates" },
          { id: "ajami-alkalami-ss07", label: "ألكلامي — طقم 07", file: "alkalami/Alkalami-Regular.woff2", weight: 400, features: ["ss07"], meta: "طقم أسلوبي 07", metaEn: "Stylistic Set 07" }
        ]
      },
      {
        id: "jali-diwani",
        label: "ديواني جلي",
        labelEn: "Jali Diwani",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "diwani",
        label: "ديواني",
        labelEn: "Diwani",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "ijazah",
        label: "إجازة",
        labelEn: "Ijazah",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "shikasta",
        label: "شكسته",
        labelEn: "Shekasteh",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "andalusi",
        label: "أندلسي",
        labelEn: "Andalusi",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "maghribi",
        label: "مغربي",
        labelEn: "Maghribi",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "muhaqqaq",
        label: "محقق",
        labelEn: "Muhaqqaq",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
      {
        id: "rayhani",
        label: "ريحاني",
        labelEn: "Rayhani",
        blurb: "لم نجد بعد خطًا رقميًا مرخّصًا بترخيص مفتوح يسمح بإعادة التوزيع لهذا الطراز. راجع fonts/LICENSES.md لتفاصيل ما بحثنا عنه بالضبط.",
        available: false,
        variations: []
      },
  ];

  var FEATURE_LABELS = {
      "default": { ar: "افتراضي", en: "Default" },
      "ss01": { ar: "طقم أسلوبي 01", en: "Stylistic Set 01" },
      "ss02": { ar: "طقم أسلوبي 02", en: "Stylistic Set 02" },
      "ss03": { ar: "طقم أسلوبي 03", en: "Stylistic Set 03" },
      "ss04": { ar: "طقم أسلوبي 04", en: "Stylistic Set 04" },
      "ss06": { ar: "طقم أسلوبي 06", en: "Stylistic Set 06" },
      "ss07": { ar: "طقم أسلوبي 07", en: "Stylistic Set 07" },
      "ss08": { ar: "طقم أسلوبي 08", en: "Stylistic Set 08" },
      "cv01": { ar: "متغيّر حرف 01", en: "Character Variant 01" },
      "cv02": { ar: "متغيّر حرف 02", en: "Character Variant 02" },
      "cv03": { ar: "متغيّر حرف 03", en: "Character Variant 03" },
      "cv08": { ar: "متغيّر حرف 08", en: "Character Variant 08" },
      "cv12": { ar: "متغيّر حرف 12", en: "Character Variant 12" },
      "cv44": { ar: "متغيّر حرف 44", en: "Character Variant 44" },
      "cv48": { ar: "متغيّر حرف 48", en: "Character Variant 48" },
      "dlig": { ar: "روابط اختيارية (Discretionary Ligatures)", en: "Discretionary Ligatures" },
      "salt": { ar: "بدائل تصميمية (Stylistic Alternates)", en: "Stylistic Alternates" },
      "jalt": { ar: "بدائل المدّ للتسطير (Justification Alternates)", en: "Justification Alternates" },
      "weight": { ar: "وزن", en: "Weight" },
  };

  function buildFeatureSettings(features) {
    if (!features || !features.length) return "normal";
    // Single-quoted tag strings: these get embedded inside a
    // double-quoted style="..." attribute in SVG markup (see
    // calligraphy-studio.js buildSvg), so double quotes here would
    // break the XML. CSS accepts either quote style for feature tags.
    return features.map(function (tag) { return "'" + tag + "' 1"; }).join(", ");
  }

  function featureMeta(tag) {
    return FEATURE_LABELS[tag] || { ar: tag, en: tag };
  }


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

  function totalVariationCount() {
    var n = 0;
    for (var i = 0; i < CALLIGRAPHY_FAMILIES.length; i++) {
      if (CALLIGRAPHY_FAMILIES[i].available) n += CALLIGRAPHY_FAMILIES[i].variations.length;
    }
    return n;
  }

  global.CalligraphyData = {
    FAMILIES: CALLIGRAPHY_FAMILIES,
    PHRASES: READY_PHRASES,
    FEATURE_LABELS: FEATURE_LABELS,
    fontUrl: fontUrl,
    findVariation: findVariation,
    featureMeta: featureMeta,
    buildFeatureSettings: buildFeatureSettings,
    totalVariationCount: totalVariationCount
  };
})(window);
