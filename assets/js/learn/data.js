/* Learn Arabic — curriculum data (content only, no DOM).
   Modern Standard Arabic (MSA). Letter forms are DERIVED from the isolated letter
   plus the `connects` flag, so they cannot drift out of sync. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LearnData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const TATWEEL = "\u0640";
  const FATHA = "\u064E", KASRA = "\u0650", DAMMA = "\u064F", SUKUN = "\u0652", SHADDA = "\u0651";
  // Letters that never join to the FOLLOWING letter.
  const NON_CONNECTING = ["ا", "د", "ذ", "ر", "ز", "و"];

  // id, letter, nameAr, nameEn, sound (short, unique), roman consonant, difficulty, dots, say (pronunciation guidance), examples
  // example = [plain, vowelled, transliteration, meaning, position of the letter]
  const RAW = [
    ["alif","ا","ألف","Alif","long ā, as in “father”","ā","Easy","no dots",
      "Alif is mostly a long “aa” vowel and never starts with a consonant sound of its own. The glottal stop at the start of words (as in أَسَد) is written with hamza on alif: أ إ.",
      [["أسد","أَسَد","asad","lion","initial"],["باب","بَاب","baab","door","medial"]]],
    ["ba","ب","باء","Ba","b, as in “boy”","b","Easy","one dot below",
      "Same as English b.",[["بيت","بَيْت","bayt","house","initial"],["كتاب","كِتَاب","kitaab","book","final"]]],
    ["ta","ت","تاء","Ta","t (light, no puff of air)","t","Easy","two dots above",
      "Like English t but made with the tongue tip against the upper teeth, with less puff of air.",[["تفاح","تُفَّاح","tuffaaḥ","apples","initial"],["بنت","بِنْت","bint","girl","final"]]],
    ["tha","ث","ثاء","Tha","th, as in “think”","th","Medium","three dots above",
      "Like the th in “think”. Some dialects say t or s instead; MSA uses the th sound.",[["ثعلب","ثَعْلَب","thaʿlab","fox","initial"],["مثلث","مُثَلَّث","muthallath","triangle","medial"]]],
    ["jim","ج","جيم","Jim","j, as in “jam”","j","Medium","one dot inside",
      "In MSA, like English j. Egyptian Arabic says a hard g here, so you will hear both; this course teaches the MSA sound.",[["جمل","جَمَل","jamal","camel","initial"],["تاج","تَاج","taaj","crown","final"]]],
    ["hah","ح","حاء","Ḥa","ḥ, breathy throat “h”","ḥ","Challenging","no dots",
      "A strong breathy h made by narrowing the throat, like fogging a mirror with force. It is not the same as ه.",[["حصان","حِصَان","ḥiṣaan","horse","initial"],["بحر","بَحْر","baḥr","sea","medial"]]],
    ["kha","خ","خاء","Kha","kh, as in Scottish “loch”","kh","Medium","one dot above",
      "A rough sound from the back of the mouth, like ch in German “Bach”.",[["خبز","خُبْز","khubz","bread","initial"],["مطبخ","مَطْبَخ","maṭbakh","kitchen","final"]]],
    ["dal","د","دال","Dal","d (tongue at the teeth)","d","Easy","no dots",
      "Like English d, with the tongue touching the back of the upper teeth.",[["دار","دَار","daar","house, home","initial"],["ولد","وَلَد","walad","boy","final"]]],
    ["dhal","ذ","ذال","Dhal","dh, as in “this”","dh","Medium","one dot above",
      "The voiced th of “this” and “that”.",[["ذهب","ذَهَب","dhahab","gold","initial"],["أستاذ","أُسْتَاذ","ustaadh","teacher, professor","final"]]],
    ["ra","ر","راء","Ra","r (tapped or rolled)","r","Medium","no dots",
      "A quick tap or roll of the tongue tip, as in Spanish “pero”. Not the English r.",[["رجل","رَجُل","rajul","man","initial"],["قمر","قَمَر","qamar","moon","final"]]],
    ["zay","ز","زاي","Zay","z, as in “zoo”","z","Easy","one dot above",
      "Same as English z.",[["زهرة","زَهْرَة","zahra","flower","initial"],["موز","مَوْز","mawz","bananas","final"]]],
    ["sin","س","سين","Sin","s, as in “sun”","s","Easy","no dots",
      "Same as English s.",[["سمك","سَمَك","samak","fish","initial"],["مسجد","مَسْجِد","masjid","mosque","medial"]]],
    ["shin","ش","شين","Shin","sh, as in “ship”","sh","Easy","three dots above",
      "Same as English sh.",[["شمس","شَمْس","shams","sun","initial"],["مشمش","مِشْمِش","mishmish","apricots","medial"]]],
    ["sad","ص","صاد","Ṣad","ṣ, “heavy” s","ṣ","Challenging","no dots",
      "An emphatic s: say s with the back of the tongue raised and the throat tense, which makes nearby vowels sound deeper. It is a different letter from س.",[["صباح","صَبَاح","ṣabaaḥ","morning","initial"],["نصف","نِصْف","niṣf","half","medial"]]],
    ["dad","ض","ضاد","Ḍad","ḍ, “heavy” d","ḍ","Challenging","one dot above",
      "The emphatic partner of د: d with the tongue raised and tense. Arabic is sometimes called “the language of ض” because this sound is distinctive.",[["ضوء","ضَوْء","ḍawʾ","light","initial"],["بيض","بَيْض","bayḍ","eggs","final"]]],
    ["tah","ط","طاء","Ṭa","ṭ, “heavy” t","ṭ","Challenging","no dots",
      "The emphatic partner of ت: t with the tongue raised and tense, and no puff of air.",[["طائر","طَائِر","ṭaaʾir","bird","initial"],["وطن","وَطَن","waṭan","homeland","medial"]]],
    ["zah","ظ","ظاء","Ẓa","ẓ, “heavy” dh","ẓ","Challenging","one dot above",
      "The emphatic partner of ذ: the th of “this” said with the tongue raised and tense. In many dialects it is pronounced like a heavy z.",[["ظل","ظِلّ","ẓill","shadow","initial"],["نظارة","نَظَّارَة","naẓẓaara","glasses","medial"]]],
    ["ayn","ع","عين","ʿAyn","ʿ, voiced throat sound","ʿ","Challenging","no dots",
      "A voiced sound made by squeezing the throat. English has nothing like it; listen to a native speaker, and do not replace it with a plain vowel.",[["عين","عَيْن","ʿayn","eye","initial"],["شمعة","شَمْعَة","shamʿa","candle","medial"]]],
    ["ghayn","غ","غين","Ghayn","gh, gargled r","gh","Challenging","one dot above",
      "Like the French r: a light gargle at the back of the throat.",[["غابة","غَابَة","ghaaba","forest","initial"],["دماغ","دِمَاغ","dimaagh","brain","final"]]],
    ["fa","ف","فاء","Fa","f, as in “fan”","f","Easy","one dot above",
      "Same as English f.",[["فيل","فِيل","fiil","elephant","initial"],["مفتاح","مِفْتَاح","miftaaḥ","key","medial"]]],
    ["qaf","ق","قاف","Qaf","q, deep k","q","Challenging","two dots above",
      "A k made further back in the throat. In some dialects it becomes a glottal stop or g, but MSA uses q.",[["قمر","قَمَر","qamar","moon","initial"],["طريق","طَرِيق","ṭariiq","road","final"]]],
    ["kaf","ك","كاف","Kaf","k, as in “kite”","k","Easy","no dots",
      "Like English k, with a lighter puff of air.",[["كتاب","كِتَاب","kitaab","book","initial"],["مكتب","مَكْتَب","maktab","office, desk","medial"]]],
    ["lam","ل","لام","Lam","l, as in “light”","l","Easy","no dots",
      "Like a clear English l. Lam + alif joins into a special shape, لا.",[["ليل","لَيْل","layl","night","initial"],["قلم","قَلَم","qalam","pen","medial"]]],
    ["mim","م","ميم","Mim","m, as in “moon”","m","Easy","no dots",
      "Same as English m.",[["ماء","مَاء","maaʾ","water","initial"],["نجمة","نَجْمَة","najma","star","medial"]]],
    ["nun","ن","نون","Nun","n, as in “nose”","n","Easy","one dot above",
      "Same as English n.",[["نجمة","نَجْمَة","najma","star","initial"],["لبن","لَبَن","laban","milk","final"]]],
    ["ha","ه","هاء","Ha","h, as in “hat”","h","Easy","no dots",
      "A light h, pronounced in every position, even at the end of a word. Do not confuse it with ح.",[["هلال","هِلَال","hilaal","crescent moon","initial"],["وجه","وَجْه","wajh","face","final"]]],
    ["waw","و","واو","Waw","w, as in “water”","w","Easy","no dots",
      "A consonant w (as in “water”) or the long vowel uu (as in “moon”), depending on the word.",[["ورد","وَرْد","ward","roses","initial"],["دلو","دَلْو","dalw","bucket","final"]]],
    ["ya","ي","ياء","Ya","y, as in “yes”","y","Easy","two dots below",
      "A consonant y (as in “yes”) or the long vowel ii (as in “feet”), depending on the word.",[["يد","يَد","yad","hand","initial"],["سيارة","سَيَّارَة","sayyaara","car","medial"]]]
  ];

  const LETTERS = RAW.map(function (r, i) {
    const ch = r[1], connects = NON_CONNECTING.indexOf(ch) === -1;
    return {
      id: r[0], order: i + 1, letter: ch, nameAr: r[2], nameEn: r[3], sound: r[4], roman: r[5],
      difficulty: r[6], dots: r[7], say: r[8], connects: connects,
      forms: { isolated: ch, initial: connects ? ch + TATWEEL : null, medial: connects ? TATWEEL + ch + TATWEEL : null, final: TATWEEL + ch },
      syllables: ch === "ا"
        ? [["أ" + FATHA, "ʾa"], ["إ" + KASRA, "ʾi"], ["أ" + DAMMA, "ʾu"]]
        : [[ch + FATHA, r[5] + "a"], [ch + KASRA, r[5] + "i"], [ch + DAMMA, r[5] + "u"]],
      examples: r[9].map(function (e) { return { plain: e[0], vowelled: e[1], translit: e[2], meaning: e[3], position: e[4] }; })
    };
  });

  // Letters that share a base shape and differ mainly by dots (or are easily confused).
  const SIMILAR_GROUPS = [
    ["ba", "ta", "tha", "nun", "ya"], ["jim", "hah", "kha"], ["dal", "dhal"], ["ra", "zay"],
    ["sin", "shin"], ["sad", "dad"], ["tah", "zah"], ["ayn", "ghayn"], ["fa", "qaf"]
  ];

  const HARAKAT = [
    { id: "fatha", mark: FATHA, nameAr: "فتحة", nameEn: "Fatha", sound: "short “a”", example: ["بَ", "ba"], word: ["كَتَبَ", "kataba", "he wrote"], note: "A small diagonal stroke ABOVE the letter. It adds a short “a” after the consonant." },
    { id: "kasra", mark: KASRA, nameAr: "كسرة", nameEn: "Kasra", sound: "short “i”", example: ["بِ", "bi"], word: ["كِتَاب", "kitaab", "book"], note: "A small diagonal stroke BELOW the letter. It adds a short “i” as in “sit”." },
    { id: "damma", mark: DAMMA, nameAr: "ضمة", nameEn: "Damma", sound: "short “u”", example: ["بُ", "bu"], word: ["كُتُب", "kutub", "books"], note: "A small loop-like mark ABOVE the letter. It adds a short “u” as in “put”." },
    { id: "sukun", mark: SUKUN, nameAr: "سكون", nameEn: "Sukun", sound: "no vowel", example: ["بْ", "b"], word: ["مَكْتَب", "maktab", "office, desk"], note: "A small circle above the letter. The consonant is pronounced with NO vowel after it, joining directly to the next sound." },
    { id: "shadda", mark: SHADDA, nameAr: "شدّة", nameEn: "Shadda", sound: "doubled consonant", example: ["بَّ", "bba"], word: ["مُعَلِّم", "muʿallim", "teacher (male)"], note: "A small w-like mark above the letter. The consonant is said twice (held longer). When a vowel mark is also present, it sits above or below the shadda." },
    { id: "tanween", mark: "\u064B\u064C\u064D", nameAr: "تنوين", nameEn: "Tanween", sound: "-an, -in, -un", example: ["كِتَابٌ", "kitaabun"], word: ["كِتَابًا", "kitaaban", "a book"], note: "A doubled vowel mark at the END of an indefinite noun, adding an “n”: ـً (-an), ـٍ (-in), ـٌ (-un). Fathatayn usually sits on an extra alif: ـًا. In everyday speech the final -n is often dropped at the end of a sentence." }
  ];

  // Quick-check questions for the two harakat lessons: [prompt, options, correctIndex, explanation]
  const HARAKAT_LESSONS = [
    { id: "harakat-1", title: "Short vowels: fatha, kasra, damma", marks: ["fatha", "kasra", "damma"],
      intro: "Arabic spells out consonants and long vowels (ا و ي). Short vowels are normally left out and shown only by optional marks called harakat. Children’s books, the Qur’an and learner materials include them; most newspapers do not.",
      check: [
        ["Which mark gives the sound “bi”?", ["بَ", "بِ", "بُ", "بْ"], 1, "Kasra (below the letter) gives a short “i”."],
        ["How is بُ pronounced?", ["ba", "bi", "bu", "b"], 2, "Damma above the letter gives a short “u”."],
        ["Where does fatha sit?", ["Above the letter", "Below the letter", "Inside the letter", "After the word"], 0, "Fatha is a short diagonal stroke above the letter."]
      ] },
    { id: "harakat-2", title: "Sukun, shadda and tanween", marks: ["sukun", "shadda", "tanween"],
      intro: "Three more marks finish the set: sukun means “no vowel here”, shadda doubles a consonant, and tanween adds a final -an, -in or -un to indefinite nouns.",
      check: [
        ["What does sukun (ـْ) tell you?", ["Add a short a", "No vowel after this consonant", "Double the consonant", "Add -un"], 1, "Sukun marks a consonant with no vowel, as in مَكْتَب (mak-tab)."],
        ["What does shadda (ـّ) do?", ["Doubles the consonant", "Removes the consonant", "Adds -an", "Makes a long vowel"], 0, "Shadda means the consonant is doubled, as in مُعَلِّم (mu-ʿal-lim)."],
        ["Which tanween ending is ـٌ ?", ["-an", "-in", "-un", "-aa"], 2, "Dammatayn (ـٌ) gives -un, as in كِتَابٌ (kitaabun)."]
      ] }
  ];

  // Reading & typing ladder. `check` says how a stage is graded:
  //   "letters" = typed letters must match; harakat are optional (engine.checkTyped)
  //   "exact"   = typed text must match INCLUDING harakat (engine.checkTypedStrict)
  //   "choice"  = multiple choice (no typing)
  const READING_STAGES = [
    { id: "letters", check: "letters", title: "1. Single letters", items: [["ب", "ba (letter Ba)", "Letter Ba"], ["م", "mim", "Letter Mim"], ["ك", "kaf", "Letter Kaf"], ["ر", "ra", "Letter Ra"], ["ن", "nun", "Letter Nun"]] },
    { id: "marked", check: "choice", title: "2. Letters with harakat", items: [["بَ", "ba", "Ba with fatha"], ["مِ", "mi", "Mim with kasra"], ["كُ", "ku", "Kaf with damma"], ["رَ", "ra", "Ra with fatha"], ["نِ", "ni", "Nun with kasra"]] },
    { id: "joined", check: "letters", title: "3. Connected letters", items: [["بنت", "bint", "girl (letters ب ن ت joined)"], ["كتب", "kutub", "books (ك ت ب joined)"], ["قلم", "qalam", "pen"], ["نور", "nuur", "light (و never joins the ر after it)"], ["ماء", "maaʾ", "water"]] },
    { id: "words", check: "exact", title: "4. Short vowelled words", items: [["كِتَاب", "kitaab", "book"], ["قَمَر", "qamar", "moon"], ["بَيْت", "bayt", "house"], ["شَمْس", "shams", "sun"], ["مَدْرَسَة", "madrasa", "school"]] },
    { id: "phrases", check: "letters", title: "5. Simple phrases", items: [["مَرْحَبًا", "marḥaban", "hello"], ["شُكْرًا", "shukran", "thank you"], ["صَبَاحُ الْخَيْرِ", "ṣabaaḥ al-khayr", "good morning"], ["السَّلَامُ عَلَيْكُمْ", "as-salaamu ʿalaykum", "peace be upon you (greeting)"]] },
    { id: "sentences", check: "letters", title: "6. Beginner sentences", items: [["\u0647\u064E\u0670\u0630\u064E\u0627 \u0643\u0650\u062A\u064E\u0627\u0628\u064C", "haadha kitaabun", "This is a book."], ["أَنَا طَالِبٌ", "anaa ṭaalibun", "I am a student (male)."], ["الْبَيْتُ كَبِيرٌ", "al-baytu kabiirun", "The house is big."]] }
  ];

  const TOTAL_LESSONS = LETTERS.length + HARAKAT_LESSONS.length;

  return { TATWEEL, NON_CONNECTING, LETTERS, SIMILAR_GROUPS, HARAKAT, HARAKAT_LESSONS, READING_STAGES, TOTAL_LESSONS };
});
