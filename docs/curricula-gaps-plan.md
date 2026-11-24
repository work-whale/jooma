# Plan: curriculum statement gaps (Stage 3)

Written 2026-11-24. Follows `docs/uk-curricula-build.md` section 12.2 ("No statements yet"). Nothing here is built yet.

## 0. Where things stand

Every curriculum below is already in the registry and selectable. What is missing is the statements the "Align to curriculum" card lists, so these teachers see "not available yet".

| Gap | Teachers affected | Source we would use | Blocker |
|---|---|---|---|
| Australia: HASS, The Arts, Technologies, HPE (Languages see 2.4) | All 8 Australian states and territories | ACARA workbook already in `docs/standards/AC9_curriculum_workbook.xlsx` | None: same CC BY 4.0 licence as the English, Maths and Science we ship |
| Texas | `us-tx` | TEKS, 19 TAC chapters 110 to 112 | Licence |
| Florida | `us-fl` | B.E.S.T. ELA and Maths (fldoe.org PDFs) | Licence; science changing |
| Virginia | `us-va` | English SOL 2024, Maths SOL 2023, Science SOL 2018 | Licence |
| Ireland | `ireland` | NCCA primary curricula and Junior Cycle specifications | Licence (probably a quick yes) |
| New Zealand | `new-zealand` | Refreshed NZ Curriculum on Tahurangi | Licence (non-commercial) |
| Ontario | `ca-on` | Ontario curriculum, grades 1 to 9 core subjects | Licence |
| British Columbia | `ca-bc` | curriculum.gov.bc.ca | Licence |
| Alberta | `ca-ab` | New K to 6 curriculum (open.alberta.ca PDFs) | Licence (possibly already open) |

Out of scope: IB, Cambridge and Pearson (their own copyright, no realistic licence), Wales (email still unsent), NGSS (waiting on WestEd and the National Academies Press), Australian Years 11 and 12 (set by each state, not ACARA).

**Do first:** run the NI handover (`docs/curriculum-e2e-handover.md`) and merge `claude/curriculum-stage-1-status-8dm96r` into `staging`. This plan edits the same files (`app/lib/standards/index.ts`, `FRAMEWORK_AGES`, `types.ts`), so it branches from `staging` after that merge.

## 1. Licence findings (2026-11-24)

Searched each body's own pages. "Not confirmed" means no clear statement was found and the body must be asked. Jooma is a paid product, so a non-commercial or classroom-only permission is a no.

| Source | What we found | Verdict | Ask |
|---|---|---|---|
| ACARA (Australia) | CC BY 4.0, already relied on for `ac9` | Open | Nothing |
| Texas (TEA) | TEA content is copyright; private entities need a licence agreement, which may carry a fee or royalty (tea.texas.gov site policies). TEKS are also state rules in 19 TAC, which may make the rule text uncopyrightable under *Georgia v. Public.Resource.Org* (2020), but that is a legal argument, not a permission | Closed without a licence | Email TEA's copyrights office for a licence to quote TEKS text |
| Florida (FLDOE) | No reuse statement found on the B.E.S.T. PDFs. CPALMS is Florida State University's and its terms bar commercial use of the site, so do not take data from CPALMS | Not confirmed | Ask FLDOE Bureau of Standards and Instructional Support in writing |
| Virginia (VDOE) | SOL documents say "All rights reserved"; reproduction allowed only for instruction in Virginia public school classrooms | Closed without permission | Email VDOE for permission |
| Ireland (NCCA) | ncca.ie open-data page: reuse under CC BY 4.0 with attribution. curriculumonline.ie (where the specifications live) says personal use only | Conflicting | Ask NCCA to confirm CC BY 4.0 covers the curriculum specifications. Likely yes |
| New Zealand (Ministry of Education) | Tahurangi: CC BY-NC 4.0 | Closed for a paid product | Ask the Ministry for commercial permission |
| Ontario | King's Printer for Ontario; commercial reproduction needs a licence (ontario.ca/copyright) | Closed without a licence | Request a licence from the King's Printer's representative (Publications Ontario) |
| British Columbia | Checked 2026-11-24: curriculum.gov.bc.ca's footer "Copyright" link goes to the province's general notice: "may not be reproduced or redistributed without the prior written permission of the Province of British Columbia". Curriculum is not among its exceptions | Closed without permission | Submit the Copyright Permission Request Form (forms.gov.bc.ca/copyright-permission-request) |
| Alberta | New K to 6 curriculum PDFs are published on open.alberta.ca, where many items carry the Open Government Licence Alberta. On 2026-11-24 open.alberta.ca and new.learnalberta.ca refused automated requests (HTTP 403), so the licence field is still unread | Possibly open | Owner: open the dataset page in a browser and read its "Licence" field. If it says Open Government Licence Alberta, build without asking |

Sources: [TEA site policies](https://tea.texas.gov/About_TEA/Welcome_and_Overview/Site_Policies), [CPALMS terms](https://www.cpalms.org/Public/AccountSetting), [VDOE Maths SOL 2023](https://www.doe.virginia.gov/home/showpublisheddocument/53643/639050229877730000), [NCCA open data](https://ncca.ie/en/open-data-and-the-re-use-of-public-sector-information), [curriculumonline.ie notice](https://www.curriculumonline.ie:443/privacy-notice/), [Tahurangi copyright](https://newzealandcurriculum.tahurangi.education.govt.nz/copyright), [Ontario copyright](https://www.ontario.ca/page/copyright-information), [BC copyright](https://www2.gov.bc.ca/gov/content/home/copyright), [OGL BC](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc), [Open Alberta K to 6 ELA PDF](https://open.alberta.ca/dataset/da982352-b50d-49a2-8805-c9073a7ecebd/resource/583f6a69-3190-4714-83a3-2e284c93c0bd/download/edc-new-curr-k6-english-language-arts-literature.pdf).

**Rule for the build:** a source is built only after a written yes (or a confirmed open licence) is recorded in `app/lib/standards/permissions.ts` with the date and link, as for Scotland and NI. No data for a closed source is committed, so a refusal or a fee costs nothing. Every yes and every fee decision goes in the build log.

A draft permission email is in section 7.

## 2. Phase A: Australia's other learning areas (no blocker, build now)

### 2.1 What the workbook holds

Content descriptions (rows with a code and text, elaborations excluded), counted 2026-11-24:

| Learning area | Statements | Levels | Subjects |
|---|---|---|---|
| English, Mathematics, Science (shipped) | 676 | Foundation, Year 1 to Year 10 | |
| Humanities and Social Sciences | 333 | Foundation, Year 1 to Year 10 | HASS F to 6; Civics and Citizenship, Economics and Business, Geography, History (7 to 10) |
| The Arts | 165 | Foundation, then two-year bands | Dance, Drama, Media Arts, Music, Visual Arts |
| Technologies | 124 | Foundation, then two-year bands | Design and Technologies, Digital Technologies |
| Health and Physical Education | 97 | Foundation, then two-year bands | Health and Physical Education |
| Languages | 1,283 | Foundation, then two-year bands, two sequences per language | About 16 languages |

### 2.2 Changes

1. `scripts/build-standards.mjs`, `ac9()`:
   - Take every learning area except Languages (see 2.4).
   - Parse banded levels: "Years 1 and 2" gives ages [6, 7]; "Years 9 and 10" gives [14, 15]. Foundation stays [5]; "Year N" stays [N + 5].
   - `subject`: the workbook's Subject column, with "HASS F-6" written out as "Humanities and Social Sciences" and the "7-10" suffixes dropped ("History 7-10" becomes "History"). Hyphens in source text go through the existing `clean()`.
   - Source title loses "(English, Mathematics, Science)". The credit line stays as it is (same file, same access date).
2. Existing ids must not move: every current `ac9-*` id and text stays byte for byte, so saved runs keep their ticks.
3. Keep one framework id `ac9` and one file. It roughly doubles from 216 KB. Split by learning area only if the gzipped chunk passes 150 KB (measure, see 2.5).
4. Topic matcher (`app/lib/standards/suggest.ts`): the subject filter needs the new subject names and the words teachers type: "HASS", "humanities", "geography", "history", "civics", "economics", "PE", "health", "art", "visual art", "music", "drama", "dance", "media", "digital tech", "design and tech", "D&T".
5. Card: check the subject grouping on a Year 7 list, which goes from about 70 statements to about 140. If it needs a subject filter, that is a follow-up, not this phase.
6. `node scripts/curricula-status.mjs` to update the workbook; build log section in `docs/uk-curricula-build.md` (or a new `docs/curricula-gaps-build.md`).

### 2.3 Tests (written first, run red)

Unit (`tests/unit/standards.spec.ts` and a new `tests/unit/ac9-areas.spec.ts`):
- Counts per learning area equal the workbook counts above (733 new + 676).
- Regression: the 676 existing ids and texts are unchanged (checked against a list taken before the change).
- Banded levels: a "Years 3 and 4" Arts statement has ages [8, 9]; Foundation has [5]; no statement has an age outside 5 to 15.
- No Languages statement and no elaboration is in the file.
- Every AU year on the registry list from Foundation to Year 10 has at least one statement in each of the eight areas' subjects that apply at that year (HASS F to 6 stops at Year 6; History starts at Year 7).
- Subject names: no "HASS F-6" and no "7-10" suffix.
- Matcher: "PE" picks HPE, "Geography" picks Geography and not History, "art" picks Visual Arts; an unknown subject falls back to the capped full list.
- Wrong-code checks: would each test fail if the parser skipped bands, or if "Year N" ages shifted by one? Mutation-check both.
- Golden prompts unchanged (no prompt file changes).

E2E (`tests/tools/curricula-standards.spec.ts`, model mocked): a Queensland Year 4 teacher opens a worksheet, the card lists a HASS statement, ticks it, and the request body carries its id; the ACARA credit shows under the card.

Narrow check: `next build` chunk size for the `ac9` data before and after.

Not tested: the matcher's real choices across many topics (needs `LIVE_MODEL`, not part of this phase).

### 2.4 Languages: recommended out

1,283 statements, two sequences per language (from Foundation, or from Year 7) that overlap at the same year, so "Year 8 French" has two possible lists. It would also triple the file. Recommended: leave out, and say "Languages are not listed yet" in the card note for AU. Revisit if language teachers ask.

### 2.5 Done when

Unit green, the AU E2E green, `tsc` clean, `node scripts/check-language.mjs` passes, chunk size recorded, status script run.

## 3. Phase B: the licence asks (owner or CEO, in parallel with Phase A)

1. Alberta (owner, in a browser, since the site blocks automated reads): read the licence field on the open.alberta.ca items for K to 6 ELA and Literature, Mathematics, Science, for example https://open.alberta.ca/dataset/da982352-b50d-49a2-8805-c9073a7ecebd. If OGL Alberta, Alberta moves to Phase C straight away.
2. BC: done 2026-11-24, permission needed (section 1).
3. Send the section 7 email to NCCA, TEA, FLDOE, VDOE, the NZ Ministry of Education and Publications Ontario, and submit BC's form. Send all at once: replies take weeks.
4. Log each reply in the build log. A fee comes back to the owner before anything is built.

## 4. Phase C: one build per "yes"

Each source is its own small branch and PR, in the order the yeses arrive. Same shape every time, copying the Scotland and NI work:

1. Download the official source to `docs/standards/<country>/`, record its URL, fetch date and sha256.
2. Add a builder to `scripts/build-standards.mjs` (or a sibling script if the format differs), writing `app/lib/standards/data/<id>.json`. Statement ids are a hash of subject, strand and text where the source has no code, as NI does.
3. Add the framework id to `FrameworkId` (`app/lib/curricula/types.ts`), `FRAMEWORK_NAME`, `FRAMEWORK_AGES`, `loadFramework`, `FRAMEWORK_PERMITTED` (with the licence note), `FRAMEWORK_CREDIT`, and `/terms` section 13.
4. Set `alignment: { frameworks: [...], adapted: false }` on the curriculum, and the provenance entry.
5. Unit tests: counts, word-for-word samples against the source, every year on the curriculum's list has statements or an honest note, permission off gives "not available" and no credit, credit equals the stored credit, matcher subject words.
6. One E2E: a teacher of that curriculum aligns a worksheet, the id is in the request, the credit shows.
7. Status script, build log.

Per-source scope (recommended defaults, ages from the registry's year list):

| Source | Subjects | Years | Notes |
|---|---|---|---|
| Texas TEKS | ELAR (ch. 110), Mathematics (111), Science (112) | K to 8 by grade; high school core courses (English I to IV, Algebra I, Geometry, Algebra II, Biology, Chemistry, Physics) at all high-school ages, as Common Core high school is | Very large; the 150-statement matcher cap does the work. Take the text from the official TAC rule, not TEA web pages |
| Florida B.E.S.T. | ELA, Mathematics | K to 12 | Science: wait for the State Board vote on new B.E.S.T. Science (expected Dec 2026) rather than build the 2008 standards twice |
| Virginia SOL | English 2024, Mathematics 2023, Science 2018 | K to 12 | |
| Ireland | Primary Language Curriculum, Primary Mathematics Curriculum 2023 (stages 1 to 4), Junior Cycle English, Mathematics, Science (1st to 3rd Year) | Junior Infants to 3rd Year | Primary stages cover two classes each (Stage 1 = Junior and Senior Infants). Senior Cycle left out |
| New Zealand | Refreshed English and Mathematics and Statistics, whichever years are in force on the build date | Year 0 upward | Confirm the phase-in dates when the yes arrives |
| Ontario | Language 1 to 8 (2023), Mathematics 1 to 8 (2020), Science and Technology 1 to 8 (2022), Grade 9 English, Mathematics, Science | Grade 1 to 9 | Specific expectations with their codes (B1.2) |
| British Columbia | English Language Arts, Mathematics, Science | K to 9 | Curricular Competencies and Content, not Big Ideas |
| Alberta | New K to 6 ELA and Literature, Mathematics, Science | K to 6 | Grades 7 to 12 are still the older programs and under renewal: leave out |

## 5. Questions for the owner (defaults in bold)

1. Australian Languages: **leave out for now** (section 2.4), or build them?
2. Send all the licence emails at once (**yes**), and who sends them: you or the CEO?
3. If a body asks for a fee: **pause that source and decide case by case**.
4. Texas: rely on the "state rules cannot be copyrighted" argument instead of asking TEA? **No**: Jooma has no legal team; ask TEA.
5. Florida science: **wait for the new B.E.S.T. Science vote** instead of building the 2008 standards now?
6. High school for Texas, Florida and Virginia: **core courses only** (listed in section 4)?

**Answered 2026-11-24: all six defaults.** Languages left out; emails sent all at once by the owner or CEO from section 7; a fee pauses that source; ask TEA; wait for Florida's science vote; core high-school courses only. Also agreed: run the NI handover tests first and build Australia on top of that branch; Claude reads the Alberta and BC licence pages before anyone emails them.

## 6. Order of work

1. NI handover run and merge (section 0).
2. Phase A (Australia) and Phase B (asks) together.
3. Phase C per yes, smallest first: Alberta or Ireland are likely first.
4. Release: region switches on in Admin, status script, one account check per new curriculum after release.

## 7. Draft permission email

Subject: Permission to quote [curriculum name] in a teacher planning tool

Hello,

Jooma ([website]) is a UK company that makes a paid online tool teachers use to plan lessons and make resources. Teachers choose their curriculum, and the tool lets them tick the official statements a resource covers, then quotes those statements in the resource.

We would like to include the text of [document names, editions] for teachers in [jurisdiction]. We would:
- quote the statements word for word, with their official codes, and never change their wording;
- show your copyright notice and source under every list of statements, and on our Terms page;
- not suggest any endorsement by [body].

Could you tell us whether we may do this, and on what terms? If a licence or fee applies, we would be glad to hear the details.

Thank you,
[Name], [role], Jooma
