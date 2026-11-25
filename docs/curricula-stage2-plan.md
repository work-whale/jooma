# Plan: curricula Stage 2 (the workbook's "2 Soon" countries)

Written 2026-11-24. Nothing here is built yet.

"Stage 2" here means the workbook's stage 2: the rows marked `Out of scope (stage 2)` in `docs/Curricula/Jooma national curricula by country and state.xlsx`. It is not the "Stage 2" and "Stage 3" headings in `docs/uk-curricula-build.md`, which were names for work sessions (NI's year list, Australia's other learning areas).

## 0. Where things stand

Stage 1 (the "1 Next" rows) is merged to master (PR #123) and every region switch is on in production: 85 curricula, statements for Common Core, Australia v9 (all areas but Languages), Scotland and Northern Ireland. Open Stage 1 items (Wales email, NGSS, the seven licence asks, Alberta's licence page, the Scotland and NI account check) carry on in parallel and are not part of this plan, except one: Scotland and Northern Ireland get a `verifiedOn` date in Step 1.

## 1. Decisions (owner, 2026-11-24)

| Topic | Decision |
|---|---|
| Depth | A full profile for every Stage 2 country, plus statements for any country whose curriculum text has an open licence that allows commercial use. Closed sources get a permission request, as for Texas. |
| India | CBSE only: one entry, "India: CBSE (NCERT)". CISCE, NIOS and state boards wait until teachers ask. |
| UAE | The Ministry of Education curriculum only. Private-school teachers pick the curriculum their school follows (England, US, IB, CBSE), which already exist. No KHDA, ADEK or SPEA entries. |
| UK-only tools | Hidden for all Stage 2 curricula, like every other non-UK curriculum. |
| Regions | Five new switches: Asia, Middle East, Africa, Europe, Caribbean. |
| Rolling rollouts | One version whose label says which years are on the new curriculum, plus a dated switch when the rollout ends. No per-year versions. |
| Spelling | British English for all, American English for the Philippines (UAE checked in Step 0). |
| Order | Africa, then Asia, then Caribbean and Malta, then the UAE. |
| Permission emails | Not sent during the stages. Every source that needs permission (Stage 1 and Stage 2) is listed with its drafted email in `docs/curricula-permissions.md`, and all are sent together after the last stage. |
| Who does what | Opus does Step 0 (research) itself and reviews every build step; Sonnet does the building. |

## 2. Scope: 15 entries

| Region (new switch) | Entries |
|---|---|
| Asia | India (CBSE), Pakistan, Philippines, Malaysia, Singapore, Hong Kong |
| Middle East | United Arab Emirates (MoE) |
| Africa | Nigeria, Ghana, Kenya, Uganda, South Africa |
| Europe | Malta |
| Caribbean | Jamaica, Trinidad and Tobago |

The workbook rows for India's other boards and the UAE emirates are marked "covered by" the entries above or "Out of scope (later)" by the status script, so nothing is left unexplained.

Each entry follows the existing shape (`app/lib/curricula/types.ts`), as Ireland does in `ireland.ts`: `id`, `region`, `country`, `place`, `name`, `promptLabel`, dated `versions`, `years` (label and starting age), `defaultLanguage`, `terms` (curriculum, stages, exams, inspection, SEN, teacher standards, early years, attainment, headteacher), a `context` line, `verifiedOn`, and a provenance row (`provenance.ts`).

Things that make these countries different from Stage 1:

- **Curricula mid-change.** Malaysia (KP2027 from 2027, rolling up from Year 1 and Form 1), Pakistan (new primary curriculum 2027-28), the Philippines (MATATAG rolling year by year to 2028), Singapore (SEC replaces O and N Levels from 2027), Nigeria (revised curriculum rolling up from 2025-26), Kenya (CBE Senior School from 2026). The registry switches a whole curriculum on one date; it has no per-year version. See question 2.
- **School years that do not start in September.** South Africa, Singapore, Kenya and others run January to December; India's CBSE year starts in April. Nothing in the app depends on the month today, so this only goes in the `context` line where it helps the model (for example term names in a Term Plan).
- **Teaching languages Jooma does not write.** Urdu, Hindi, Filipino, Malay, Chinese, Tamil, Arabic, Kiswahili, Afrikaans and Maltese are not output languages. Every Stage 2 country teaches in English in at least part of its schools, so each gets an English default. No new output language is part of this stage.
- **Seven rows were never checked** against an official source (Singapore, Hong Kong, Ghana, Uganda, Malta, Jamaica, Trinidad and Tobago are "Not checked (reference knowledge)"). They get the same check as the rest before they can show.

## 3. Steps (test first; each step committed separately on `staging`)

### Step 0: source and licence check (Claude, research only, no code)

For each of the 15, open the official source and record in a new build log (`docs/curricula-stage2-build.md`):

1. The version in force today and any dated change ahead, with the link.
2. Year and stage names and the age pupils start each year.
3. National exams, the inspection or quality body, SEN terms, the head of school's title, the early-years framework name.
4. **The licence for the curriculum text**: is reuse allowed, and is commercial reuse allowed? Verdict per source: Open (build statements), Closed (permission request), or Unclear (ask).
5. Where the official site refuses automated reads (as Alberta's did), list it for the owner to open in a browser.

Done when every row has a source link, a check date and a licence verdict. Output: the table that drives Steps 2 and 3. Every closed or unclear source is added, with its drafted email, to `docs/curricula-permissions.md`; nothing is sent until all stages are done. Done by Opus, not delegated, because a wrong licence verdict is the costliest mistake in this stage.

### Step 1: plumbing for five new regions

- `RegionId` and `REGIONS` gain `asia`, `middle-east`, `africa`, `europe`, `caribbean`, each with its label for the admin console and picker.
- **Staging migration** (Claude writes and applies it to staging, the owner pushes it to production): seed `curricula_asia`, `curricula_middle_east`, `curricula_africa`, `curricula_europe`, `curricula_caribbean` in `app_settings`, all `false`, and add the five keys to the whitelist inside `public_settings()` (it lists the keys by name in `20261114000000_curricula.sql`). Off by default, so a production push changes nothing a teacher sees.
- Scotland and Northern Ireland get `verifiedOn`.
- The picker's country list: check each Stage 2 country's ISO code is offered on the profile and complete-profile screens, and that picking it lands on the new entry.

### Step 2: the entries, one region at a time

Order: **Africa, Asia, Caribbean and Europe, Middle East** (see question 4). Each region is one commit: entries, provenance, `node scripts/curricula-status.mjs` to update the workbook, then its tests. A region's switch stays off until Step 4.

### Step 3: statements for open-licence sources

**Step 0 result (2026-11-24): no Stage 2 source is open for commercial use, so this step builds nothing now.** All 15 are on `docs/curricula-permissions.md`; each "yes" later is built as below.

Only for sources Step 0 marks Open. Each is its own commit, the same shape as Scotland and NI (`docs/curricula-gaps-plan.md` section 4): official source copied to `docs/standards/<country>/` with URL, fetch date and sha256; a builder; the data file; `FrameworkId`, `FRAMEWORK_NAME`, `FRAMEWORK_AGES`, `loadFramework`, `FRAMEWORK_PERMITTED` (with the licence note), `FRAMEWORK_CREDIT`, and `/terms` section 13; matcher subject words in `app/lib/standards/suggest.ts`. Default scope per source: English, Mathematics and Science for the years the source covers. A source that is very large or not a list (prose, as NI Key Stage 3 was) comes back to the owner before it is built.

### Step 4: release

Owner pushes the migration to production, then switches regions on one at a time in Admin > Settings > Curricula by region. Run `node scripts/curricula-status.mjs --live=<regions>` after each.

## 4. Tests

Planned before the code, per `AGENTS.md`. Each test is asked: would it still pass if the code were wrong?

**Unit** (`tests/unit/curricula.spec.ts` and friends, written first, run red):

- Registry: every new id unique and stable; every entry has `verifiedOn`, a `defaultLanguage` from `LANGUAGES`, ages that rise year by year, and a provenance row; every entry's region is one of the five new ones.
- Versions: each dated change picks the old version the day before and the new one on the day (Malaysia 2027, Singapore 2027, Pakistan 2027-28), using `currentVersion(entry, now)`.
- Region switches: `regionsFromSettings` turns on each new region only for an exact `true`; a missing or malformed row leaves it off; a new entry is invisible to a teacher while its region is off and visible to an admin.
- Tool scope: every Stage 2 id hides the five UK-only tools.
- Prompts: `curriculumInstruction` for each new id names its own system, exams and inspection body and none from another system (no "Ofsted", no "GCSE" unless the country really sits them, no other country's name); UK golden prompts stay byte for byte the same (`curriculum-golden.spec.ts`).
- Parsing: `parseCurriculum` accepts each new id, rejects look-alikes, and never returns an entry whose region is off.
- Sheet: every new entry matches a workbook row (existing sheet test), and every stage 2 row has a status.
- Boundaries: South Africa's Grade R (age 5) and India's LKG and UKG line up by age with England's Reception; years with no counterpart (Singapore JC 2, Malaysia Form 6 upper) still have an age and do not break the age lookup.
- Step 3 sources: counts, word-for-word samples against the source, every year on the list has statements or an honest "not available", permission off gives no statements and no credit.

**Definer function check:** extend `scripts/verify-curriculum-profile.mjs` so that, through the anon key as a throwaway user, `public_settings()` returns the five new keys and nothing else new, and a teacher can save a Stage 2 `curriculum_id` on their own profile only.

**E2E** (model mocked, one spec): a South African teacher, with the Africa switch on for the test, picks their curriculum, sees "Grade R" to "Grade 12" in the year list, does not see the UK-only tools, and a worksheet request carries `curriculumId`. Plus one per Step 3 source: align a worksheet, the statement id is in the request, the credit shows.

**Live** (`LIVE_MODEL=1`, staging): one worksheet per new region; the output parses and contains no "Key Stage", "Ofsted" or "Year N" where the country does not use them.

**Visuals:** before and after screenshots of the picker and a tool's year list in `docs/screenshots/<date>-curricula-stage2/` (gitignored).

**Deliberately not tested:** output quality for every one of the 15 (one live run per region stands in); the matcher's choices across many topics.

## 5. Questions for the owner (answered 2026-11-24, see section 1)

1. **Regions:** **five new switches (Asia, Middle East, Africa, Europe, Caribbean)**, or one switch per country? Five matches how Stage 1 works; Europe and Asia will also hold Stage 3 countries later.
2. **Rolling rollouts** (Malaysia, Philippines, Nigeria): **one version whose label says which years are on the new curriculum, plus a dated switch when the rollout finishes**, or add per-year versions to the registry (a type change touching every entry's tests)?
3. **Default spelling:** **British English for all except the Philippines (American English)**? The UAE's public schools need checking in Step 0.
4. **Order:** **Africa first** (English-medium, and Jooma's only non-GB teacher today is in South Africa), then Asia, then Caribbean and Malta, then the UAE?
5. **Permission requests** from Step 0: sent by **the owner or the CEO, all at once**, as for Stage 1?

## 6. Order of work

Every step runs as a loop: Opus plans the step, a Sonnet subagent implements it on `staging` (tests first), and Opus reviews the diff and reruns the tests before the step is committed. Fixes go back to Sonnet.

1. Owner answers section 5 (done).
2. Step 0 (research, Opus). Permission requests go on the list in `docs/curricula-permissions.md`.
3. Steps 1 and 2, region by region, on `staging`.
4. Step 3, one source per open licence (and later, per "yes").
5. Step 4 release, then one account check per region.
