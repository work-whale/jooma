# UK nations "Align to curriculum": build record

Run: 2026-11-20, unattended, on the working tree of branch `staging`. Plan followed: `docs/uk-curricula-plan.md`.
Nothing was committed or pushed, no branch was changed, no email was sent, production was not touched (no Supabase call was made at all; the E2E tests use the throwaway test users on staging that `.env.local` points to, and delete them afterwards).

## What changed for teachers, in one paragraph

Before: a Scotland, Wales or Northern Ireland teacher who opened "Align to curriculum" was shown England's statements under the name "National Curriculum in England". Now: **Scotland** sees Curriculum for Excellence outcomes by level (1,296 statements across four lists), **Northern Ireland** sees the statutory requirements for Years 1 to 7 (539 statements), and **Wales** sees an honest "not available yet" note. England, the islands, the US and Australia are unchanged. Year 11 and above in Scotland, and Nursery, Reception and Year 8 and above in Northern Ireland, are told there is nothing to align to for that year, never shown another year's list.

## Plain-English glossary (the owner is not British)

- **Early / First / Second / Third and fourth level** (Scotland): Scotland's own stages of Curriculum for Excellence. Early = nursery to the first year of primary (P1), First = P2 to P4, Second = P5 to P7, Third and fourth = S1 to S3 (the first three years of secondary, ages about 12 to 15). S4 onwards is the "senior phase" (exam courses), which has no outcomes of this kind.
- **Es and Os**: Experiences and Outcomes, Scotland's curriculum statements, written as "I can ..." or "I have ..." sentences. Each has a code such as `MNU 1-02a` (area, level digit, number, letter).
- **Foundation Stage / Key Stage 1 / Key Stage 2** (Northern Ireland): school stages. Foundation Stage = the first two years of primary (NI Years 1 and 2), Key Stage 1 = Years 3 and 4, Key Stage 2 = Years 5 to 7, Key Stage 3 = Years 8 to 10, Key Stage 4 = Years 11 and 12.
- **Area of Learning** (Northern Ireland): a subject group such as "Language and Literacy" or "The World Around Us".
- **The Order**: The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007, the law that sets what NI schools must teach.
- **OGL**: Open Government Licence v3.0, the UK government's licence that allows free reuse, including commercial reuse, if you credit the source.
- **Crown copyright**: the UK government owns the copyright; the OGL is how it lets others reuse the material.

## 1. Status table

| Step | State | Result |
|---|---|---|
| A. Baseline | done | 2,242 unit tests green; before screenshots show England's list under all three nations |
| 0. Interim safety fix | done | Scotland, Wales and NI never get England's statements; this alone fixed the production bug |
| 1. Shared plumbing | done | generic framework ids, stage labels on the card's Year options, no change for US or Australia |
| 2. Scotland | done | four level files, 1,296 statements, credit, tests, E2E |
| 3. Northern Ireland | **partly done** | Foundation Stage, Key Stage 1 and Key Stage 2 built (539 statements); Key Stage 3 and 4 not built, see section 2 |
| 4. Wales | skipped (by decision) | no Hwb fetch, nothing shipped; permission email drafted in section 10 |
| 5. Finish | done | bundle compared, lazy-load E2E, status check, full regression |

## 2. Owner decisions, and what I did in your absence

The six decisions you confirmed (all the plan's defaults):

1. **NI year mapping by year number.** An NI teacher who picks Year 3 gets NI Year 3 (Key Stage 1). To change it later: shift every `nic-*` entry in `FRAMEWORK_AGES` (`app/lib/standards/index.ts`) down by one.
2. **Wales skipped.** No Hwb page was fetched, nothing Welsh ships. Draft email in section 10.
3. **Scotland Benchmarks excluded.**
4. **Gaelic-medium documents excluded** ("Literacy and Gaidhlig" and every "(Gaelic)" translation). Gaelic (learners), which is taught in English, is included.
5. **`curricula-status.mjs` run with `--check` only.** The workbook was not written (git shows no change to it).
6. **Scotland S1 by age.** Year 8 = Third and fourth level; the card shows "Third and fourth level · Year 8".

`WALES_PERMISSION:` (leave empty; write `granted <date> <who> <licence wording>` here when permission arrives, then Step 4 of the plan can run)

Choices I made because you were away (each the conservative option):

- **Northern Ireland Key Stages 3 and 4 are not built.** The Order's Parts 2 to 4 (Foundation Stage, Key Stage 1, Key Stage 2) are clean lists of requirements, and I could prove every list item was captured (section 5). Parts 5 and 6 (Key Stage 3 and 4) are not like that: each subject is prose under headings ("Objective 1: Developing pupils as Individuals ...") with only a generic "Learning Outcomes" list repeated under every subject ("research and manage information effectively ...", 146 list items in Part 5 and 26 in Part 6). Turning that into statements would mean merging and choosing, which the plan forbids. So an NI teacher on Year 8 to Year 11 sees "There are no published standards to align to for Year 8 ...". To finish later someone must decide what a KS3 statement is (next steps).
- **Mathematics sub-headings are part of the NI strand.** The Order has bold sub-headings in Mathematics ("Understanding Number and Number Notation"). They are source wording, so they are added: strand `Number: Understanding Number and Number Notation`.
- **Foundation Stage "Progression" sections.** Where every strand has its own Progression (Language and Literacy, The Arts) the strand reads `Reading (progression)`. Where one Progression closes a whole Area (Mathematics and Numeracy, The World Around Us, Personal Development and Mutual Understanding), it reads `Mathematics and Numeracy (progression)`. The plan said "<strand> (progression)" everywhere; labelling a whole-Area section with its last strand ("Change over Time (progression)") would have misled.
- **NI nested lists** become `Lead-in: (a) part (b) part`, keeping the lead-in's colon. Lead-ins such as "Pupils should be enabled to:" are not statements, so a statement reads as an instruction ("Use prepositions to state position").
- **Scottish headings.** The strand is `<heading>: <row name>` ("Number, money and measure: Estimation and rounding"), the heading alone where the area has no row names ("People, past events and societies"), and `Physical education, physical activity and sport: Physical education: Movement skills ...` where a section sits inside a section. A heading set in 12 point (Religious and moral education, "Development of beliefs and values") counts as a heading.
- **Source printing slips in Education Scotland's PDFs** (also in their all-in-one PDF): `TCH 02-02a` is written `TCH 2-02a`; `RME 0-07a / 1-07a / RME 2-07a ...` has the missing `RME` put back; `MLAN 1-03`, `MLAN 1-06`, `MLAN 1-13` have no final letter in the source and are kept as printed. `TCH 1-02a` is printed twice with two different statements (Sciences and Technologies; the Sciences one reads like `TCH 1-06a`, so probably a print slip); both are kept as printed.
- **Repeated codes.** In Education Scotland's documents a code is not always unique: the Early level outcomes for talking, reading and writing share codes, and some Health and wellbeing outcomes are printed again under Sciences and Social studies. A repeated code gets a 6 character hash after it in its id (26 statements); every other id is the code alone.
- **List bullets in Scottish statements are kept** as the "•" character ("While learning together ... I can: • experience different roles ..."), as the source prints them. A word broken at a line end after a hyphen is joined ("grammatically-straightforward").
- **A year is only offered when it has statements.** I tightened `alignParamFor` so it sends nothing for a year the nation has no statements for (Scotland Year 11, "Adult learners"), not only for a year the curriculum lacks. Covered by a unit test. US and Australian behaviour is unchanged.
- **Credits.** I re-read both licence pages. The plan's wording for `CFE_CREDIT` and `NIC_CREDIT` matches what the sources say, so I used it unchanged.
- **Stale servers.** A stale `next start` was on :3000 at the start, so I stopped it as your rules allow. Later I stopped only the `next start` processes I had started myself, by process id, before each rebuild. The last one I started (current build, staging environment) is stopped at the end of the run.
- **No staging migration** was needed or applied. No schema change, no database write other than the test users the E2E specs create and delete.

## 3. Sources

All fetched 2026-11-20. Copies are in `docs/standards/uk/` (7.9 MB, not staged; you decide about committing them).

### Scotland: Curriculum for Excellence Experiences and Outcomes

Listing page: https://education.gov.scot/curriculum-for-excellence/curriculum-for-excellence-documents/experiences-and-outcomes/ (page says "updated 27/04/2026"; saved as `scotland/listing.html`, sha256 `52a9e80bb156d578a1b363f8b766d54ce18ce68c26a4c6bb531068bdaefbc506`).

| File in `docs/standards/uk/scotland/` | URL (under https://education.gov.scot) | sha256 |
|---|---|---|
| `expressive-arts-eo.pdf` | /media/ogyjyehk/expressive-arts-eo.pdf | `c84cb7ca1ae79093003004d5eace1e58de113c2807135c22e525800d7eddfc3b` |
| `health-and-wellbeing-eo.pdf` | /media/5p4dvqvm/health-and-wellbeing-eo.pdf | `17108f9b17d2d639e3b08ed3a303039c9f8bb0de0a518ce9e1a43e9dd9b3742d` |
| `classical-languages-eo.pdf` | /media/0e5pagsr/classical-languages-eo.pdf | `8543f2753e10236b3e0293206d1c4ce64388ed2675cd44a71c534d2c60c3e6d1` |
| `gaelic-learners-eo.pdf` | /media/ysyfazzx/gaelic-learners-eo.pdf | `2c522fa26a15bd48b5a15c45673a8c3960adec1939ef8fd12f5d7ff493f90694` |
| `literacy-english-eo.pdf` | /media/qhxmxnfq/literacy-english-eo.pdf | `18ab523c8fb3e4389b004397f86e8ac31a013093c2b052743df5dbd364456281` |
| `modern-languages-eo.pdf` | /media/wr4pokgb/modern-languages-eo.pdf | `da036f6c5a2427d9da26dde12de55c29aa80cb73abf2f2c183615b0582b68e40` |
| `numeracy-maths-eo.pdf` | /media/sz2lnh1g/numeracy-maths-eo.pdf | `2976f73347215d3f97fe7eb50b9724b4738418e734c7d36845e022bf2aef9f55` |
| `rme-eo.pdf` | /media/hg0nltic/rme-eo.pdf | `e31afd9b5f56c0614c813e9c0dc56a7b6875a69d26d4c4fe869f5f7c7ab44df2` |
| `rerc-eo.pdf` | /media/lbtg5lpl/rerc-eo.pdf | `a05836374047dea5cd05dcab5edd252c5ec534d9e86381162c677ad9ad32575a` |
| `sciences-eo.pdf` | /media/hpidflxa/sciences-eo.pdf | `6e3f2f55ac3b53fcf1f53d738697bbb3221caf250403b903f45c792ecd7c0d8f` |
| `social-studies-eo.pdf` | /media/rh3fq1gi/social-studies-eo.pdf | `15d410e83d8632c65c4dfec4c300d1239ebb16ce69991c69893b027f02f9ffa4` |
| `technologies-es-os.pdf` | /media/nqgj0egw/technologies-es-os.pdf | `d93fc1c3011a1d9b257a8b91dfa35d445c335500fbe0eb068fbbc037fd1bc057` |
| `all-experiencesoutcomes18.pdf` (cross-check only) | /media/wpsnskgv/all-experiencesoutcomes18.pdf | `e1c103cb48aae8f534955b10dac83c363c76d81f76485366056446bcacff6d69` |

The links were read from the listing page, not guessed; they match the plan. Excluded on purpose: every "(Gaelic)" translation, "Literacy and Gaidhlig", the "across learning" and "responsibility of all" documents (subsets of the area documents), the Early Level modern languages document combined with Benchmarks, Benchmarks.

**Licence evidence.** https://education.gov.scot/terms-of-use (saved as `scotland/terms-of-use.html`, sha256 `fb924a6283f0d37e1e921897b42fa32a953b56d3ef43ef2751f55f99a9d89f6a`) says: "The material contained within the Education Scotland website is © Crown copyright 2022. You may use and re-use the information featured on this website (not including logos) free of charge in any format or medium, under the terms of the Open Government Licence." The link goes to http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ (version 3). Images and videos are excluded; the Es and Os are text.

### Northern Ireland: The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007, Schedule 2

- URL: https://www.legislation.gov.uk/nisr/2007/46/schedule/2/data.xml, saved as `northern-ireland/nisr-2007-46-schedule-2.xml`, sha256 `c63af56f40de2b8caead22e492d50e02658aa169e952a4850b1d66e29ab18091`.
- Version: "Latest available (Revised)" on the page (`northern-ireland/schedule-2-page.html`, sha256 `063850e67078cdb4494ab7025246c0af74f34b54a878da48daab380f02e07c32`); the XML says last modified 2024-04-02, extent from 2023-07-01.
- **Licence evidence.** The page footer of legislation.gov.uk says: "All content is available under the Open Government Licence v3.0 except where otherwise stated." CCEA's own documents (ccea.org.uk) are CCEA copyright and are not used.
- The human-readable PDF (`/nisr/2007/46/data.pdf`) returned an empty "202 accepted" response (the site builds it on demand), so it is not saved; the XML is the data of record.

## 4. Data

Scotland, `app/lib/standards/data/`: reader method is positional parsing of the PDF tables (not the reading-order fallback). 1,162 outcomes were read from the 12 area PDFs (72 Expressive arts, 141 Health and wellbeing, 8 Classical languages, 71 Gaelic (learners), 127 Literacy and English, 72 Modern languages, 139 Numeracy and mathematics, 87 Religious and moral education, 97 Religious education in Roman Catholic schools, 128 Sciences, 127 Social studies, 93 Technologies). An outcome common to several levels is written to each list it belongs to with only that list's codes:

| File | Statements | By area |
|---|---|---|
| `cfe-early.json` | 173 | Expressive arts 18; Health and wellbeing 44; Gaelic (learners) 10; Literacy and English 20; Numeracy and mathematics 14; Religious and moral education 8; Religious education in Roman Catholic schools 16; Sciences 13; Social studies 13; Technologies 17 |
| `cfe-first.json` | 255 | Expressive arts 19; Health and wellbeing 46; Gaelic 13; Literacy 29; Modern languages 17; Numeracy 27; RME 19; RERC 28; Sciences 18; Social studies 21; Technologies 18 |
| `cfe-second.json` | 301 | Expressive arts 19; Health and wellbeing 51; Gaelic 16; Literacy 31; Modern languages 25; Numeracy 35; RME 22; RERC 31; Sciences 29; Social studies 24; Technologies 18 |
| `cfe-third-fourth.json` | 567 | Expressive arts 37; Health and wellbeing 80; Classical languages 8; Gaelic 32; Literacy 52; Modern languages 31; Numeracy 66; RME 43; RERC 40; Sciences 69; Social studies 69; Technologies 40 |

1,367 distinct codes. Ages: Early 3, 4, 5; First 6, 7, 8; Second 9, 10, 11; Third and fourth 12, 13, 14.

Northern Ireland: the Order's Parts 2 to 4.

| File | Statements | By Area of Learning |
|---|---|---|
| `nic-fs.json` (Foundation Stage, ages 5, 6) | 239 | Language and Literacy 53; Mathematics and Numeracy 73; The Arts 31; The World Around Us 34; Personal Development and Mutual Understanding 18; Physical Development and Movement 30 |
| `nic-ks1.json` (ages 7, 8) | 150 | Language and Literacy 44; Mathematics and Numeracy 49; The Arts 13; The World Around Us 16; Personal Development and Mutual Understanding 9; Physical Education 19 |
| `nic-ks2.json` (ages 9, 10, 11) | 150 | Language and Literacy 41; Mathematics and Numeracy 47; The Arts 13; The World Around Us 17; Personal Development and Mutual Understanding 9; Physical Education 23 |

No codes (the Order has none); ids are the stage plus 10 hex characters of sha1 of subject, strand and text, so they survive insertions in the source.

**Normalisations applied** (the only ones): capital first letter, collapsed whitespace, en and em dashes written as hyphens, tags and entities removed; Northern Ireland also trailing list punctuation (";", "; and", ", and", ":") removed and ALL-CAPS titles written as Part 1 of the Order writes them. Never merged, paraphrased or invented. Scottish page furniture (running headers, page numbers, footnote markers and footnote text, the Appendix pages, each area's introduction, level labels, row descriptions) is not in any statement.

The reader stops the build if any text item on a page cannot be placed. The final run placed every item (0 unplaced in all 12 documents).

## 5. Spot-checks

**Scotland, by hand, seeded sample (seed 20261120, four per level file, 12 areas covered).** For each I compared the data with the lines the PDF prints just above the code. All 16 were right (text, code, level and strand):

`cfe-early-soc-0-18a`, `cfe-early-mth-0-13a`, `cfe-early-rme-0-04a`, `cfe-early-rerc-0-04a`, `cfe-first-hwb-1-37a`, `cfe-first-rme-1-01b`, `cfe-first-tch-1-06a`, `cfe-first-mnu-1-20a`, `cfe-second-scn-2-09a`, `cfe-second-hwb-2-12a`, `cfe-second-rme-2-07a` (this one found a real fault: its strand carried the previous page's heading, because "Development of beliefs and values" is set in 12 point; **FIXED** in the reader, and the data test now pins it), `cfe-second-mlan-2-08b`, `cfe-third-fourth-tch-3-14a`, `cfe-third-fourth-lgl-3-12b`, `cfe-third-fourth-mth-4-16a`, `cfe-third-fourth-lit-3-18a`.

Also by hand: the first (`MNU 0-01a`) and last (`MNU 4-22a`) Numeracy and mathematics outcomes; every Second level Planet Earth outcome (`SCN 2-01a` to `SCN 2-06a`, plus the cross-listed `TCH 2-02b`), checked against the reading-order text; the Religious education in Roman Catholic schools outcome `RERC 3-07a` (a bulleted outcome). All matched. Two other faults were found by review and fixed in the reader before the data was accepted: two statements (`SCN 0-03a` and `SCN 1-03a`) had words from the neighbouring column mixed in (cells less than 9 points apart; `SCN 0-03a` read "...what I need to develop. I can observe do to look after them"), and some Early outcomes had their code lines read as text.

**Northern Ireland, by hand, seeded sample (12 statements, four per stage).** Each statement found in the Order's XML, with the Titles above it matching its subject and strand. All correct. One extra: `Gymnastics: Pupils should be taught to explore, create, practice and improve body management skills.` is a real list item of the Order in Foundation Stage (not a lead-in).

**Automatic, every run (`tests/unit/uk-curricula-data.spec.ts`):**
- every Scottish statement and strand is found in its own PDF read a second, independent way (pdf.js reading order); every code in the PDFs is in the data and no other. Cross-check with the all-in-one PDF: every code in it is in the data except the 35 Gaelic-medium `GAI` codes (excluded on purpose); the only codes in the data and not in its text are `EXA 3-01a` (printed with a footnote digit stuck on) and `RME 1-07a` (the prefix fix).
- three Scottish statements (`LIT 1-10a`, `LIT 1-26a`, `LIT 3-11a`) have one word printed as a separate piece that the PDF's reading order puts elsewhere ("as", "to", "I can select"); they are held to their exact text instead, which I read off the page by position.
- the pinned "uncovered source lines" test: a line a statement lost shows up as one more uncovered line.
- every NI statement and strand is in its Part of the Order; the number of list items without a list inside, counted straight off the XML, equals the number the statements cover (264, 150 and 150 for the three Parts). It also pins that Parts 5 and 6 hold 146 and 26 such items that are not built.

## 6. Commands and results

### Step A. Baseline
- `git status` at the start: modified `CurriculumAlignment.tsx`, `tests/tools/slideshow-curriculum.spec.ts`; deleted `app/lib/curriculum.ts`; untracked `docs/favourites-share-summary.html`, `docs/uk-curricula-plan.md`. These are the owner's; built on top, never reverted.
- `pnpm test:unit` before any change: **2242 passed, 0 failed** (`docs/screenshots/2026-11-20-uk-curricula/unit-baseline.txt`).
- Built the current tree (`build-before.txt`), started it through `scripts/with-staging-env.sh`. After each build `grep -rl hhgfhhofbhzioywnppzr .next/server` found 0 files (no production URL in any build).
- Next 16.2 does not print per-route First Load JS, so the bundle comparison uses `.next/static/chunks` (section 6, Step 5).
- E2E spec written before any code change. Run on the unchanged tree, the "never England's" test **failed for the right reason** for all three nations (the card said "National Curriculum in England" and listed England's years); the slides wizard test passed, as it should (today's behaviour the fix must keep). Screenshots in `before/`.

### Step 0. Interim safety fix
Edge cases listed before writing tests, each asked "would this still pass if the code were wrong?":
- A nation falling in England's mode (the bug itself): tested by id and by the label a form sends, and against the live registry state (`usableFrameworks` decides "standards" or "none"), so a later step that forgets to wire data fails.
- Over-correction: England, EYFS, the four islands, `null`, `undefined`, `""`, an unknown string and England's two labels must stay in England's mode.
- Positive control: `alignParamFor("england", ...)` still sends the same two Year 4 statements that are refused for every nation. Without it, "undefined for all nations" would also pass if `alignParamFor` were broken for everyone.
- The slides wizard year list: five UK ids, four islands, `null`, unknown stay on the UK list; `us-ca`, `au-qld`, `ireland`, `ib-myp` do not; plus a sweep of the whole registry.
- The topic matcher (`suggestionSource`): England only for England's years, standards only for years that have data, nothing for a state with its own standards (Texas) and Ireland, never England's for a nation.

Tests first: `uk-curricula-alignment.spec.ts` ran **5 failed, 1 passed** (the pass is the England control). Built: `alignmentMode`, `usesUkYearList`, `suggestionSource`, `GenerateModal.tsx`, `/api/suggest-subject`. After: **2248 passed**, `tsc` clean; E2E 8 of 8 (new spec plus the two existing curriculum specs, unchanged).

### Step 1. Shared plumbing
Tests first: 3 failed (missing `FRAMEWORK_IDS`, `alignmentStageLabel`); "US and Australian params unchanged, no stage" passed before and after on purpose. After: **2252 passed**, `tsc` clean, `eslint` 17 errors (the same 17 as before, none in touched files).

### Step 2. Scotland
- **Honest note on test order.** The alignment tests were written before the wiring and ran **8 failed, 11 passed**. The data tests import the JSON, which cannot exist before the reader does, so I explored the PDF layout with a throwaway reader first, wrote the data tests against the real shape, and checked them afterwards by mutation instead of by a red run: truncating two statements made "known outcomes" and the "uncovered lines" test fail (the containment test alone does not catch a truncation, which is why that test exists).
- Faults found and fixed in the reader, each by a failing diagnostic, never by editing JSON: a cell's lines sit up to 27 points above its code; paragraph gaps inside a cell; list bullets and indents; codes split across items, across lines and with a gap after the first letter; a code printed right against the next cell's text; two cells closer than 9 points (fixed by treating an x position shared by three or more items as a column start); headings in 12 point and nested headings.
- `pnpm test:unit` **2280 passed** after Scotland; E2E 9 of 9.

### Step 3. Northern Ireland
- Alignment tests first: **7 failed, 20 passed** (the passes are England, step 0, plumbing and Scotland). Data tests against the XML after the reader, checked by mutation (removing one statement and altering one word made four tests fail; restored).
- After: **2298 passed**, `tsc` clean. Build `build-step3.txt`. E2E: the new spec 6 of 6 (never England's; slides; Scotland worksheet; NI worksheet; NI Reception; lazy load), `slideshow-curriculum.spec.ts` 3 of 3 and `curricula-standards.spec.ts` 3 of 3, **12 of 12**.

### Step 5. Finish
- **Bundle.** `.next/static/chunks`: 19,640,085 bytes before, 20,186,254 after (+546,169, the seven new data files as separate chunks). The ten largest chunks are byte for byte the same sizes before and after (`chunks-before.txt`, `chunks-after.txt`), so nothing was added to the first load of any page. The lazy-load E2E proves the Scottish statements are fetched only when the card opens: before opening, no downloaded script contains a phrase from `cfe-first.json`; after, a newly downloaded one does.
- `node scripts/curricula-status.mjs --check` exits 0; the workbook was not written.
- Final run: `pnpm test:unit` 2298 passed (baseline 2242; the 56 new tests are in the two new spec files and the edited `standards.spec.ts`), `npx tsc --noEmit -p .` clean, `node scripts/check-language.mjs` passed, `npx eslint` 17 errors (all pre-existing, in untouched files; I fixed three unused-import warnings I had introduced).
- Dash check: no en or em dash in any file I wrote or changed. The one match in the touched files is a pre-existing line in `tests/unit/standards.spec.ts` (an old test pattern), not mine. In the new tests the dashes are built from their code points.
- The `/terms` page was fetched from the running server: section 13 lists the Curriculum for Excellence and Northern Ireland credits.
- E2E that were **not** re-run: the rest of the suite. Only the specs the plan names were run.

## 7. Files changed

New (mine): `scripts/build-uk-curricula.mjs`; `app/lib/standards/data/cfe-early.json`, `cfe-first.json`, `cfe-second.json`, `cfe-third-fourth.json`, `nic-fs.json`, `nic-ks1.json`, `nic-ks2.json`; `tests/unit/uk-curricula-alignment.spec.ts`; `tests/unit/uk-curricula-data.spec.ts`; `tests/tools/uk-curricula-align.spec.ts`; `docs/uk-curricula-build.md`; `docs/standards/uk/` (source copies, not staged).

Modified (mine): `app/lib/standards/index.ts` (`alignmentMode`, `FRAMEWORK_IDS`, `FRAMEWORK_STAGE`, `alignmentStageLabel`, generic `frameworkOf`, names, ages, loaders), `app/lib/standards/align.ts` (`suggestionSource`, UK `countryId`, deduped names, stage, year guard), `app/lib/standards/credits.ts`, `app/lib/standards/permissions.ts`, `app/lib/curricula/index.ts` (`usesUkYearList`), `app/lib/curricula/types.ts`, `app/lib/curricula/uk.ts`, `app/lib/curricula/provenance.ts`, `app/api/suggest-subject/route.ts`, `app/components/slideshow/GenerateModal.tsx` (year list), `app/components/slideshow/CurriculumAlignment.tsx` (stage beside the year; the owner's earlier edits are in the same file), `app/terms/page.tsx`, `tests/unit/standards.spec.ts`.

The owner's own uncommitted work, kept as it was: the Country dropdown removal in `CurriculumAlignment.tsx`, the deletion of `app/lib/curriculum.ts`, the regression test in `tests/tools/slideshow-curriculum.spec.ts`, `docs/favourites-share-summary.html`, `docs/uk-curricula-plan.md`.

Screenshots (gitignored): `docs/screenshots/2026-11-20-uk-curricula/before/` (England's list under Scotland, Wales and NI) and `after/` (Scotland Year 4 ticked, NI Year 3 ticked, NI Reception, Wales "not available yet", the Scotland slides wizard step 2), plus the build logs and chunk lists.

## 8. Left untested, and why

- **Model output** for Scottish and NI statements, and the topic matcher's pick accuracy: both are stubbed in E2E. The prompt templates and schemas are unchanged, so no `LIVE_MODEL` run was needed or made.
- **Topic matcher size and speed on the largest list.** `/api/suggest-subject` sends every statement of the year to the model. Third and fourth level (Years 8 to 10) is 567 statements, about 130,000 characters or roughly 33,000 tokens per call. The largest existing list is Common Core at age 16, 197 statements. At gpt-4o-mini prices that is roughly half a cent a call (the model can be changed in tool settings), but the route's 15 second limit and the latency were not measured. See next steps.
- **The signed-in slides deck request body.** Generation happens after navigating to the editor, so it is brittle to intercept. The send path is the same `alignParamFor` the unit tests and the worksheet E2E prove.
- **A visual review of the Terms page.** Checked by fetching the page text, not by screenshot.
- **Wales end to end**, Welsh-language and Gaelic versions, Benchmarks, the excluded Scottish documents, NI Key Stages 3 and 4: not built.
- **`curricula-status.mjs` writing the workbook:** not run (decision 5).
- **The rest of the E2E suite and the other unit-adjacent scripts** (`verify-*.mjs`): not run, because nothing in them touches this code.

## 9. Next steps

1. Review and commit (I committed nothing). Review the 7 data files, the script and `docs/standards/uk/`; decide whether the source copies (7.9 MB) are committed, as `docs/standards/` is.
2. **Wales:** send the email in section 10; when permission is recorded in the `WALES_PERMISSION:` line, run Step 4 of the plan.
3. **NI Key Stages 3 and 4:** decide what a statement is there. Options: (a) the "Knowledge, Understanding and Skills" bullets under each subject, (b) only the subject titles, (c) leave as is. Needs your decision because the source is prose.
4. **Topic matcher size** for Scotland Years 8 to 10: ask the model to pick the subject first, or send only the subject the teacher typed, before sending 567 statements.
5. **Production:** the fix and the data ship together when this branch is merged. The UK region switches are already on in production. Check one Scotland and one NI account after release.
6. Optional: one `LIVE_MODEL=1` run for a Scottish and an NI worksheet to see real output with the statements quoted.
7. If NI gets its own year list later (NI Year 1 starts at age 4), shift the `nic-*` ages down by one.
8. Scotland's curriculum is under review (Curriculum Improvement Cycle) and the NI Order was amended in 2022 and 2023: the source copies carry their fetch date and sha256; re-run `node scripts/build-uk-curricula.mjs --nation=scotland` (or `northern-ireland`) when a source changes. A changed statement gets a new id (NI) or keeps its code (Scotland); an old saved run quietly drops a tick it can no longer find.
9. Existing saved runs of Scotland, Wales and NI teachers hold England statement ids. They are now ignored (nothing is sent), which is intended and covered by a unit test.

## 10. Wales: draft permission request (NOT SENT)

To: curriculumforwales@gov.wales (or hwb@gov.wales)
Subject: Reuse of the Curriculum for Wales descriptions of learning in a teaching tool

Dear Curriculum for Wales team,

I am writing for Jooma Ltd (company number [number]), a UK company that makes lesson planning tools for teachers. We would like to let a teacher in Wales pick the exact "descriptions of learning" a lesson or worksheet should teach, from the Curriculum for Wales Framework guidance on Hwb, by progression step and area of learning.

We would show each description exactly as published, with its area of learning, What matters statement and progression step, and with a credit and a link to Hwb. When a teacher ticks a description, we would quote it in the instructions that are sent to the tool that drafts the lesson, so that the draft follows the curriculum. Jooma is a paid service for schools and teachers.

We have read the Hwb terms and conditions and the Welsh Government copyright statement. They limit downloads to educational use and do not mention the Open Government Licence for these pages, so we are asking before we copy anything. Could you tell us either:

1. that the Framework guidance text (the descriptions of learning) may be reused, including in a commercial product, under the Open Government Licence v3.0 with the acknowledgement you prefer, or
2. what permission or licence we would need, and the wording of the credit you want shown.

We have not copied or stored any of the Hwb text. We would be glad to send a sample of how it would look.

Thank you for your time.

[Name], [role], Jooma Ltd, [email]

## 11. Session 2 (2026-11-20): topic matcher size, Northern Ireland Key Stages 3 and 4, live runs

Owner's decisions of 2026-11-20, built on the working tree of `staging` (last pushed commit e131117). Nothing committed or pushed. Staging only: the one production call was a read-only SELECT of `tool_settings` (11.4).

### 11.1 Topic matcher: filter by subject, and a hard cap

**Why.** `/api/suggest-subject` sent every statement of the year to the model: 567 for Scotland Years 8 to 10, 130,018 characters (about 33,000 tokens). Guests can call it.

**What changed.** A new pure module, `app/lib/standards/suggest.ts`:

- `filterBySubject(statements, subject, topic)` maps what the teacher typed to the curriculum's own subjects. For example, "Maths" becomes "Numeracy and mathematics" (Scotland) or "Mathematics and Numeracy" (Northern Ireland). "English" becomes "Literacy and English" or "Language and Literacy". "Science" becomes "Sciences", or "The World Around Us" at NI Key Stages 1 and 2.
  - It tries the typed subject first, then the lesson topic, then falls back to every statement.
  - It never returns an empty list for a non-empty year.
  - Targets are tried in tiers. "Music" means Music in England and "Expressive arts" in Scotland, never both.
- `capCandidates` keeps at most `MAX_CANDIDATES` (150) statements, whatever the filter did. It keeps the ones sharing the most words with the topic, in the list's order.
- `suggestPrompt` cuts the numbered list so the system and user messages together stay under `MAX_PROMPT_CHARS` (50,000, about 12,000 tokens). The topic is cut to 300 characters and the year to 40.
- `resolvePicks` maps the model's numbers into the candidates actually sent, not the whole year. Numbers that are out of range, zero, negative, fractional, repeated or not numbers are dropped.
- `suggestBody` is what the card posts.
  - England: exactly as before, `{ topic, year }` once JSON drops the undefined id, with or without a subject.
  - Any other curriculum: adds `subject`, but only when the card has one.

The route uses these functions. The card has a new optional `subject` prop. The worksheet passes its Subject field. The slides wizard has no subject field, so its body is unchanged.

**Sizes now**, for Scotland's Third and fourth level (567 statements, 130,018 characters before):

| Teacher typed | Statements sent | Characters |
|---|---|---|
| "Maths" | 66 | 16,330 |
| no subject, topic matches nothing | 150 | about 34,000 |

**Tests first.** `tests/unit/suggest-candidates.spec.ts` was written first and ran red (the module was missing). It is now **24 passed**. One fix on the way: my test assumed "fraction" appears late in the list, which is wrong. The late words are "photosynthesis" and "algorithms".

The tests cover:
- each nation, England (Year 4 and Reception), the US (Common Core maths and ELA) and Australia
- no match, an empty subject, and a subject the year lacks (French at NI Key Stage 1)
- word boundaries ("Earth" is not "Art")
- the subject winning over the topic
- the cap, and the prompt length with 2,000 long statements
- pick mapping, and the request body

### 11.2 Regression found by the live run: the card asked before the teacher's curriculum was known

The first live run failed on the Scotland deck.

**What went wrong.** In the slides wizard, the card asked the matcher with England's body (`{ topic, year }`, no curriculum). `useTeacherCurriculum` starts as `{ id: "england", loaded: false }`, and the wizard opens before the profile has loaded. The card then marked that topic and year as asked, so it never asked again for Scotland. A Scottish or NI teacher lost the automatic pick, and the call ran on England's list. The worksheet was not affected, because it passes its curriculum in.

**Fix.**
- `suggestKey()` (unit-tested, red then green) returns null until the curriculum is known: either a curriculum prop, or the hook's `loaded`. The key now includes the curriculum id.
- The card also checks that the list it holds was loaded for this curriculum and year (`listFor`). It never matches against the previous curriculum's list during a switch.

**E2E.** The Scotland slides test in `tests/tools/uk-curricula-align.spec.ts` now asserts that every matcher call is `{ topic: "Volcanoes", year: "Year 4", curriculumId: "scotland" }`. It **failed on the old build** (missing `curriculumId`) and passes on the fixed one.

### 11.3 Northern Ireland Key Stages 3 and 4

**Source:** the same XML, `docs/standards/uk/northern-ireland/nisr-2007-46-schedule-2.xml`. I checked its sha256 (`c63af56f40de2b8caead22e492d50e02658aa169e952a4850b1d66e29ab18091`), so no refetch was needed.

**New ids:**

| Id | Ages | Years | Stage label |
|---|---|---|---|
| `nic-ks3` | 12, 13, 14 | 8 to 10 | Key Stage 3 |
| `nic-ks4` | 15 | 11 | Key Stage 4 |

Year 12 and Year 13 (age 16 and up) have nothing.

**What the source holds.** I read it before building anything.

- **Part 5 (Key Stage 3)** has 16 subject tables.
  - **Twelve have a "Knowledge, Understanding and Skills" column.** It is the first column of the first body row: a lead-in paragraph, then bullet paragraphs, as the owner described. Those bullets are the statements. The Objective 1 to 3 columns and the "Learning Outcomes" row are never read.
  - **Learning for Life and Work has no such column.** Its 4 tables are Employability, Local and Global Citizenship, Personal Development and Home Economics. Each has 3 or 4 key concepts across the top (for example "Career Management"). Under each concept is a short prose note, then a "Pupils should have opportunities to:" bullet list, which is the minimum content.
  - **OWNER DECISION:** I built these lists (61 statements) and left out the prose notes. The key concept goes in the strand, for example "Employability: Career Management". The lists are statutory content, word for word, not invented. But they do not sit under a "Knowledge, Understanding and Skills" heading, so you may prefer to drop them. To drop them: in `keyStage3()` in `scripts/build-uk-curricula.mjs`, skip tables without that heading, and update the pinned counts.
- **Part 6 (Key Stage 4)** has no subject tables. The Order says: "In addition to the Minimum Content for Learning and Life and Work and Physical Education, schools will be required to provide pupils with access to..."
  - So Key Stage 4 minimum content exists **only for Learning for Life and Work and Physical Education**, as real list items. That is what `nic-ks4` holds.
  - **English, Mathematics, the sciences, history, geography, languages and the arts have no Key Stage 4 list in the Order.** As instructed, I did not invent one. A Year 11 teacher sees only Learning for Life and Work and Physical Education.
  - Correction to section 2: it called Part 6's 26 list items "generic Learning Outcomes". That was wrong. They are this minimum content.

**Statements per subject:**

| Stage | Area of Learning (subject) | Strand (element) | Statements |
|---|---|---|---|
| Key Stage 3 | Language and Literacy (21) | English with Media Education | 11 |
| | | Irish with Media Education in Irish-speaking schools | 10 |
| | Mathematics and Numeracy (5) | Mathematics with Financial Capability | 5 |
| | Modern Languages (10) | Modern Languages | 10 |
| | The Arts (23) | Art and Design / Music / Drama | 5 / 8 / 10 |
| | Environment and Society (8) | History / Geography | 3 / 5 |
| | Science and Technology (19) | Science (4, plus 11 under its four sub-headings) / Technology and Design | 15 / 4 |
| | Learning for Life and Work (61) | Employability / Local and Global Citizenship / Personal Development / Home Economics | 16 / 15 / 19 / 11 |
| | Physical Education (7) | Physical Education | 7 |
| | **Total** | | **154** |
| Key Stage 4 | Learning for Life and Work (19) | Employability / Personal Development / Local and Global Citizenship | 6 / 7 / 6 |
| | Physical Education (5) | Physical Education | 5 |
| | **Total** | | **24** |

**Reading rules.** These are also in the script header. Otherwise only the normalisations in section 4 apply.

- **Lead-ins are dropped.** A cell's first paragraph is its lead-in. 26 were dropped: 12 subject cells, 13 key concept cells, and Science's "learn about:".
- **A paragraph followed directly by a list becomes one statement**, written `<paragraph> (a) ... (b) ...` as in Parts 2 to 4. For example: "Investigate the past and its impact on our world today through an understanding of: (a) different perspectives and interpretations (b) cause and effect ...". Maths' "knowledge and understanding of (a) Number (b) Algebra ..." is read the same way.
- **A capitalised paragraph with no end punctuation before a list is a sub-heading**, added to the strand. This applies to Science's "Organisms and Health", "Chemical and material behaviour", "Forces and energy" and "Earth and Universe". Each list item is then its own statement, for example "Cells, genes and reproduction".
- **Science's methods are three paragraphs ending in commas, after a colon.** They become one lettered statement: "Develop skills in scientific methods of enquiry ...: (a) planning for investigations (b) obtaining evidence (c) presenting and interpreting results".
- **New normalisation:** a lettered part loses a final comma. In Parts 5 and 6, commas end some list items the way semicolons end others. For example, "(a) drawing and graphic media, (b) ..." becomes "(a) drawing and graphic media (b) ...".
- **The Music table is titled "ART AND DESIGN: MUSIC" in the Order.** Part 1 lists Music under The Arts, so its subject is The Arts.
- **"Irish with Media Education in Irish-speaking schools" is included.** It is a Key Stage 3 element in Part 1's table and is written in English. Scotland's Gaelic-medium documents were a separate Gaelic-language source, so the cases differ. OWNER DECISION if you want them treated the same.
- **Amendment text is kept**, as for Parts 2 to 4. For example, Personal Health includes "Receive training in (i) cardiopulmonary resuscitation (CPR); and (ii) automatic external defibrillator (AED) awareness."
- **The existing NI files did not change.** Rebuilding Northern Ireland rewrote `nic-fs`, `nic-ks1` and `nic-ks2` byte for byte the same; git shows no change.

**Wiring.** `FrameworkId`, `FRAMEWORK_NAME`, `FRAMEWORK_AGES`, `loadFramework`, `FRAMEWORK_STAGE`, the credits (the same OGL credit), the permissions, the registry (`northern-ireland` now uses all five frameworks) and the provenance note.

**Tests.** The alignment and data tests were edited first and ran red, because the data files did not exist yet. They now check:
- Years 1 to 11 are covered, and each age from 5 to 15 has exactly one stage.
- Year 8 sends "Key Stage 3", Year 11 sends "Key Stage 4", and Year 12 sends nothing.
- Subjects per stage match Part 1, and strands are the elements named in the table titles.
- Known statements are word for word.
- Refusals: no statement contains a Learning Outcomes item, Objective column text, a key concept note or a lead-in.
- An independent second reading of every Knowledge, Understanding and Skills cell straight off the XML: every piece is in a statement or strand, or is one of the 26 lead-ins.
- Key Stage 4 is covered by the existing leaf count: Part 6 has 26 leaves, and all 26 are covered.

Fixes on the way, all in the tests, none in the data:
- The first green run found two miscounts of mine: 16 tables, not 15; 26 lead-ins, not 25.
- One refusal phrase was too broad: PE's real bullet contains "work effectively with others".

**Mutation check:** deleting "Cells, genes and reproduction" and changing one word of a Drama statement made 5 tests fail. I restored the file afterwards.

**E2E.**
- New test in `tests/tools/uk-curricula-align.spec.ts`: an NI Year 8 teacher, on their saved curriculum.
  - The card shows "Key Stage 3 · Year 8".
  - Key Stage 3 Areas are listed, and The World Around Us is not.
  - No Learning Outcomes text appears.
  - The matcher is asked with `subject: "Science"`.
  - The statement is sent word for word with stage "Key Stage 3".
- The Scotland and NI worksheet tests now also assert `subject: "Maths"` in the matcher request.

### 11.4 Live run on staging (real models, nothing mocked)

**Model settings check first.** I re-diffed `tool_settings`: staging and production are identical for all 50 slugs (model, effort, verbosity, enabled). Models that ran:
- `worksheet-generator` and `generate-slideshow`: gpt-5.6-luna, low effort, medium verbosity
- `suggest-subject`: gpt-4o-mini

**Spec:** `tests/tools/uk-curricula-live.spec.ts`, skipped unless `LIVE_MODEL=1`. Run it with:

    LIVE_MODEL=1 npx playwright test tests/tools/uk-curricula-live --workers=2

**Result: 4 passed** on the second run, after the 11.2 fix. The first run had 2 passed and 2 failed: the bug in 11.2, and a username clash between my own throwaway test teachers.

Each case below ticked the statement and checked three key terms in the output.

| Case | Matcher's own pick (real model) | Sent | Follows the statement | Renders | Cost |
|---|---|---|---|---|---|
| Scotland worksheet, Year 4, Maths, "Place value in whole numbers" | MNU 1-02a, alone | "MNU 1-02a: I have investigated how whole numbers are constructed ...", with "First level" | yes, 3 of 3 (place value, digit, zero). Objective: "explain how whole numbers are constructed and how a digit's place gives it its value, including the importance of zero" | yes | $0.0018 |
| Scotland deck, Year 4 | MNU 1-02a, alone | same | yes, 3 of 3. 12 slides, for example "Your Place-Value Toolkit: Digit, Place, Value, Zero" | yes, "Deck ready" | $0.0048 |
| NI worksheet, Year 3, Maths, "Simple everyday fractions" | "Recognise and use simple everyday fractions.", alone | same, with "Key Stage 1" | yes, 3 of 3 (half, quarter, fraction). Objective: "I am learning to recognise and use simple everyday fractions." | yes | $0.0019 |
| NI deck, Year 3 | same, alone | same | yes, 3 of 3. 12 slides | yes | $0.0054 |

**Cost: $0.0139 (about 1.1p)** for the second run, read from `token_usage`.
- The decks used web pictures. No generated-picture cost (`asset_cost`) was logged within the wait.
- The first run spent about the same again (two worksheets and part of a deck), so the session's total live spend is under 3p.

Screenshots and `results.json` are in `docs/screenshots/2026-11-20-uk-curricula/live/` (gitignored).

### 11.5 Commands and results (final)

| Check | Result |
|---|---|
| `pnpm test:unit` | **2327 passed**, 0 failed (was 2298) |
| `npx tsc --noEmit -p .` | clean |
| `node scripts/check-language.mjs` | passed |
| `npx eslint .` | **17 errors**, the same 17 as before, none in touched files. 43 warnings, one fewer than before (I removed an unused parameter I had added) |
| Curriculum E2E (`uk-curricula-align`, `slideshow-curriculum`, `curricula-standards`) | **13 of 13 passed** |
| Dash check | no en or em dash in any file written or changed |

The E2E ran on a fresh `next build` served through `scripts/with-staging-env.sh`, with 0 production references in `.next/server`. England's slides body is still asserted exactly: `[{ topic: "Fractions", year: "Year 4" }]`.

### 11.6 Files

New: `app/lib/standards/suggest.ts`, `app/lib/standards/data/nic-ks3.json`, `app/lib/standards/data/nic-ks4.json`, `tests/unit/suggest-candidates.spec.ts`, `tests/tools/uk-curricula-live.spec.ts`.

Modified:
- app: `app/api/suggest-subject/route.ts`, `app/components/slideshow/CurriculumAlignment.tsx`, `app/components/forms/WorksheetGeneratorForm.tsx`
- standards: `app/lib/standards/index.ts`, `credits.ts`, `permissions.ts`
- curricula: `app/lib/curricula/types.ts`, `uk.ts`, `provenance.ts`
- build: `scripts/build-uk-curricula.mjs`
- tests: `tests/unit/uk-curricula-alignment.spec.ts`, `tests/unit/uk-curricula-data.spec.ts`, `tests/unit/standards.spec.ts`, `tests/tools/uk-curricula-align.spec.ts`
- this file

### 11.7 Left untested, and why

- **The route with a real guest.** Prompt building, the cap and pick mapping are pure functions with unit tests; the route only wires them together. Guest access is unchanged (`proxy.ts`, `generation-guard`).
- **The matcher's accuracy across many topics.** Four live calls each picked the target; I ran no wider sample.
- **The matcher's latency on the largest list.** Not timed, but the prompt is now at most about a third of its old size.
- **Wales:** not this session.

### 11.8 Owner decisions open

1. **Keep Learning for Life and Work at Key Stage 3 (61 statements)?** Recommended: yes. It is statutory minimum content, and a teacher of those subjects has nothing else to align to.
2. **Keep "Irish with Media Education in Irish-speaking schools"?** Recommended: yes, as its own strand.
3. **Should Year 12 also show the Key Stage 4 list?** Year 12 is NI's second Key Stage 4 year. Today it shows nothing, because Key Stage 4 was specified as age 15 only.
