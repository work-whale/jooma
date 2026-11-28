# Curricula Stage 3 release checklist (batches A to E)

For the owner, at a computer with the Supabase CLI and GitHub. About 20 minutes.

What ships: batch A's nine country profiles (Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Jordan, Egypt and Israel under Middle East; Türkiye under Europe), batch B's nine (China, Japan, South Korea, Taiwan, Vietnam, Thailand, Indonesia, Sri Lanka and Nepal under Asia), batch C's twenty-nine European countries, batch D's six under a new Latin America heading (Mexico, Brazil, Argentina, Chile, Colombia, Peru), batch E's five under Africa (Ethiopia, Rwanda, Tanzania, Zambia, Zimbabwe), the five Stage 3 batch switches (all off), the Latin America region switch (on, but it shows nothing until batch D is on), forty-three new countries in the profile country list, and one prompt fix for every non-UK curriculum (the school's teaching language no longer changes the output language). Profiles only: no official statements until permissions come back (`docs/curricula-permissions.md`, rows 27 to 76).

Nothing changes for teachers until step 4, except two small things that ship with the merge: the new countries appear in the profile country list, and the prompt fix applies to every non-UK curriculum already live (tested: Stage 2 live run 7/7 after the fix).

## 1. Before you start

- [ ] `git checkout staging && git pull`; the newest commits are the Stage 3 batch A ones.
- [ ] `pnpm test:unit` passes.
- [ ] `node scripts/check-language.mjs` passes.
- [ ] `node scripts/curricula-status.mjs --check < /dev/null` exits 0.

## 2. Push the migrations to production

There are two. The first adds five switches in a new Admin section ("Curricula: Stage 3 releases"), all off, renames the Europe switch label from "Europe (Malta)" to "Europe", and redefines `public_settings()` to return the five new keys. The live code ignores keys it does not know, so it is safe before or after the merge. The second (batch D) adds the Latin America region switch, ON, and adds it to `public_settings()`. It is safe on its own: every batch D entry also needs the batch D switch, which the first migration seeds off.

- [ ] `supabase link --project-ref hhgfhhofbhzioywnppzr` and check `supabase/.temp/project-ref` says the production ref.
- [ ] `supabase db push --dry-run` lists ONLY `20261127000000_curricula_stage3_releases.sql` and `20261128000000_curricula_latin_america.sql`. If it lists anything else, stop.
- [ ] `supabase db push`.
- [ ] In the SQL editor: `select key, value from app_settings where key like 'curricula_s3_%' order by key;` shows five rows, all false.
- [ ] `select key, value from app_settings where key = 'curricula_latin_america';` shows one row, true.

## 3. Merge staging into master

- [ ] Open a pull request from `staging` to `master` and merge it.
- [ ] Wait for the Vercel production deploy to go green.
- [ ] As a normal teacher (not an admin), Middle East in the curriculum picker still shows only the UAE.

## 4. Switch batch A on

The Middle East and Europe region switches are already on, so only the batch switch is needed.

- [ ] Admin > Settings > Curricula: Stage 3 releases: turn on "Stage 3 batch A: Gulf, Middle East and Türkiye".
- [ ] As a teacher: Middle East lists the UAE plus eight countries; Europe lists Malta and Türkiye.
- [ ] Pick Saudi Arabia; the worksheet year list runs KG1 to Grade 12. Make one worksheet: in English (American spelling for Saudi Arabia), no "Key Stage", "Ofsted" or "Year 4".
- [ ] Run `node scripts/curricula-status.mjs --live=uk,british-isles,ireland,international,australia-nz,usa,canada,africa,asia,caribbean,europe,middle-east,s3-a < /dev/null` and commit the workbook.
- [ ] If anything looks wrong, turn the batch switch off; that hides all nine again. Tell Claude.

## 5. Batch B (Asia), whenever you are ready

Ships in the same merge as batch A, hidden behind its own switch. No migration of its own.

