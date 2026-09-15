// Phase 7, point 1: the Tashkeel (تشكيل) library — real Arabic
// diacritic/vowel marks, NOT a hand-drawn stand-in library. Every mark
// here is a genuine Unicode combining character; its actual on-canvas
// vector outline is never invented by this file — it's extracted at
// use-time straight from whichever real, already-licensed font the
// target patch (or the editor's current default) is using, via the
// exact same HarfBuzz shaping pipeline every glyph in this app goes
// through (see tashkeel-panel.js's probeMarkAvailability/shapeMark).
//
// The standard, Unicode-recommended way to render a combining mark in
// isolation is to shape it attached to a "dotted circle" placeholder
// base (U+25CC) and keep only the mark's own glyph (HarfBuzz always
// gives a combining Arabic mark xAdvance === 0 — the same real signal
// scene.js already uses everywhere else to identify diacritics). If a
// particular font's own glyph table doesn't actually produce a
// non-empty, zero-advance glyph for a given mark, that mark is
// unavailable for that font — never faked with placeholder geometry —
// and the panel greys it out rather than pretending it works.

export const TASHKEEL_MARKS = [
  { id: 'fatha', char: 'َ', labelAr: 'فتحة', labelEn: 'Fatha' },
  { id: 'damma', char: 'ُ', labelAr: 'ضمة', labelEn: 'Damma' },
  { id: 'kasra', char: 'ِ', labelAr: 'كسرة', labelEn: 'Kasra' },
  { id: 'sukun', char: 'ْ', labelAr: 'سكون', labelEn: 'Sukun' },
  { id: 'shadda', char: 'ّ', labelAr: 'شدة', labelEn: 'Shadda' },
  { id: 'fathatan', char: 'ً', labelAr: 'فتحتان', labelEn: 'Fathatan' },
  { id: 'dammatan', char: 'ٌ', labelAr: 'ضمتان', labelEn: 'Dammatan' },
  { id: 'kasratan', char: 'ٍ', labelAr: 'كسرتان', labelEn: 'Kasratan' },
  { id: 'maddah', char: 'ٓ', labelAr: 'مدة', labelEn: 'Maddah' },
  { id: 'hamza-above', char: 'ٔ', labelAr: 'همزة فوق', labelEn: 'Hamza Above' },
  { id: 'hamza-below', char: 'ٕ', labelAr: 'همزة تحت', labelEn: 'Hamza Below' },
  { id: 'small-alef', char: 'ٰ', labelAr: 'ألف خنجرية', labelEn: 'Small Alef (other)' },
];

// The dotted-circle placeholder base every mark is shaped against.
export const DOTTED_CIRCLE = '◌';

// Real, genuinely-combined Tashkeel — a doubled (shadda) consonant
// carrying its own short vowel or tanwin, e.g. "مُحَمَّدٌ"'s doubled dal
// (shadda + damma-tanwin). `chars` is the actual two-codepoint Unicode
// sequence (shadda, then the vowel/tanwin — the conventional Arabic
// input order for a doubled+voweled letter), shaped as ONE run against
// the dotted-circle placeholder exactly like a single mark. A font
// only "genuinely" supports a combo when shaping that real sequence
// produces TWO distinct non-empty zero-advance glyphs (both marks
// actually rendered, positioned by the font's own real mark-to-mark
// GPOS) — never a hand-placed guess at how two generic icons should
// stack. See tashkeel-panel.js's shapeCombo() for the probe itself.
export const TASHKEEL_COMBOS = [
  { id: 'shadda-fatha', chars: 'ّ' + 'َ', labelAr: 'شدة + فتحة', labelEn: 'Shadda + Fatha' },
  { id: 'shadda-damma', chars: 'ّ' + 'ُ', labelAr: 'شدة + ضمة', labelEn: 'Shadda + Damma' },
  { id: 'shadda-kasra', chars: 'ّ' + 'ِ', labelAr: 'شدة + كسرة', labelEn: 'Shadda + Kasra' },
  { id: 'shadda-fathatan', chars: 'ّ' + 'ً', labelAr: 'شدة + فتحتان', labelEn: 'Shadda + Fathatan' },
  { id: 'shadda-dammatan', chars: 'ّ' + 'ٌ', labelAr: 'شدة + ضمتان', labelEn: 'Shadda + Dammatan' },
  { id: 'shadda-kasratan', chars: 'ّ' + 'ٍ', labelAr: 'شدة + كسرتان', labelEn: 'Shadda + Kasratan' },
];

// Phase 15: the Tashkeel panel is organized into real calligraphic-
// style sections (matching a reference calligraphy-tool's layout),
// each backed by one of this project's own already-registered,
// already-licensed font families in assets/js/calligraphy-data.js —
// never an invented style. "الفارسي" (Farsi/Persian) is the
// traditional Arabic-calligraphy name for the Nastaliq style, which is
// why it points at the real `nastaliq` family rather than a family of
// its own; every other id here matches the registry's own family id
// exactly. A section is only ever rendered by tashkeel-panel.js when
// its family is `available: true` and has at least one real
// variation — see font-registry.js's getFamily().
export const STYLE_SECTIONS = [
  { id: 'ruqaa', label: 'الرقعة', labelEn: "Ruq'ah", familyId: 'ruqaa' },
  { id: 'thuluth', label: 'الثلث', labelEn: 'Thuluth', familyId: 'thuluth' },
  { id: 'naskh', label: 'النسخ', labelEn: 'Naskh', familyId: 'naskh' },
  { id: 'nastaliq', label: 'الفارسي', labelEn: 'Farsi (Nastaliq)', familyId: 'nastaliq' },
  { id: 'diwani', label: 'الديواني', labelEn: 'Diwani', familyId: 'diwani' },
];

// Phase 7.1 point 1 — investigated and DELIBERATELY not expanded.
// Candidates tested against every real font variation via HarfBuzz
// (shadda+sukun; hamza-above/below + a short vowel; maddah+hamza-
// above) all "passed" the same technical bar the six combos above
// use (>=2 distinct positioned zero-advance glyphs) on most fonts.
// But so did two deliberately nonsensical negative controls shaped
// the same way (fatha+damma; sukun+shadda) — on the SAME fonts, at
// the SAME near-universal rate. That proves the technical test alone
// only shows a font's generic Arabic mark-to-mark GPOS can stack any
// two combining marks without collision; it does NOT distinguish a
// linguistically real, traditionally-recognized combined Tashkeel
// form from an arbitrary, meaningless pair. Only shadda + a short
// vowel/tanwin has that independent linguistic grounding (standard
// Arabic vocalization of a geminated consonant), which is why those
// six remain the complete set. Adding any of the tested candidates on
// the strength of the shape test alone would be exactly the kind of
// invented combination the spec warns against. See
// tools/generate-tashkeel-audit.js and PHASE7.1's report for the full
// investigation and raw numbers.
