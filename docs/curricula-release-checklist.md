# Curricula Stage 2 release checklist

For the owner, at a computer with the Supabase CLI and GitHub. About 30 minutes, plus one teacher check per region.

What ships: 15 country profiles in five new regions (Africa, Asia, Caribbean, Europe (Malta), Middle East), the under-5 reading fix and the fact-check fixes. Profiles only: no official statements until permissions come back (`docs/curricula-permissions.md`). Every new region switch starts OFF, so nothing changes for teachers until step 4.

Checked 2026-11-25: production has every migration up to `20261120000300`. Only `20261124000000_curricula_stage2_regions.sql` is new.

## 1. Before you start

- [ ] `git checkout staging && git pull` and confirm the top commit is the latest Stage 2 one (`git log --oneline -3`).
- [ ] `pnpm test:unit` passes.
- [ ] `node scripts/check-language.mjs` passes. (`pnpm lint` still stops on 11 older React hook errors, `set-state-in-effect` and `refs`, in files outside this release, for example the login page and DeleteAccountModal. They were there before Stage 2 and need their own rework.)
- [ ] `node scripts/curricula-status.mjs --check < /dev/null` exits 0.

## 2. Push the migration to production

It adds five switches (all off) and redefines `public_settings()` to return them. The live code ignores keys it does not know, so this is safe before or after the code merge.

- [ ] `supabase link --project-ref hhgfhhofbhzioywnppzr` and check `supabase/.temp/project-ref` says the production ref.
- [ ] `supabase db push --dry-run` lists ONLY `20261124000000_curricula_stage2_regions.sql`. If it lists anything else, stop.
- [ ] `supabase db push`.
- [ ] Check in the SQL editor: `select key, value from app_settings where key like 'curricula_%' order by key;` shows `curricula_africa`, `curricula_asia`, `curricula_caribbean`, `curricula_europe` and `curricula_middle_east` all false, and the old six still true.

## 3. Merge staging into master

- [ ] Open a pull request from `staging` to `master` and merge it.
- [ ] Wait for the Vercel production deploy to go green.
- [ ] Signed in as a normal teacher (not an admin), the curriculum picker shows no new countries yet. Admins see every curriculum, so use a teacher account.

## 4. Switch regions on, one at a time

In Admin > Settings > Curricula by region. Suggested order, smallest risk first: Europe (Malta), Caribbean, Middle East, Africa, Asia.

For each region:

- [ ] Turn the switch on.
- [ ] As a teacher, pick one country from that region in Profile. The year list uses the country's own names (for example Grade R to Grade 12 for South Africa).
- [ ] Make one worksheet. It uses the local year name and has no "Key Stage", "Ofsted" or "KS2" (the Philippines and Hong Kong really use "Key Stage", so it is fine there).
- [ ] Run `node scripts/curricula-status.mjs --live=<all regions on so far> < /dev/null`, for example `--live=uk,british-isles,ireland,international,australia-nz,usa,canada,europe`. Region ids: `africa`, `asia`, `caribbean`, `europe`, `middle-east`.
- [ ] If anything looks wrong, turn the switch off again. That hides the region's countries from the picker; tell Claude, so it can check teachers who already picked one.

## 5. After release

- [ ] Send the permission emails in `docs/curricula-permissions.md`, all at once as planned.
- [ ] Tell Claude which regions are on, so the workbook and memory match.

## Known limits (fine to ship)

- Jo knows each country's system but picks topics from its own knowledge, not the official lists, until permissions come back.
- Worksheets on neutral topics (for example adding fractions) rarely use local names, places or money.
- Singapore Secondary 5 is kept as a year, though it may not survive Full Subject-Based Banding (not confirmed).
