# Reviewer guide — Arabic course content

## What this is
The Learn Arabic course (alphabet, harakat, reading practice) was written and tested by software. Automated tests can check **structure** (for example: all 28 letters exist, a vowelled spelling matches its plain spelling, a letter sits where the lesson says). They **cannot** tell whether a pronunciation note is good teaching, whether a word is natural Modern Standard Arabic, or whether an English meaning is the best choice. **That judgement needs a qualified Arabic teacher.** Until a teacher has completed this review, none of the course content should be described as linguistically verified.

## Files
| File | Purpose |
|---|---|
| `review-items.csv` | One row per reviewable item (544 rows). Open in Excel/Sheets (UTF-8 with BOM, so Arabic displays correctly). **Fill in the last three columns.** |
| `review-sheet.md` | The same items grouped by lesson, easier to read straight through. |
| `build-review-package.mjs` | Regenerates both files from the course source, so every value traces to a source location (the `source` column). |

## Contents
- alphabet: 56 items
- example-word: 56 items
- harakat: 36 items
- letter-shapes: 28 items
- look-alike group: 9 items
- missing-letter exercise: 56 items
- page-template: 20 items
- page-text: 9 items
- pronunciation: 28 items
- quick-check: 139 items
- reading-item: 27 items
- reading-stage: 6 items
- sentence-example: 12 items
- sentence-pattern: 4 items
- vocabulary: 51 items
- vocabulary-dialect: 3 items
- vocabulary-topic: 4 items

147 items are marked **high** priority. This is a rule-based suggestion (emphatic/pharyngeal/uvular letters, claims about dialects, hamza, dagger alif, ta marbuta, non-joining letters, factual statements about the writing system). It is not a judgement that other items are safe, so please review all of them.

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
- **page-text / page-template:** statements the page makes to every learner about joining rules, audio and dialects.

## Special cases that need extra care
- **contains-arabic-example**: 3 items (listed at the end of `review-sheet.md`)
- **dagger-alif**: 9 items (listed at the end of `review-sheet.md`)
- **dialect**: 3 items (listed at the end of `review-sheet.md`)
- **hamza**: 35 items (listed at the end of `review-sheet.md`)
- **hamzat-wasl**: 4 items (listed at the end of `review-sheet.md`)
- **lam-alif-ligature**: 9 items (listed at the end of `review-sheet.md`)
- **makes-a-dialect-claim**: 4 items (listed at the end of `review-sheet.md`)
- **non-joining-letter**: 20 items (listed at the end of `review-sheet.md`)
- **non-joining-letter-inside-word**: 128 items (listed at the end of `review-sheet.md`)
- **shadda**: 25 items (listed at the end of `review-sheet.md`)
- **sukun**: 77 items (listed at the end of `review-sheet.md`)
- **ta-marbuta**: 34 items (listed at the end of `review-sheet.md`)
- **tanween**: 23 items (listed at the end of `review-sheet.md`)
- **uses-character-outside-the-28-letter-table**: 64 items (listed at the end of `review-sheet.md`)

## What the automated checks do and do not cover
The column `automated_checks_STRUCTURE_ONLY` records what software verified. It never means a row is approved. In particular, software has **not** checked: pronunciation, naturalness of usage, correctness of English meanings, correctness of vowel marks beyond consistency with the plain spelling, or dialect statements.

## Known limits of the course content (for context)
- Examples are Modern Standard Arabic; dialect pronunciations are mentioned only briefly.
- Transliteration is a rough guide; audio uses a device text-to-speech voice (not native recordings) where available.
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
