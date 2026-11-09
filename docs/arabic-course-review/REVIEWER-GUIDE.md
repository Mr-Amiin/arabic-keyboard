# Reviewer guide — Arabic course content

## What this is
The Learn Arabic course (alphabet, harakat, reading practice) was written and tested by software. Automated tests can check **structure** (for example: all 28 letters exist, a vowelled spelling matches its plain spelling, a letter sits where the lesson says). They **cannot** tell whether a pronunciation note is good teaching, whether a word is natural Modern Standard Arabic, or whether an English meaning is the best choice. **That judgement needs a qualified Arabic teacher.** Until a teacher has completed this review, none of the course content should be described as linguistically verified.

## Files
| File | Purpose |
|---|---|
| `review-items.csv` | One row per reviewable item (1112 rows). Open in Excel/Sheets (UTF-8 with BOM, so Arabic displays correctly). **Fill in the last three columns.** |
| `review-sheet.md` | The same items grouped by lesson, easier to read straight through. |
| `recording-script.csv` | The exact Arabic text of every word and sentence the course can speak aloud, one row per audio key (402 rows), with blank columns for who recorded and who verified it. Nothing is recorded yet: the course uses a device voice. Record only text you have approved in the review above. |
| `build-review-package.mjs` | Regenerates both files from the course source, so every value traces to a source location (the `source` column). |

## Contents
- alphabet: 56 items
- comprehension-question: 64 items
- conversation-unit: 8 items
- conversation-vocabulary: 8 items
- dialect-note: 15 items
- dialogue-line: 50 items
- example-word: 56 items
- harakat: 36 items
- letter-shapes: 28 items
- look-alike group: 9 items
- missing-letter exercise: 56 items
- page-template: 26 items
- page-text: 11 items
- pronunciation: 52 items
- quick-check: 139 items
- reading-glossary: 25 items
- reading-item: 27 items
- reading-line: 42 items
- reading-passage: 8 items
- reading-stage: 6 items
- sentence-example: 33 items
- sentence-pattern: 4 items
- vocabulary: 310 items
- vocabulary-dialect: 3 items
- vocabulary-topic: 16 items
- vocabulary-variant: 24 items

463 items are marked **high** priority. This is a rule-based suggestion (emphatic/pharyngeal/uvular letters, claims about dialects, hamza, dagger alif, ta marbuta, non-joining letters, factual statements about the writing system). It is not a judgement that other items are safe, so please review all of them.

## How to review
1. Work lesson by lesson. For each row, read the **arabic_as_implemented**, **plain_spelling**, **transliteration** and **english_text** columns and check them against your own knowledge and a reference you trust.
2. In **teacher_decision** enter exactly one of: `approved`, `correction needed`, `uncertain`.
3. If the decision is `correction needed`, write the exact replacement in **proposed_correction** (Arabic with all marks you want, then transliteration and English if they change) and explain in **reviewer_comments**.
4. Use `uncertain` whenever you cannot confirm an item, and say why in **reviewer_comments**. Please do not guess.
5. Do not edit item IDs or the other columns. IDs are how corrections are matched back to the source.
6. When finished, fill in the sign-off block below.

