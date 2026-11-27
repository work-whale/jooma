# Curricula Stage 3 batch A release checklist

For the owner, at a computer with the Supabase CLI and GitHub. About 20 minutes.

What ships: nine country profiles (Saudi Arabia, Qatar, Kuwait, Oman, Bahrain, Jordan, Egypt and Israel under Middle East; Türkiye under Europe), the five Stage 3 batch switches (all off), the nine countries in the profile country list, and one prompt fix for every non-UK curriculum (the school's teaching language no longer changes the output language). Profiles only: no official statements until permissions come back (`docs/curricula-permissions.md`, rows 27 to 35).

Nothing changes for teachers until step 4, except two small things that ship with the merge: the nine countries appear in the profile country list, and the prompt fix applies to every non-UK curriculum already live (tested: Stage 2 live run 7/7 after the fix).

## 1. Before you start

- [ ] `git checkout staging && git pull`; the newest commits are the Stage 3 batch A ones.
- [ ] `pnpm test:unit` passes.
- [ ] `node scripts/check-language.mjs` passes.
- [ ] `node scripts/curricula-status.mjs --check < /dev/null` exits 0.

## 2. Push the migration to production

It adds five switches in a new Admin section ("Curricula: Stage 3 releases"), all off, renames the Europe switch label from "Europe (Malta)" to "Europe", and redefines `public_settings()` to return the five new keys. The live code ignores keys it does not know, so it is safe before or after the merge.

- [ ] `supabase link --project-ref hhgfhhofbhzioywnppzr` and check `supabase/.temp/project-ref` says the production ref.
- [ ] `supabase db push --dry-run` lists ONLY `20261127000000_curricula_stage3_releases.sql`. If it lists anything else, stop.
- [ ] `supabase db push`.
- [ ] In the SQL editor: `select key, value from app_settings where key like 'curricula_s3_%' order by key;` shows five rows, all false.

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

## Known limits (fine to ship)

- Every batch A teaching language (Arabic, Hebrew, Turkish) is not an output language yet, so all nine default to English (`docs/curricula-language-gaps.md`).
- Some terms (inspection, SEN) are left out where no source confirmed them, so prompts fall back to generic wording there.
- Türkiye's all-grades version switches on 1 September 2027; the exact first day of 2027-28 is not yet published.
