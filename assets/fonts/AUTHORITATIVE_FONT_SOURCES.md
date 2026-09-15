# Authoritative font source registry (Phase 10B, amended Phase 11/12/13/14)

> **Phase 11 update (2026-09-05):** Layla Thuluth (below) is no longer a
> pending recommendation — it passed the full technical/Tashkeel gate in
> Phase 10D and is now **APPROVED FOR PRODUCTION**, bundled as the "ثلث
> (Layla)" variation of the existing Thuluth family. See
> `PHASE10D_REPORT.md` for that decision record. Phase 11 then ran a fresh,
> wider research pass for the remaining traditional-calligraphy styles
> (Diwani, Jali Diwani, Jali Thuluth, Ijazah, Maghribi, Muhaqqaq, Rayhani).
> Its findings are appended as a new section at the end of this document
> rather than rewritten into the Phase 10B sections above, so the original
> audit trail stays intact.
>
> **Phase 12 update:** UKIJ Diwani Tom's actual font file (obtained from
> the user, sourced from a Fonts2u.com mirror) was technically audited and
> **REJECTED FOR PRODUCTION** — its embedded license fields conflict with
> the Debian evidence below, and all 8 of its basic Tashkeel glyphs have
> empty outlines. See `PHASE12_REPORT.md` for the complete record; the
> rejection stands.
>
> **Phase 13 update:** a fresh search for other Diwani candidates found
> none with open licensing anywhere (Google Fonts, SIL, Fedora, Debian,
> Ubuntu, and every identifiable foundry/designer checked came up empty
> or commercial-only). The one open lead still worth pursuing: Debian's
> `fonts-ukij-uyghur` package is actually built from a **different,
> later upstream snapshot** (`fonts-ukij-uyghur_20110217.orig.tar.bz2`,
> 2011-02-17) than the 2004 binary already rejected — untested, and not
> known to share or lack the rejected file's defects. See
> `PHASE13_REPORT.md` for the complete record.
>
> **Phase 14 update:** that Debian 2011 snapshot was obtained,
> technically audited from scratch as a new candidate, and
> **APPROVED FOR PRODUCTION** — a completely different, independently
> verified file from the 2004 binary (which remains separately
> rejected), with its licensing conflict resolved and all 12 Tashkeel
> marks plus all 6 combos genuinely supported (0/12 for the 2004
> file). Now bundled as the "ديواني (UKIJ Diwani Tom)" variation of the
> Diwani family. See `PHASE14_REPORT.md` for the complete record. See
> `traditional-calligraphy-roadmap.md` for the consolidated,
> phase-independent status of every style.

This is the human-readable companion to `authoritative-font-sources.json`.
It documents, for every candidate carried forward from Phase 10A's
`alfont-audit.json`, whether an actual authoritative source — a real
designer, foundry, official project, or an institutional distribution
channel like a Linux distribution's own package repository — could be
found, independent of anything alfont.com itself says.

**The rule this registry follows throughout:** alfont.com's own page for a
font is never treated as evidence of anything. A font is only as trusted
here as its *authoritative* source — the designer's own site, an official
project page, or a distribution channel (Fedora, EPEL, FontLibrary.org,
Google Fonts) whose own packaging process requires a license check before
a font is accepted. Where two independent sources agree, that is called
out explicitly, because it is the strongest evidence this kind of audit
can produce without contacting a designer directly.

**No font file has been downloaded this phase.** Every `technicalStatus`
and `tashkeelStatus` in the JSON registry reads `not_performed` for
exactly that reason — running fontTools, the HarfBuzz shaping pipeline, or
the Tashkeel test all require an actual file, and downloading requires the
user's explicit go-ahead per this project's operating rules. Where a
candidate is now solid enough on source-and-license grounds that
downloading it would be a reasonable next step, that is called out in its
`finalDecision`, not treated as already done.

## Headline finding: the Layla font project (Thuluth, Ruqaa, Naskh)