## What to check, by category
- **alphabet / letter-shapes:** letter, Arabic name, English label, dots description; isolated / beginning / middle / end forms; the joining statement. The six letters that do not join to the following letter are ا د ذ ر ز و.
- **pronunciation:** accuracy and safety of each English-speaker approximation; whether statements about dialects are correct and appropriately worded; whether the guidance is MSA.
- **example-word:** correct spelling; correct short-vowel marks; correct transliteration; best English meaning; natural MSA usage; the position (beginning/middle/end) of the target letter. The context column contains **machine-derived** connected shapes: please confirm them, as they are produced by a simple joining rule.
- **harakat:** definitions, sounds, where each mark is written, and the notes about tanween and shadda.
- **quick-check / missing-letter exercise:** is the keyed answer correct; is the explanation shown to learners accurate; could a distractor also produce a valid word with the stated meaning.
- **reading-stage / reading-item:** spelling and vowelling, transliteration, meaning; whether the stage order is a sensible beginner progression; whether the stated grading (letters only, or letters and harakat) suits the stage.
- **vocabulary / vocabulary-topic:** Arabic with harakat, plain spelling, transliteration, English meaning, register (Modern Standard Arabic) and the grammar note on each topic. Each word also appears in spelling exercises as the plain spelling plus machine-made misspellings (see the context column).
- **vocabulary-variant / vocabulary-dialect / dialect-note:** regional or dialect forms shown only for recognition. Check the form, the region label, and whether it is correctly described as dialect or as standard Arabic used regionally (for example the Levantine month names). They are never quizzed.
- **conversation-unit / dialogue-line / conversation-vocabulary:** the dialogue text with harakat, its transliteration and English translation, speaker gender agreement, and the key-vocabulary list.
- **sentence-example:** fill-in sentences. Confirm the keyed word is right and that every distractor is wrong.
- **comprehension-question:** the keyed answer and explanation for dialogue and reading questions (option order is shuffled each time).
- **pronunciation:** the English-speaker pronunciation tips used in the speaking activities.
- **reading-passage / reading-line / reading-glossary:** the reading texts, their level, whether harakat are hidden at first, and the vocabulary explanations.
- **page-text / page-template:** statements the page makes to every learner about joining rules, audio, dialects, progress and completion.

## Special cases that need extra care
- **alif-maqsura**: 19 items (listed at the end of `review-sheet.md`)
- **contains-arabic-example**: 15 items (listed at the end of `review-sheet.md`)
- **dagger-alif**: 29 items (listed at the end of `review-sheet.md`)
- **dialect**: 30 items (listed at the end of `review-sheet.md`)
- **hamza**: 195 items (listed at the end of `review-sheet.md`)
- **hamzat-wasl**: 21 items (listed at the end of `review-sheet.md`)
- **lam-alif-ligature**: 42 items (listed at the end of `review-sheet.md`)
- **makes-a-dialect-claim**: 4 items (listed at the end of `review-sheet.md`)
- **non-joining-letter**: 20 items (listed at the end of `review-sheet.md`)
- **non-joining-letter-inside-word**: 483 items (listed at the end of `review-sheet.md`)
- **regional-usage**: 12 items (listed at the end of `review-sheet.md`)
- **shadda**: 166 items (listed at the end of `review-sheet.md`)
- **sukun**: 407 items (listed at the end of `review-sheet.md`)
- **ta-marbuta**: 149 items (listed at the end of `review-sheet.md`)
- **tanween**: 86 items (listed at the end of `review-sheet.md`)
- **uses-character-outside-the-28-letter-table**: 310 items (listed at the end of `review-sheet.md`)

## What the automated checks do and do not cover
The column `automated_checks_STRUCTURE_ONLY` records what software verified. It never means a row is approved. In particular, software has **not** checked: pronunciation, naturalness of usage, correctness of English meanings, correctness of vowel marks beyond consistency with the plain spelling, or dialect statements.

## Known limits of the course content (for context)
- Examples are Modern Standard Arabic; dialect forms are shown only in labelled notes and are never quizzed.
- Transliteration is a rough guide; audio uses a device text-to-speech voice (not native recordings) where available. The architecture can play verified human recordings later, once the Arabic text and the recording script are approved; none exist today.
- Vocabulary is given in dictionary (pausal) form without case endings, except in dialogues and sentences where an ending is part of the sentence.
- Month names follow the Gregorian names used in Egypt, the Gulf and North Africa; the Levant and Iraq names are shown as regional variants.
- Words containing hamza, ta marbuta or alif maqsura use characters beyond the 28-letter table; they are flagged `uses-character-outside-the-28-letter-table`.

## After the review
A developer will apply corrections using the `source` column and the proposed corrections, regenerate this package, and re-run the automated tests. Please keep the returned CSV: it is the record of what was approved. Do not edit course files directly.

## Note on location
This folder sits inside the website repository's root. If the site is published from the repository root, these files may be publicly reachable at their paths. They contain only course content, but publication is a decision for the site owner.

## Reviewer sign-off (to be completed by the reviewer)
- Reviewer name:
- Qualification / relevant experience:
- Date review completed:
- Scope reviewed (all items / listed lessons only):
- Overall comments:
