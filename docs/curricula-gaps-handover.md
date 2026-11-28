# Curricula: open gaps after Stages 1 to 3

Written 2026-11-28, when the Stage 3 profiles were finished (batches A to E built on `staging`; Bangladesh held). Start a gap-patching session here, then run `node scripts/curricula-status.mjs --check`.

Every country Jooma lists has a full profile (year names, local terms, exams, version dates). What is missing is mostly the official statement lists behind "Align to curriculum", plus a few product and language gaps.

## 1. Releases waiting on the owner

| What | Where | State |
|---|---|---|
| Stage 3 batches A to E | `docs/curricula-stage3-release-checklist.md` | Built and tested on staging, not merged. Two production migrations (20261127000000, 20261128000000), then one switch per batch. |
| Bangladesh | Stage 3 plan | Held until the 2028 curriculum rollout is clearer (owner, 2026-11-27). |

## 2. Statement lists: permission asks (not sent)

`docs/curricula-permissions.md` holds 76 asks (Stage 1 rows 1 to 10, Stage 2 rows 11 to 26, Stage 3 rows 27 to 76). Owner's rule: send them all together, now that the last stage is built. The draft email is in `docs/curricula-gaps-plan.md` section 7, with exceptions listed at the top of the register (Wales, NGSS, South Africa, the Philippines, British Columbia).

Largest teacher impact first, as a suggestion:

1. **NGSS** (two asks: WestEd trademark, National Academies Press text). Twelve US states show "not available" for science until both come back.
2. **Wales** (Hwb terms). Welsh teachers are already live and have no statements.
3. **Texas, Florida, Virginia, Ontario, British Columbia, New Zealand, Ireland** (Stage 1 rows 4 to 10).
4. Stage 2 and 3 rows in any order.

## 3. Statement lists: open sources (owner decides, no email needed)

Licences that already allow commercial use. The owner decided (2026-11-27) to build these after the Stage 3 profiles, which is now.

| Source | Licence | Note |
|---|---|---|
| Japan (MEXT Courses of Study) | GJS Terms 2.0 | **BUILT 2026-11-28** (`jp-cos`, 865 statements in Japanese: official English covers the General Provisions only). Behind the batch B switch. |
| Taiwan (curriculum guidelines) | NAER open data declaration (PageDoc?fid=324; not OGDL) | **BUILT 2026-11-28** (`tw-108-zh`, 724 statements in Chinese for Mandarin and maths; `tw-108-en`, 997 in NAER's official English for English and science). Behind the batch B switch. |
| Norway (Udir Grep) | NLOD | **BUILT 2026-11-28** (`no-lk20`, 592 competence aims in Udir's English, LK20 plans in force from 2026-08-01, snapshot in docs/standards/norway). Behind the batch C switch. |
| Sweden (Skolverket Syllabus API) | CC0 1.0 | Machine-readable data. |
| France (programmes) | Licence Ouverte 2.0 / CRPA | Statements are in French. |
| Finland (ePerusteet) | Probably open | Licence text not found; confirm first. |
| Argentina (NAP) | Probably open (argentina.gob.ar CC BY 4.0) | Read one booklet's own notice first. |
| Brazil (BNCC) | Probably open (gov.br CC BY-ND 3.0) | Check basenacionalcomum.mec.gov.br's terms; verbatim only (no derivatives). |
| Vietnam | Open by statute only | Left out by the owner (no lawyer). |

Build pattern: `docs/curricula-gaps-plan.md` section 4 (as for Scotland and Northern Ireland), sources and sha256 recorded in the build log. Open-licence builds log to `docs/curricula-open-statements-build.md` (owner rule 2026-11-28: official text only, never Jooma's translation; core four subjects). Taiwan's sources, licence, decisions and results are in its section 3.

## 4. Language gaps

`docs/curricula-language-gaps.md` lists every curriculum whose teaching language Jooma cannot write yet (Arabic, Hebrew, Turkish, Chinese, Japanese, Korean, Dutch, the Nordic and Central European languages, Amharic, Kinyarwanda, Kiswahili and others). Also:

- **Latin American Spanish (es-419):** written output already uses Latin American wording through `languageNotes`; speech is still the Spain voice.
- **Worksheet template labels** ("Learning objective", subject headings) stay English in every output language.

## 5. Facts left out of profiles

Each profile names only what a source confirmed, so some terms fall back to generic wording. To patch, check the provenance note in `app/lib/curricula/provenance.ts` (each says what is Reference or missing):

- Inspection and SEN terms are missing for most Stage 3 entries.
- Ghana, Nigeria and Uganda have no attainment term (labels not confirmed).
- Ethiopia: which end-of-primary and middle-school exams are regional or national.
- Rwanda: whether S6 is on the old curriculum in 2026-27.
- Tanzania: the Amali vocational stream (national from 2028) is not in the profile.
- Zimbabwe: the continuous assessment weighting (one source only).
- Scotland and Northern Ireland entries have no `verifiedOn`.

## 6. Older owner decisions still open

From `docs/uk-curricula-build.md`: Northern Ireland, whether to keep Learning for Life and Work at KS3, keep the Irish-medium strand, and Year 12 at KS4.

## 7. Known test and lint debts

- `pnpm lint` had 11 old react-hooks errors in unrelated files when last counted (2026-11-25; not recounted since). The language check passes.
- `tests/auth/welcome.spec.ts` is stale since the no-card trial; the jo-fill and differentiated-versions specs flake in long runs.
