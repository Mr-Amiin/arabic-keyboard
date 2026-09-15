# Traditional calligraphy font roadmap

Consolidated, phase-independent status for every traditional Arabic
calligraphy style this project has investigated. This file is the single
place to check "where do we stand on style X" without re-reading every
phase report; `authoritative-font-sources.json` and
`AUTHORITATIVE_FONT_SOURCES.md` remain the detailed, phase-by-phase audit
trail behind each line here.

**The standard every entry is held to** is the one Layla Thuluth
established: a real authoritative source (designer/foundry > official
repo > government/institutional repo > reviewed Linux packaging > Google
Fonts > FontLibrary-with-identifiable-source > other recognized sources —
never Alfont, random download sites, anonymous mirrors, or "free
download" pages), one of a fixed set of license classifications backed by
the source's own text (never upgraded because a font "seems" free), a
full technical/HarfBuzz/Tashkeel pass against the actual file, and a check
for genuine (not fabricated) variations. A style only moves to AVAILABLE
when a font has cleared every one of those gates and been bundled.

## AVAILABLE (bundled in production)

Fonts already in `assets/fonts/calligraphy/` and registered in
`assets/js/calligraphy-data.js`.

- **Thuluth** — two real, distinct cuts: **Tholoth** (Khotot, GPL v2) and
  **Layla Thuluth** (Dr. Mohammed Isam Abdel-Magid's "Layla" project, SIL
  OFL 1.1; approved for production in Phase 10D after the full
  technical/Tashkeel gate — 9/12 Tashkeel marks genuinely supported, 6
  combos via honest editor-computed positioning since the font has no
  GPOS table; see `PHASE10C_REPORT.md` / `PHASE10D_REPORT.md`).
- **Naskh** — 8 real families (Amiri, Scheherazade New, Noto Naskh
  Arabic, Lateef, Harmattan, El Messiri, Markazi Text, Mirza).
- **Kufi** — 6 real families (Reem Kufi, Reem Kufi Ink, Noto Kufi Arabic,
  Mada, Katibeh, Qahiri).
- **Ruq'ah** — Aref Ruqaa / Aref Ruqaa Ink.
- **Nastaliq** — 3 real families (Noto Nastaliq Urdu, Gulzar, Iran
  Nastaliq); Phase 11's secondary-priority check found no clearly
  superior replacement (Awami Nastaliq exists and is genuinely
  OFL-licensed, but serves the same niche Noto Nastaliq Urdu already
  covers well).
- **Quranic / Tajweed-oriented Naskh** — Amiri Quran.
- **Ajami / Kano** — Alkalami (a distinct calligraphic tradition
  discovered during earlier research; included under its real name, not
  as a substitute for Andalusi or Maghribi, both of which remain
  unavailable — see below).
- **Diwani** — UKIJ Diwani Tom, **Debian 2011 snapshot**
  (`fonts-ukij-uyghur_20110217.orig.tar.bz2`, OFL-1.1/LGPL-3; approved
  for production in Phase 14 after the full technical/Tashkeel/editor
  gate — 12/12 Tashkeel marks and all 6 combos genuinely supported via
  honest editor-computed positioning since the font's GPOS table is
  structurally empty; Diwani-B; see `PHASE14_REPORT.md`). This is a
  completely different, independently-audited file from the 2004 v2.00
  binary rejected in Phase 12/13, which remains rejected — see REJECTED
  below.
- **Decorative / Contemporary Display** — a set of bold, contemporary
  display faces, explicitly labeled as their own category and never
  substituted for Diwani or Thuluth.

## APPROVED (license-cleared, technically verified, awaiting nothing — none currently)

No candidate is in this state right now. A candidate lands here only
after clearing every gate (source, license, technical, Tashkeel,
variations) but before its production PR/promotion step is finalized;
Layla Thuluth passed through this state in Phase 10D and is now listed
under AVAILABLE instead.

## UNDER REVIEW (license-cleared or credible; technical gate blocked or pending)

- **Bouazzi Maghribi** (Maghribi) — **REDISTRIBUTION NOT VERIFIED**,
  Phase 11. A named foundry (Alef Type Foundry) and a README claiming
  MIT, but the linked `license.md` does not exist in the repository
  under any case or branch checked, and GitHub's own license-detection
  finds nothing either. Not license-cleared as-is; would need the
  foundry to actually publish the license text (or a location this
  sandbox's tools couldn't reach) before proceeding further.

## REJECTED (technically audited against the real file and found unusable)

- **UKIJ Diwani Tom — the 2004 v2.00 binary** (Diwani), SHA-256
  `f9e66eb66e42cf673ee01788bfa26ca499f1df4352afccb797a9a97a920ef464` —
  **REJECTED FOR PRODUCTION, Phase 12, final.** Two independent grounds:
  (1) the file's own embedded `name`-table license fields (ID 13/14)
  state "Alpsoft Science and Technology Development Co., Ltd." /
  `alplar.com` — a third party with no established connection to UKIJ or
  to the Debian OFL-1.1/LGPL-3 record, and no LICENSE/OFL file was
  bundled to resolve the conflict; (2) independently, all 8 of the
  font's basic Tashkeel diacritic glyphs (fatha through shadda) were
  verified to have empty outlines — real glyph slots, correct cmap and
  metrics, but no actual artwork, confirmed by direct inspection of
  every one of the font's 28 declared mark glyphs. Basic Arabic letter
  shaping is genuinely correct and the design is a credible Diwani-B
  calligraphic style (see `PHASE12_REPORT.md`), but neither defect can be
  worked around within this project's rules. This specific binary is
  closed; see the Debian-snapshot entry above for the one still-open
  thread on this font.

## REQUIRES PERMISSION (a real, contactable/traceable source, but license terms are unfavorable, unconfirmed in a way that needs a human answer, or the lead is a dead end)

- **Arabic Typesetting** (Diwani) — Monotype/Microsoft, bundled with
  Windows/Office. A genuinely authentic Diwani-influenced display face —
  more visually convincing than most leads in this entire search — but
  proprietary, with no redistribution rights. Phase 13. Worth a direct,
  paid licensing conversation with Monotype if this project ever pursues
  a permissioned (non-free) route for Diwani.
- **FS_Diwany** (Diwani) — designer Abdulsamie Rajab Salem (Future Soft
  Egypt / Abdo Fonts), identified via Luc Devroye's independent academic
  type-design catalog. A real, named designer — unusual for this search —
  but no license of any kind found; his current retail presence
  (MyFonts, Behance) grants no redistribution rights. Phase 13.
- **Samir Khouaja Maghribi Bold** (Maghribi) — the best-named lead found,
  but unreachable: no personal site, portfolio, foundry page, GitHub, or
  social presence for a designer by this name, only generic mirror sites.
  Reconfirmed dead in Phase 11.
- **KACST Farsi** — a real institutional font, but a plain GPL license
  with no font exception raises a genuine, unresolved legal question
  about whether a user's exported output would be considered a
  "combined work." Separately, it was never a genuine calligraphic-style
  candidate (a general Arabic-script family, not a Nastaliq/Persian
  calligraphy typeface) — kept here for completeness, not recommended for
  pursuit regardless of the license question.

## NO VIABLE OPEN FONT FOUND (searched twice now, nothing to report)

- **Diwani (beyond UKIJ)** — Phase 13 searched exhaustively: Google
  Fonts, SIL International, Fedora, Ubuntu, and Debian (independent of
  the UKIJ package) all confirmed directly to have no other
  Diwani-labeled font; no GitHub/GitLab repo, university digitization
  project, or open foundry release was found anywhere. Every genuine
  Diwani-style font identified beyond UKIJ (see REQUIRES PERMISSION
  above and DO NOT USE below) is either proprietary or
  unauthorized-mirror-only. This no longer leaves Diwani uncovered
  overall — UKIJ Diwani Tom's Debian 2011 snapshot was promoted to
  production in Phase 14 (see AVAILABLE above) — but no *second*,
  independent open Diwani font exists if variety within the style is
  ever wanted later.
- **Jali Diwani** — no dedicated digital font exists anywhere found;
  Microsoft's Aldhabi is proprietary, "JH Diwani" is commercial
  no-redistribution, "Diwani Letter" has no authoritative source,
  DecoType/Google Fonts offer no such product. UKIJ Diwani Tom (above) is
  an ordinary Diwani, not a Jali cut, and does not fill this style.
- **Jali Thuluth** — Layla Thuluth is a plain Thuluth, not a Jali
  (large/monumental) cut; the two are related but distinct, and this
  project does not blur them. "Jali Arabic Variable" is a confirmed false
  positive (unrelated sans-serif). No genuine candidate found across two
  research passes.
- **Ijazah** — only design-portfolio pieces and generic commercial
  marketplace listings exist; the one new lead this phase ("Arabic
  Ejaza") is an anonymous mirror, explicitly rejected as unverifiable.
- **Muhaqqaq** — one login-walled lead exists and could not be verified;
  the King Fahd Complex/QPC GitHub repository was checked directly this
  phase and does not offer a Muhaqqaq font.
- **Rayhani** — only the Wikipedia article on the historical script
  itself; one near-miss ("Reyhaneh") ruled out as an unrelated personal
  name.
- **Andalusi** — no licensed open digital font found in any phase to
  date (carried over from earlier phases; not re-searched in Phase 11,
  which focused on the seven styles listed in its own scope).

## DO NOT USE (unauthorized or unclear provenance, mirror-only)

- **Diwani Letter (DIWANLTR.TTF)** — genuine Diwani letterforms, but no
  authoritative source or rights-holder found anywhere, only generic
  freeware mirrors. Phase 13.
- **AF_Diwani family** (AF_Diwani, AF_Diwani Normal, AF_Diwani Normal
  Traditional) — same unauthorized-mirror-only pattern. Phase 13.

## Recommended next font

**None currently ready or missing.** Diwani was, as of Phase 13, the
highest-priority style with zero coverage; Phase 14 closed that gap by
promoting UKIJ Diwani Tom's Debian 2011 snapshot to production (see
AVAILABLE above). No other style currently has an open, unaudited lead
ready for technical download.

## Fonts ready for technical download

None currently pending — the one open lead this project was tracking
(UKIJ Diwani Tom's Debian 2011 snapshot) was acquired, audited, and
promoted to production in Phase 14.

## Styles for which no viable open font currently exists

Jali Diwani, Jali Thuluth, Ijazah, Muhaqqaq, Rayhani, Andalusi. Maghribi
has two non-viable leads on record (Samir Khouaja: unreachable; Bouazzi
Maghribi: unverified license) but, like the others, no font that has
actually cleared this project's license gate.
