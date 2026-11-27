# Reviewer guide — Arabic grammar lessons (DRAFT)

## What this is
Eight beginner Arabic grammar lessons for the Learn Arabic Academy were **drafted by software** and have **not been reviewed or approved by any qualified Arabic teacher**. They are **not published**: they are not in the live course catalogue, no grammar page has been generated, and nothing here is verified. This package lets a qualified teacher check every explanation, example, common mistake and mini-check question, and record exact corrections.

Automated tests can check **structure** (for example: every example contains Arabic letters and vowel marks, a quiz has a valid answer index and distinct choices, the consonants of a transliteration match the Arabic). They **cannot** tell whether an explanation is good teaching, whether a sentence is natural Modern Standard Arabic, whether a vowel mark or case ending is right, or whether an English translation is the best one. Every software check is labelled **STRUCTURE ONLY** and never means an item is correct.

## Files
| File | Purpose |
|---|---|
| `grammar-review-items.csv` | One row per reviewable item (258 rows). Open in Excel/Sheets (UTF-8 with BOM, so Arabic displays correctly). **Fill in the last four columns.** |
| `grammar-review-sheet.md` | The same items grouped by lesson, easier to read straight through. |
| `grammar-drafts.json` | The eight draft lessons exactly as written. Every item points into this file (the `source` column). Do not edit it; send corrections back through the CSV. |
| `build-grammar-review.mjs` | Regenerates the CSV, the sheet, this guide and the manifest from `grammar-drafts.json`. |
| `MANIFEST.txt` | SHA-256 hashes identifying the exact drafts and generated files, with the explicit UNREVIEWED status. |

## Contents
- 8 lessons, 258 review items: 8 lesson-summary; 57 explanation; 96 example; 31 common-mistake; 66 mini-check.
- 53 items are flagged by the author for special attention (listed at the end of `grammar-review-sheet.md` and in the `author_flag_for_teacher` column). A flag means “simplified, disputed or context dependent — please assess”; it does not mean the item is wrong, and unflagged items are **not** safe. Please review everything.

## How to review
1. Work lesson by lesson. For each row read **arabic_as_implemented**, **plain_spelling**, **transliteration** and **english_text** and check them against your own knowledge and a reference you trust.
2. In **teacher_decision** enter exactly one of: `approved`, `correction needed`, `uncertain`.
3. If the decision is `correction needed`, write the exact replacement in **proposed_correction** (Arabic with every mark you want, then transliteration and English if they change) and name the field you are correcting in **corrected_field_ref** by copying one pointer from the **field_refs** column (for example `/lessons/2/examples/4/ar`). Explain in **reviewer_comments**. If a correction touches several fields, put each pointer on its own line.
4. Use `uncertain` whenever you cannot confirm an item, and say why in **reviewer_comments**. Please do not guess.
5. Do not edit item IDs or any other column. The item ID and the `source` column are how a correction is traced back to the exact lesson field.
6. When finished, fill in the sign-off block at the end of `grammar-review-sheet.md` (copy it into your returned file if you work in the CSV).

## How an item traces back to its lesson field
- **item_id** is stable and positional: `GR-<LESSON>-<KIND>-<NN>`, for example `GR-GENDER-EX-04` is the 4th example of the gender lesson. Kinds: SUM (title and summary), EXP (explanation block), EX (example), MIS (common mistake), CHK (mini-check question).
- **source** is `docs/arabic-grammar-review/grammar-drafts.json#<JSON pointer>` to the item. **field_refs** lists a JSON pointer for each individual field of the item (`/ar`, `/translit`, `/en`, `/choices/2`, `/answerIndex` …), so a correction can name exactly what to change.
- IDs follow the order in the drafts. After corrections are applied the package is regenerated and IDs are re-issued, so please keep your returned file: it is the record of what was approved.

## What to look at in each lesson
- **Definite article:** which letters are classed as sun and moon letters; how the lam of الـ is pronounced and written (sukun or shadda); the silent alif after another word; whether the transliteration conventions (`al-`, `ash-`, `l-`) are acceptable.
- **Pronouns and nominal sentences:** the six pronouns and their forms; the statement that an ordinary present-tense nominal sentence has no word for “am/is/are”; the contrast between nominal and verbal sentences and how pronoun + verb sentences are classed; the plurals used with نَحْنُ.
- **Masculine and feminine:** the ة (taa marbuta) pattern, its pronunciation, and the exceptions (feminine nouns without ة; masculine words and names that end in ة).
- **Adjective agreement:** gender, definiteness and case agreement; the difference between a noun phrase and a sentence; whether the adjectives are natural.
- **Possession (الإضافة):** the form of the first noun (no ال, no tanween), the genitive second noun, the possessive endings, and every case ending shown.
- **Question words:** the meaning and usage of مَنْ، مَا، مَاذَا، أَيْنَ، مَتَى، لِمَاذَا، كَيْفَ، كَمْ, the simplified مَا / مَاذَا rule, and the idioms used.
- **Present-tense verbs:** the prefixes and endings for أَنَا، أَنْتَ، أَنْتِ، هُوَ، هِيَ، نَحْنُ; the stem vowels; the final damma; verb-first sentences and verb agreement.
- **Negation and prepositions:** لَا with verbs; لَيْسَ with its six forms and the accusative predicate; the other negation words that are only named (لَمْ, لَنْ); the prepositions فِي، عَلَى، مِنْ، إِلَى، مَعَ and the genitive after them.
- **Every Arabic example:** spelling, **all** vowel marks and case endings, transliteration, the English translation, and whether it is natural beginner-level Modern Standard Arabic.
- **Every mini-check:** is the keyed answer correct; is every other choice really wrong; could a distractor also be acceptable; is the explanation accurate.

## What the automated checks do and do not cover
The column `automated_checks_STRUCTURE_ONLY` records what software verified. It never means a row is approved. In particular, software has **not** checked: grammar rules, naturalness of usage, correctness of vowel marks and case endings, correctness of English meanings, the answer keys, or the accuracy of any explanation.

## Known limits of these drafts (for context)
- Examples are Modern Standard Arabic written with full vowel marks, including case endings, because the lessons teach endings. The existing course shows vocabulary in dictionary (pausal) form.
- The transliteration follows the existing course style (macrons, `ʿ`, `l-` for the silent alif of الـ) and is a guide only.
- Some words used in examples are not in the course vocabulary. They have no vocabulary link.

## After the review
A developer will apply corrections to `grammar-drafts.json` using the `source` and `corrected_field_ref` columns, regenerate this package and re-run the tests. The drafts will stay unpublished until the owner decides otherwise.

## Note on location
This folder sits inside the website repository. If the site is published from the repository root, these files may be publicly reachable at their paths. They contain only draft course content, but publication is a decision for the site owner.

## Reviewer sign-off (to be completed by the reviewer)
- Reviewer name:
- Qualification / relevant experience:
- Date review completed:
- Scope reviewed (all items / listed lessons only):
- Overall comments:
