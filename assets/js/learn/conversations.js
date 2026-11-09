/* Learn Arabic — Phase 3 conversation units (content only, no DOM). UNREVIEWED by a qualified Arabic teacher.
   Eight short dialogues in Modern Standard Arabic. Every line has vowelled Arabic, transliteration and an English translation;
   `plain` is derived from `ar` (harakat removed). Spoken dialect forms appear ONLY in `dialect` notes, labelled with their region, and are
   never quizzed or scheduled. Sentence-completion items (SENTENCE_ITEMS) are stable-id review items in the same shape as the V1 sentence
   patterns, so the existing fill-in/typing exercises and the Leitner scheduler handle them unchanged. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LearnConversations = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const strip = s => s.replace(/[ً-ٰٟـ]/g, "");
  const PASS_PERCENT = 70;   // a unit counts as complete when its comprehension check scores at least this

  // Each unit: lines [speaker, ar, translit, en]; vocab = vocabulary item ids; sentences = [n, ar, translit, en, slot, pool, punct];
  // questions = [prompt, options, index of the correct option, explanation, optionsAreArabic?]; speak = [line number, pronunciation tip];
  // dialect = [ar, translit, en, region, note]
  const RAW = [
    { short: "intro", title: "Introducing yourself", scenario: "Two people meet for the first time and introduce themselves.", speakers: { A: "Ahmad (a man)", B: "Sara (a woman)" },
      lines: [
        ["A", "مَرْحَبًا! اِسْمِي أَحْمَد.", "marḥaban! ismī aḥmad.", "Hello! My name is Ahmad."],
        ["B", "أَهْلًا يَا أَحْمَد! أَنَا سَارَة.", "ahlan yā aḥmad! anā sāra.", "Hi, Ahmad! I am Sara."],
        ["A", "أَنَا طَالِب. وَأَنْتِ؟", "anā ṭālib. wa-anti?", "I am a student. And you?"],
        ["B", "أَنَا مُعَلِّمَة.", "anā muʿallima.", "I am a teacher."],
        ["A", "تَشَرَّفْنَا يَا سَارَة.", "tasharrafnā yā sāra.", "Nice to meet you, Sara."],
        ["B", "تَشَرَّفْنَا.", "tasharrafnā.", "Nice to meet you."] ],
      vocab: ["greet-hello", "greet-ahlan", "greet-name-a", "ppl-i", "ppl-you-f", "ppl-vocative", "ppl-nice-to-meet", "sch-student-m", "sch-teacher-f"],
      sentences: [[1, "أَنَا مُعَلِّمَة", "anā muʿallima", "I am a teacher (said by a woman).", "مُعَلِّمَة", ["طَالِبَة", "طَبِيبَة", "مُهَنْدِسَة"], ""],
                  [2, "تَشَرَّفْنَا يَا سَارَة", "tasharrafnā yā sāra", "Nice to meet you, Sara.", "تَشَرَّفْنَا", ["شُكْرًا", "عَفْوًا", "مَرْحَبًا"], ""]],
      questions: [
        ["What is the man’s name?", ["Ahmad", "Sara", "Omar", "Yusuf"], 0, "He says اِسْمِي أَحْمَد (ismī aḥmad), “My name is Ahmad”."],
        ["What is Sara’s job?", ["Teacher", "Student", "Doctor", "Engineer"], 0, "She says أَنَا مُعَلِّمَة (anā muʿallima). مُعَلِّمَة is a female teacher."],
        ["Which phrase do both speakers use to say “nice to meet you”?", ["تَشَرَّفْنَا", "شُكْرًا", "عَفْوًا", "مَرْحَبًا"], 0, "تَشَرَّفْنَا (tasharrafnā) is the phrase both speakers say.", true],
        ["Why does Ahmad say وَأَنْتِ (with a kasra on the last letter)?", ["He is speaking to a woman.", "He is speaking to a man.", "He is speaking to a group.", "He is talking about himself."], 0, "أَنْتِ (anti) means “you” said to a woman; to a man it is أَنْتَ (anta)."] ],
      speak: [[1, "مَرْحَبًا: the ح (ḥ) is a breathy sound made in the throat. It is not the English h."], [2, "سَارَة: the ā is a long vowel, held about twice as long as a short vowel. The ر is a quick tap of the tongue, not the English r."], [5, "تَشَرَّفْنَا: the shadda on ر means the sound is doubled; hold it briefly (tasharr-afnā)."]],
      dialect: [["فُرْصَة سَعِيدَة", "furṣa saʿīda", "nice to meet you (“a happy opportunity”)", "Egyptian Arabic (also heard elsewhere)", "Common in speech. تَشَرَّفْنَا is also widely understood."]] },

    { short: "family", title: "Introducing your family", scenario: "Omar looks at a family photo with Sara.", speakers: { A: "Omar (a man)", B: "Sara (a woman)" },
      lines: [
        ["A", "مَنْ هَٰذَا؟", "man hādhā?", "Who is this? (pointing at a photo)"],
        ["B", "هَٰذَا أَبِي. اِسْمُهُ مُحَمَّد.", "hādhā abī. ismuhu muḥammad.", "This is my father. His name is Muhammad."],
        ["A", "وَمَنْ هَٰذِهِ؟", "wa-man hādhihi?", "And who is this?"],
        ["B", "هَٰذِهِ أُمِّي. هِيَ طَبِيبَة.", "hādhihi ummī. hiya ṭabība.", "This is my mother. She is a doctor."],
        ["A", "هَلْ عِنْدَكِ أَخ؟", "hal ʿindaki akh?", "Do you have a brother?"],
        ["B", "نَعَمْ، عِنْدِي أَخ وَأُخْت.", "naʿam, ʿindī akh wa-ukht.", "Yes, I have a brother and a sister."] ],
      vocab: ["core-who", "fam-father", "fam-mother", "fam-brother", "fam-sister", "core-have", "core-hal", "greet-yes", "sch-doctor", "ppl-name"],
      sentences: [[1, "هَٰذَا أَبِي", "hādhā abī", "This is my father.", "أَبِي", ["أَخِي", "جَدِّي", "عَمِّي"], ""],
                  [2, "هَٰذِهِ أُمِّي", "hādhihi ummī", "This is my mother.", "أُمِّي", ["أُخْتِي", "جَدَّتِي", "زَوْجَتِي"], ""],
                  [3, "عِنْدِي أَخ", "ʿindī akh", "I have a brother.", "أَخ", ["أُخْت", "عَمّ", "جَدّ"], ""]],
      questions: [
        ["Who is the first person in the photo?", ["Sara’s father", "Sara’s mother", "Sara’s brother", "Sara’s teacher"], 0, "Sara says هَٰذَا أَبِي (hādhā abī), “This is my father”."],
        ["What is Sara’s father called?", ["Muhammad", "Ahmad", "Omar", "Yusuf"], 0, "اِسْمُهُ مُحَمَّد (ismuhu muḥammad): “His name is Muhammad”."],
        ["What is Sara’s mother’s job?", ["Doctor", "Teacher", "Student", "Engineer"], 0, "هِيَ طَبِيبَة (hiya ṭabība): “She is a doctor”."],
        ["Which brothers and sisters does Sara have?", ["One brother and one sister", "Two brothers", "Only a sister", "None"], 0, "عِنْدِي أَخ وَأُخْت (ʿindī akh wa-ukht): “I have a brother and a sister”."] ],
      speak: [[2, "أَبِي: the final ī is a long vowel. Keep it long: abī."], [5, "عِنْدَكِ: the ع (ʿayn) is a deep sound from the throat; begin the word with it. The final kasra (-ki) shows that Omar is speaking to a woman."], [6, "أُخْت: the خ (kh) is made at the back of the mouth, like the ch in Scottish “loch”."]],
      dialect: [["مَامَا / بَابَا", "māmā / bābā", "mum / dad", "informal speech across the Arab world", "Informal. أُمّ and أَب are the standard words."]] },

    { short: "greet", title: "Greeting people", scenario: "Two men greet each other, ask how they are, and say goodbye.", speakers: { A: "Ahmad (a man)", B: "Omar (a man)" },
      lines: [
        ["A", "السَّلَامُ عَلَيْكُمْ.", "as-salāmu ʿalaykum.", "Peace be upon you."],
        ["B", "وَعَلَيْكُمُ السَّلَامُ.", "wa-ʿalaykumu s-salām.", "And upon you be peace."],
        ["A", "كَيْفَ حَالُكَ؟", "kayfa ḥāluka?", "How are you?"],
        ["B", "بِخَيْرٍ، الْحَمْدُ لِلَّهِ. وَأَنْتَ؟", "bi-khayrin, al-ḥamdu lillāh. wa-anta?", "Fine, praise be to God. And you?"],
        ["A", "بِخَيْرٍ، شُكْرًا.", "bi-khayrin, shukran.", "Fine, thank you."],
        ["B", "مَعَ السَّلَامَةِ.", "maʿa s-salāma.", "Goodbye."],
        ["A", "مَعَ السَّلَامَةِ.", "maʿa s-salāma.", "Goodbye."] ],
      vocab: ["greet-salam", "greet-salam-reply", "greet-how", "greet-fine", "greet-hamd", "greet-thanks", "greet-bye", "ppl-you-m"],
      sentences: [[1, "أَنَا بِخَيْر", "anā bi-khayr", "I am fine.", "بِخَيْر", ["مَرِيض", "جَائِع", "سَعِيد"], ""]],
      questions: [
        ["What is the traditional reply to السَّلَامُ عَلَيْكُمْ?", ["وَعَلَيْكُمُ السَّلَامُ", "صَبَاحُ النُّورِ", "مَعَ السَّلَامَةِ", "عَفْوًا"], 0, "The reply is وَعَلَيْكُمُ السَّلَامُ (wa-ʿalaykumu s-salām), “and upon you be peace”.", true],
        ["How does Omar answer “How are you?”", ["He is fine and thanks God.", "He is sick.", "He is tired.", "He does not answer."], 0, "بِخَيْرٍ، الْحَمْدُ لِلَّهِ (bi-khayrin, al-ḥamdu lillāh): “Fine, praise be to God”."],
        ["Why does the question end in ـكَ (كَيْفَ حَالُكَ)?", ["It is addressed to a man.", "It is addressed to a woman.", "It is addressed to a child only.", "It is a formal letter."], 0, "ـكَ (-ka) means “your” for a man. To a woman it is كَيْفَ حَالُكِ (kayfa ḥāluki)."],
        ["Which phrase ends the conversation?", ["مَعَ السَّلَامَةِ", "مَرْحَبًا", "بِخَيْرٍ", "شُكْرًا"], 0, "Both speakers say مَعَ السَّلَامَةِ (maʿa s-salāma), “goodbye”.", true] ],
      speak: [[1, "السَّلَامُ: the ل of الـ merges into the س, so say as-salām, not al-salām."], [4, "الْحَمْدُ لِلَّهِ: the ح (ḥ) is a breathy throat sound; the ل in لِلَّهِ carries a shadda, so it is doubled (lillāh)."], [2, "عَلَيْكُمُ: begin with the deep ع (ʿayn)."]],
      dialect: [["إِزَّيَّك", "izzayyak", "how are you? (to a man)", "Egyptian Arabic", "See also the greetings topic. Not Modern Standard Arabic."], ["كِيفَك", "kīfak", "how are you? (to a man)", "Levantine Arabic", "Not Modern Standard Arabic."], ["شْلُونَك", "shlōnak", "how are you? (to a man)", "Gulf and Iraqi Arabic", "Not Modern Standard Arabic."]] },

    { short: "name", title: "Asking someone’s name and nationality", scenario: "Yusuf (from Egypt) and Layla (from Jordan) ask each other their names and where they are from.", speakers: { A: "Yusuf (a man)", B: "Layla (a woman)" },
      lines: [
        ["A", "مَا اسْمُكِ؟", "mā smuki?", "What is your name? (to a woman)"],
        ["B", "اِسْمِي لَيْلَى. وَمَا اسْمُكَ؟", "ismī laylā. wa-mā smuka?", "My name is Layla. And what is your name? (to a man)"],
        ["A", "اِسْمِي يُوسُف. مِنْ أَيْنَ أَنْتِ؟", "ismī yūsuf. min ayna anti?", "My name is Yusuf. Where are you from? (to a woman)"],
        ["B", "أَنَا مِنَ الْأُرْدُنّ. أَنَا أُرْدُنِّيَّة. وَأَنْتَ؟", "anā mina l-urdunn. anā urdunniyya. wa-anta?", "I am from Jordan. I am Jordanian (a woman). And you?"],
        ["A", "أَنَا مِنْ مِصْر. أَنَا مِصْرِيّ.", "anā min miṣr. anā miṣriyy.", "I am from Egypt. I am Egyptian (a man)."],
        ["B", "أَهْلًا وَسَهْلًا!", "ahlan wa-sahlan!", "Welcome!"] ],
      vocab: ["greet-name-q", "ppl-name", "ppl-from", "core-where", "ppl-jordan", "ppl-egypt", "ppl-jordanian", "ppl-egyptian", "ppl-nationality", "ppl-you-f", "ppl-you-m", "greet-ahlan"],
      sentences: [[1, "أَنَا مِنْ مِصْر", "anā min miṣr", "I am from Egypt.", "مِصْر", ["سُورِيَا", "لُبْنَان", "أَمْرِيكَا"], ""],
                  [2, "أَنَا مِصْرِيّ", "anā miṣriyy", "I am Egyptian (said by a man).", "مِصْرِيّ", ["سُورِيّ", "لُبْنَانِيّ", "أَمْرِيكِيّ"], ""],
                  [3, "مِنْ أَيْنَ أَنْتِ", "min ayna anti", "Where are you from? (to a woman)", "أَيْنَ", ["مَاذَا", "كَيْفَ", "مَتَى"], "؟"]],
      questions: [
        ["Where is Layla from?", ["Jordan", "Egypt", "Syria", "Morocco"], 0, "She says أَنَا مِنَ الْأُرْدُنّ (anā mina l-urdunn): “I am from Jordan”."],
        ["What nationality is Yusuf?", ["Egyptian", "Jordanian", "Lebanese", "American"], 0, "أَنَا مِصْرِيّ (anā miṣriyy): “I am Egyptian”."],
        ["Why does Layla say أُرْدُنِّيَّة and not أُرْدُنِّيّ?", ["She is a woman, so the nationality takes ـَة.", "She is a child.", "Jordan is a plural country.", "It is a different word."], 0, "A nationality word agrees with the speaker: add ـَة for a woman (أُرْدُنِّيّ → أُرْدُنِّيَّة)."],
        ["What does مِنْ أَيْنَ أَنْتِ؟ ask?", ["Where are you from?", "What is your name?", "How are you?", "What do you want?"], 0, "مِنْ (min) means “from” and أَيْنَ (ayna) means “where”."] ],
      speak: [[1, "اسْمُكِ: after مَا the first letter of اسْم is not pronounced separately, so the words run together: mā smuki."], [4, "أُرْدُنِّيَّة: it has two shaddas (ن and ي). Hold each doubled sound briefly."], [5, "مِصْر: the ص (ṣ) is an emphatic s. Say it with the back of the tongue raised, which gives a darker, heavier sound than English s."]],
      dialect: [["اِسْمَك إِيه؟", "ismak ēh?", "what is your name? (to a man)", "Egyptian Arabic", "Modern Standard Arabic: مَا اسْمُكَ؟"], ["شُو اسْمَك؟", "shū ismak?", "what is your name? (to a man)", "Levantine Arabic", "Modern Standard Arabic: مَا اسْمُكَ؟"], ["إِنْتَ مِنْ فِين؟", "inta min fīn?", "where are you from? (to a man)", "Egyptian Arabic", "Modern Standard Arabic: مِنْ أَيْنَ أَنْتَ؟"], ["مِنْ وَيْن إِنْتَ؟", "min wēn inta?", "where are you from? (to a man)", "Levantine Arabic", "Modern Standard Arabic: مِنْ أَيْنَ أَنْتَ؟"]] },

    { short: "order", title: "Ordering food and drinks", scenario: "A customer orders tea and food at a restaurant.", speakers: { A: "The waiter", B: "The customer (a man)" },
      lines: [
        ["A", "أَهْلًا وَسَهْلًا! مَاذَا تُرِيدُ؟", "ahlan wa-sahlan! mādhā turīdu?", "Welcome! What do you want?"],
        ["B", "أُرِيدُ شَايًا، مِنْ فَضْلِكَ.", "urīdu shāyan, min faḍlika.", "I want tea, please."],
        ["A", "هَلْ تُرِيدُ طَعَامًا؟", "hal turīdu ṭaʿāman?", "Do you want food?"],
        ["B", "نَعَمْ، أُرِيدُ دَجَاجًا وَخُبْزًا.", "naʿam, urīdu dajājan wa-khubzan.", "Yes, I want chicken and bread."],
        ["A", "حَسَنًا.", "ḥasanan.", "Very well."],
        ["B", "شُكْرًا.", "shukran.", "Thank you."],
        ["A", "عَفْوًا.", "ʿafwan.", "You’re welcome."] ],
      vocab: ["rtn-want", "food-tea", "food-chicken", "food-bread", "food-food", "core-what-do", "core-hal", "greet-please", "greet-thanks", "greet-welcome", "greet-yes", "core-ok"],
      sentences: [[1, "أُرِيدُ شَايًا", "urīdu shāyan", "I want tea.", "شَايًا", ["قَهْوَةً", "عَصِيرًا", "مَاءً"], ""],
                  [2, "أُرِيدُ دَجَاجًا", "urīdu dajājan", "I want chicken.", "دَجَاجًا", ["سَمَكًا", "لَحْمًا", "خُبْزًا"], ""],
                  [3, "هَلْ تُرِيدُ طَعَامًا", "hal turīdu ṭaʿāman", "Do you want food?", "طَعَامًا", ["مَاءً", "شَايًا", "عَصِيرًا"], "؟"]],
      questions: [
        ["What does the customer order to drink?", ["Tea", "Coffee", "Juice", "Water"], 0, "أُرِيدُ شَايًا (urīdu shāyan): “I want tea”."],
        ["Which food does the customer order?", ["Chicken and bread", "Fish and rice", "Cheese and eggs", "Meat and salt"], 0, "أُرِيدُ دَجَاجًا وَخُبْزًا (urīdu dajājan wa-khubzan): “I want chicken and bread”."],
        ["What does the waiter ask first?", ["What do you want?", "How are you?", "Where are you from?", "What is your name?"], 0, "مَاذَا تُرِيدُ؟ (mādhā turīdu?) means “What do you want?”."],
        ["Which word does the waiter use to answer “thank you”?", ["عَفْوًا", "نَعَمْ", "لَا", "مِنْ فَضْلِكَ"], 0, "عَفْوًا (ʿafwan) means “you’re welcome” (it also means “excuse me”).", true] ],
      speak: [[2, "مِنْ فَضْلِكَ: the ض (ḍ) is an emphatic d, heavier than the English d."], [4, "دَجَاجًا: the ج is pronounced like the j in “jam” in Modern Standard Arabic."], [1, "تُرِيدُ: the ر is a quick tap of the tongue."]],
      dialect: [["حَاضِر", "ḥāḍir", "right away; of course (said by a waiter)", "Egyptian and Gulf Arabic", "In Modern Standard Arabic you can say حَسَنًا."], ["عَايِز شَاي", "ʿāyiz shāy", "I want tea (said by a man)", "Egyptian Arabic", "Modern Standard Arabic: أُرِيدُ شَايًا."]] },

    { short: "shop", title: "Shopping and asking prices", scenario: "A customer asks the price of a shirt and asks for a discount.", speakers: { A: "The customer", B: "The seller" },
      lines: [
        ["A", "السَّلَامُ عَلَيْكُمْ. بِكَمْ هَٰذَا الْقَمِيص؟", "as-salāmu ʿalaykum. bikam hādhā l-qamīṣ?", "Peace be upon you. How much is this shirt?"],
        ["B", "وَعَلَيْكُمُ السَّلَامُ. عَشَرَة دَنَانِير.", "wa-ʿalaykumu s-salām. ʿashara danānīr.", "And upon you be peace. Ten dinars."],
        ["A", "هَٰذَا غَالٍ! هَلْ هُنَاك تَخْفِيض؟", "hādhā ghālin! hal hunāk takhfīḍ?", "This is expensive! Is there a discount?"],
        ["B", "نَعَمْ، ثَمَانِيَة دَنَانِير.", "naʿam, thamāniya danānīr.", "Yes, eight dinars."],
        ["A", "حَسَنًا، أُرِيدُ هَٰذَا.", "ḥasanan, urīdu hādhā.", "OK, I want this."],
        ["B", "تَفَضَّلْ.", "tafaḍḍal.", "Here you are."] ],
      vocab: ["shp-how-much-is", "clo-shirt", "shp-expensive", "shp-discount", "shp-dinar", "core-hal", "plc-there", "rtn-want", "num-8", "num-10", "shp-here-you-are", "core-ok"],
      sentences: [[1, "بِكَمْ هَٰذَا الْقَمِيص", "bikam hādhā l-qamīṣ", "How much is this shirt?", "الْقَمِيص", ["الْحِذَاء", "الْمِعْطَف", "الْفُسْتَان"], "؟"],
                  [2, "هَٰذَا غَالٍ", "hādhā ghālin", "This is expensive.", "غَالٍ", ["رَخِيص", "بَارِد", "جَدِيد"], ""],
                  [3, "أُرِيدُ هَٰذَا", "urīdu hādhā", "I want this.", "أُرِيدُ", ["أَشْتَرِي", "أَبِيعُ", "أَدْفَعُ"], ""]],
      questions: [
        ["What does the customer want to buy?", ["A shirt", "A coat", "Shoes", "A bag"], 0, "بِكَمْ هَٰذَا الْقَمِيص؟ asks about a shirt (قَمِيص)."],
        ["What is the first price?", ["Ten dinars", "Eight dinars", "Five dinars", "Twenty dinars"], 0, "The seller says عَشَرَة دَنَانِير (ʿashara danānīr): ten dinars."],
        ["Why does the customer ask about a discount?", ["He thinks the price is expensive.", "He thinks the shop is far.", "He wants to pay later.", "He does not like the colour."], 0, "He says هَٰذَا غَالٍ (hādhā ghālin): “This is expensive!”"],
        ["What is the final price?", ["Eight dinars", "Ten dinars", "Seven dinars", "Nine dinars"], 0, "After the discount the seller says ثَمَانِيَة دَنَانِير (thamāniya danānīr): eight dinars."] ],
      speak: [[3, "غَالٍ: the غ (gh) is a voiced sound from the back of the throat, a little like a gargled French r."], [6, "تَفَضَّلْ: the shadda on the ض means it is doubled; the ض is an emphatic d."], [4, "ثَمَانِيَة: the ث is pronounced like the th in “think”."]],
      dialect: [["بِكَام", "bikām", "how much?", "Egyptian Arabic", "Modern Standard Arabic: بِكَمْ."], ["قَدَّيْش", "ʾaddaysh", "how much?", "Levantine Arabic", "Modern Standard Arabic: بِكَمْ."]] },

    { short: "direct", title: "Asking for directions", scenario: "A tourist asks a passer-by where the station is.", speakers: { A: "The tourist", B: "The passer-by (speaking to a man)" },
      lines: [
        ["A", "عَفْوًا، أَيْنَ الْمَحَطَّة؟", "ʿafwan, ayna l-maḥaṭṭa?", "Excuse me, where is the station?"],
        ["B", "الْمَحَطَّة قَرِيبَة. اِذْهَبْ مُسْتَقِيمًا.", "al-maḥaṭṭa qarība. idhhab mustaqīman.", "The station is near. Go straight."],
        ["A", "هَلْ هِيَ عَلَى الْيَمِين؟", "hal hiya ʿalā l-yamīn?", "Is it on the right?"],
        ["B", "لَا، هِيَ عَلَى الْيَسَار، بِجَانِب الْبَنْك.", "lā, hiya ʿalā l-yasār, bi-jānib al-bank.", "No, it is on the left, next to the bank."],
        ["A", "شُكْرًا.", "shukran.", "Thank you."],
        ["B", "عَفْوًا.", "ʿafwan.", "You’re welcome."] ],
      vocab: ["plc-station", "core-where", "plc-near", "plc-go-cmd", "plc-straight", "core-hal", "core-on", "plc-right", "plc-left", "plc-next-to", "plc-bank", "greet-welcome", "greet-no", "greet-thanks"],
      sentences: [[1, "الْمَحَطَّة عَلَى الْيَسَار", "al-maḥaṭṭa ʿalā l-yasār", "The station is on the left.", "الْيَسَار", ["الْيَمِين", "الْأَمَام", "الْخَلْف"], ""],
                  [2, "اِذْهَبْ مُسْتَقِيمًا", "idhhab mustaqīman", "Go straight (to a man).", "مُسْتَقِيمًا", ["يَمِينًا", "يَسَارًا", "قَرِيبًا"], ""],
                  [3, "هِيَ بِجَانِب الْبَنْك", "hiya bi-jānib al-bank", "It is next to the bank.", "الْبَنْك", ["الْمَطَار", "الْمَسْجِد", "الْمُسْتَشْفَى"], ""]],
      questions: [
        ["Where does the tourist want to go?", ["To the station", "To the bank", "To the airport", "To the hospital"], 0, "He asks أَيْنَ الْمَحَطَّة؟ (ayna l-maḥaṭṭa?): “Where is the station?”"],
        ["How far is it?", ["Near", "Far", "Very far", "It is closed"], 0, "الْمَحَطَّة قَرِيبَة (al-maḥaṭṭa qarība): “The station is near”."],
        ["Which side is the station on?", ["The left", "The right", "Straight ahead", "Behind"], 0, "هِيَ عَلَى الْيَسَار (hiya ʿalā l-yasār): “It is on the left”."],
        ["What is it next to?", ["The bank", "The mosque", "The school", "The market"], 0, "بِجَانِب الْبَنْك (bi-jānib al-bank): “next to the bank”."] ],
      speak: [[2, "اِذْهَبْ: begin with a short i (the first alif is a connecting alif), then dh as in “this”."], [1, "الْمَحَطَّة: the ط (ṭ) is an emphatic t, made with the back of the tongue raised, and it is doubled."], [1, "عَفْوًا: begin with the deep ع (ʿayn), then f."]],
      dialect: [["دُغْرِي", "dughrī", "straight ahead", "Egyptian and Levantine Arabic", "Modern Standard Arabic: مُسْتَقِيم."]] },

    { short: "daily", title: "Talking about daily activities", scenario: "Layla asks Yusuf about his day.", speakers: { A: "Layla (a woman)", B: "Yusuf (a man)" },
      lines: [
        ["A", "مَاذَا تَفْعَلُ كُلَّ يَوْم؟", "mādhā tafʿalu kulla yawm?", "What do you do every day?"],
        ["B", "أَسْتَيْقِظُ فِي الصَّبَاح ثُمَّ أَشْرَبُ الْقَهْوَة.", "astayqiẓu fī ṣ-ṣabāḥ thumma ashrabu l-qahwa.", "I wake up in the morning, then I drink the coffee."],
        ["A", "هَلْ تَعْمَلُ؟", "hal taʿmalu?", "Do you work?"],
        ["B", "نَعَمْ، أَعْمَلُ فِي شَرِكَة.", "naʿam, aʿmalu fī sharika.", "Yes, I work in a company."],
        ["A", "وَمَاذَا تَفْعَلُ فِي الْمَسَاء؟", "wa-mādhā tafʿalu fī l-masāʾ?", "And what do you do in the evening?"],
        ["B", "أَقْرَأُ كِتَابًا ثُمَّ أَنَام.", "aqraʾu kitāban thumma anām.", "I read a book, then I sleep."] ],
      vocab: ["core-what-do", "rtn-do", "core-every", "time-day", "rtn-wake-up", "time-morning", "core-in", "core-then", "rtn-drink", "food-coffee", "rtn-work", "sch-company", "time-evening", "rtn-read", "sch-book", "rtn-sleep", "core-hal"],
      sentences: [[1, "أَشْرَبُ الْقَهْوَة", "ashrabu l-qahwa", "I drink the coffee.", "أَشْرَبُ", ["آكُلُ", "أَقْرَأُ", "أَكْتُبُ"], ""],
                  [2, "أَعْمَلُ فِي شَرِكَة", "aʿmalu fī sharika", "I work in a company.", "شَرِكَة", ["مَدْرَسَة", "مَطْعَم", "مَكْتَبَة"], ""],
                  [3, "أَقْرَأُ كِتَابًا", "aqraʾu kitāban", "I read a book.", "كِتَابًا", ["قَلَمًا", "بَيْتًا", "بَابًا"], ""]],
      questions: [
        ["What does Yusuf do first in the morning?", ["He wakes up", "He goes to work", "He reads a book", "He sleeps"], 0, "أَسْتَيْقِظُ فِي الصَّبَاح (astayqiẓu fī ṣ-ṣabāḥ): “I wake up in the morning”."],
        ["Where does Yusuf work?", ["In a company", "In a school", "In a hospital", "In a restaurant"], 0, "أَعْمَلُ فِي شَرِكَة (aʿmalu fī sharika): “I work in a company”."],
        ["What does he do in the evening?", ["He reads a book", "He plays", "He travels", "He washes"], 0, "أَقْرَأُ كِتَابًا (aqraʾu kitāban): “I read a book”."],
        ["What does he do last?", ["He sleeps", "He drinks coffee", "He works", "He wakes up"], 0, "ثُمَّ أَنَام (thumma anām): “then I sleep”."] ],
      speak: [[2, "أَسْتَيْقِظُ: the ق (q) is made deeper in the throat than the English k, and the ظ (ẓ) is an emphatic, heavy th."], [1, "تَفْعَلُ: begin the second syllable with the deep ع (ʿayn)."], [6, "أَقْرَأُ: the ق (q) again, deeper than k; the final ء is a short stop of the breath."]],
      dialect: [["بَشْرَب", "bashrab", "I drink / I am drinking", "Levantine Arabic", "Egyptian and Levantine speakers usually add a prefix b- to present-tense verbs. Modern Standard Arabic has no such prefix: أَشْرَبُ."]] }
  ];

  const UNITS = RAW.map(u => {
    const id = "conv-" + u.short;
    return {
      id: id, short: u.short, title: u.title, scenario: u.scenario, speakers: u.speakers, register: "msa",
      registerNote: "The dialogue is Modern Standard Arabic. Spoken dialect forms appear only in the labelled notes and are not quizzed.",
      lines: u.lines.map((l, i) => { const ar = l[1].normalize("NFC"); return { id: id + "-" + (i + 1), n: i + 1, speaker: l[0], ar: ar, plain: strip(ar), translit: l[2], en: l[3], audioKey: "dlg-" + u.short + "-" + (i + 1) }; }),
      vocab: u.vocab,
      questions: u.questions.map((q, i) => ({ id: id + "-q" + (i + 1), prompt: q[0], options: q[1], answer: q[2], explanation: q[3], arabicOptions: !!q[4] })),
      speak: u.speak.map((t, i) => ({ id: id + "-sp" + (i + 1), line: t[0], tip: t[1] })),
      dialect: u.dialect.map((d, i) => ({ id: "dial-" + u.short + "-" + (i + 1), ar: d[0].normalize("NFC"), translit: d[1], en: d[2], region: d[3], note: d[4], reg: "dialect" })),
      _sent: u.sentences
    };
  });
  const SENTENCE_ITEMS = [];
  UNITS.forEach(u => u._sent.forEach(s => { const ar = s[1].normalize("NFC"); SENTENCE_ITEMS.push({ id: "snt-" + u.short + "-" + s[0], unit: u.id, ar: ar, plain: strip(ar), translit: s[2], en: s[3], slot: s[4].normalize("NFC"), pool: s[5].map(w => w.normalize("NFC")), punct: s[6], reg: "msa" }); }));
  UNITS.forEach(u => { u.sentenceIds = SENTENCE_ITEMS.filter(s => s.unit === u.id).map(s => s.id); delete u._sent; });
  return { UNITS, SENTENCE_ITEMS, PASS_PERCENT };
});
