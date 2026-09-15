# UKIJ Diwani Tom — license and source (Phase 14)

## What this is

`UKIJDiwaniTom-Regular.ttf` / `.woff2` in this directory is the **2011
upstream snapshot** of UKIJ Diwani Tom, taken from the Debian source
package `fonts-ukij-uyghur`, version `20110217-4`. It is **not** the
2004 v2.00 binary this project rejected in Phase 12/13 — that file
remains rejected and unused; see `PHASE12_REPORT.md` and
`PHASE13_REPORT.md` at the project root.

## Exact provenance chain

- Debian source package: `fonts-ukij-uyghur`, upstream version
  `20110217`, Debian revision `-4`.
- Upstream tarball: `fonts-ukij-uyghur_20110217.orig.tar.bz2`
  - Size: 8,495,130 bytes
  - MD5: `9c94757640bfeab3443ed7bd7894995b`
  - SHA-256: `47758bffb2da4e1ba8cc186f4be098e5e44fb0ac42a4b70ecdf49afd104d6d31`
  - Both the size and MD5 match Debian's own `.dsc` control file
    exactly; see `PHASE14_REPORT.md` for the discussion of a
    since-corrected transcription error in an earlier relayed SHA-256.
- Exact font file extracted from that tarball: `UKIJDiT.ttf`
  - Size: 188,072 bytes
  - SHA-256: `66bc43736d5f6e2e7ab1671bb0f708f2fa3b7a9182fb7036d46b3bab85a1d225`
  - This is a **different, later build** than the rejected 2004 binary
    — confirmed by direct byte comparison (`cmp`), different SHA-256,
    different embedded version string ("Version 3.00 November 4,
    2010" vs. the 2004 file's "Version 2.00"), and different embedded
    license metadata (see below).
  - The file in this directory is byte-for-byte identical to the
    extracted archive copy (verified by SHA-256 immediately before
    promotion).

## License

Per Debian's own `debian/copyright` file for this package (retrieved
directly from `metadata.ftp-master.debian.org`, and independently
corroborated against the same file's contents already found in Phase
13's research):

```
Files: *
Copyright: 2004-2010, Uyghur Computer Science Association <UKIJ@yahoogroups.com>
License: OFL-1.1 or LGPL-3

Files: debian/*
Copyright: 2011 Christian Perrier <bubulle@debian.org>
           2021 Hideki Yamane <henrich@debian.org>
License: GPL-2+
```

The blanket `Files: *` entry covers every font file in the package,
including `UKIJDiT.ttf` — there is no per-file override naming Diwani
Tom specifically, and no evidence any font in the package is excluded
from this license. **The GPL-2+ line applies only to the Debian
packaging scripts under `debian/`, never to the font files
themselves.**

This font is therefore usable under the redistributor's choice of
either the **SIL Open Font License 1.1** or the **GNU Lesser General
Public License v3 (or later)**. This project distributes it under the
**OFL-1.1**, consistent with how the rest of this project's open-font
roster is licensed.

### Resolution of the 2004 binary's licensing conflict

The rejected 2004 `UKIJDiT.ttf` carried embedded `name`-table license
fields (IDs 13/14) reading "Alpsoft Science and Technology Development
Co., Ltd." / `alplar.com`, with no connection to UKIJ or to this
OFL-1.1/LGPL-3 record — an unexplained third-party claim that was the
primary reason for that file's rejection.

This 2011 file's own embedded `name`-table license fields instead read
plainly **"LGPL"**, with a license URL pointing to the real GNU LGPL
page (`http://www.gnu.org/licenses/lgpl.html`), and its designer field
credits **Tursunjan Sultan ("alp")** — the same UKIJ project designer
Phase 11 already identified, with a contact address
(`alplar@hotmail.com`) that plausibly explains the superficial
"alplar"/"Alpsoft" naming resemblance as coincidental rather than as
evidence the two files share a rights-holder. This file's embedded
metadata is consistent with the Debian record; the 2004 file's is not.
This does not retroactively clear the 2004 binary — it remains
rejected — but it means this 2011 file does not inherit that
contradiction.

## Redistribution / web embedding / modification / commercial use / attribution

All permitted under OFL-1.1: redistribution, web embedding
(`@font-face`), modification, and commercial use are all allowed;
attribution is not legally required by OFL-1.1 but is given here as
good practice. The font's Reserved Font Name status was not checked
against an OFL-specific `FONTLOG`/`OFL.txt` (none was bundled in the
Debian upstream tarball — it contains only 90 `.ttf` files, no
accompanying license or documentation files), so this project does not
alter or re-release the font under a name implying it is a different,
UKIJ-endorsed variant; it is distributed here unmodified, under its
original name.

## Designer / foundry

Tursunjan Sultan ("alp"), Uyghur Computer Science Association.

## Technical summary (see PHASE14_REPORT.md for full detail)

- fontTools-verified: 800 glyphs, `cmap`/`GSUB`/`GDEF` present; `GPOS`
  table present but structurally empty (0 lookups, 0 features) —
  Tashkeel combos in this editor use generic editor-computed
  positioning for this font, never fabricated GPOS data.
- All 12 standard Tashkeel marks and all 6 shadda+vowel/tanwin combos
  verified to have real, non-empty glyph outlines (independently
  confirmed via both a live HarfBuzz shaping probe and direct
  fontTools `BoundsPen` inspection) — a complete reversal of the
  rejected 2004 binary's 0/12 result.
- Real Arabic shaping (joining, forms, RTL, clusters) confirmed
  correct with zero unexpected `.notdef`.
- Diwani calligraphic authenticity classified **B** (credible,
  design-consistent with the 2004 binary's own lineage) from actual
  rendered shaped glyph paths, not from the font's name or category.