- [ ] Admin > Settings > Curricula: Stage 3 releases: turn on "Stage 3 batch B: Asia".
- [ ] As a teacher: Asia lists the Stage 2 six plus China, Japan, South Korea, Taiwan, Vietnam, Thailand, Indonesia, Sri Lanka and Nepal (15).
- [ ] Pick Japan; the worksheet year list runs Elementary 1 to Senior High 3. Make one worksheet: in English, no "Key Stage" or "Year 4".
- [ ] Run the status script with `s3-b` added to `--live` and commit the workbook.
- [ ] If anything looks wrong, turn the batch B switch off. Tell Claude.

## 6. Batch C (Europe), whenever you are ready

Ships in the same merge, hidden behind its own switch. No migration of its own.

- [ ] Admin > Settings > Curricula: Stage 3 releases: turn on "Stage 3 batch C: Europe".
- [ ] As a teacher: Europe lists Malta, Türkiye (if batch A is on) and the twenty-nine.
- [ ] In a browser that never chose a language, pick France: output switches to French, and the worksheet year list runs PS to Terminale. Make one worksheet: in French.
- [ ] Pick Denmark: output stays in English.
- [ ] Run the status script with `s3-c` added to `--live` and commit the workbook.
- [ ] If anything looks wrong, turn the batch C switch off. Tell Claude.

## 7. Batch D (Latin America), whenever you are ready

Ships in the same merge, hidden behind its own switch. Its region switch is already on from step 2.

- [ ] Admin > Settings > Curricula: Stage 3 releases: turn on "Stage 3 batch D: Latin America".
- [ ] As a teacher: a new Latin America heading lists Mexico, Brazil, Argentina, Chile, Colombia and Peru.
- [ ] In a browser that never chose a language, pick Mexico: output switches to Spanish, and the year list runs Preescolar 1 to Bachillerato 3. Make one worksheet: in Spanish with Latin American wording (no "vosotros").
- [ ] Choose English, pick Chile: the worksheet stays in English.
- [ ] Run the status script with `latin-america,s3-d` added to `--live` and commit the workbook.
- [ ] If anything looks wrong, turn the batch D switch off. Tell Claude.

## 8. Batch E (Africa), whenever you are ready

Ships in the same merge, hidden behind its own switch. The Africa region is already on, and batch E has no migration of its own.

- [ ] Admin > Settings > Curricula: Stage 3 releases: turn on "Stage 3 batch E: Africa".
- [ ] As a teacher: Africa lists the Stage 2 five plus Ethiopia, Rwanda, Tanzania, Zambia and Zimbabwe (10).
- [ ] Pick Tanzania; the worksheet year list runs Pre-primary, Standard 1 to 7 and Form 1 to 6. Make one worksheet: in English.
- [ ] Run the status script with `s3-e` added to `--live` and commit the workbook.
- [ ] If anything looks wrong, turn the batch E switch off. Tell Claude.

## Known limits (fine to ship)

- No batch A or B teaching language (Arabic, Hebrew, Turkish, Chinese, Japanese, Korean, Vietnamese, Thai, Indonesian, Sinhala, Tamil, Nepali) is an output language yet, so all eighteen default to English (`docs/curricula-language-gaps.md`).
- Some terms (inspection, SEN) are left out where no source confirmed them, so prompts fall back to generic wording there.
- Türkiye's all-grades version switches on 1 September 2027; the exact first day of 2027-28 is not yet published.
- Batch C: nine European countries default to their own language (France, Germany, Austria, Spain, Italy, Portugal, Poland, Sweden, Estonia) for teachers who never chose one; the other twenty, Belgium and Switzerland included, default to English.
- Batch D: Spanish output uses Spain's voice for speech (es-ES) and Latin American wording only in writing; Brazil uses Brazilian Portuguese. Mexico names no national test, because none is set now.
- Batch E: all five default to English. Tanzania and Zambia list old and new years side by side during their transitions (Standard 7 until 2027; Zambia's Grade 7 and Grades 10 to 12 until 2028).
