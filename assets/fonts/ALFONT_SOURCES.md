# Alfont source registry (Phase 10A)

This is the human-readable companion to `alfont-audit.json`. It records
every candidate discovered on [alfont.com](https://alfont.com/) during
Phase 10A's discovery pass, why each was or wasn't accepted, and where
the authoritative license evidence (or absence of it) came from.

**Read this before touching anything here again:** no font file was
downloaded from alfont.com during this audit, and nothing in this file
list has been added to `assets/fonts/calligraphy/`. Downloading files
requires the user's explicit permission per this project's operating
rules, and the license gate had not been cleared for any single
alfont-hosted candidate at the time this registry was written — so
there was nothing yet worth downloading. See "What alfont.com actually
is" below for why.

## What alfont.com actually is

Checked directly, not assumed:

- The **homepage** displays zero license policy, terms of use, or
  copyright disclaimer of any kind.
- **Every individual font page checked** (sampled across categories)
  shows only a generic "free download" line — no designer name, no
  version, no copyright notice, no license text. `quran-taha1-arabic-font-download.html`
  is a representative example: nothing beyond "تحميل خط ... مجاناً"
  ("download font ... for free").
- **Category labels are not reliable indicators of calligraphic
  style.** The "Thulth" (Thuluth) category's first page includes
  **Rubik** — a real, well-known Google Fonts geometric sans-serif
  with no calligraphic character at all. The "Ruq'ah" category
  includes **Forma DJR Arabic Text** (a commercially-sold retail
  font from Darden Studio) and **Bree ARA TN Trial** (explicitly a
  restricted evaluation build of a commercial font, six weights). The
  "Diwani" category includes **Arabic Typesetting** — Microsoft's own
  proprietary system font that ships with Windows/Office. The "Kufi"
  category's first page includes fonts like "Glass Flowers 3D" and
  "Chrome Elements" that aren't Arabic calligraphy at all.

This is exactly the pattern the phase's own instructions warned
against: a "free download" button proves nothing about legal
redistribution rights, and several fonts on this specific site are
demonstrably NOT free (a Microsoft system font, a commercial retail
family, a commercial trial build). Given that pattern holds across
every category sampled, **no file hosted directly by alfont.com can
be classified SAFE TO BUNDLE without independent verification from an
authoritative source elsewhere** — alfont's own page content is not
evidence either way.

## Candidates found, by requested style category

### Naskh (نسخ)
Category page: https://alfont.com/naskh-arabic-fonts (10 pages).
Sampled page 1: KA Typical Naskh v2.0, Naskh Al Ghurairi, the
Alyamama family (5 weights), "monasabat sahabatmatar25". No designer/
license info on any individual page. **No candidate cleared the
license gate.**

### Thuluth (ثلث)
Category page: https://alfont.com/thulth-arabic-fonts (7 pages).
Sampled page 1: "The Year of The Camel", "DG Tofan Al Aqsa", "Nasrt
Font Bold", "H ALHFHAF", "Arabic Poetry Medium", and the **Rubik**
family (5 weights — see "What alfont.com actually is" above; Rubik is
real and OFL-licensed from its authoritative Google Fonts source, but
it is not Thuluth calligraphy and isn't a candidate for this
project's purpose). **No genuine Thuluth candidate cleared the
license gate this pass** — none of the traditional-sounding names had
any locatable designer or license evidence.

### Jali Thuluth (ثلث جلي)
No dedicated alfont listing found via targeted search. **Not
available from this source.**

### Diwani (ديواني)
Category page: https://alfont.com/diwany-arabic-fonts (10 pages).
Sampled page 1: Kawkab Mono (3 weights), **Arabic Typesetting** (DO
NOT USE — Microsoft proprietary), **Sahel** (genuinely SIL OFL, but
from its own GitHub repo, not alfont — and not actually a Diwani
calligraphic style, a modern Persian sans-serif mis-filed here), "B
Yekan" (a font with a known, contested Persian-market licensing
history — not verified free). Targeted search also surfaced **UKIJ
Diwani Tom**, from the real UKIJ project, but UKIJ's individual
releases have historically carried varying terms, so this needs a
per-font check, not a project-wide assumption. **No candidate cleared
the license gate.**

### Jali Diwani (جلي ديواني)
No dedicated alfont listing found via targeted search. **Not
available from this source.**

### Ruq'ah (رقعة)
Category page: https://alfont.com/ruqaa-arabic-fonts (9 pages).
Sampled page 1: the Janna/AJannat family, "(A) Arslan Wessam B",
**Bree ARA TN Trial** (DO NOT USE — commercial trial), **Forma DJR
Arabic Text Bold** (DO NOT USE — commercial retail font), **Aref
Ruqaa Swashes Fixed Bold**, "Lifta Swash Fixed". Aref Ruqaa is
genuinely SIL OFL and its base family is already bundled in this
project (`assets/fonts/calligraphy/arefruqaa/`,
`arefruqaaink/`) from Phase 8 — but sourced from `google/fonts`
directly, not alfont's differently-named copy. **No new candidate
cleared the license gate.**

### Nastaliq (نستعليق) / Persian (فارسی)
No single dedicated category page; found via targeted search: "Mj
Ojan", "W homa", "Mj Faraz", **Kacst Farsi** (part of the real KACST
government-funded font project, GPLv2 per Fedora's own packaging —
promising provenance but a different license family than this
project's existing OFL fonts, needing its own compatibility check),
"B Titr Bold", **Hussaini Nastaleeq** (a recognizable Nastaliq name,
but no designer or license evidence located this pass). **No
candidate cleared the license gate.**

### Ijazah (إجازة)
No dedicated alfont listing found via targeted search. **Not
available from this source.**

### Maghribi (مغربي)
Found via targeted search: **aalmaghribi quran** and **Samir Khouaja
Maghribi Bold**. The latter names a real, identifiable designer
(Samir Khouaja) — the single best lead of this entire audit, since
most other listings are anonymous. Neither has a located license.
This is the exact style Phase 9's prior work flagged as lacking
verified digital assets, and alfont does not resolve that gap.
**No candidate cleared the license gate; Samir Khouaja is worth a
dedicated follow-up (searching for their own site/portfolio) before
concluding further.**

### Muhaqqaq (محقق)
No dedicated alfont listing found via targeted search. **Not
available from this source.**

### Rayhani (ريحاني)
No dedicated alfont listing found via targeted search. **Not
available from this source.**

### Kufi (كوفي)
Category page: https://alfont.com/kufi-fonts (3+ pages). Sampled page
1: "Qashib Regular", "Glass Flowers 3D 2", "Guesswhat Exceptional",
"KO Pilot Regular", "KAF GULZAR", "TS Hanazad Display", "Chrome
Elements", "Sultan Display Regular", "ALAQ HALAB" — several of these
are plainly not Arabic calligraphy at all (see "What alfont.com
actually is"). Targeted search also found "Kufyan Arabic" (2 weights)
and "kufi v1". **No candidate cleared the license gate.**

### Quranic calligraphy
Found via targeted search: **Quran Taha1**
(https://alfont.com/quran-taha1-arabic-font-download.html) — its
individual page was inspected directly and confirmed to carry zero
designer, version, or license information. **No candidate cleared the
license gate.**

### Decorative Arabic calligraphy
Not separately surveyed as its own category this pass — the
site's "New Arabic Fonts" feed and the mis-categorized entries above
(Glass Flowers 3D, Chrome Elements, etc.) suggest this bucket is
dominated by non-calligraphic decorative/display fonts, consistent
with the pattern seen everywhere else on the site.

## Final decision for every candidate

**Zero fonts from alfont.com are approved for
`assets/fonts/calligraphy/` as a result of this audit.** Three
specific reasons converge on that outcome: (1) alfont itself supplies
no license evidence for anything, ever; (2) where a candidate's name
matched a real, independently-traceable open-source project (Aref
Ruqaa, Sahel, the KACST family), the correct and available path is to
source that font from its own authoritative origin — which for Aref
Ruqaa is already done — not from alfont's copy of unconfirmed
provenance; and (3) the traditional styles this project most needs
(Jali Thuluth, Jali Diwani, Ijazah, Muhaqqaq, Rayhani) simply were not
found on this site at all. See `alfont-audit.json` for the
per-candidate machine-readable detail, and the Phase 10A final report
for what's recommended next.
