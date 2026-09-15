# Font asset licenses

This file is the authoritative font-licensing audit for every font family
bundled under `assets/fonts/calligraphy/`. It was first created in Phase 7
(spec point 17) covering the 12 families that already shipped a license
file in this repository, and was completed in Phase 8 §2 ("Font Licensing
— Highest Priority") by fetching and bundling an authoritative license
file for each of the remaining 20 families.

**Method, stated plainly so the claims below can be checked:** no license
information here is invented or assumed from a font's name, reputation, or
common belief about how Google Fonts licenses its catalog. Every row is
either (a) transcribed from a license/copyright file physically present in
that family's own folder in this repository, verified against the file's
own text, or (b) for the 20 families that had no such file before Phase 8,
fetched from that font family's own canonical upstream source — the
`google/fonts` GitHub repository's `ofl/<family>/OFL.txt` path, which
mirrors this project's own folder-naming convention — and then bundled
into the family's folder as `OFL.txt` so the claim is now backed by a file
in this repository exactly like the original 12. Each fetch was checked
for the full standard OFL 1.1 structure (a copyright/preamble line,
followed by "SIL OPEN FONT LICENSE Version 1.1", PREAMBLE, DEFINITIONS,
PERMISSION & CONDITIONS, TERMINATION, and DISCLAIMER sections) before being
trusted; one font (`lateef/`) initially came back as a paraphrased summary
on first fetch and was re-fetched to get the real, verbatim text. No
license text was templated or spliced from another font's file — a
byte-diff of the pre-existing bundled files showed their preambles are not
identical to one another (different FAQ URLs: `http://scripts.sil.org/OFL`,
`https://scripts.sil.org/OFL`, `https://openfontlicense.org`), so each
family's own real file was fetched individually.

No new font files were added or changed in Phase 8 — this is a licensing
and documentation pass only. Phase 7's own new vector assets (Tashkeel-mark
rendering, the Elements and Designs libraries) are original paths authored
for this project and are covered separately in `ASSET_ATTRIBUTION.md`, not
here.

Verification date for every row below: **2026-09-04** (the date each license
file was fetched or, for the original 12, re-confirmed against the file
already present in this repository).

## All 33 bundled font families

