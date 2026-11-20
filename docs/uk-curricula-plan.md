# UK nations "Align to curriculum": implementation plan

For: Jooma (C:\Users\kitki\Desktop\WORK\jooma). Goal: give Scotland, Wales and Northern Ireland their own statements in "Align to curriculum". Today they are shown England's.
Executor: Sonnet, running unattended. Every decision below is already made. Where the owner must decide, it says **OWNER DECISION**, with a default to use so the run never blocks.

---

## 0. What I verified before planning (read this first)

### The bug, and where it lives
- `app/lib/standards/index.ts:89-93`. `alignmentMode()` returns `"england"` when `c.region === "uk" || c.region === "british-isles"`. So `scotland`, `wales` and `northern-ireland` (all region `"uk"`, `app/lib/curricula/uk.ts:46-79`) get England's statements, and the card names them "National Curriculum in England" (`app/components/slideshow/CurriculumAlignment.tsx:293-315`).
- `alignmentMode()` has two less obvious consumers. Both must be handled, or step 0 causes a regression:
  1. **`app/components/slideshow/GenerateModal.tsx:197-200`.** `yearOptions` uses `alignmentMode(...) === "england"` to pick the UK year list (`SLIDESHOW_YEARS`, Nursery to Year 13 plus "Adult learners", `app/lib/assistant-tools.ts:120-126`). Once Scotland is no longer "england", the else branch would give Scotland `UK_YEARS` plus "Adult learners", silently dropping Year 12 and Year 13.
  2. **`app/api/suggest-subject/route.ts:29-34`.** Any non-"standards" mode falls back to **England's** statements. A curriculum in mode "none" that calls the route would get England ids back.
- `app/lib/standards/align.ts:28-59` (`alignParamFor`). England goes through `curriculumAlignParam` unchanged. Every other curriculum keeps only statements whose `frameworkOf(id)` is usable for that curriculum, so England ids sent for Scotland are already dropped. `place = c.place ?? c.name` (line 48) would print "Curriculum for Excellence" as the country, because UK entries have `state` but no `place`. I checked the registry: the only entries with `state` and no `place` are the five UK ones, so `c.place ?? c.state ?? c.name` changes nothing else.
- Server prompts print what the client sends:
  - `app/lib/deck-prompt.ts:228-235` and `app/lib/worksheet-prompt.ts:102` use `curriculumPromptBlock()` (`app/lib/national-curriculum/prompt.ts:91-101`). It prints `curriculumName · stage · year · subject · strand`, then the statement texts.
  - `app/api/generate-lesson-outline/route.ts:52` prints `curriculumName`.
  - **No server change is needed.** Correct names come from `alignParamFor` on the client.
- `curriculumInstruction()` returns `""` for all five UK ids (`app/lib/curricula/index.ts:133-135`, golden test `tests/unit/curriculum-golden.spec.ts`). UK prompts stay byte for byte unchanged. Do not touch this.

### Data and tests
- Existing data shape: `app/lib/standards/data/*.json` is `{ source: { title, file, url, credit }, statements: [{ id, code, subject, strand, ages, text }] }`.
  - Each file is lazy-loaded through `loadFramework()`'s `switch` with `await import("./data/x.json")` (`index.ts:66-77`).
  - Built by `scripts/build-standards.mjs` from sources committed in `docs/standards/`.
  - Text is verbatim except for a capitalised first letter, collapsed whitespace, and en and em dashes written as hyphens (`build-standards.mjs:35,52`).
- `tests/unit/standards.spec.ts` has two tests that change with this work:
  - Lines 217-222 assert that every `uk` and `british-isles` curriculum is `"england"`. This must change.
  - Lines 314-316 pin `FRAMEWORK_PERMITTED` with `toEqual`. Extend it per step.
- `scripts/check-language.mjs:42-59` covers only marketing files, not `app/lib/standards` or the data. The rule "no em or en dashes anywhere" is enforced for data by the unit tests (the existing one is `standards.spec.ts:54`).
- **Uncommitted work already in the tree** (`git status`): `CurriculumAlignment.tsx` (Country dropdown removed, `data-testid="curriculum-alignment-name"` added), `app/lib/curriculum.ts` deleted, and a regression test added in `tests/tools/slideshow-curriculum.spec.ts`. Screenshots are in `docs/screenshots/2026-11-20-align-country-box`. This is the owner's work. **Build on top of it. Never revert, stash or commit it.**

### Sources and licences (researched 2026-11-20)

| Nation | Statements | Machine-readable source | Licence finding | Decision |
|---|---|---|---|---|
| Scotland | Experiences and Outcomes (Es and Os), Early, First, Second, Third, Fourth level | Per-area PDFs on https://education.gov.scot/curriculum-for-excellence/curriculum-for-excellence-documents/experiences-and-outcomes/ (page updated 27/04/2026). `all-experiencesoutcomes18.pdf` (2.27 MB, 313 pages) holds 1,396 unique codes. Its `.doc` twin is actually RTF converted from the PDF. | https://education.gov.scot/terms-of-use: "© Crown copyright", reuse "under the terms of the Open Government Licence", logos and third-party material excluded. OGL v3 allows commercial use and adaptation. | **Ship.** |
| Northern Ireland | Statutory requirements by Area of Learning, Foundation Stage, KS1, KS2, KS3, KS4 | The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007, Schedule 2, on legislation.gov.uk as XML: https://www.legislation.gov.uk/nisr/2007/46/schedule/2/data.xml (latest revised; amendments 2008, 2009, 2022, 2023). | legislation.gov.uk content is Crown copyright under OGL v3.0. CCEA's own documents (ccea.org.uk) are CCEA copyright and are **not used**. | **Ship from legislation.gov.uk only.** Year mapping is an OWNER DECISION (section 6). |
| Wales | Descriptions of learning by "What matters" statement and Progression step 1 to 5 | Live Hwb pages, e.g. https://hwb.gov.wales/curriculum-for-wales/mathematics-and-numeracy/descriptions-of-learning/. Clean HTML: `progression-steps__strand`, then `progression-steps__element` rows of 5 `progression-steps__cell`, one `<p>` per description. | **Unclear, and restrictive.** The Hwb Terms (https://hwb.gov.wales/termsandconditions) limit downloads to educational use, forbid commercial use, modification, data mining and web scraping without permission, and do not name the OGL. gov.wales's OGL statement does not mention Hwb. The 2020 guidance PDF carries only "© Crown copyright January 2020". | **OWNER DECISION. Default: do not fetch Hwb and do not ship Wales.** Wales shows the honest "not available yet" note until the owner records written permission. |

**Benchmarks (Scotland). OWNER DECISION. Default: leave out.** They are assessment guidance rather than curriculum statements, they are several times larger, and they can be added later as their own framework ids.

---

## 1. Architecture decisions (made; follow them)

