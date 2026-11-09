/* Learn Arabic — vocabulary and sentence-pattern data (content only, no DOM). UNREVIEWED by a qualified Arabic teacher.
   reg: "msa" = Modern Standard Arabic (used in all exercises); "dialect" = regional, shown for information only and never quizzed.
   `ar` is vowelled; `plain` is the spelling without harakat; `punct` (e.g. a question mark) is displayed after `ar` but is not part of the word. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./vocab-packs.js"));
  else root.LearnVocab = factory(root.LearnVocabPacks);
})(typeof self !== "undefined" ? self : this, function (PK) {
  "use strict";
  const V1_TOPICS = [
    { id: "numbers", title: "Numbers 0–10", blurb: "Count from zero to ten.", note: "These are the bare counting forms. Numbers 3–10 follow special gender rules when counting nouns, which this course does not teach yet." },
    { id: "colours", title: "Colours", blurb: "Ten common colours.", note: "Colour words agree with the noun they describe. These are the masculine singular forms (for example the feminine of أَحْمَر is حَمْرَاء)." },
    { id: "family", title: "Family", blurb: "Close family members.", note: "Arabic has separate words for paternal and maternal relatives (for example عَمّ and خَال)." },
    { id: "greetings", title: "Greetings and everyday expressions", blurb: "Hello, thank you, how are you, and more.", note: "Some expressions change for a woman (for example كَيْفَ حَالُكِ؟). The forms here are for speaking to a man." }
  ];
  // [id, topic, ar, plain, translit, english, kind(word|phrase), punct, note]
  const RAW = [
    ["num-0", "numbers", "صِفْر", "صفر", "ṣifr", "zero", "word", "", "Written ٠ in Arabic-Indic digits."],
    ["num-1", "numbers", "وَاحِد", "واحد", "wāḥid", "one", "word", "", "Written ١."],
    ["num-2", "numbers", "اِثْنَان", "اثنان", "ithnān", "two", "word", "", "Written ٢. The first letter is a connecting alif (hamzat wasl)."],
    ["num-3", "numbers", "ثَلَاثَة", "ثلاثة", "thalātha", "three", "word", "", "Written ٣."],
    ["num-4", "numbers", "أَرْبَعَة", "أربعة", "arbaʿa", "four", "word", "", "Written ٤."],
    ["num-5", "numbers", "خَمْسَة", "خمسة", "khamsa", "five", "word", "", "Written ٥."],
    ["num-6", "numbers", "سِتَّة", "ستة", "sitta", "six", "word", "", "Written ٦."],
    ["num-7", "numbers", "سَبْعَة", "سبعة", "sabʿa", "seven", "word", "", "Written ٧."],
    ["num-8", "numbers", "ثَمَانِيَة", "ثمانية", "thamāniya", "eight", "word", "", "Written ٨."],
    ["num-9", "numbers", "تِسْعَة", "تسعة", "tisʿa", "nine", "word", "", "Written ٩."],
    ["num-10", "numbers", "عَشَرَة", "عشرة", "ʿashara", "ten", "word", "", "Written ١٠."],
    ["col-red", "colours", "أَحْمَر", "أحمر", "aḥmar", "red", "word", "", ""],
    ["col-blue", "colours", "أَزْرَق", "أزرق", "azraq", "blue", "word", "", ""],
    ["col-green", "colours", "أَخْضَر", "أخضر", "akhḍar", "green", "word", "", ""],
    ["col-yellow", "colours", "أَصْفَر", "أصفر", "aṣfar", "yellow", "word", "", ""],
    ["col-black", "colours", "أَسْوَد", "أسود", "aswad", "black", "word", "", ""],
    ["col-white", "colours", "أَبْيَض", "أبيض", "abyaḍ", "white", "word", "", ""],
    ["col-orange", "colours", "بُرْتُقَالِيّ", "برتقالي", "burtuqāliyy", "orange", "word", "", ""],
    ["col-pink", "colours", "وَرْدِيّ", "وردي", "wardiyy", "pink", "word", "", "From وَرْد (roses)."],
    ["col-brown", "colours", "بُنِّيّ", "بني", "bunniyy", "brown", "word", "", ""],
    ["col-grey", "colours", "رَمَادِيّ", "رمادي", "ramādiyy", "grey", "word", "", ""],
    ["fam-mother", "family", "أُمّ", "أم", "umm", "mother", "word", "", ""],
    ["fam-father", "family", "أَب", "أب", "ab", "father", "word", "", ""],
    ["fam-brother", "family", "أَخ", "أخ", "akh", "brother", "word", "", ""],
    ["fam-sister", "family", "أُخْت", "أخت", "ukht", "sister", "word", "", ""],
    ["fam-son", "family", "اِبْن", "ابن", "ibn", "son", "word", "", "The first letter is a connecting alif (hamzat wasl)."],
    ["fam-daughter", "family", "اِبْنَة", "ابنة", "ibna", "daughter", "word", "", "بِنْت is also used for “daughter” and “girl”."],
    ["fam-grandfather", "family", "جَدّ", "جد", "jadd", "grandfather", "word", "", ""],
    ["fam-grandmother", "family", "جَدَّة", "جدة", "jadda", "grandmother", "word", "", ""],
    ["fam-uncle-p", "family", "عَمّ", "عم", "ʿamm", "uncle (father’s brother)", "word", "", ""],
    ["fam-uncle-m", "family", "خَال", "خال", "khāl", "uncle (mother’s brother)", "word", "", ""],
    ["fam-husband", "family", "زَوْج", "زوج", "zawj", "husband", "word", "", ""],
    ["fam-wife", "family", "زَوْجَة", "زوجة", "zawja", "wife", "word", "", ""],
    ["greet-hello", "greetings", "مَرْحَبًا", "مرحبا", "marḥaban", "hello", "word", "", ""],
    ["greet-ahlan", "greetings", "أَهْلًا", "أهلا", "ahlan", "hi, welcome", "word", "", "Often extended to أَهْلًا وَسَهْلًا (welcome)."],
    ["greet-salam", "greetings", "السَّلَامُ عَلَيْكُمْ", "السلام عليكم", "as-salāmu ʿalaykum", "peace be upon you (a greeting)", "phrase", "", "A greeting used across the Arabic-speaking world."],
    ["greet-salam-reply", "greetings", "وَعَلَيْكُمُ السَّلَامُ", "وعليكم السلام", "wa-ʿalaykumu s-salām", "and upon you be peace (the reply)", "phrase", "", "The traditional reply to السَّلَامُ عَلَيْكُمْ."],
    ["greet-morning", "greetings", "صَبَاحُ الْخَيْرِ", "صباح الخير", "ṣabāḥu l-khayr", "good morning", "phrase", "", ""],
    ["greet-morning-reply", "greetings", "صَبَاحُ النُّورِ", "صباح النور", "ṣabāḥu n-nūr", "good morning (the reply; literally “morning of light”)", "phrase", "", ""],
    ["greet-evening", "greetings", "مَسَاءُ الْخَيْرِ", "مساء الخير", "masāʾu l-khayr", "good evening", "phrase", "", ""],
    ["greet-bye", "greetings", "مَعَ السَّلَامَةِ", "مع السلامة", "maʿa s-salāma", "goodbye (literally “with safety”)", "phrase", "", ""],
    ["greet-thanks", "greetings", "شُكْرًا", "شكرا", "shukran", "thank you", "word", "", ""],
    ["greet-welcome", "greetings", "عَفْوًا", "عفوا", "ʿafwan", "you’re welcome (also “excuse me”)", "word", "", ""],
    ["greet-please", "greetings", "مِنْ فَضْلِكَ", "من فضلك", "min faḍlika", "please (to a man)", "phrase", "", "To a woman: مِنْ فَضْلِكِ."],
    ["greet-yes", "greetings", "نَعَمْ", "نعم", "naʿam", "yes", "word", "", ""],
    ["greet-no", "greetings", "لَا", "لا", "lā", "no", "word", "", ""],
    ["greet-how", "greetings", "كَيْفَ حَالُكَ", "كيف حالك", "kayfa ḥāluka", "how are you? (to a man)", "phrase", "؟", "To a woman: كَيْفَ حَالُكِ؟"],
    ["greet-fine", "greetings", "بِخَيْرٍ", "بخير", "bi-khayrin", "fine, well (a reply to “how are you?”)", "word", "", ""],
    ["greet-hamd", "greetings", "الْحَمْدُ لِلَّهِ", "الحمد لله", "al-ḥamdu lillāhi", "praise be to God (also a common answer to “how are you?”)", "phrase", "", ""],
    ["greet-name-q", "greetings", "مَا اسْمُكَ", "ما اسمك", "mā smuka", "what is your name? (to a man)", "phrase", "؟", "To a woman: مَا اسْمُكِ؟"],
    ["greet-name-a", "greetings", "اِسْمِي أَحْمَد", "اسمي أحمد", "ismī aḥmad", "my name is Ahmad", "phrase", "", "Replace أَحْمَد with your own name."]
  ];
  // V1 topics and items keep their ids and content. Phase 3 adds a `group` (starter / everyday), a `difficulty` and the new packs after them.
  const V1_ITEMS = RAW.map(r => ({ id: r[0], topic: r[1], ar: r[2], plain: r[3], translit: r[4], en: r[5], kind: r[6], punct: r[7], note: r[8], reg: "msa", difficulty: "Easy" }));
  const TOPICS = V1_TOPICS.map(t => Object.assign({ group: "starter" }, t)).concat(PK ? PK.TOPICS : []);
  const ITEMS = V1_ITEMS.concat(PK ? PK.ITEMS : []);
  // Regional words and regional month names: display only, never quizzed, never scheduled (ids start "var-").
  const VARIANTS = PK ? PK.VARIANTS : [];

  // Regional greetings: shown for information on the greetings page, never used in exercises or reviews.
  const DIALECT = [
    { id: "dia-eg", topic: "greetings", ar: "إِزَّيَّك", plain: "إزيك", translit: "izzayyak", en: "how are you? (to a man)", reg: "dialect", region: "Egyptian Arabic", kind: "word", punct: "؟", note: "Not Modern Standard Arabic." },
    { id: "dia-lev", topic: "greetings", ar: "كِيفَك", plain: "كيفك", translit: "kīfak", en: "how are you? (to a man)", reg: "dialect", region: "Levantine Arabic (e.g. Lebanon, Syria, Jordan, Palestine)", kind: "word", punct: "؟", note: "Not Modern Standard Arabic." },
    { id: "dia-gulf", topic: "greetings", ar: "شْلُونَك", plain: "شلونك", translit: "shlōnak", en: "how are you? (to a man)", reg: "dialect", region: "Gulf and Iraqi Arabic", kind: "word", punct: "؟", note: "Not Modern Standard Arabic." }
  ];

  // Sentence patterns. Each example: [id, sentence, plain, translit, english, slot word to blank, pool of wrong words, punct]
  const PATTERNS = [
    { id: "this-m", title: "هَٰذَا + noun: “This is a …” (masculine)", template: "هَٰذَا + masculine noun",
      explain: "Use هَٰذَا (hādhā, “this”) before a masculine noun to say “This is a …”. Arabic has no word for “is” here: the sentence is just هَٰذَا followed by the noun. The noun usually ends in -un (ـٌ) when it means “a …”.",
      examples: [
        ["pat-this-m-1", "هَٰذَا كِتَابٌ", "هذا كتاب", "hādhā kitābun", "This is a book.", "كِتَابٌ", ["بَيْتٌ", "قَلَمٌ", "بَابٌ"], ""],
        ["pat-this-m-2", "هَٰذَا بَيْتٌ", "هذا بيت", "hādhā baytun", "This is a house.", "بَيْتٌ", ["كِتَابٌ", "قَلَمٌ", "بَابٌ"], ""],
        ["pat-this-m-3", "هَٰذَا قَلَمٌ", "هذا قلم", "hādhā qalamun", "This is a pen.", "قَلَمٌ", ["كِتَابٌ", "بَيْتٌ", "بَابٌ"], ""] ] },
    { id: "this-f", title: "هَٰذِهِ + noun: “This is a …” (feminine)", template: "هَٰذِهِ + feminine noun",
      explain: "Use هَٰذِهِ (hādhihi, “this”) before a feminine noun. Many feminine nouns end in ة (taa marbuta).",
      examples: [
        ["pat-this-f-1", "هَٰذِهِ سَيَّارَةٌ", "هذه سيارة", "hādhihi sayyāratun", "This is a car.", "سَيَّارَةٌ", ["مَدْرَسَةٌ", "حَقِيبَةٌ", "طَاوِلَةٌ"], ""],
        ["pat-this-f-2", "هَٰذِهِ مَدْرَسَةٌ", "هذه مدرسة", "hādhihi madrasatun", "This is a school.", "مَدْرَسَةٌ", ["سَيَّارَةٌ", "حَقِيبَةٌ", "طَاوِلَةٌ"], ""],
        ["pat-this-f-3", "هَٰذِهِ حَقِيبَةٌ", "هذه حقيبة", "hādhihi ḥaqībatun", "This is a bag.", "حَقِيبَةٌ", ["سَيَّارَةٌ", "مَدْرَسَةٌ", "طَاوِلَةٌ"], ""] ] },
    { id: "i-am", title: "أَنَا + noun: “I am a …”", template: "أَنَا + noun",
      explain: "أَنَا (anā) means “I”. The noun after it matches the speaker: طَالِبٌ is a male student and طَالِبَةٌ is a female student.",
      examples: [
        ["pat-i-am-1", "أَنَا طَالِبٌ", "أنا طالب", "anā ṭālibun", "I am a student (said by a man).", "طَالِبٌ", ["مُعَلِّمٌ", "طَبِيبٌ", "مُهَنْدِسٌ"], ""],
        ["pat-i-am-2", "أَنَا مُعَلِّمٌ", "أنا معلم", "anā muʿallimun", "I am a teacher (said by a man).", "مُعَلِّمٌ", ["طَالِبٌ", "طَبِيبٌ", "مُهَنْدِسٌ"], ""],
        ["pat-i-am-3", "أَنَا طَالِبَةٌ", "أنا طالبة", "anā ṭālibatun", "I am a student (said by a woman).", "طَالِبَةٌ", ["طَالِبٌ", "مُعَلِّمَةٌ", "طَبِيبَةٌ"], ""] ] },
    { id: "where-is", title: "أَيْنَ + noun؟ “Where is …?”", template: "أَيْنَ + the noun",
      explain: "أَيْنَ (ayna) means “where”. Put the noun after it with the definite article ال: أَيْنَ الْكِتَابُ؟ means “Where is the book?”.",
      examples: [
        ["pat-where-1", "أَيْنَ الْكِتَابُ", "اين الكتاب", "ayna l-kitābu", "Where is the book?", "الْكِتَابُ", ["الْبَيْتُ", "الْقَلَمُ", "الْمَدْرَسَةُ"], "؟"],
        ["pat-where-2", "أَيْنَ الْبَيْتُ", "اين البيت", "ayna l-baytu", "Where is the house?", "الْبَيْتُ", ["الْكِتَابُ", "الْقَلَمُ", "الْمَدْرَسَةُ"], "؟"],
        ["pat-where-3", "أَيْنَ الْمَدْرَسَةُ", "اين المدرسة", "ayna l-madrasatu", "Where is the school?", "الْمَدْرَسَةُ", ["الْكِتَابُ", "الْبَيْتُ", "الْقَلَمُ"], "؟"] ] }
  ].map(p => ({ id: p.id, title: p.title, template: p.template, explain: p.explain, examples: p.examples.map(e => ({ id: e[0], pattern: p.id, ar: e[1], plain: e[2], translit: e[3], en: e[4], slot: e[5], pool: e[6], punct: e[7] })) }));

  const PATTERN_ITEMS = [].concat.apply([], PATTERNS.map(p => p.examples));
  return { TOPICS, ITEMS, DIALECT, VARIANTS, PATTERNS, PATTERN_ITEMS, V1_TOPIC_IDS: V1_TOPICS.map(t => t.id) };
});
