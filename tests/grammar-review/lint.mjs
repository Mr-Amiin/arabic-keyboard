// STRUCTURE-ONLY consistency lint between vowelled Arabic and its transliteration. It compares consonant skeletons and short-vowel sequences,
// so it catches a wrong, missing or extra consonant or vowel (a typo on either side). It is NOT a linguistic check: it cannot say whether
// a sentence is correct or natural. This is an independent copy of the rule the review-package generator uses, so the two can be compared.
export const MARKS = /[\u064B-\u0652\u0670]/;
const LETTER = { "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "ḥ", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "ṣ", "ض": "ḍ", "ط": "ṭ", "ظ": "ẓ", "ع": "ʿ", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "t" };
const SKIP = new Set(["ا", "آ", "أ", "إ", "ؤ", "ئ", "ء", "ى", "ـ"]);
const collapse = (t) => t.filter((x, i) => i === 0 || x !== t[i - 1]);
export const stripMarks = (s) => s.replace(/[\u064B-\u0652\u0670]/g, "");

export const arabicSkeleton = (text) => {
  const out = [];
  for (let word of text.normalize("NFC").split(/\s+/)) {
    word = word.replace(/[؟،؛!?.,]/g, ""); if (!word) continue;
    if (word.startsWith("ال") && word.length > 2) word = word.slice(2);
    const ch = [...word];
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]; if (MARKS.test(c) || SKIP.has(c)) continue;
      let j = i + 1, marks = ""; while (j < ch.length && MARKS.test(ch[j])) marks += ch[j++];
      if (c === "و" || c === "ي") { if (/[\u064B-\u0652]/.test(marks)) out.push(c === "و" ? "w" : "y"); }
      else if (LETTER[c]) out.push(LETTER[c]); else throw new Error("unmapped Arabic character " + JSON.stringify(c) + " in " + text);
      if (/[\u064B\u064C\u064D]/.test(marks)) out.push("n");
    }
  }
  return collapse(out);
};
export const translitSkeleton = (text) => {
  const t = text.normalize("NFC").toLowerCase().replace(/[?!.,؟]/g, "").replace(/(^|\s)a?(?:sh|dh|th|[lnsdrzṭṣḍẓt])-/g, "$1").replace(/[\s-]+/g, "").replace(/ʾ/g, "");
  const out = []; let i = 0;
  while (i < t.length) { const two = t.slice(i, i + 2); if (["sh", "kh", "gh", "dh", "th"].includes(two)) { out.push(two); i += 2; continue; } const c = t[i++]; if ("aāiīuū".includes(c)) continue; if ("btjḥdrzsṣḍṭẓʿfqklmnhwy".includes(c)) out.push(c); else throw new Error("unexpected transliteration character " + JSON.stringify(c) + " in " + text); }
  return collapse(out);
};
const VOWEL = { "\u064E": "a", "\u064B": "a", "\u064F": "u", "\u064C": "u", "\u0650": "i", "\u064D": "i" };
export const arabicVowels = (s) => [...s.normalize("NFC")].filter((c) => VOWEL[c]).map((c) => VOWEL[c]).join("");
export const translitVowels = (s) => [...s.normalize("NFC").toLowerCase().replace(/(^|\s)a?(?:sh|dh|th|[lnsdrzṭṣḍẓt])-/g, "$1")].filter((c) => "aāiīuū".includes(c)).map((c) => ({ ā: "a", ī: "i", ū: "u" }[c] || c)).join("");
export const consonantsMatch = (ar, tr) => arabicSkeleton(ar).join(" ") === translitSkeleton(tr).join(" ");
export const vowelsMatch = (ar, tr) => arabicVowels(ar) === translitVowels(tr);