1. **Use the existing "standards" path. Do not add a new mode.** Each nation's data becomes ordinary `FrameworkId`s in `app/lib/standards`, so loading, the card, credits, `alignParamFor` and suggest-subject all work with small generic changes.
2. **One `FrameworkId` per stage, not per nation.** `loadStandardsFor()` (`index.ts:107-114`) already filters frameworks by age before loading. Per-stage ids therefore mean a Year 4 teacher downloads one stage file (about 100 KB), not the whole nation (about 450 KB for Scotland), with no change to the loader. Stage names for the year picker come free from a per-framework label.
   - Scotland: `cfe-early`, `cfe-first`, `cfe-second`, `cfe-third-fourth`
   - Northern Ireland: `nic-fs`, `nic-ks1`, `nic-ks2`, `nic-ks3`, `nic-ks4`
   - Wales (only once permitted): `cfw-ps1` to `cfw-ps5`
   - Third and fourth level share one id because Education Scotland gives them the same span (S1 to S3). Separate ids would list the same multi-level outcome twice in one year.
3. **England labels stay in the UI.** Do not change `UK_YEARS` (`uk.ts:13-17`). Each stage maps to registry ages (table below). The card's Year options for these nations read like England's: `"First level · Year 4"`, `"Key Stage 1 · Year 3"`. A teacher can see which stage a label maps to.
4. **Ages (`FRAMEWORK_AGES`, using the registry ages of the England-named years: Nursery 3, Reception 4, Year N = N+4):**

| Framework | Ages | England labels shown | Basis |
|---|---|---|---|
| cfe-early | 3, 4, 5 | Nursery, Reception, Year 1 | Early = pre-school and P1 (P1 starts at about 5) |
| cfe-first | 6, 7, 8 | Year 2 to Year 4 | First = to end of P4 |
| cfe-second | 9, 10, 11 | Year 5 to Year 7 | Second = to end of P7 |
| cfe-third-fourth | 12, 13, 14 | Year 8 to Year 10 | Third and fourth = S1 to S3 (S1 starts at about 12) |
| (Scotland Year 11) | none | "not covered" note | S4 is the senior phase: qualifications, no Es and Os |
| nic-fs | 5, 6 | Year 1, Year 2 | OWNER DECISION 1: by year number (default) |
| nic-ks1 | 7, 8 | Year 3, Year 4 | " |
| nic-ks2 | 9, 10, 11 | Year 5 to Year 7 | " |
| nic-ks3 | 12, 13, 14 | Year 8 to Year 10 | " |
| nic-ks4 | 15 | Year 11 | " (Order has PE and LLW only at KS4) |
| cfw-ps1 to ps5 | [3,4], [5,6,7], [8,9,10], [11,12,13], [14,15] | Nursery to Year 11 | Step n describes expectations reached at about 5, 8, 11, 14, 16, so each year sees the step it works towards. Welsh year names and ages are England's. |

5. **Ids.**
   - Scotland: from the official code, `<framework>-<first code slug>`, e.g. `cfe-first-mnu-1-02a`. `code` holds the outcome's codes for that framework in source order, joined with `" / "`, e.g. `"HWB 3-01a / HWB 4-01a"`.
   - Northern Ireland and Wales have no official codes: `<framework>-<first 10 hex of sha1(subject + "|" + strand + "|" + text)>`, with `code: ""`. Hash ids survive insertions in the source; positional ids would not. Restored runs keep their ticks while the text is unchanged.
   - `frameworkOf()` becomes generic: test against `FRAMEWORK_IDS` (all keys of `FRAMEWORK_NAME`), sorted longest first, with `statementId.startsWith(id + "-")`.
6. **Names and credits:**
   - `FRAMEWORK_NAME`: every `cfe-*` = `"Curriculum for Excellence experiences and outcomes"`; every `nic-*` = `"Northern Ireland Curriculum statutory requirements"`; every `cfw-*` = `"Curriculum for Wales descriptions of learning"`.
   - `align.ts` must **dedupe** names: `[...new Set(frameworks.map((f) => FRAMEWORK_NAME[f]))].join(" and ")`.
   - New `FRAMEWORK_STAGE: Partial<Record<FrameworkId, string>>`: `"Early level"`, `"First level"`, `"Second level"`, `"Third and fourth level"`, `"Foundation Stage"`, `"Key Stage 1"` to `"Key Stage 4"`, `"Progression step 1"` to `"Progression step 5"`. US and Australian ids have no entry, so their behaviour is unchanged.
   - Credits in `app/lib/standards/credits.ts`, one constant per nation applied to each of its ids. **No dashes.** The executor must re-read the licence page and adjust wording if it differs, recording the change in the build doc:
     - `CFE_CREDIT = "Curriculum for Excellence experiences and outcomes: © Crown copyright, Education Scotland. Contains public sector information licensed under the Open Government Licence v3.0."`
     - `NIC_CREDIT = "Northern Ireland Curriculum statutory requirements, from The Education (Curriculum Minimum Content) Order (Northern Ireland) 2007: © Crown copyright. Contains public sector information licensed under the Open Government Licence v3.0."`
     - `CFW_CREDIT`: written only when Wales is permitted, with the wording the permission specifies.
7. **Text rules (same as `build-standards.mjs`), applied by a new script.** Allowed changes:
   - capital first letter
   - collapsed whitespace
   - en and em dashes become hyphens (spaced stay spaced)
   - HTML or XML tags stripped and entities decoded
   - Northern Ireland only: trailing list punctuation (`;`, `; and`, `, and`, `:`) removed, and ALL-CAPS area and strand titles title-cased.

   Nothing else. Never invent, merge or paraphrase a statement.
8. **Source copies.** Save to `docs/standards/uk/<nation>/` (matches the existing `docs/standards/` convention). Do not stage them; the owner decides about committing. Record each file's URL, fetch date and `sha256sum` in the build doc and in the build script's header comment.

---

## 2. Project rules the executor must follow

- Read `AGENTS.md` and `CLAUDE.md` (which is just `@AGENTS.md`) first. `docs/instant-navigation-guide.md` is **not** relevant: no routing, Suspense or navigation changes.
- **No em dashes (U+2014) or en dashes (U+2013) anywhere**: code, comments, test names, data, docs, the build doc. Check before finishing: `grep -rnP "[\x{2013}\x{2014}]" <changed files>` must print nothing.
- **Staging only, never production.** Build and start only through `scripts/with-staging-env.sh`, which refuses a production `.env.local`. Never aim a test at production. Never use `E2E_BASE_URL` with a production URL.
- **Test-first.** For each step, write or extend the unit tests, run them and **see them fail** (record the failing count in the build doc), then implement until green.
  - Unit: `pnpm test:unit` (whole suite) or `pnpm test:unit tests/unit/<file>.spec.ts`.
- **E2E:** Playwright under `tests/tools/`.
  - Model routes are mocked with `page.route`.
  - Base URL is `http://localhost:3000`, never `127.0.0.1`.
  - Always pass `--trace off`.
  - Never let Playwright start `next dev`. `playwright.config.ts:98-107` starts `pnpm next dev` when nothing is on :3000, so **a server must be running before every Playwright command.**