| Font (folder) | Files | Source | License | License file | Attribution requirements | URL / source | Verified |
|---|---|---|---|---|---|---|---|
| `alkalami/` | Alkalami-Regular | Google Fonts (SIL International) | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text; "Alkalami" and "SIL" are Reserved Font Names — do not use to name a modified version | Copyright (c) 2015-2023, SIL International (http://www.sil.org/), with Reserved Font Names "Alkalami" and "SIL" | 2026-09-04 |
| `amiri/` | Amiri-Regular, Amiri-Bold | Google Fonts / github.com/aliftype/amiri | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2010-2022 The Amiri Project Authors (https://github.com/aliftype/amiri) | 2026-09-04 |
| `arefruqaa/` | ArefRuqaa-Regular, ArefRuqaa-Bold | Google Fonts / github.com/alif-type/aref-ruqaa | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "EURM10" is a Reserved Font Name | Copyright 2015-2020 The Aref Ruqaa Project Authors (https://github.com/alif-type/aref-ruqaa), with Reserved Font Name EURM10 | 2026-09-04 |
| `arefruqaaink/` | ArefRuqaaInk-Regular, ArefRuqaaInk-Bold | Google Fonts / github.com/aliftype/aref-ruqaa | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "EURM10" is a Reserved Font Name | Copyright 2015-2022 The Aref Ruqaa Project Authors (https://github.com/aliftype/aref-ruqaa), with Reserved Font Name EURM10 | 2026-09-04 |
| `baloobhaijaan2/` | BalooBhaijaan2-Variable | Google Fonts / github.com/EkType/Baloo2 | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2) | 2026-09-04 |
| `blaka/` | Blaka-Regular | Google Fonts / github.com/Gue3bara/Blaka | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2019 The Blaka Project Authors (https://github.com/Gue3bara/Blaka) | 2026-09-04 |
| `blakaink/` | BlakaInk-Regular | Google Fonts / github.com/Gue3bara/Blaka | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2019 The Blaka Project Authors (https://github.com/Gue3bara/Blaka) | 2026-09-04 |
| `cortoba/` | Cortoba-Regular | Arabeyes Project / arabeyes.org/Khotot | GNU GPL v2 (per accompanying Debian-format copyright record; no separate font-embedding exception text is bundled) | `GPL-2.txt`, `GPL-2-copyright.txt` (bundled) | Redistribute under GPL-2, include license text; see the copyright file for the exact Debian-format terms as stated | Copyright (c) 2004-2006, Arabeyes Project — Source: https://www.arabeyes.org/Khotot (Upstream-Name: Khotot) | 2026-09-04 |
| `elmessiri/` | ElMessiri-Variable | Google Fonts / github.com/Gue3bara/El-Messiri | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2015 The El Messiri Project Authors (https://github.com/Gue3bara/El-Messiri) | 2026-09-04 |
| `gulzar/` | Gulzar-Regular | Google Fonts / github.com/simoncozens/Gulzar | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2021 The Gulzar Project Authors (https://github.com/simoncozens/Gulzar) | 2026-09-04 |
| `harmattan/` | Harmattan-Regular | Google Fonts / SIL Global | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "Andika" and "SIL" are Reserved Font Names on the underlying shared components; "Harmattan" and "SIL" are Reserved Font Names on this font | Copyright (c) 2007-2008 The C&MA Guinea Fulbe Team; copyright renewed 2011-2012 George W. Nuss ("Fouta"); copyright 2004-2025 SIL Global ("Andika"+"SIL"); copyright 2014-2025 SIL Global ("Harmattan"+"SIL") | 2026-09-04 |
| `irannastaliq/` | IranNastaliq-Regular | gitlab.flossir.org/farsi-fonts (Open Source Community of Iran) | SIL Open Font License 1.1 (Debian-format copyright record; full OFL body is embedded within it) | `OFL-copyright.txt` (bundled) | Retain copyright notice and license text | Copyright (c) 2022, Information Technology Organization of Iran (ito.gov.ir) — Source: https://gitlab.flossir.org/farsi-fonts/fonts-irannastaliq/ | 2026-09-04 |
| `jomhuria/` | Jomhuria-Regular | Google Fonts | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2015 KB-Studio; Copyright 2015 Lasse Fister; Copyright 2015 Sorkin Type Co; Copyright 2010-2015 Khaled Hosny | 2026-09-04 |
| `katibeh/` | Katibeh-Regular | Google Fonts | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2015, 2016 KB-Studio; Copyright 2015, 2016 Lasse Fister; Copyright 2015, 2016 Eduardo Tunni | 2026-09-04 |
| `lalezar/` | Lalezar-Regular | Google Fonts / github.com/BornaIz/Lalezar | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2015 The Lalezar Project Authors (https://github.com/BornaIz/Lalezar) | 2026-09-04 |
| `lateef/` | Lateef-Regular | Google Fonts / SIL Global | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8; required a re-fetch — first attempt returned a paraphrased summary, not the verbatim license) | Retain copyright notice and license text; "Lateef" and "SIL" are Reserved Font Names | Copyright (c) 1994-2025, SIL Global (https://www.sil.org/), with Reserved Font Names "Lateef" and "SIL"; Latin glyphs copyright (c) 2018 The Crimson Pro Project Authors | 2026-09-04 |
| `laylathuluth/` | LaylaThuluth-Regular | FontLibrary.org / Fedora Project `layla-thuluth-fonts` package (designer: Mohammed Isam) — Phase 10B authoritative-source research, Phase 10C independent technical audit (SHA-256 `31d204337e70699a9a8c1461d737bd5f3cd1c283dad8970915222bac9c9bc74d` verified against the user-provided file), Phase 10D Tashkeel-compatibility hardening (see PHASE10C_REPORT.md and PHASE10D_REPORT.md) | SIL Open Font License 1.1 (full license text embedded directly in the font's own `name` table, extracted verbatim — not fetched from a separate source) | `OFL.txt` (bundled Phase 10D, extracted from the font's own nameID 13) | Retain copyright notice and license text; "LaylaArcyArc, LaylaBasicArabic, LaylaBoxer, LaylaDigital, LaylaDiwani, LaylaThuluth, LaylaKoufi, LaylaRuqaa" are Reserved Font Names (only relevant to a modified version — the bundled file is the unmodified original) | Copyright 2014-2017, Mohammed Isam (http://sites.google.com/site/mohammedisam2000); Latin glyphs and numbers taken from "Urdu Khush Khati" v1.5 by Basharat Ali (lfcsopensource), also OFL | 2026-09-05 |
| `lemonada/` | Lemonada-* | Google Fonts / github.com/Gue3bara/Lemonada | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2011 The Lemonada Project Authors (https://github.com/Gue3bara/Lemonada) | 2026-09-04 |
| `mada/` | Mada-Variable | Google Fonts / github.com/aliftype/mada | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "Source" is a Reserved Font Name | Copyright 2015-2022 The Mada Project Authors (https://github.com/aliftype/mada), with Reserved Font Name "Source" | 2026-09-04 |
| `markazitext/` | MarkaziText-Variable | Google Fonts / github.com/BornaIz/markazitext | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2017 The Markazi Text Project Authors (https://github.com/BornaIz/markazitext) | 2026-09-04 |
| `mirza/` | Mirza-* | Google Fonts / github.com/Tarobish/Mirza | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2015 The Mirza Project Authors (https://github.com/Tarobish/Mirza) | 2026-09-04 |
| `notokufiarabic/` | NotoKufiArabic-Variable | Google Fonts / github.com/notofonts/arabic | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic) | 2026-09-04 |
| `notonaskharabic/` | NotoNaskhArabic-Variable | Google Fonts / github.com/notofonts/arabic | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic) | 2026-09-04 |
| `notonastaliqurdu/` | NotoNastaliqUrdu-Variable | Google Fonts / github.com/notofonts/nastaliq | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/nastaliq) | 2026-09-04 |
| `qahiri/` | Qahiri-Regular | Google Fonts / github.com/aliftype/qahiri | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2021 The Qahiri Project Authors (github.com/aliftype/qahiri) | 2026-09-04 |
| `quranic/` | Quranic / Amiri Quran styles | Google Fonts / github.com/aliftype/amiri | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2010-2022 The Amiri Quran Project Authors (https://github.com/aliftype/amiri) | 2026-09-04 |
| `rakkas/` | Rakkas-Regular | Google Fonts | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text | Copyright 2016 Zeynep Akay | 2026-09-04 |
| `reemkufi/` | ReemKufi-Variable | Google Fonts / github.com/aliftype/reem-kufi | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "Josefin Sans" is listed as the Reserved Font Name in the upstream file as fetched | Copyright 2015-2022 The Reem Kufi Project Authors (https://github.com/aliftype/reem-kufi), with Reserved Font Name "Josefin Sans" (as stated verbatim in the upstream file) | 2026-09-04 |
| `reemkufiink/` | ReemKufiInk-Regular | Google Fonts / github.com/aliftype/reem-kufi | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "Josefin Sans" is listed as the Reserved Font Name in the upstream file as fetched | Copyright 2015-2022 The Reem Kufi Project Authors (https://github.com/aliftype/reem-kufi), with Reserved Font Name "Josefin Sans" (as stated verbatim in the upstream file) | 2026-09-04 |
| `scheherazadenew/` | ScheherazadeNew-Regular, ScheherazadeNew-Bold | Google Fonts / SIL Global | SIL Open Font License 1.1 | `OFL.txt` (bundled Phase 8) | Retain copyright notice and license text; "Scheherazade" and "SIL" are Reserved Font Names | Copyright (c) 1994-2026, SIL Global (https://www.sil.org/), with Reserved Font Names "Scheherazade" and "SIL" | 2026-09-04 |
| `thabit/` | Thabit-Regular | arabeyes.org (Khaled Hosny) | SIL Open Font License (Debian-format copyright record; full OFL body embedded within it) | `OFL-copyright.txt` (bundled) | Retain copyright notice and license text | Copyright 2002-2008, Khaled Hosny; Latin glyphs Copyright (c) IBM Corporation 1990,1991 — Source: http://www.arabeyes.org/project.php?proj=Khotot | 2026-09-04 |
| `tholoth/` | Tholoth-Regular | Arabeyes Project / arabeyes.org/Khotot | GNU GPL v2 (per accompanying Debian-format copyright record; no separate font-embedding exception text is bundled) | `GPL-2.txt`, `GPL-2-copyright.txt` (bundled) | Redistribute under GPL-2, include license text; see the copyright file for the exact Debian-format terms as stated | Copyright (c) 2004-2006, Arabeyes Project — Source: https://www.arabeyes.org/Khotot (Upstream-Name: Khotot) | 2026-09-04 |
| `vibes/` | Vibes-Regular | Google Fonts / github.com/bluemix/vibes-typeface | SIL Open Font License 1.1 | `OFL.txt` (bundled) | Retain copyright notice and license text | Copyright 2019 The Vibes Project Authors (https://github.com/bluemix/vibes-typeface) | 2026-09-04 |

**Note on `laylathuluth/`:** this family is the first font added to this
project through the multi-phase authoritative-source-research /
technical-audit / Tashkeel-hardening pipeline (Phase 10A–10D), rather
than being fetched directly from Google Fonts like most other families
here. Its own structural profile is genuinely different from every
other bundled font: it has GSUB (real letter joining) but no GPOS
table at all. Phase 10C's independent audit found this makes 3 of 12
Tashkeel marks (Maddah, Hamza Above, Hamza Below) genuinely
unsupported — the font's own cmap does not map them — and the six
combined-mark sequences (shadda + vowel/tanwin) have no real font-
provided mark-to-mark positioning data. Phase 10D hardened the
editor's own Tashkeel detection to correctly report the 3 missing
marks as unavailable (rather than a prior false-positive), and added a
generic (not Layla-specific) editor-computed stacking placement for
combos on any font lacking real GPOS mark-to-mark data, verified to
produce correctly-separated, non-overlapping geometry for this family.
See `PHASE10C_REPORT.md` and `PHASE10D_REPORT.md` for the complete,
independently-reproduced findings and acceptance-gate results.

**Phase 22 update:** this font is now also used for one Tashkeel
Calligraphic-Library (Layer 2) item — `hamza-tashkeel` (Thuluth section)
reuses its real `hamza`/`hamzaisolated` glyph (U+0621/U+FE80) as
visual-match geometry, extracted via the real HarfBuzz pipeline. See
`TASHKEEL_LIBRARY_PROVENANCE.md`'s "Phase 22" section for the full
provenance record. This does not change anything above: the font is
still not used for live body-text shaping in any style section, and the
3 genuinely-unsupported Tashkeel marks noted above are unchanged.

**Note on `thabit/`:** this family is fully licensed and bundled but, per
the Phase 8 font distribution audit, is not currently referenced by any
entry in `assets/js/calligraphy-data.js` — it is not wired into the editor
UI. It is documented here for completeness because its files are physically
present in this repository, but see `PHASE8_REPORT.md` for the disposition
decision (excluded from the production archive as unused dead weight,
retained in the working repository).

**Note on `reemkufi/` and `reemkufiink/`:** the upstream `OFL.txt` files
fetched from Google Fonts' own repository for both of these families state
a Reserved Font Name of "Josefin Sans" rather than "Reem Kufi" or "Reem
Kufi Ink". This looks like a metadata inconsistency in the upstream source
file itself, not an error introduced by this audit — the text above is
transcribed exactly as fetched from the authoritative source, per the
explicit instruction not to invent or correct license text. If this matters
for a specific redistribution decision, verify directly against
https://github.com/google/fonts/blob/main/ofl/reemkufi/OFL.txt before
relying on it.

All 33 families above are used in the editor exactly as distributed
(unmodified outlines; only HarfBuzz shaping and standard OpenType feature
toggles already exposed by each font are applied) — a use permitted by
both the SIL OFL and the GPL-with-Debian-stated-terms families.

## Vendored non-font code libraries (for completeness)

These ship under `calligraphy-editor/vendor/` and are not fonts, but are
recorded here since they are the other third-party assets this project
bundles. Unaffected by the Phase 8 font-licensing work.

| Library | Version | License | Bundled file | Copyright (as stated in the file) |
|---|---|---|---|---|
| jsPDF | 2.5.1 | MIT | `calligraphy-editor/vendor/jspdf/LICENSE` | (c) 2010-2021 James Hall; (c) 2015-2021 yWorks GmbH |
| svg2pdf.js | 2.2.1 | MIT | `calligraphy-editor/vendor/svg2pdf/LICENSE` | Copyright (c) 2015-2021 yWorks GmbH; Copyright (c) 2013-2015 by Vitaly Puzrin |
| harfbuzzjs | (existing, pre-Phase-7) | MIT | `calligraphy-editor/vendor/harfbuzz/LICENSE` | Copyright (c) 2019-2026 The harfbuzzjs project authors |
