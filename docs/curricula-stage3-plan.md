# Plan: curricula Stage 3 (the workbook's "3 Later" countries)

Written 2026-11-27. Nothing here is built yet.

"Stage 3" means the rows marked `Out of scope (stage 3)` in `docs/Curricula/Jooma national curricula by country and state.xlsx`: 59 countries plus 14 split-system rows (Germany 6, Switzerland 3, Belgium 3, Spain 2). It is not the "Stage 3" heading in `docs/uk-curricula-build.md`, which was a work session (Australia's other learning areas).

## 0. Where things stand

Stage 2 is released (2026-11-27): merged to master (PR #125), migration `20261124000000` on production, and the owner has switched all five new regions on. All 11 `curricula_*` switches are true on production, and the workbook shows every Stage 1 and 2 entry as Live (e0b2eb7). Permission emails (`docs/curricula-permissions.md`) are still unsent by design: they all go together after the last stage.

## 1. Decisions (owner, 2026-11-27, plus Stage 2 rules that carry over)

| Topic | Decision |
|---|---|
| Depth | A full profile for every country. Step 0 checks each source's licence: closed or unclear sources go on `docs/curricula-permissions.md`; a source that is genuinely open for commercial use comes back to the owner before statements are built. |
| First batch | Gulf and Middle East. Then the rest of Asia, Europe, Latin America, the rest of Africa. |
| Release gate | A new switch per batch, off by default. Needed because the Asia, Africa, Europe and Middle East switches are already on. |
| Output language | A country whose language is one of Jooma's 9 non-English output languages gets it as its default (only if the teacher never chose one, as today). Every other country defaults to English. Each such country is listed in `docs/curricula-language-gaps.md` so it can get its own language later. |
| UK-only tools | Hidden, as for every non-UK curriculum. |
| Rolling rollouts | One version whose label says which years are on the new curriculum, plus a dated switch when the rollout ends (Stage 2 rule). |
| Permission emails | Added to `docs/curricula-permissions.md`, sent together after the last stage (Stage 2 rule). |
| Who does what | Opus does Step 0 research itself and reviews every build step; Sonnet builds. |

## 2. Batches

| Batch | Switch | Picker heading (region) | Entries |
|---|---|---|---|
| A. Gulf and Middle East | `curricula_s3_a` | Middle East (Turkey: Europe, as in the workbook) | Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Jordan, Egypt, Israel, Turkey (Türkiye) |
| B. Asia | `curricula_s3_b` | Asia | China, Japan, South Korea, Taiwan, Vietnam, Thailand, Indonesia, Bangladesh, Sri Lanka, Nepal |
| C. Europe | `curricula_s3_c` | Europe | Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Italy, Latvia, Lithuania, Netherlands, Norway, Poland, Portugal, Romania, Serbia, Slovakia, Slovenia, Spain, Sweden, Switzerland, Ukraine |
| D. Latin America | `curricula_s3_d` | Latin America (new region) | Argentina, Brazil, Chile, Colombia, Mexico, Peru |
| E. Africa | `curricula_s3_e` | Africa | Ethiopia, Rwanda, Tanzania, Zambia, Zimbabwe |

59 entries in total. Switches are named by batch letter, not region, because Turkey is in batch A but under the Europe heading (decided in `docs/curricula-stage3-build.md` A.8). Europe is the largest batch (29 countries) and may be split in two when we get there. The split systems (Germany's Länder, Swiss cantons, Belgium's communities, Spain's autonomous communities) are a question for batch C, not now (section 6).

**Why the switch is separate from the region.** Today `region` decides both the picker heading and the switch. If batch A used a new region, Saudi Arabia would sit under a different heading from the UAE. So Step 1 adds an optional `release` field to `Curriculum`: an entry shows to a teacher only when its region switch AND its release switch are on. Picker headings stay geographic. After a batch is released and settled, its `release` field can be dropped and its switch retired.

## 3. What makes Stage 3 different

- **Most countries do not teach in English.** For batch A, the state schools teach in Arabic (Gulf, Jordan, Egypt), Hebrew or Arabic (Israel) and Turkish (Turkey). None of these is a Jooma output language, so all nine default to English. Teachers using Jooma in these countries are mostly in English-medium private schools, which already pick England, US, IB or Cambridge. The national entry is for teachers in state schools and bilingual schools, and for anyone who wants local terms.
- **Sources in other languages.** Many official documents exist only in the national language. Step 0 reads them through translation and marks each fact Confirmed only when the official page says it. Terms go into the profile in English with the local name in brackets where teachers use it (for example "Tawjihi (General Secondary Education Certificate)").
- **Ministry names change often in the Gulf** (Saudi Arabia's Education and Training Evaluation Commission, Qatar's ministry merger, Kuwait's reforms). Every term gets a check date.
- **Licences.** Stage 2 found no open source. Expect the same, with possible exceptions where government works carry no copyright (to be checked per country, never assumed).

## 4. Steps (test first; each step committed separately on `staging`, pushed after each)

### Step 0: source and licence check, batch by batch (Opus, research only)

For each country in the batch, recorded in `docs/curricula-stage3-build.md`, in the same shape as `docs/curricula-stage2-build.md` section 0:

1. The version in force today and any dated change ahead, with the link.
2. Year and stage names and the age pupils start each year.
3. National exams, inspection or quality body, SEN terms, head of school's title, early-years framework.
4. Teaching language(s) and the default output language under section 1's rule; non-English-only countries added to `docs/curricula-language-gaps.md`.
5. The licence for the curriculum text: Open, Closed or Unclear. Closed and Unclear go on `docs/curricula-permissions.md` with a drafted email.
6. Official sites that block automated reads are listed for the owner to open in a browser.

Done for a batch when every row has a source link, a check date and a licence verdict.

### Step 1: plumbing (once, before batch A builds)

- `Curriculum.release?: ReleaseId` and `RELEASES` (the five Stage 3 switches); `offeredCurricula` and `parseCurriculum` require region AND release on for non-admins; admins still see everything.
- **Staging migration** (Claude writes and applies it to staging; owner pushes to production): seed the five `curricula_s3_*` keys false and add them to the `public_settings()` whitelist. The `latin-america` region is added with batch D, not here (build log A.8).
- Admin > Settings > Curricula by region lists the release switches under their own heading ("Stage 3 releases").
- Picker: check each country's ISO code is offered on the profile and complete-profile screens.

### Step 2: entries, one batch at a time

Each batch is one commit (Europe may be two): entries, provenance, `node scripts/curricula-status.mjs` to update the workbook, then tests. Its release switch stays off until Step 4.

### Step 3: statements for open sources

Only for sources Step 0 marks Open, and only after the owner says yes. Same shape as Scotland and NI (`docs/curricula-gaps-plan.md` section 4).

### Step 4: release, per batch

Owner pushes the migration (first batch only), merges staging into master, turns the batch's release switch on, does one teacher check, runs `node scripts/curricula-status.mjs --live=...`. A checklist like `docs/curricula-release-checklist.md` is written for each batch.

## 5. Tests

Planned before the code (`AGENTS.md`). Each asked: would it still pass if the code were wrong?

**Unit** (written first, run red):

- Release gate: an entry with `release` is hidden from a teacher when its release switch is off even though its region is on; shown when both are on; hidden when the region is off and the release is on; always shown to an admin; a missing or malformed release row leaves it off; entries without `release` behave exactly as today (Stage 1 and 2 regression).
- `parseCurriculum` rejects a Stage 3 id while its release is off.
- Registry: ids unique and stable; every entry has `verifiedOn`, a `defaultLanguage` from `LANGUAGES`, rising ages, a provenance row, a region and a release.
- Language rule: entries for France, Germany, Spain, Italy, Poland, Portugal, Brazil, Sweden, Estonia, Austria default to their language; every other Stage 3 entry defaults to English and appears in the language gaps list (a test reads the list so the note can't drift).
- Tool scope: every Stage 3 id hides the five UK-only tools.
- Prompts: `curriculumInstruction` for each new id names its own system, exams and inspection body and none from another system; UK golden prompts unchanged (`curriculum-golden.spec.ts`).
- Versions: each dated change picks the old version the day before and the new one on the day.
- Sheet: every Stage 3 row has an entry or a status.

**Definer function check:** extend `scripts/verify-curriculum-profile.mjs`: through the anon key, `public_settings()` returns the six new keys and nothing else new; a teacher can save a Stage 3 `curriculum_id` only on their own profile.

**E2E** (model mocked, one spec): with the batch A release on for the test, a Saudi teacher picks their curriculum under "Middle East", sees the local year names, no UK-only tools, and a worksheet request carries `curriculumId`. With the release off, the country is not in a teacher's picker.

**Live** (`LIVE_MODEL=1`, staging): one worksheet per batch, plus one in a non-English default (for example France in batch C); the output parses, is in the right language, and uses no "Key Stage" or "Ofsted".

**Visuals:** before and after screenshots of the picker and the admin switches in `docs/screenshots/<date>-curricula-stage3/` (gitignored).

**Deliberately not tested:** output quality for every country (one live run per batch stands in); translation accuracy of local term names beyond the Step 0 check.

## 6. Later questions (not needed for batch A)

1. **Split systems (batch C):** one national entry for Germany, Switzerland, Belgium and Spain, with the Länder, cantons and communities named in the `context` line, or one entry per state or community? Recommendation: one national entry first, split only where teachers ask.
2. **Spanish for Latin America:** Jooma's Spanish speaks with a Spain voice (`es-ES`). Use it for Latin America as is, or add Latin American Spanish as a new output language first? Recommendation: use it, and list `es-419` in the language gaps.
3. **Europe:** one batch or two (West and North / Central and East)?

### Batch D decisions (owner, 2026-11-28)

| Topic | Decision |
|---|---|
| Spanish | Argentina, Chile, Colombia, Mexico and Peru default to Jooma's Spanish (`es`). When the output language is Spanish, the curriculum line asks for Latin American usage ("ustedes", "computadora"), and never changes the output language itself (batch A lesson). Speech stays es-ES. `es-419` goes on `docs/curricula-language-gaps.md`. Brazil defaults to `pt-BR`. |
| Switches | New region `latin-america` (picker heading "Latin America"), its switch `curricula_latin-america` seeded TRUE in the staging migration; the release switch `curricula_s3_d` stays false, so release is one flip as in batches A to C. Both keys go on the `public_settings()` whitelist. |
| Split systems | One national entry per country (Brazil's states, Argentina's provinces and Mexico's states named in the `context` line), as in batch C. |
| Open sources | If Step 0 finds a source open for commercial use (Brazil's BNCC is the likely one), record it in the build log; statements are built later with Japan and Taiwan, after Stage 3's profiles. |

## 7. Order of work

Every step runs as a loop: Opus plans, a Sonnet subagent builds on `staging` (tests first), Opus reviews the diff and reruns the tests before it is committed and pushed. Fixes go back to Sonnet.

1. Owner answers section 1 (done 2026-11-27).
2. Step 0 for batch A (Opus).
3. Step 1 plumbing, then Step 2 batch A.
4. Step 4 release of batch A, while Step 0 runs for batch B. And so on.
