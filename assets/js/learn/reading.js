/* Learn Arabic — Phase 3 reading comprehension (content only, no DOM). UNREVIEWED by a qualified Arabic teacher.
   Four levels, each a little harder than the last: 1 short sentences, 2 everyday paragraphs, 3 beginner stories, 4 dialogues read as texts.
   Levels 1–3 open fully vowelled; level 4 opens WITHOUT harakat (the learner can switch them on). `plain` is derived from `ar` (harakat removed),
   so the two forms can never disagree. All texts are Modern Standard Arabic. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LearnReading = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const strip = s => s.replace(/[ً-ٰٟـ]/g, "");
  const PASS_PERCENT = 70;   // a passage counts as read when its comprehension questions score at least this
  const LEVELS = [
    { n: 1, id: "sentences", title: "Short sentences", blurb: "Single, fully vowelled sentences about everyday things." },
    { n: 2, id: "paragraphs", title: "Everyday paragraphs", blurb: "Three or four connected sentences about home and your day." },
    { n: 3, id: "stories", title: "Beginner stories", blurb: "A short story with a beginning, a middle and an end." },
    { n: 4, id: "dialogues", title: "Dialogues to read", blurb: "Conversations shown as texts. Harakat are hidden at first." }
  ];

  // Each passage: lines [ar, translit, en, speaker?]; glossary [ar, translit, en]; questions [prompt, options, index of the correct option, explanation]
  const RAW = [
    { id: "read-s1", level: 1, title: "My family and my house", marks: true,
      intro: "Read each sentence. Then answer the questions.",
      lines: [
        ["هَٰذَا بَيْتِي.", "hādhā baytī.", "This is my house."],
        ["بَيْتِي كَبِير.", "baytī kabīr.", "My house is big."],
        ["هَٰذِهِ أُمِّي.", "hādhihi ummī.", "This is my mother."],
        ["أَبِي طَبِيب.", "abī ṭabīb.", "My father is a doctor."],
        ["أُخْتِي طَالِبَة.", "ukhtī ṭāliba.", "My sister is a student."],
        ["أَنَا أُحِبُّ الشَّاي.", "anā uḥibbu sh-shāy.", "I like tea."] ],
      glossary: [["ـِي", "-ī", "my (added to the end of a noun): بَيْتِي “my house”, أُمِّي “my mother”"], ["كَبِير", "kabīr", "big"], ["أُحِبُّ", "uḥibbu", "I like, I love"]],
      questions: [
        ["What is the father’s job?", ["Doctor", "Teacher", "Student", "Engineer"], 0, "أَبِي طَبِيب (abī ṭabīb): “My father is a doctor”."],
        ["Who is the student?", ["The sister", "The mother", "The father", "The writer’s friend"], 0, "أُخْتِي طَالِبَة (ukhtī ṭāliba): “My sister is a student”."],
        ["What does the writer like?", ["Tea", "Coffee", "Juice", "Milk"], 0, "أَنَا أُحِبُّ الشَّاي (anā uḥibbu sh-shāy): “I like tea”."],
        ["How is the house?", ["Big", "Small", "New", "Cold"], 0, "بَيْتِي كَبِير (baytī kabīr): “My house is big”."] ] },
    { id: "read-s2", level: 1, title: "Food and weather", marks: true,
      intro: "Read each sentence. Then answer the questions.",
      lines: [
        ["أَنَا أَشْرَبُ الْمَاء.", "anā ashrabu l-māʾ.", "I drink the water."],
        ["هُوَ يَأْكُلُ الْخُبْز.", "huwa yaʾkulu l-khubz.", "He eats the bread."],
        ["هِيَ تَشْرَبُ الْقَهْوَة.", "hiya tashrabu l-qahwa.", "She drinks the coffee."],
        ["نَحْنُ نَأْكُلُ الْجُبْن.", "naḥnu naʾkulu l-jubn.", "We eat the cheese."],
        ["الْعَصِير بَارِد.", "al-ʿaṣīr bārid.", "The juice is cold."],
        ["الطَّقْس حَارّ.", "aṭ-ṭaqs ḥārr.", "The weather is hot."] ],
      glossary: [["الـ", "al-", "the (added to the start of a noun): الْمَاء “the water”"], ["بَارِد", "bārid", "cold"], ["حَارّ", "ḥārr", "hot"]],
      questions: [
        ["Who drinks the coffee?", ["She", "He", "I", "We"], 0, "هِيَ تَشْرَبُ الْقَهْوَة (hiya tashrabu l-qahwa): “She drinks the coffee”. هِيَ means “she”."],
        ["What do “we” eat?", ["The cheese", "The bread", "The apples", "The fish"], 0, "نَحْنُ نَأْكُلُ الْجُبْن (naḥnu naʾkulu l-jubn): “We eat the cheese”."],
        ["What is cold?", ["The juice", "The water", "The coffee", "The weather"], 0, "الْعَصِير بَارِد (al-ʿaṣīr bārid): “The juice is cold”."],
        ["How is the weather?", ["Hot", "Cold", "Rainy", "Snowy"], 0, "الطَّقْس حَارّ (aṭ-ṭaqs ḥārr): “The weather is hot”."] ] },
    { id: "read-p1", level: 2, title: "My house", marks: true,
      intro: "Read the paragraph, then answer the questions.",
      lines: [
        ["بَيْتِي فِي الْمَدِينَة.", "baytī fī l-madīna.", "My house is in the city."],
        ["فِي بَيْتِي غُرْفَة وَمَطْبَخ وَحَمَّام.", "fī baytī ghurfa wa-maṭbakh wa-ḥammām.", "In my house there is a room, a kitchen and a bathroom."],
        ["فِي الْغُرْفَة سَرِير وَطَاوِلَة.", "fī l-ghurfa sarīr wa-ṭāwila.", "In the room there is a bed and a table."],
        ["أُحِبُّ بَيْتِي.", "uḥibbu baytī.", "I like my house."] ],
      glossary: [["فِي", "fī", "in"], ["وَ", "wa-", "and (a one-letter word written joined to the next word)"], ["غُرْفَة", "ghurfa", "room"]],
      questions: [
        ["Where is the house?", ["In the city", "In a village", "On a mountain", "Near the sea"], 0, "بَيْتِي فِي الْمَدِينَة (baytī fī l-madīna): “My house is in the city”."],
        ["What is in the room?", ["A bed and a table", "A kitchen", "A garden", "A car"], 0, "فِي الْغُرْفَة سَرِير وَطَاوِلَة: “In the room there is a bed and a table”."],
        ["Which place is NOT mentioned in the text?", ["A garden", "A kitchen", "A bathroom", "A room"], 0, "The house has a room, a kitchen and a bathroom. A garden is not mentioned."],
        ["How does the writer feel about the house?", ["The writer likes it", "The writer dislikes it", "The writer is afraid of it", "The writer is selling it"], 0, "أُحِبُّ بَيْتِي (uḥibbu baytī): “I like my house”."] ] },
    { id: "read-p2", level: 2, title: "My day", marks: true,
      intro: "Read the paragraph, then answer the questions.",
      lines: [
        ["أَسْتَيْقِظُ فِي الصَّبَاح.", "astayqiẓu fī ṣ-ṣabāḥ.", "I wake up in the morning."],
        ["أَشْرَبُ الشَّاي وَآكُلُ الْخُبْز.", "ashrabu sh-shāy wa-ākulu l-khubz.", "I drink tea and eat bread."],
        ["ثُمَّ أَذْهَبُ إِلَى الْمَدْرَسَة.", "thumma adhhabu ilā l-madrasa.", "Then I go to school."],
        ["فِي الْمَسَاء أَرْجِعُ إِلَى الْبَيْت وَأَقْرَأُ كِتَابًا.", "fī l-masāʾ arjiʿu ilā l-bayt wa-aqraʾu kitāban.", "In the evening I go back to the house and read a book."] ],
      glossary: [["أَذْهَبُ", "adhhabu", "I go"], ["إِلَى", "ilā", "to, towards"], ["أَرْجِعُ", "arjiʿu", "I return, I go back"]],
      questions: [
        ["What does the writer drink in the morning?", ["Tea", "Coffee", "Water", "Juice"], 0, "أَشْرَبُ الشَّاي (ashrabu sh-shāy): “I drink tea”."],
        ["Where does the writer go after breakfast?", ["To school", "To the market", "To the station", "To the bank"], 0, "ثُمَّ أَذْهَبُ إِلَى الْمَدْرَسَة: “Then I go to school”."],
        ["What does the writer do in the evening?", ["Goes back home and reads a book", "Goes to work", "Travels by train", "Plays outside"], 0, "أَرْجِعُ إِلَى الْبَيْت وَأَقْرَأُ كِتَابًا: “I go back to the house and read a book”."],
        ["When does the writer wake up?", ["In the morning", "In the evening", "At night", "In the afternoon"], 0, "أَسْتَيْقِظُ فِي الصَّبَاح: “I wake up in the morning”."] ] },
    { id: "read-t1", level: 3, title: "At the market", marks: true,
      intro: "Read the story, then answer the questions.",
      lines: [
        ["تَذْهَبُ سَارَة إِلَى السُّوق.", "tadhhabu sāra ilā s-sūq.", "Sara goes to the market."],
        ["هِيَ تُرِيدُ تُفَّاحًا وَخُبْزًا.", "hiya turīdu tuffāḥan wa-khubzan.", "She wants apples and bread."],
        ["تَسْأَلُ سَارَة: بِكَمْ التُّفَّاح؟", "tasʾalu sāra: bikam at-tuffāḥ?", "Sara asks: How much are the apples?"],
        ["يَقُولُ الْبَائِع: خَمْسَة دَنَانِير.", "yaqūlu l-bāʾiʿ: khamsa danānīr.", "The seller says: Five dinars."],
        ["تَدْفَعُ سَارَة وَتَقُولُ: شُكْرًا.", "tadfaʿu sāra wa-taqūlu: shukran.", "Sara pays and says: Thank you."],
        ["يَقُولُ الْبَائِع: عَفْوًا.", "yaqūlu l-bāʾiʿ: ʿafwan.", "The seller says: You’re welcome."] ],
      glossary: [["الْبَائِع", "al-bāʾiʿ", "the seller (from يَبِيعُ “he sells”)"], ["تَسْأَلُ", "tasʾalu", "she asks"], ["تَقُولُ", "taqūlu", "she says"], ["تُفَّاحًا", "tuffāḥan", "apples (the -an ending is used after the verb “wants”)"]],
      questions: [
        ["Where does Sara go?", ["To the market", "To school", "To the bank", "To the station"], 0, "تَذْهَبُ سَارَة إِلَى السُّوق: “Sara goes to the market”."],
        ["What does she want?", ["Apples and bread", "Fish and cheese", "A shirt", "Tea and coffee"], 0, "هِيَ تُرِيدُ تُفَّاحًا وَخُبْزًا: “She wants apples and bread”."],
        ["How much are the apples?", ["Five dinars", "Ten dinars", "Eight dinars", "Two dinars"], 0, "خَمْسَة دَنَانِير (khamsa danānīr): “five dinars”."],
        ["What does the seller say at the end?", ["You’re welcome", "Goodbye", "How much?", "Welcome"], 0, "The seller says عَفْوًا (ʿafwan): “You’re welcome”."] ] },
    { id: "read-t2", level: 3, title: "Yusuf’s trip", marks: true,
      intro: "Read the story, then answer the questions.",
      lines: [
        ["يُوسُف طَالِب مِنْ مِصْر.", "yūsuf ṭālib min miṣr.", "Yusuf is a student from Egypt."],
        ["هُوَ يُسَافِرُ إِلَى الْأُرْدُنّ بِالطَّائِرَة.", "huwa yusāfiru ilā l-urdunn bi-ṭ-ṭāʾira.", "He travels to Jordan by plane."],
        ["يَصِلُ إِلَى عَمَّان فِي الْمَسَاء.", "yaṣilu ilā ʿammān fī l-masāʾ.", "He arrives in Amman in the evening."],
        ["الطَّقْس بَارِد فِي عَمَّان.", "aṭ-ṭaqs bārid fī ʿammān.", "The weather is cold in Amman."],
        ["يَذْهَبُ إِلَى الْفُنْدُق بِسَيَّارَة أُجْرَة.", "yadhhabu ilā l-funduq bi-sayyārat ujra.", "He goes to the hotel by taxi."],
        ["يُحِبُّ يُوسُف الْأُرْدُنّ.", "yuḥibbu yūsuf al-urdunn.", "Yusuf likes Jordan."] ],
      glossary: [["عَمَّان", "ʿammān", "Amman (the capital of Jordan)"], ["بِـ", "bi-", "by, with (joined to the next word): بِالطَّائِرَة “by plane”"], ["يَصِلُ", "yaṣilu", "he arrives"]],
      questions: [
        ["Where is Yusuf from?", ["Egypt", "Jordan", "Morocco", "Syria"], 0, "يُوسُف طَالِب مِنْ مِصْر: “Yusuf is a student from Egypt”."],
        ["How does he travel to Jordan?", ["By plane", "By train", "By ship", "By bus"], 0, "بِالطَّائِرَة (bi-ṭ-ṭāʾira): “by plane”."],
        ["How is the weather in Amman?", ["Cold", "Hot", "Rainy", "Sunny"], 0, "الطَّقْس بَارِد فِي عَمَّان: “The weather is cold in Amman”."],
        ["How does he go to the hotel?", ["By taxi", "On foot", "By bicycle", "By train"], 0, "بِسَيَّارَة أُجْرَة (bi-sayyārat ujra): “by taxi”."] ] },
    { id: "read-d1", level: 4, title: "At the café", marks: false,
      intro: "Read the dialogue. Harakat are hidden: switch them on if you need help.",
      lines: [
        ["مَرْحَبًا. هَلْ عِنْدَكُمْ قَهْوَة؟", "marḥaban. hal ʿindakum qahwa?", "Hello. Do you have coffee?", "Customer"],
        ["نَعَمْ، عِنْدَنَا قَهْوَة وَشَاي وَعَصِير.", "naʿam, ʿindanā qahwa wa-shāy wa-ʿaṣīr.", "Yes, we have coffee, tea and juice.", "Worker"],
        ["أُرِيدُ قَهْوَةً وَمَاءً، مِنْ فَضْلِكَ.", "urīdu qahwatan wa-māʾan, min faḍlika.", "I want coffee and water, please.", "Customer"],
        ["حَسَنًا. تَفَضَّلْ.", "ḥasanan. tafaḍḍal.", "OK. Here you are.", "Worker"],
        ["شُكْرًا.", "shukran.", "Thank you.", "Customer"] ],
      glossary: [["عِنْدَكُمْ", "ʿindakum", "you (plural, polite) have"], ["عِنْدَنَا", "ʿindanā", "we have"], ["قَهْوَةً", "qahwatan", "coffee (the -an ending is used after the verb “want”)"]],
      questions: [
        ["What does the customer ask first?", ["Whether they have coffee", "How much the tea costs", "Where the bathroom is", "What time it is"], 0, "هَلْ عِنْدَكُمْ قَهْوَة؟ means “Do you have coffee?”."],
        ["Which drinks does the café have?", ["Coffee, tea and juice", "Only coffee", "Water and milk", "Tea and milk"], 0, "عِنْدَنَا قَهْوَة وَشَاي وَعَصِير: “We have coffee, tea and juice”."],
        ["What does the customer order?", ["Coffee and water", "Tea and juice", "Coffee and bread", "Juice and water"], 0, "أُرِيدُ قَهْوَةً وَمَاءً: “I want coffee and water”."],
        ["What does the worker say when handing over the order?", ["تَفَضَّلْ (here you are)", "عَفْوًا (excuse me)", "لَا (no)", "مَرْحَبًا (hello)"], 0, "تَفَضَّلْ (tafaḍḍal) is said when giving someone something.", true] ] },
    { id: "read-d2", level: 4, title: "In the classroom", marks: false,
      intro: "Read the dialogue. Harakat are hidden: switch them on if you need help.",
      lines: [
        ["صَبَاحُ الْخَيْرِ يَا مُعَلِّمَة.", "ṣabāḥu l-khayr yā muʿallima.", "Good morning, teacher.", "Student"],
        ["صَبَاحُ النُّورِ. مَا اسْمُكَ؟", "ṣabāḥu n-nūr. mā smuka?", "Good morning. What is your name?", "Teacher"],
        ["اِسْمِي عُمَر.", "ismī ʿumar.", "My name is Omar.", "Student"],
        ["مِنْ أَيْنَ أَنْتَ يَا عُمَر؟", "min ayna anta yā ʿumar?", "Where are you from, Omar?", "Teacher"],
        ["أَنَا مِنَ الْمَغْرِب. أَنَا مَغْرِبِيّ.", "anā mina l-maghrib. anā maghribiyy.", "I am from Morocco. I am Moroccan.", "Student"] ],
      glossary: [["يَا مُعَلِّمَة", "yā muʿallima", "O teacher (to a female teacher)"], ["صَبَاحُ النُّورِ", "ṣabāḥu n-nūr", "good morning (the reply)"], ["مَغْرِبِيّ", "maghribiyy", "Moroccan (man)"]],
      questions: [
        ["What is the student’s name?", ["Omar", "Ahmad", "Yusuf", "Sara"], 0, "اِسْمِي عُمَر (ismī ʿumar): “My name is Omar”."],
        ["Where is the student from?", ["Morocco", "Egypt", "Jordan", "Lebanon"], 0, "أَنَا مِنَ الْمَغْرِب: “I am from Morocco”."],
        ["Who asks the questions?", ["The teacher", "The student", "Both of them equally", "Nobody"], 0, "The teacher asks مَا اسْمُكَ؟ and مِنْ أَيْنَ أَنْتَ؟."],
        ["Who does the student greet first?", ["The teacher", "A friend", "The headmaster", "His mother"], 0, "He says صَبَاحُ الْخَيْرِ يَا مُعَلِّمَة (“Good morning, teacher”)."] ] }
  ];

  const PASSAGES = RAW.map(p => ({
    id: p.id, level: p.level, title: p.title, kind: LEVELS[p.level - 1].id, marks: p.marks, intro: p.intro, register: "msa",
    lines: p.lines.map((l, i) => { const ar = l[0].normalize("NFC"); return { n: i + 1, ar: ar, plain: strip(ar), translit: l[1], en: l[2], speaker: l[3] || "", audioKey: "rd-" + p.id.slice(5) + "-" + (i + 1) }; }),
    glossary: p.glossary.map(g => ({ ar: g[0].normalize("NFC"), translit: g[1], en: g[2] })),
    questions: p.questions.map((q, i) => ({ id: p.id + "-q" + (i + 1), prompt: q[0], options: q[1], answer: q[2], explanation: q[3], arabicOptions: !!q[4] }))
  }));
  return { LEVELS, PASSAGES, PASS_PERCENT };
});
