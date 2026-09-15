// Unicode "Arabic Joining Type" per character — the real linguistic
// property that decides whether a letter's calligraphic stroke extends
// to connect with the NEXT letter. This is what turns HarfBuzz's flat
// glyph list into genuine calligraphic PATCHES (see scene.js's
// computePatchIds()): a patch boundary belongs wherever the earlier
// letter in reading order does NOT extend a connection forward — never
// at raw Unicode-character boundaries, and never at word boundaries
// alone (a single word routinely contains several patches, and this
// table is exactly why).
//
// Values (matching the Unicode Joining_Type property):
//   D — Dual_Joining: connects to both the previous AND the next letter
//       (most Arabic letters: ب ت ث ج ح خ س ش ص ض ط ظ ع غ ف ق ك ل م ن ه ي ...)
//   R — Right_Joining: connects only to the previous letter, never
//       extends a stroke to the next one (ا آ أ إ ٱ د ذ ر ز و ؤ ة ى ...)
//   U — Non_Joining: does not participate in joining at all (spaces,
//       punctuation, digits, standalone hamza)
//   T — Transparent: combining marks/diacritics (fatha, damma, kasra,
//       sukun, shadda, tanwin, etc.) — invisible to the joining chain,
//       they always ride along with whichever base letter they attach
//       to and never start or end a patch on their own.
//
// This is a per-CHARACTER Unicode property table, not per-word and not
// per-phrase — it is what lets the patch algorithm generalize to any
// Arabic input rather than hard-coding specific words.

const RIGHT_JOINING = new Set([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, // آ أ ؤ إ ا
  0x0629, // ة
  0x062F, 0x0630, // د ذ
  0x0631, 0x0632, // ر ز
  0x0648, // و
  0x0649, // ى
  0x0671, 0x0672, 0x0673, 0x0675, // various alef wasla / high hamza forms
  0x0676, 0x0677, // waw variants (right-joining)
  0x0688, 0x0689, 0x068A, 0x068B, 0x068C, 0x068D, 0x068E, 0x068F, 0x0690, // dal/reh variants (Urdu/Sindhi etc.)
  0x0691, 0x0692, 0x0693, 0x0694, 0x0695, 0x0696, 0x0697, 0x0698, 0x0699, // reh/jeh variants
  0x06C0, // ۀ heh with yeh above
  0x06C3, // ۃ teh marbuta goal
  0x06C4, 0x06C5, 0x06C6, 0x06C7, 0x06C8, 0x06C9, 0x06CA, 0x06CB, // waw variants
  0x06CD, // yeh with tail (right-joining)
  0x06D2, 0x06D3, // ے yeh barree / yeh barree with hamza
  0x06D5, // ۵? (heh goal — right joining in Sindhi)
  0x0709, 0x070A, 0x070C, 0x070E, // Syriac-adjacent, harmless if unused
]);

const NON_JOINING = new Set([
  0x0621, // ء standalone hamza
  0x0020, 0x00A0, // space, nbsp
  0x0009, 0x000A, 0x000D, // tab/newline
]);

// Combining marks / diacritics (Transparent) — fatha, damma, kasra,
// sukun, shadda, tanwin, quranic annotation marks, superscript alef,
// small high marks, etc. Ranges chosen to cover standard Arabic
// diacritics without needing exhaustive Unicode block coverage.
function isTransparentMark(cp) {
  return (
    (cp >= 0x0610 && cp <= 0x061A) || // Quranic annotation signs
    (cp >= 0x064B && cp <= 0x065F) || // tanwin, fatha/damma/kasra, shadda, sukun, small marks
    cp === 0x0670 || // superscript alef
    (cp >= 0x06D6 && cp <= 0x06DC) || // small high marks
    (cp >= 0x06DF && cp <= 0x06E4) ||
    (cp >= 0x06E7 && cp <= 0x06E8) ||
    (cp >= 0x06EA && cp <= 0x06ED) ||
    (cp >= 0x08D3 && cp <= 0x08FF) // extended Arabic marks
  );
}

function isArabicLetterRange(cp) {
  return (
    (cp >= 0x0620 && cp <= 0x064A) || // main Arabic letter block
    (cp >= 0x066E && cp <= 0x06D3) || // extended letters (Persian/Urdu etc.)
    (cp >= 0x06EE && cp <= 0x06FC) ||
    (cp >= 0x0750 && cp <= 0x077F) || // Arabic Supplement
    (cp >= 0x08A0 && cp <= 0x08B4) // Arabic Extended-A letters
  );
}

/** Returns 'D' | 'R' | 'U' | 'T' for a single character. */
export function joiningTypeOf(ch) {
  if (!ch) return 'U';
  const cp = ch.codePointAt(0);
  if (isTransparentMark(cp)) return 'T';
  if (NON_JOINING.has(cp)) return 'U';
  if (RIGHT_JOINING.has(cp)) return 'R';
  if (isArabicLetterRange(cp)) return 'D';
  return 'U'; // anything else (digits, punctuation, Latin, etc.) doesn't join
}

/** Does this character extend a calligraphic connection to the NEXT
 * character in logical reading order? Only Dual-joining letters do —
 * this is the single rule the whole patch algorithm is built on. */
export function forwardJoins(ch) {
  return joiningTypeOf(ch) === 'D';
}

export function isMarkChar(ch) {
  return ch ? joiningTypeOf(ch) === 'T' : false;
}