- **Server procedure (Git Bash plus PowerShell):**
  1. Check: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
  2. Identify: PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'next' } | Select-Object ProcessId, CommandLine`
  3. If it is `next start` (a stale build), you may stop it with `Stop-Process -Id <pid> -Confirm:$false` and rebuild.
  4. If it is `next dev` (the owner's), **leave it running and do not stop it.** Playwright will reuse it and it serves current code; note this in the build doc.
  5. If nothing is running, or after stopping a stale `next start`:
     - `bash scripts/with-staging-env.sh npx next build 2>&1 | tee docs/screenshots/<DATE>-uk-curricula/build-<label>.txt`
     - then start `bash scripts/with-staging-env.sh npx next start --port 3000` **in the background** (run_in_background)
     - poll the curl check until it returns 200.
- **Screenshots** go in `docs/screenshots/<DATE>-uk-curricula/before/` and `.../after/`. `<DATE>` is the run date, YYYY-MM-DD. The folder is gitignored (`.gitignore:63`).
- **Do not commit or push. Do not create a branch.** Leave everything in the working tree for owner review. Write the summary in `docs/uk-curricula-build.md`.
- **No new npm dependencies.** Use `unpdf` and `jszip` (already used by `scripts/build-standards.mjs`), `node:crypto`, and regex parsing as the existing scripts do. Do **not** import from `scripts/build-standards.mjs`: it runs its whole build at top level. Copy the small `clean`/`cap` helpers into the new script.
- Do **not** run `scripts/build-standards.mjs`: it would rewrite the existing US and Australian data.
- No database or schema changes: none are needed. `profiles.curriculum_id` already exists.
- Do not run `node scripts/curricula-status.mjs` without `--check`: that would rewrite the shared workbook. **OWNER DECISION 5, default: `--check` only.**
- `LIVE_MODEL=1` specs: not needed. Prompt templates and schemas are unchanged; only the quoted statements differ. Say so in the summary.

---

## 3. Order of work

Each step is a checkpoint. The app works if the run stops after any step. At the end of every step, append the step's section to `docs/uk-curricula-build.md` (template in section 5).

### Step A. Baseline (no code changes)
1. `git status` and `git diff --stat`. Record them in the build doc, noting the owner's uncommitted files (section 0).
2. `pnpm test:unit`. Record the pass and fail counts; pre-existing failures are not yours to fix.
3. Server procedure (section 2). Build the **current** tree and keep `build-before.txt`. Next 16.2 may not print per-route sizes. If it does not, also record:
   - `du -sb .next/static/chunks`
   - the ten largest files: `ls -S .next/static/chunks | head -10` with sizes.
4. Write the E2E spec (Step 0 item 6) **now**, before any code change. Run it with `SHOTS_DIR=docs/screenshots/<DATE>-uk-curricula/before pnpm exec playwright test tests/tools/uk-curricula-align.spec.ts --trace off`.
   - The "never shown England's statements" test **must fail** for Scotland, Wales and NI. That is the live bug, and the screenshots are the "before" evidence.

Done looks like: baseline counts recorded, before screenshots exist showing England's list under a Scotland, Wales or NI curriculum, and the spec fails for the right reason.

### Step 0. Interim safety fix
Goal: until a nation's data lands, it shows "not available yet" (mode `"none"`) instead of England's list. Nothing else about England, the islands, the US or Australia changes.

1. **Tests first.** Create `tests/unit/uk-curricula-alignment.spec.ts` with `describe("step 0: Scotland, Wales and Northern Ireland never get England's statements")`:
   - `"England, EYFS and the islands still align to England's own statements"`: `alignmentMode(x)` is `"england"` for `england`, `england-eyfs`, `jersey`, `guernsey`, `isle-of-man`, `gibraltar`, `null`, `undefined`, `""`, `"nonsense"`, `"2014 National Curriculum"` and `"Early Years Foundation Stage (EYFS)"`.
   - `"Scotland, Wales and Northern Ireland are never in England's mode, by id or by label"`: for `scotland`, `wales`, `northern-ireland`, `"Scottish Curriculum for Excellence"`, `"Welsh Curriculum"` and `"Northern Ireland Curriculum"`:
     - `alignmentMode` is not `"england"`
     - it equals `usableFrameworks(getCurriculum(x)).length ? "standards" : "none"`.
   - `"a nation with no data yet is told so and offered no years"`: for every one of the three whose `usableFrameworks` is empty, the mode is `"none"` and `alignmentYears(c)` is `[]`. Write it dynamically so it stays true in later steps.
   - `"England's statements are never sent for Scotland, Wales or Northern Ireland, even from a restored run"`: take two Year 4 statements from `app/lib/national-curriculum/data/primary.json`. Then `alignParamFor(nation, true, "Year 4", { subject: "", strand: "" }, picked)` is `undefined` for all three nations, by id and by label.
   - `"the slides wizard keeps the UK year list for every UK and island curriculum"`: new `usesUkYearList(x)` is `true` for the five UK ids, the four islands, `null` and an unknown string, and `false` for `us-ca`, `au-qld`, `ireland` and `ib-myp`.
   - `"the topic matcher only uses England's statements for England"`: new `suggestionSource(curriculumId, year)` returns:
     - `"england"` for `(undefined, "Year 4")` and `("england", "Nursery")`
     - `null` for `("england", "Year 8")`
     - `"standards"` for `("us-ca", "Grade 3")`
     - `null` for `("us-tx", "Grade 3")` and `("ireland", "3rd Class")`
     - `null` for `("scotland", "Year 4")` while Scotland has no data. Assert this against the same dynamic expression as above.
   - In `tests/unit/standards.spec.ts`, replace lines 217-222 with `"England, EYFS and the islands keep England's own statements"`. Loop over `["england","england-eyfs"]` plus every `british-isles` id plus `null`, all `"england"`.
2. Run, and see the new tests fail.
3. Implement:
   - `app/lib/standards/index.ts` `alignmentMode` (lines 89-93):
     ```ts
     const ENGLAND_ALIGNED = new Set(["england", "england-eyfs"]);
     // !c, ENGLAND_ALIGNED.has(c.id) or c.region === "british-isles" -> "england";
     // otherwise usableFrameworks(c).length ? "standards" : "none"
     ```
     Update the header comment (lines 17-18) to say Scotland, Wales and NI use their own data or the note, never England's.
   - `app/lib/curricula/index.ts`: add the exported, pure, client-safe function `usesUkYearList(value: unknown): boolean` (`!c || c.region === "uk" || c.region === "british-isles"`). No new imports; keep relative-import rules for `scripts/curricula-status.mjs` (line 26 comment).
   - `GenerateModal.tsx:197-200`: replace `alignmentMode(teacherCurriculum.id) === "england"` with `usesUkYearList(teacherCurriculum.id)`. Remove the `alignmentMode` import (line 18) if it becomes unused.
   - `app/lib/standards/align.ts`: add `suggestionSource(curriculumId: unknown, year: string): "england" | "standards" | null`:
     - mode `"england"`: `isCurriculumYear(year) ? "england" : null`
     - mode `"standards"`: `alignmentYears(c).some((y) => y.label === year) ? "standards" : null`
     - otherwise `null`.
   - `app/api/suggest-subject/route.ts:29-34`: use `suggestionSource`. When it is `null`, return `empty`. Otherwise load from the matching source. England and US behaviour is identical.
4. Run `pnpm test:unit`. All green, and the counts in the build doc show nothing else broke.
5. `CurriculumAlignment.tsx` needs no change for step 0: mode `"none"` already renders `data-testid="curriculum-not-available"` with `cur.name` (lines 259-266).
6. E2E spec `tests/tools/uk-curricula-align.spec.ts`. Header comment in the style of `tests/tools/curricula-standards.spec.ts`. Reuse its helpers: `noSuggestions`, `capture`, and `teacherOn` with `createAdmin` + `setPlan(t,"max","paying")` + `admin.from("profiles").update({ curriculum_id, curriculum_confirmed_at })`, plus `deleteTeacher` in `afterAll`. Screenshots are taken only when `process.env.SHOTS_DIR` is set, **before** the assertions, so a failing "before" run still saves them.
   - Test `"a Scotland, Wales or Northern Ireland teacher is never shown England's statements"`, a `for` over the three promptLabels:
     - England teacher, `/tools/worksheet-generator`; select the nation's label in `getByLabel("Curriculum", { exact: true })`; Year group `"Year 4"`; fill Subject and Learning objective; open the card.
     - Card text never contains `"National Curriculum in England"`, and never contains the text of `y4-maths-number-fractions-01` (read from `primary.json`).
     - `const mode = alignmentMode(label)` (import from `@/app/lib/standards`). If `"none"`: `getByTestId("curriculum-not-available")` contains the curriculum's `name` and `getByLabel("Subject")` has count 0. Otherwise: `getByTestId("curriculum-alignment-name")` has text `getCurriculum(label).name` and `getByTestId("curriculum-credits")` is visible.
     - Screenshot the card to `${SHOTS_DIR}/worksheet-${id}.png`.
   - Test `"a Scotland teacher's slides wizard still offers the UK years, Year 12 and 13 included"`:
     - `teacherOn("scotland")`, then `/tools/slideshow?prefill=<encodePrefill({slug:"slideshow",fields:{topic:"Volcanoes",year:"Year 4"}})>` exactly as `curricula-standards.spec.ts:110-122`.
     - Click the year pill; the buttons `"Year 12"`, `"Year 13"` and `"Adult learners"` are visible.
7. Server procedure: rebuild (`build-step0.txt`), start, run the spec. Both tests pass. Also rerun `tests/tools/slideshow-curriculum.spec.ts` and `tests/tools/curricula-standards.spec.ts`; they must pass unchanged. Screenshots go to `after/`.

Done looks like: unit and E2E green; Scotland, Wales and NI show the "not available yet" note; England, islands, US and AU unchanged. **This alone fixes the production bug.** If the run stops here, the app is correct.

### Step 1. Shared plumbing for UK frameworks (no data yet, no behaviour change)
1. **Tests first** (in `uk-curricula-alignment.spec.ts`, `describe("shared plumbing")`):
   - `"frameworkOf reads every framework's own prefix"`: for each `f` of `FRAMEWORK_IDS`, `frameworkOf(`${f}-x`) === f`. `frameworkOf("y4-maths-number-fractions-01")`, `frameworkOf("")` and `frameworkOf("ccss-")` are `null`.
   - `"US and Australian params are unchanged: no stage, same names"`: `alignParamFor("us-ca", ...)` from existing `ccss-math` data has no `stage` key (`expect("stage" in p).toBe(false)`), `countryName` is `"California"` and `curriculumName` is `"Common Core State Standards for Mathematics"`. The `au-nsw` adapted name is unchanged.
   - `"no stage label outside the UK nations"`: `alignmentStageLabel(getCurriculum("us-ca")!, "Grade 3")`, `("au-qld", "Year 3")` and `("england", "Year 4")` are all `null`.
2. Implement in `app/lib/standards/index.ts`:
   - `export const FRAMEWORK_IDS = Object.keys(FRAMEWORK_NAME) as FrameworkId[]`
   - generic `frameworkOf`
   - `export const FRAMEWORK_STAGE: Partial<Record<FrameworkId, string>> = {}`
   - `export function alignmentStageLabel(c: Curriculum, yearLabel: string): string | null`: find the year's age; take the distinct `FRAMEWORK_STAGE` labels of usable frameworks whose ages include it; join with `" and "`; return `null` when there are none.
   - Update the `Statement.code` doc comment: `""` where the source has no codes (Wales, NI).
3. In `app/lib/standards/align.ts` (non-England branch only):
   - `countryId: c.region === "uk" ? c.id : c.country.toLowerCase()`
   - `place = c.place ?? c.state ?? c.name`
   - dedupe framework names
   - add `...(stage ? { stage } : {})` where `stage = alignmentStageLabel(c, year)`.
4. In `CurriculumAlignment.tsx`, standards branch Year options (lines 287-289): option text `stage ? `${stage} · ${y}` : y` with `stage = alignmentStageLabel(cur, y)`. Values stay the bare label, which existing E2E relies on (`curricula-standards.spec.ts:70`). Update the header comment (lines 40-45) to mention Scotland, Wales and NI.
5. `pnpm test:unit` green. Run `npx tsc --noEmit` and `pnpm lint`; both clean, or record only pre-existing issues.

Done looks like: tests green, no visible change anywhere.

### Step 2. Scotland (Es and Os)
1. **Fetch** to `docs/standards/uk/scotland/` with `curl -L -o <file> <url>`. Open the listing page first and use its current links, since media ids can change. Files as of 2026-11-20:
   - `expressive-arts-eo.pdf` /media/ogyjyehk/
   - `health-and-wellbeing-eo.pdf` /media/5p4dvqvm/
   - `classical-languages-eo.pdf` /media/0e5pagsr/
   - `gaelic-learners-eo.pdf` /media/ysyfazzx/
   - `literacy-english-eo.pdf` /media/qhxmxnfq/
   - `modern-languages-eo.pdf` /media/wr4pokgb/
   - `numeracy-maths-eo.pdf` /media/sz2lnh1g/
   - `rme-eo.pdf` /media/hg0nltic/
   - `rerc-eo.pdf` /media/lbtg5lpl/
   - `sciences-eo.pdf` /media/hpidflxa/
   - `social-studies-eo.pdf` /media/rh3fq1gi/
   - `technologies-es-os.pdf` /media/nqgj0egw/
   - `all-experiencesoutcomes18.pdf` /media/wpsnskgv/, for cross-checking only. All are under https://education.gov.scot.

   **Excluded (record in the build doc):**
   - every "(Gaelic)" translation
   - "Literacy and Gàidhlig": its LIT codes clash with Literacy and English. **OWNER DECISION 4, default: exclude.**
   - the "across learning" and "responsibility of all" documents: these are subsets of the area documents
   - the Early Level Modern Languages document: it is combined with Benchmarks
   - Benchmarks (OWNER DECISION 3).

   Also save the terms-of-use page text (WebFetch) into the build doc as licence evidence.
2. **Tests first.** Create `tests/unit/uk-curricula-data.spec.ts`, importing every data JSON (existing and new) the way `standards.spec.ts:16-19` does.
   - `describe("every framework's data")`, generic over a `DATA: Partial<Record<FrameworkId, FrameworkData>>` that grows each step:
     - `"ids are unique across every framework, and each round-trips through frameworkOf"`
     - `"every statement is complete"`: text has 3 or more words; subject and strand are non-empty; ages are non-empty and within `FRAMEWORK_AGES[f]`; all ages are between 3 and 15
     - `"text is clean"`: no `[–—]` (write the escapes, never the characters), no `<`, no `&[a-z#0-9]+;`, no `\uFFFD`, no double spaces, no trailing `;`, and an uppercase first letter
     - `"each file carries the credit the card shows"`
     - `"no stage overlaps a sibling stage"`: within a nation, the `FRAMEWORK_AGES` sets are disjoint.
   - `describe("Scotland")`:
     - `"codes follow Education Scotland's scheme and match their level"`: regex `/^[A-Z]{3,4} [0-4]-\d{2}[a-z]( \/ [A-Z]{3,4} [0-4]-\d{2}[a-z])*$/`; the level digit is 0 for early, 1 for first, 2 for second, 3 or 4 for third-fourth.
     - `"subjects are the curriculum areas"`: the set is a subset of `["Expressive arts","Health and wellbeing","Classical languages","Gaelic (learners)","Literacy and English","Modern languages","Numeracy and mathematics","Religious and moral education","Religious education in Roman Catholic schools","Sciences","Social studies","Technologies"]`. Adjust names to the PDFs' own titles, then pin them.
     - `"every code in the source is in the data, once"`: the code set across the four files equals the code set extracted from the 12 area PDFs. Pin the count with `toBe(N)` after the manual check. For reference, the all-in-one PDF has 1,396 unique codes including Gàidhlig; the area-PDF total will be lower.
     - `"known outcomes landed at the right level, word for word"`:
       - `cfe-early-mnu-0-02a`: `"I have explored numbers, understanding that they represent quantities and I can use them to count, create sequences and describe order."`
       - `cfe-first-mnu-1-02a`: `"I have investigated how whole numbers are constructed, can understand the importance of zero within the system and can use my knowledge to explain the link between a digit, its place and its value."`
       - `"I am aware of and able to express my feelings and am developing the ability to talk about them."` appears as code `"HWB 0-01a"` in cfe-early and as `"HWB 3-01a / HWB 4-01a"` in cfe-third-fourth.

       These texts were read from the PDF on 2026-11-20. The executor re-confirms them against the downloaded copy.
     - `"every statement is in its source, word for word"`: letters-only containment, the `missingFrom` approach of `standards.spec.ts:110,164-170`, against the concatenated area-PDF text. Use `skipWithout(path)` when sources are missing. Every strand must also be found letters-only in the source.
   - `describe("Scotland")` in `uk-curricula-alignment.spec.ts`:
     - `"Scotland aligns to its own Es and Os"`: registry `alignment` equals `{ frameworks: ["cfe-early","cfe-first","cfe-second","cfe-third-fourth"], adapted: false }`; mode `"standards"`, by id and by `"Scottish Curriculum for Excellence"`.
     - `"each year sees its level, and Year 11 sees none"`:
       - `alignmentYears(scotland)` labels equal Nursery to Year 10
       - `alignmentStageLabel` gives: Nursery `"Early level"`, Year 1 `"Early level"`, Year 2 `"First level"`, Year 4 `"First level"`, Year 5 `"Second level"`, Year 7 `"Second level"`, Year 8 `"Third and fourth level"`, Year 10 `"Third and fourth level"`, Year 11 `null`.
     - `"a Scottish year lists only Scottish statements"`: for every age 3 to 14, `statementsForAge(usable data, age)` is non-empty and every id's `frameworkOf` starts with `cfe-`. None equals any id in `primary.json` or `early-years.json`.
     - `"what a Scottish deck or worksheet sends"`: `alignParamFor("scotland", true, "Year 4", sel, picked)` matches `{ countryId: "scotland", countryName: "Scotland", curriculumName: "Curriculum for Excellence experiences and outcomes", stage: "First level", year: "Year 4", grade: "Year 4" }`, and the statement texts equal `${code}: ${text}` (verbatim, code first, as for the US).
     - `"the framework name is said once"`: two `cfe-third-fourth` statements at Year 8 give the name without `" and "`.
     - `"the prompt block names the curriculum and level and quotes the statements"`: `curriculumPromptBlock(param, "Year 4", "worksheet", worksheetCurriculumRules("Year 4"))` contains `"Curriculum for Excellence experiences and outcomes · First level · Year 4"` and `"  1. MNU 1-02a: I have investigated"`.
     - `"nothing is sent when off, empty, uncovered or from another nation"`: off; `[]`; year `"Year 11"` with a cfe statement (note: `alignParamFor` only checks that the label exists, so assert the **card** path instead: `alignmentYears` excludes Year 11); England statements; NI statements (after step 3).
   - Extend `standards.spec.ts:314-316` `FRAMEWORK_PERMITTED` to include the four `cfe-*` keys as `true`.
3. Run, and see them fail.
4. **Build script** `scripts/build-uk-curricula.mjs`, run as `node scripts/build-uk-curricula.mjs --nation=scotland` (also `--nation=northern-ireland`; `--nation=wales` must exit with a message unless the build doc records permission).
   - Header comment in the style of `build-standards.mjs:1-37`: sources, URLs, fetch date, sha256, licence, text rules, exclusions.
   - Writes `app/lib/standards/data/cfe-early.json`, `cfe-first.json`, `cfe-second.json` and `cfe-third-fourth.json` with `JSON.stringify(..., null, 1) + "\n"` and `source: { title, file: "docs/standards/uk/scotland/", url: "<Es and Os page>", credit: CFE_CREDIT }`.
   - Prints counts by framework and subject.
   - Throws on a duplicate id, or on one code appearing with two different texts.
   - **Extraction approach:**
     - Use `unpdf` `getDocumentProxy`, then per page `page.getTextContent()`, so items have positions (`transform[4]` = x, `transform[5]` = y).
     - Group items into lines by y, then into table columns by x. Organiser headings span the table width or sit in the first column; level cells are the columns under "Early", "First" and so on.
     - Within a column, a statement is the text since the previous code group in that column, up to a code group matching `/[A-Z]{3,4} ?[0-4] ?- ?\d{2} ?[a-z]/` (codes can be split by spaces).
     - Statements spanning pages continue in the same column. Each statement gets the latest organiser above it. Strand = `"<organiser>"`, or `"<heading>: <sub-organiser>"` where the document has two heading levels (e.g. Numeracy: `"Number, money and measure: Estimation and rounding"`). Keep the document's wording.
     - Then split each statement's codes by level digit into the four frameworks, as in section 1 item 5.
     - Fallback if positional parsing proves unworkable: `extractText(pdf, { mergePages: true })` reading order. On 2026-11-20 it gave clean "text then code" order in the numeracy section of the all-in-one PDF. Strip organiser text using the organiser list read from headings. Record which method was used.
5. **Wire it:**
   - `types.ts:60` `FrameworkId` union, plus the four ids
   - `permissions.ts:18` (extend the literal union in `satisfies` and set `true`)
   - `credits.ts`: `CFE_CREDIT` for each id
   - `index.ts`: `FRAMEWORK_NAME`, `FRAMEWORK_AGES` (section 1 table), `FRAMEWORK_STAGE`, and four `case` lines in `loadFramework` with separate dynamic imports (one chunk each)
   - `uk.ts`: scotland entry `alignment: { frameworks: [...4], adapted: false }`
   - `provenance.ts:31-34`: add `notes` with the sources, licence, fetch date, exclusions and the age mapping
   - `app/terms/page.tsx:107-116`: add `{FRAMEWORK_PERMITTED["cfe-early"] && <li>{FRAMEWORK_CREDIT["cfe-early"]}</li>}`.
6. **Spot-check (mandatory, by hand).**
   - Print 15 random Scottish statements (seeded so the sample is recorded), spread over all four files and at least 8 subjects. For each, find the statement in the source PDF text and confirm text, code, level and strand. Record id, OK or FIXED, and what was wrong in the build doc.
   - Also confirm by hand: the first and last outcome of Numeracy and mathematics, every Second level Sciences "Planet Earth" outcome, and one RERC outcome.
   - Any mismatch means fixing the parser, never hand-editing JSON.
7. `pnpm test:unit` green (the data tests run fully because the sources are present). Run `npx tsc --noEmit` and `pnpm lint`.
8. E2E: add `"a Scotland teacher aligns a worksheet to Curriculum for Excellence, with levels and credits"`:
   - England teacher; worksheet; select `"Scottish Curriculum for Excellence"`; Year group `"Year 4"`; Subject `"Maths"`; objective `"Place value in whole numbers"`.
   - Stub suggest-subject to capture the request and return `{ subject: "Numeracy and mathematics", strand: <strand of cfe-first-mnu-1-02a>, statementIds: ["cfe-first-mnu-1-02a"] }`.
   - Assert:
     - the request had `curriculumId: "scotland"`, `year: "Year 4"`
     - card name is `"Curriculum for Excellence"`
     - `getByLabel("Year", { exact: true })` has value `"Year 4"` and `option:checked` text `"First level · Year 4"`
     - credits contain `"Open Government Licence"`
     - the checkbox for MNU 1-02a is `aria-checked="true"` and contains `"MNU 1-02a"`
     - no `"National Curriculum in England"`.
   - Click `[data-jo-generate]` with `capture(page, "/api/worksheet-generator")`. Assert `curriculumAlign` matches `{ curriculumName: "Curriculum for Excellence experiences and outcomes", countryName: "Scotland", stage: "First level", year: "Year 4" }` and `statements[0].text === "MNU 1-02a: " + <json text>`.
   - Extend the step 0 slides test: after the year-pill check, Continue to step 2, open the card, and assert the Year option text `"First level · Year 4"` and that the Subject options contain `"Numeracy and mathematics"`.
   - Rebuild (`build-step2.txt`), start, run the whole new spec plus the two existing curriculum specs. Screenshots to `after/`.

Done looks like: Scotland teachers see CfE statements by level with the credit; all tests green; build doc records counts, exclusions, spot-check results and the build size.

### Step 3. Northern Ireland (statutory requirements from legislation.gov.uk)
1. **Fetch:**
   - `curl -L -o docs/standards/uk/northern-ireland/nisr-2007-46-schedule-2.xml https://www.legislation.gov.uk/nisr/2007/46/schedule/2/data.xml`
   - the human-readable PDF for reference: `https://www.legislation.gov.uk/nisr/2007/46/data.pdf`
   - Record the "latest available (revised)" status and the point-in-time date the page shows. Save the legislation.gov.uk licence statement (open its "Open Government Licence" footer link) as evidence.
   - **If the OGL cannot be confirmed** on legislation.gov.uk, still build the data but set `nic-*` to `false` in `permissions.ts` (mode stays "none") and flag it at the top of the build doc.
2. **Tests first:**
   - In `uk-curricula-data.spec.ts` `describe("Northern Ireland")`:
     - `"subjects are the Areas of Learning the Order names for that stage"`: FS: Language and Literacy; Mathematics and Numeracy; The Arts; The World Around Us; Personal Development and Mutual Understanding; Physical Development and Movement. KS1 and KS2: same but Physical Education. KS3: plus Environment and Society, Science and Technology, Learning for Life and Work, Modern Languages. KS4: Learning for Life and Work and Physical Education only. Confirm the names against Part 1 of the Schedule and pin them.
     - `"code is empty and ids are hashes"`
     - `"known requirements, word for word"`: KS1 Mathematics and Numeracy contains `"Use prepositions to state position"`; KS2 contains `"Develop strategies to add and subtract mentally"`. Confirm both in the XML.
     - `"every statement is in the Order, word for word"`: letters-only against the XML text with tags stripped.
     - Pin the count per stage after the spot-check.
   - In `uk-curricula-alignment.spec.ts` `describe("Northern Ireland")`:
     - registry alignment `["nic-fs","nic-ks1","nic-ks2","nic-ks3","nic-ks4"]`, mode `"standards"`
     - `alignmentYears` labels = Year 1 to Year 11 (Nursery and Reception not offered)
     - stage labels: Year 1 and 2 `"Foundation Stage"`, Year 3 and 4 `"Key Stage 1"`, Year 5 and 7 `"Key Stage 2"`, Year 8 and 10 `"Key Stage 3"`, Year 11 `"Key Stage 4"`, Reception `null`
     - `alignParamFor("Northern Ireland Curriculum", true, "Year 3", sel, picked)` matches `{ countryId: "northern-ireland", countryName: "Northern Ireland", curriculumName: "Northern Ireland Curriculum statutory requirements", stage: "Key Stage 1" }`, with texts equal to the JSON text (no code prefix)
     - Scottish or England statements sent for NI give `undefined`
     - extend `FRAMEWORK_PERMITTED` in `standards.spec.ts`.
3. Run, and see them fail.
4. **Build** (`--nation=northern-ireland`). Regex-parse the XML as the existing scripts do. No XML dependency.
   - Walk `Part` (FS, KS1, KS2, KS3, KS4 by Part title), then the area `Title` (subject, title-cased from ALL-CAPS using the Part 1 names), then sub-`Title` (strand, title-cased; Foundation Stage "Progression" sections become strand `"<strand> (progression)"`).
   - Each `ListItem` text is one statement. Nested lists become CCSS style: `"<lead-in> (a) <item> (b) <item>"`. Lead-in lines such as "Pupils should be enabled to:" are not statements.
   - Strip `CommentaryRef` and amendment markup but keep inserted text. Skip anything outside an Area of Learning (Part 1 general requirements, RE).
   - Write `nic-fs.json` to `nic-ks4.json` with credit `NIC_CREDIT`.
5. **Wire** as in step 2 item 5: `nic-*` ids, ages from the section 1 table, stage labels, `northern-ireland` registry `alignment`, provenance notes (state the source is the Order on legislation.gov.uk, not CCEA's documents), terms page line.
6. **Spot-check** 12 random NI statements across all five stages against the XML and the legislation.gov.uk page. Record them.
7. Tests, tsc and lint. E2E: add `"a Northern Ireland teacher aligns a worksheet to the statutory requirements"`:
   - select `"Northern Ireland Curriculum"`, `"Year 3"`
   - Year option text `"Key Stage 1 · Year 3"`; Subject options are the KS1 areas; credit contains `"Curriculum Minimum Content"`
   - tick one; generated `curriculumAlign` matches the unit expectation; statement text equals the JSON text verbatim
   - Also: `"Reception"` shows `curriculum-not-covered`.
   - Rebuild (`build-step3.txt`), rerun the spec, screenshots.

Done looks like: NI teachers see statutory statements by key stage; the year-mapping decision is flagged in the build doc.

### Step 4. Wales: gated, run only with permission
- **Run this step only if** `docs/uk-curricula-build.md` contains a line written by the owner: `WALES_PERMISSION: granted <date> <who> <licence wording>`. Otherwise:
  - skip it
  - leave Wales in mode "none" (it is already, from step 0)
  - in the build doc, under "Owner actions", write a short draft request the owner can send to curriculumforwales@gov.wales or hwb@gov.wales. The ask: permission, or confirmation that the Curriculum for Wales Framework guidance text (descriptions of learning) may be reused commercially under the Open Government Licence v3.0. **Do not send anything.**
- **With permission:**
  - Fetch the six pages to `docs/standards/uk/wales/<area>.html`: `https://hwb.gov.wales/curriculum-for-wales/<area>/descriptions-of-learning/` for `expressive-arts`, `health-and-well-being`, `humanities`, `languages-literacy-and-communication`, `mathematics-and-numeracy`, `science-and-technology`.
  - Parse:
    - `progression-steps__strand-inner <strong>` is the What matters statement, which becomes the strand.
    - In LLC the sub-headings `"Welsh/English"`, `"Welsh in English medium settings/schools/streams"`, `"British Sign Language (BSL)"` and `"International languages"` qualify the previous What matters statement: strand `"<what matters>: <sub-heading>"`.
    - Each `progression-steps__element` has 5 `progression-steps__cell` in step order. Each non-empty `<p>` is one statement (tooltip `<span>`s stripped, entities decoded, curly quotes kept); a `<ul>` inside a cell becomes `(a) (b)` parts of the preceding `<p>`.
    - Subject = Area name. `code: ""`, hash ids, `cfw-ps1` to `cfw-ps5` files.
    - Reference survey, 2026-11-20: 49 strand headings, 150 elements, about 1,100 or more paragraphs.
  - Tests mirror Scotland:
    - registry alignment five ids
    - `alignmentYears(wales)` = all 13 labels
    - stage labels: Nursery and Reception `"Progression step 1"`, Year 1 and Year 3 `"Progression step 2"`, Year 4 and Year 6 `"Progression step 3"`, Year 7 and Year 9 `"Progression step 4"`, Year 10 and Year 11 `"Progression step 5"`
    - param `{ countryId: "wales", countryName: "Wales", curriculumName: "Curriculum for Wales descriptions of learning", stage: "Progression step 3" }` for Year 4
    - known text: PS2 Mathematics and Numeracy contains `"I can read, write and interpret larger numbers, up to at least 1000, using digits and words."` (seen on Hwb 2026-11-20)
    - word for word against the saved HTML text.
  - Then add an E2E Wales worksheet test like Scotland's (`"Progression step 3 · Year 4"`), plus the credit wording from the permission, the terms page line and provenance notes.
- **OWNER DECISION 2 (Wales). Default: skip** until permission is recorded.

### Step 5. Finish
1. **Bundle check.** Stop the server, rebuild (`build-after.txt`), and compare with `build-before.txt`. If route sizes are printed, compare `/tools/worksheet-generator`, `/tools/slideshow` and `/create`: First Load JS must not grow by more than about 2 KB (registry maps only). If sizes are not printed, compare `du -sb .next/static/chunks` (growth should roughly equal the new JSON) and the ten largest chunks. Record both.
2. **Lazy-load E2E.** Add `"the statements download only when the card opens"`:
   - Pick a unique marker string from `cfe-first.json` (a full statement text).
   - Load `/tools/worksheet-generator` as a teacher, select the Scottish curriculum and Year 4, but **do not** open the card.
   - Collect every `.js` response URL from `page.on("response")`; fetch each with `page.request.get(url)`; assert none contains the marker.
   - Open the card, wait for the statement list, and assert that at least one newly loaded `.js` response contains the marker.
3. `node scripts/curricula-status.mjs --check` exits 0 (it prints "Live" for UK rows and the new provenance notes). Do not write the workbook.
4. **Full regression run.**
   - `pnpm test:unit` (all; compare with the baseline counts)
   - `npx tsc --noEmit`
   - `pnpm lint`
   - E2E: `pnpm exec playwright test tests/tools/uk-curricula-align.spec.ts tests/tools/slideshow-curriculum.spec.ts tests/tools/curricula-standards.spec.ts --trace off`.
   - Dash check: `grep -rnP "[\x{2013}\x{2014}]"` over every changed or new file (code, tests, data JSON, docs written).
5. Final screenshots in `after/`: worksheet card for Scotland (Year 4, ticked), NI (Year 3), Wales ("not available yet" note unless step 4 ran), and the slides wizard step 2 for a Scotland teacher.
6. Finish `docs/uk-curricula-build.md` (section 5). **Do not commit.**

---

## 4. Test catalogue

**Unit: `tests/unit/uk-curricula-alignment.spec.ts`** (logic; no data files needed except imports)
- step 0: England, EYFS and islands are england mode; the three nations are never england, by id or label; a nation without data is "none" with no years; England statements are never sent for the nations (restored-run case); the UK year list is kept for the slides wizard (`usesUkYearList`); `suggestionSource` per curriculum and year.
- shared plumbing: `frameworkOf` round-trip for every `FRAMEWORK_IDS` entry and `null` cases; US and AU params unchanged, with no `stage` key; `alignmentStageLabel` is `null` outside the nations.
- Scotland, NI, (Wales): registry alignment; covered years and boundary years (Year 1/2, 4/5, 7/8, 10/11 for Scotland; Reception/Year 1, 2/3, 4/5, 7/8, 10/11 for NI; Reception/Year 1, 3/4, 6/7, 9/10 for Wales); a year lists only its own nation's ids, never England's; the exact param (`countryId`, `countryName`, deduped `curriculumName`, `stage`, verbatim texts, code prefix only for Scotland); the prompt block line; nothing sent when off, empty, cross-nation or England statements.

**Unit: `tests/unit/uk-curricula-data.spec.ts`** (data integrity and provenance)
- global id uniqueness and `frameworkOf` round-trip across all frameworks (old and new)
- completeness; ages within the framework and between 3 and 15; stage age sets disjoint within a nation
- clean text: no en or em dash, HTML, entities, U+FFFD, double spaces or trailing semicolons, and an uppercase first letter
- credit equals `FRAMEWORK_CREDIT`
- per nation: subjects whitelist, code scheme (Scotland) or empty code, pinned counts, known statements verbatim, every statement and strand letters-only in the saved source (skipped if the source is missing).

**Unit: `tests/unit/standards.spec.ts`** edits: lines 217-222 rewritten (England, EYFS and islands only); `FRAMEWORK_PERMITTED` `toEqual` extended per step. Everything else unchanged and must still pass.

**Regression unit suites to run every step:** `standards.spec.ts`, `national-curriculum.spec.ts`, `curricula.spec.ts` (every registry id has provenance), `curriculum-golden.spec.ts` (UK prompts byte for byte), `worksheet-templates.spec.ts`, `deck-prompt.spec.ts`.

**E2E: `tests/tools/uk-curricula-align.spec.ts`**
1. "a Scotland, Wales or Northern Ireland teacher is never shown England's statements" (mode-aware; fails on the baseline, which is the evidence)
2. "a Scotland teacher's slides wizard still offers the UK years, Year 12 and 13 included", extended in step 2 with level labels
3. "a Scotland teacher aligns a worksheet to Curriculum for Excellence, with levels and credits"
4. "a Northern Ireland teacher aligns a worksheet to the statutory requirements"
5. (with permission) "a Wales teacher aligns a worksheet to the Curriculum for Wales"
6. "the statements download only when the card opens"

**Regression E2E:** `tests/tools/slideshow-curriculum.spec.ts` (England guest, Key Stage labels, verbatim send) and `tests/tools/curricula-standards.spec.ts` (California, Texas, US year names). Both unchanged and green.

---

## 5. `docs/uk-curricula-build.md` (progress and summary file)

Create it in step A and append after every step. Sections:
1. **Status table**: step, state (done / skipped / blocked), date, one-line result.
2. **Owner decisions**: each with the default taken and how to change it.
   1. NI year mapping
   2. Wales permission, with the draft email
   3. Scotland Benchmarks
   4. Literacy and Gàidhlig and the Early Level Modern Languages document
   5. writing the curricula workbook
   6. S1 mapping (Year 8 default)

   Plus a line the owner can fill in: `WALES_PERMISSION:`.
3. **Sources**: URL, local path, fetch date, sha256, licence evidence (quoted sentence and URL).
4. **Data**: counts per framework and subject, exclusions, extraction method, normalisations applied.
5. **Spot-checks**: the sampled ids and results.
6. **Commands and results** per step: unit pass and fail before and after, tsc, lint, E2E results (failures included, honestly), build size comparison.
7. **Files changed**: new and modified, separating out the owner's pre-existing uncommitted changes (section 0).
8. **Left untested and why** (section 7).
9. **Next steps for a later run.**

---

## 6. Owner decisions (defaults the executor uses)

1. **NI year mapping. Default: by year number.** NI pupils are one year younger than England's at the same number (NI Year 1 starts at 4), but NI schools say "Year 3" for their own Year 3. With England labels kept, an NI teacher will pick their own number. Data ages are therefore stored as the registry ages of the matching England-named label (section 1 table), documented in `provenance.ts` notes and the `FRAMEWORK_AGES` comment. If the owner later gives NI its own year list with real ages, every `nic-*` age shifts down by 1 in one place (`FRAMEWORK_AGES` and the build script).
2. **Wales. Default: do not fetch or ship** until written permission (Hwb terms restrict commercial reuse and scraping). Wales shows "not available yet".
3. **Scotland Benchmarks. Default: exclude.**
4. **Gaelic-medium documents. Default: exclude** Literacy and Gàidhlig and all "(Gaelic)" translations; include Gaelic (learners), which is English-medium with LGL codes.
5. **Curricula workbook. Default: `--check` only.**
6. **Scotland S1. Default: by age** (S1 = Year 8, Third and fourth level). The "Second level · Year 7" label on the card makes the choice visible.

---

## 7. Risks, and what is left untested

**Risks**
- **PDF table extraction (Scotland)** can attach text to the wrong level or organiser. Mitigations: the code-set equality test, letters-only containment for statements and strands, level-digit-versus-framework checks, and a recorded manual spot-check. Never hand-edit the JSON.
- **The sources can change.** Scotland is reviewing CfE (Curriculum Improvement Cycle), Hwb updates yearly, and the NI Order has 2022 and 2023 amendments. Mitigations: fixed local copies with sha256 and dates; ids from codes (Scotland) or text hashes (NI, Wales). A changed text means a new id, so a restored run quietly drops that tick (the card filters unknown ids), which is acceptable.
- **Year label ambiguity** (S1, and NI off by one) can show a teacher a neighbouring stage. Mitigation: stage labels on the Year options; owner decisions 1 and 6.
- **Existing saved runs** of Scotland, Wales or NI teachers hold England statement ids. After this work they are filtered and nothing is sent; the deck still follows topic and year. This is intended (it removes wrong England alignment) and is covered by a unit test.
- **Bundle:** data is split per stage and lazy-loaded; the registry and maps add only a few hundred bytes. Proven by the lazy-load E2E and the build comparison.
- **The deck prompt says "Audience: UK Year 4 pupils"** (`deck-prompt.ts:217`). This is pre-existing and acceptable for the UK nations; out of scope.

**Left untested, deliberately**
- Model output quality for Scottish or NI statements, and suggest-subject's pick accuracy. Both are stubbed in E2E; the prompt templates and schemas are unchanged, so no `LIVE_MODEL` run is required. That avoids spend.
- The signed-in slides deck request body. Generation happens after `createPresentation` and navigation to the editor, so it is brittle to intercept. The send path is the same `alignParamFor` that the unit tests and the worksheet E2E prove.
- The Terms page credit lines. Static JSX guarded by `FRAMEWORK_PERMITTED`, checked by eye in a screenshot only.
- Welsh-language and Gaelic versions, Benchmarks, and the excluded Scottish documents: not built.
- `curricula-status.mjs` writing the workbook: not run (owner decision 5).
- Wales end to end, unless permission is recorded.

---

### Critical Files for Implementation
- C:\Users\kitki\Desktop\WORK\jooma\app\lib\standards\index.ts
- C:\Users\kitki\Desktop\WORK\jooma\app\lib\standards\align.ts
- C:\Users\kitki\Desktop\WORK\jooma\app\components\slideshow\CurriculumAlignment.tsx
- C:\Users\kitki\Desktop\WORK\jooma\app\components\slideshow\GenerateModal.tsx
- C:\Users\kitki\Desktop\WORK\jooma\app\api\suggest-subject\route.ts

Also touched: `app/lib/curricula/types.ts`, `app/lib/curricula/uk.ts`, `app/lib/curricula/index.ts`, `app/lib/curricula/provenance.ts`, `app/lib/standards/credits.ts`, `app/lib/standards/permissions.ts`, `app/terms/page.tsx`, `tests/unit/standards.spec.ts`. New: `scripts/build-uk-curricula.mjs`, `app/lib/standards/data/cfe-*.json` and `nic-*.json`, `tests/unit/uk-curricula-alignment.spec.ts`, `tests/unit/uk-curricula-data.spec.ts`, `tests/tools/uk-curricula-align.spec.ts`, `docs/uk-curricula-build.md`.

Sources consulted for this plan:
- [Education Scotland experiences and outcomes](https://education.gov.scot/curriculum-for-excellence/curriculum-for-excellence-documents/experiences-and-outcomes/)
- [Education Scotland terms of use](https://education.gov.scot/terms-of-use)
- [All experiences and outcomes PDF](https://education.gov.scot/Documents/All-experiencesoutcomes18.pdf)
- [Education (Curriculum Minimum Content) Order (NI) 2007](https://www.legislation.gov.uk/nisr/2007/46)
- [Schedule 2 on legislation.gov.uk](https://www.legislation.gov.uk/nisr/2007/46/schedule/2)
- [Hwb descriptions of learning, Mathematics and Numeracy](https://hwb.gov.wales/curriculum-for-wales/mathematics-and-numeracy/descriptions-of-learning/)
- [Hwb terms and conditions](https://hwb.gov.wales/termsandconditions)
- [Hwb copyright statement](https://hwb.gov.wales/support-centre/trust-centre/data-protection/copyright-statement)
- [Welsh Government copyright statement](https://www.gov.wales/copyright-statement)
- [Annual updates to the Curriculum for Wales Framework guidance](https://www.gov.wales/annual-updates-curriculum-wales-framework-guidance-html)
- [Curriculum for Wales guidance 2020 (DERA)](https://dera.ioe.ac.uk//34899/1/curriculum-for-wales-guidance.pdf)