The single strongest result of this entire audit. **Layla Thuluth**,
designed by **Dr. Mohammed Isam Abdel-Magid**, is part of a project
described by a neutral third party — the Fedora Project's own wiki — as
"a collection of traditional arabic fonts (including Thuluth, Koufi,
Ruqaa...)." That is the opposite of the generic-display-font mislabeling
found throughout alfont's own Thuluth category in Phase 10A.

Two independent sources agree on OFL (SIL Open Font License):

- **Fedora Project Wiki**, `https://fedoraproject.org/wiki/Layla_fonts` —
  states the license directly and confirms the font is currently packaged
  and distributed (`layla-thuluth-fonts`, `layla-ruqaa-fonts`, built for
  Fedora 39 — a current, actively-maintained release, not an abandoned
  archive).
- **FontLibrary.org**, `https://fontlibrary.org/en/font/layla-basicarabic`
  — independently states OFL for the sibling Naskh-style release from the
  same project, describing it as "the traditional Naskh font, part of the
  Layla font group."

The designer's own original homepage (a Google Sites page,
`sites.google.com/site/mohammedisam2000/...`) is no longer live — checked
directly, returns 404 — but that does not weaken the finding: Fedora's
continued packaging of the font across multiple release cycles (CentOS
7/EPEL, Fedora 27, and now Fedora 39) means Fedora's own font-packaging
review (`Packaging:FontsPolicy`, which requires verifying license terms
before a font is accepted into the distribution) has independently
corroborated the OFL claim more than once, over more than a decade. That
is a meaningfully stronger form of evidence than a single live website
would be on its own.

**Status: SOURCE + LICENSE + REDISTRIBUTION + WEB EMBEDDING all cleared.**
TECHNICAL + ARABIC SHAPING + TASHKEEL remain, and require downloading the
actual file (from Fedora's package repository, not from alfont, and not
without the user's go-ahead first). This is the one candidate recommended
for that next step.

The same project also includes Layla Ruqaa and Layla BasicArabic (Naskh),
recorded in the JSON registry for completeness, but neither is a priority
follow-up: this project already has a strong bundled Ruq'ah family (Aref
Ruqaa/Aref Ruqaa Ink) and multiple strong bundled Naskh families (Amiri,
Scheherazade New, Lateef, Noto Naskh Arabic).

## UKIJ Diwani Tom — real project, license text still unconfirmed

`ukij.org/fonts/` is a genuine, official page for the Uyghur Computer
Science Association's font project, and it lists "UKIJ Diwani Tom" by
name (entry #64). That's a real institutional source, a clear step up
from anything found on alfont directly.

The complication: the project's own general statement says its fonts are
"distributed for free and released under LGPL and Open Font licenses" —
two different licenses named together, without saying which applies to
which specific file — while FontLibrary.org's entry for the sibling font
"UKIJ Diwani" (not the "Tom" cut) states plain GPL. Three sources, three
different specific claims. Per this phase's explicit instruction never to
assume same-named fonts share a license, this is recorded as unresolved
rather than picked optimistically.

**Status: REQUIRES PERMISSION / LICENSE TEXT NOT YET CONFIRMED.**
Recommended next step, if pursued: download the official UKIJ zip
directly from `ukij.org` (never from alfont) specifically to read
whatever license file it actually bundles — that is the only way to
settle which of the three claims governs this exact font.

## KACST Farsi — real institutional source, but the wrong kind of candidate

KACST (King Abdulaziz City for Science and Technology) is a real,
long-running institutional font project. Its original page
(`ceri.kacst.edu.sa/fonts.htm`) no longer resolves — confirmed via a
direct fetch attempt returning a DNS resolution failure, not merely a 404
— but Fedora's `kacst-fonts` package and FontLibrary.org's catalog entry
both independently and identically state **GPL**, with no font exception
mentioned by either.

Two things matter here, and neither is a reason to bundle it:

1. **GPL without a stated font exception is a genuinely different, and
   heavier, license family than every font already bundled in this
   project (all OFL).** A strict reading of plain GPL could treat a
   document or export a user produces with the font as a "combined work"
   subject to the same license — a real legal question this audit is not
   equipped to resolve on its own, and not one to wave away by assuming
   "open source" always means "safe here."
2. **KACST fonts were never a genuine traditional-calligraphy candidate
   in the first place.** They are a general institutional Arabic-script
   family. Alfont's placement of "Kacst Farsi" in Nastaliq/Persian search
   results doesn't make it an authentic Nastaliq calligraphic style, and
   this audit does not relabel it as one.

**Status: WEB EMBEDDING NOT VERIFIED**, and separately, not a real
calligraphy-style candidate regardless of licensing. Not recommended for
further pursuit.

## Samir Khouaja Maghribi Bold — the best-named lead, still a dead end

This was Phase 10A's single most promising lead specifically because a
real personal name is attached, unlike almost everything else on alfont.
Phase 10B searched directly for that name (English and Arabic
transliteration) beyond alfont and found nothing: no personal site, no
portfolio, no foundry page, no GitHub, no social-media presence. Every
result was another font-mirror/aggregator site (arfonts.net, fontbug.com,
arbfonts.com, onlinewebfonts.com, maisfontes.com) — the same
no-license-information pattern this entire audit exists to reject, just
repeated across more domains.

**Status: REQUIRES PERMISSION, UNREACHABLE.** Still the best lead this
project has for Maghribi specifically, but there is no one to ask.

## Styles confirmed empty across both phases

Four styles returned no viable candidate anywhere — not on alfont in
Phase 10A, and not in Phase 10B's wider search:

- **Ijazah** — only design-portfolio pieces (Dribbble) and generic
  commercial marketplaces surfaced; no traceable digital font project,
  free or commercial.
- **Muhaqqaq** — one lead exists (a Google Sites page titled "Muhaqqaq
  Calligraphy Arabic Font Free Download") but it is private/login-walled;
  a direct fetch attempt correctly stopped at the Google sign-in redirect
  rather than attempting to bypass it. MyFonts lists Muhaqqaq-tagged
  fonts, but those are commercial marketplace listings, not candidates.
- **Rayhani** — search returned only the Wikipedia article on the
  historical Rayhani script itself, not a digital font.
- **Jali Diwani** — no dedicated digital font found anywhere.

One more distinction worth stating plainly, per this phase's own warning
against conflating related styles: **Layla Thuluth is a plain Thuluth
font, not a Jali (large/monumental) Thuluth variant.** No dedicated Jali
Thuluth digital font was found either — the two styles are related but
different, and this registry does not blur them to make Layla Thuluth
look like it covers more ground than it does.

## What this means for the next phase

Exactly one candidate is ready for the next concrete step — downloading
the file (with the user's explicit permission) and running the existing
fontTools/HarfBuzz/Tashkeel audit pipeline against it: **Layla Thuluth**,
sourced from Fedora's package repository, not from alfont or from the
designer's now-dead personal site. Nothing else in this registry has
cleared enough of the gate to justify that step yet — UKIJ Diwani Tom
needs its license text pinned down first, and KACST Farsi was never a
real calligraphy candidate to begin with.

*(The paragraph above is the original Phase 10B conclusion. Layla Thuluth
has since been promoted to production in Phase 10D, and UKIJ Diwani Tom's
license question has since been resolved — see the Phase 11 addendum
below.)*

## Phase 11 addendum — traditional calligraphy font expansion audit

Phase 11 was explicitly research-only: no font may enter
`assets/fonts/calligraphy/` and no registry entry may be added unless a
candidate clears the *entire* gate (source, license, technical, Tashkeel,
genuine-variations) in one phase, exactly as Layla Thuluth did. Six fresh
research passes were run against the seven primary target styles, using
the same authoritative-source hierarchy as above and the same exclusion of
Alfont, anonymous mirrors, and "free download" pages as licensing
evidence.

### UKIJ Diwani Tom — license question now resolved: SAFE WITH ATTRIBUTION

The Phase 10B three-way ambiguity (ukij.org's general LGPL+OFL statement
vs. FontLibrary's plain-GPL claim for a sibling release) is now settled.
**Debian's own `debian/copyright` file** for the `fonts-ukij-uyghur`
source package — a maintainer-reviewed legal artifact, not a mirror's
claim — states this font is dual-licensed **OFL-1.1 or LGPL-3**,
copyright the Uyghur Computer Science Association, with **no Reserved
Font Name** declared. Debian's own packaging review requires exactly this
kind of license verification before a font is accepted into the
distribution, making this the strongest evidence this audit has produced
for any non-Layla candidate.

**Status: SAFE WITH ATTRIBUTION.** This is now the single strongest
non-production candidate in this registry.

What is *not* yet done: the actual font file has not been acquired. Direct
`curl` to Debian's mirrors (`deb.debian.org`, `ftp.debian.org`) returned
HTTP 000/403 inside this sandbox, and `WebFetch` — which can retrieve page
text — cannot retrieve binary file bytes. This is the identical
acquisition pattern this project hit for Layla Thuluth in Phase 10 before
the user supplied the file directly, and the fix is the same:
**recommended next step is for the user to download the font (from
`ukij.org/fonts/` directly, or the Debian package) and attach it**, so
the Phase 10C/10D technical + Tashkeel methodology can be run against it.
No file has been added to production, and none will be until that
technical gate is actually run and passed.

### Bouazzi Maghribi (new candidate) — a claimed license that doesn't hold up

A new Maghribi candidate surfaced this phase: **Bouazzi Maghribi**, from
GitHub org `aleftypefoundry` (a named foundry account, not an anonymous
mirror), presented as "an open-source revival of a classic Arabic font
based on the Maghribi script," dedicated to the memory of the late Dr.
Ahmed Bouazzi.

The repository's README asserts an MIT license and links to `license.md`
for the text. Checking that claim directly is where this candidate falls
apart: `license.md`, `License.md`, `LICENSE.md`, and extension-less
`LICENSE` all return HTTP 404 from `raw.githubusercontent.com` on both the
`master` and `main` branches; the repository's own root file listing
(`fonts/`, `samples/`, `src/`, `.gitignore`, `README.md`,
`contribution-guide.md`, `installation-guide.md`) confirms no license file
actually exists in it; and GitHub's own automatic license-detection
sidebar — which surfaces a recognized SPDX license the moment a real
`LICENSE` file is present — shows nothing for this repository. The MIT
claim is prose pointing at a file that isn't there, not a verifiable grant.

**Status: REDISTRIBUTION NOT VERIFIED.** Per this project's own standing
rule — never upgrade a candidate because it's "probably free" — a named
foundry and a plausible-sounding claim are not enough on their own.
Recommended next step, if this style stays worth pursuing: contact Alef
Type Foundry (an issue on the repository is the obvious channel) asking
them to actually add the missing `license.md`, or check whether a real
license file exists somewhere this sandbox's fetch tools couldn't reach
(a tagged release's asset bundle, for instance).

### Everything else: reconfirmed empty, no change in outcome

A fresh search this phase did not change the outcome for any other target
style — each is reconfirmed **NO CANDIDATE FOUND / NO VIABLE FONT FOUND**,
now with additional negative evidence on record:

- **Diwani / Jali Diwani (beyond UKIJ)** — Microsoft's Aldhabi is
  proprietary (bundled with Windows/Office, not redistributable); "JH
  Diwani" is a commercial no-redistribution release; a font sometimes
  labeled "Diwani Letter" online has no identifiable authoritative source;
  DecoType and Google Fonts were checked directly and neither offers a
  Jali Diwani product.
- **Jali Thuluth** — "Jali Arabic Variable," a plausible-sounding hit on
  the name, was checked directly and is an unrelated sans-serif family —
  a confirmed false positive, not a real candidate.
- **Ijazah** — the only new lead, an anonymous-mirror font called "Arabic
  Ejaza," was explicitly rejected as unverifiable (no identifiable
  designer, foundry, or authoritative repository).
- **Maghribi (Samir Khouaja lead)** — reconfirmed closed: the same
  mirror-only trail as Phase 10B, no new information, no contactable
  person or authoritative source found.
- **Muhaqqaq** — the King Fahd Complex/QPC GitHub repository (a plausible
  institutional source for Quranic-script styles) was checked directly
  and does not offer a Muhaqqaq font.
- **Rayhani** — one near-miss, "Reyhaneh," was checked and ruled out as an
  unrelated personal name, not a Rayhani-style typeface.

### Secondary styles (Nastaliq, Persian calligraphy, Naskh, Kufi): no standout found

A light check (per this phase's own instruction not to replace strong
existing families without a clearly superior candidate) found no font
worth displacing anything already bundled. Naskh (8 real families: Amiri,
Scheherazade New, Noto Naskh Arabic, Lateef, Harmattan, El Messiri,
Markazi Text, Mirza) and Kufi (6 real families: Reem Kufi, Reem Kufi Ink,
Noto Kufi Arabic, Mada, Katibeh, Qahiri) are already strongly covered.
Nastaliq already has three genuinely distinct real families (Noto
Nastaliq Urdu, Gulzar, Iran Nastaliq); a search surfaced Awami Nastaliq as
another real, OFL-licensed alternative, but it targets the same
Urdu-Nastaliq niche Noto Nastaliq Urdu already covers well and is not a
clearly superior replacement. No dedicated "Persian calligraphy" (as
distinct from Nastaliq) digital font with a traceable authoritative source
was found; modern Persian typefaces that did surface (Vazirmatn, Vazir)
are contemporary sans-serifs, not calligraphic styles, and are correctly
out of scope here.

### Phase 11 outcome

Two candidates advanced this phase (UKIJ Diwani Tom cleared licensing;
Bouazzi Maghribi was investigated and did not clear it), and no font
entered production — Layla Thuluth remains the only font this project has
added since Phase 10D, exactly as this phase's own instructions required.
See `traditional-calligraphy-roadmap.md` for the consolidated status of
every style, and `PHASE11_REPORT.md` for the full report.

## Phase 12/13 addendum — UKIJ Diwani Tom audited and rejected; no replacement found

Phase 12 obtained the actual UKIJ Diwani Tom file (you attached it,
sourced from Fonts2u.com per its own bundled readme) and ran the full
technical/Tashkeel audit. It was **rejected**, on two independent
grounds: the file's own embedded `name`-table license fields claim
"Alpsoft Science and Technology Development Co., Ltd." (`alplar.com`) as
license holder — a party with no established connection to the
OFL-1.1/LGPL-3 Debian evidence above — and all 8 of its basic Tashkeel
glyphs (fatha through shadda) were verified to have completely empty
outlines: real glyph slots, correct metrics, no actual artwork. Basic
Arabic shaping and joining work correctly, and the design is a credible
Diwani-B calligraphic style, but neither defect can be worked around
within this project's rules (no fabricating missing marks, no ignoring a
licensing conflict). Full record: `PHASE12_REPORT.md`.

Phase 13 then searched for a replacement Diwani candidate from scratch,
explicitly not reusing the rejected binary's results. The outcome is
thorough and negative, with one open thread:

**No other open-licensed Diwani font exists anywhere searched.** Google
Fonts, SIL International, Fedora, Ubuntu, and Debian (independent of
UKIJ) were all checked directly and confirmed to have no Diwani-labeled
font. Every identifiable foundry or designer with genuine Diwani work
(Monotype's "Arabic Typesetting," "Diwani Letter," the "AF_Diwani"
family, Abdulsamie Rajab Salem's "FS_Diwany") is either proprietary,
unclear-rights mirror-only, or otherwise not redistributable — recorded
in the JSON registry for completeness, none proceeding to technical
testing since none cleared licensing.

**The one open lead:** Debian's `fonts-ukij-uyghur` package is built
from a genuinely different, later upstream snapshot —
`fonts-ukij-uyghur_20110217.orig.tar.bz2` (2011-02-17), SHA-256 (per
Debian's own `.dsc` file)
`47758bffb2da4e1ba8cc186f4be098e5e44fb0ac42a4b70ecdf49afd104d6d3` — than
the 2004 v2.00 binary already rejected. Phase 13 independently
re-verified Debian's `debian/copyright` text directly: "Copyright:
2004-2010, Uyghur Computer Science Association
&lt;UKIJ@yahoogroups.com&gt;. Licenses: OFL-1.1 or LGPL-3" for the font
files (the Debian packaging itself is separately GPL-2+). The package's
full changelog (2011-2021) has no entry referencing any fix to Diwani Tom
specifically, so there's no positive evidence this snapshot's copy of
`UKIJDiT.ttf` differs from the rejected one — but there's no evidence it
doesn't, either. This sandbox cannot fetch the actual tarball (the same
binary-fetch wall hit throughout this project); acquiring it would need
either you or a future session with different network access. Per this
project's own rule, if that tarball's font turns out to differ at all
from the already-rejected file, it must be audited as a brand new
candidate from scratch — Phase 12's results cannot simply be reused for
it.

**No production change this phase.** Layla Thuluth remains the only font
in production. See `PHASE13_REPORT.md` for the full report.

## Phase 14 addendum — UKIJ Diwani Tom's Debian 2011 snapshot: APPROVED FOR PRODUCTION

You attached the actual archive this phase
(`fonts-ukij-uyghur_20110217.orig.tar.bz2`). Its SHA-256, computed
directly, is `47758bffb2da4e1ba8cc186f4be098e5e44fb0ac42a4b70ecdf49afd104d6d31`
— this differs from the 63-character value Phase 13 relayed (one hex
digit short, so not a valid SHA-256 to begin with), but the archive's
exact byte size (8,495,130) and MD5
(`9c94757640bfeab3443ed7bd7894995b`) both match Debian's own `.dsc`
precisely, so the attached file was treated as authentic — an
explainable relay-tool transcription issue, not a substituted file.

Extracted `UKIJDiT.ttf` (SHA-256
`66bc43736d5f6e2e7ab1671bb0f708f2fa3b7a9182fb7036d46b3bab85a1d225`,
188,072 bytes) was audited from scratch as a genuinely new candidate,
per this project's own rule — nothing was inherited from the rejected
2004 binary. It is confirmed, by direct byte comparison, to be a
different file: different SHA-256, different embedded version
("Version 3.00 November 4, 2010" vs. "Version 2.00"), and — critically
— an embedded `name`-table license field that now reads plainly "LGPL"
with a real GNU URL, resolving the 2004 binary's unexplained
"Alpsoft"/`alplar.com` conflict for this specific file. Debian's own
`debian/copyright` was independently re-fetched this phase (via
`metadata.ftp-master.debian.org`, corroborating Phase 13's separate
retrieval): a blanket `Files: *` entry, OFL-1.1 or LGPL-3, covering
every font in the package including this one.

The technical audit found a complete reversal of the 2004 binary's
Tashkeel defect: **12/12 marks and 6/6 combos genuinely supported**,
verified via both the hardened Phase 10D HarfBuzz probe and independent
direct fontTools `BoundsPen` outline inspection (the 2004 binary
scored 0/12). GPOS exists as a table but is structurally empty (0
lookups/features), so combos use this project's existing, unmodified
editor-positioning fallback — nothing was fabricated. Real Arabic
shaping is correct with zero unexpected `.notdef`; the design is
classified Diwani-B, consistent with the 2004 file's own lineage.

Because every gate passed — license, structure, shaping, Tashkeel,
editor integration (27/27), font switching (16/16), save/load, exports
(15/15), mobile (35/35), performance — this file was **promoted to
production**: `assets/fonts/calligraphy/ukijdiwanitom/`, registered in
`calligraphy-data.js` as "ديواني (UKIJ Diwani Tom)". The
`tashkeel-font-audit.json` was regenerated (115 → 116 variations, zero
drift in any pre-existing entry), and the production archive was
rebuilt as `calligraphy-editor-phase14.zip`.

**The 2004 v2.00 binary remains separately, permanently rejected** —
this approval covers only the 2011 file and does not retroactively
clear it. Full record: `PHASE14_REPORT.md`.
