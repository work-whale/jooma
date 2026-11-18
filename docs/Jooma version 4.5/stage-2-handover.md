# Jooma 4.5, Stage 2 (the plans engine): handover

Written by Claude overnight on 17 to 18 November 2026, while you were away. Nothing is committed, pushed or applied to any database. Stage 1 is still uncommitted, and its files are untouched apart from the ones listed below.

**In one paragraph.** Most of Stage 2's logic is built and unit-tested: the resources balance, the five account states, the 10-day Pro trial rules, the Stripe decisions, the picture gate, the export mark, Free's refine cap, the prompt rules, the email scheduler and its templates, and the launch-day sorting. One migration file holds the database side. I could not apply it (your rule), so I checked it in an in-memory Postgres instead (details under "Tests"). The server is wired so the new rules switch on **by themselves once the migration is pushed**. Before that, almost everything behaves exactly as today. The two exceptions are the trial start route (see "Ship order") and the copy and price changes listed below. The screens are mostly **not** built yet: the pricing page, the plan picker, and the P1, P2, P3, P5 and P12 prompt UI. Their content and rules are ready as tested modules.

---

## 1. Sub-steps: done, partly done, not started

| Step | State | What exists | What is missing |
|---|---|---|---|
| 2a Plans config | **Done** | `plan-config.ts` (from before) is now what `plans.ts` reads for prices, Max £13.99, trial days, clean Standard exports and the descriptions. | Nothing. |
| 2b Account states | **Partly** | `app/lib/account-plan.ts`: `planInForce()`, five states, "PRO TRIAL" chip, UK dates. `accountAccess()` has a new `"free"` state (never locked) for rows from the new migration; old rows still behave as before. The gate no longer sends "no plan" blocks once the migration is in. Audit: `is_paying_profile()` and `teacher_mrr()` already leave a trial out (no Stripe id, no `plan_config` row), so they need no change. | `/free-tools` redirect to `/dashboard`, removing `redirectIfLocked`, `noPlanBlock` (still used on the legacy path) and `eligibleForTrial`. `email_audience_members` not changed (see section 2). |
| 2c Resources balance | **Done (server)** | `app/lib/resources.ts` (pure ledger), `app/lib/resource-gate.ts` (the 402 decision, with the P3 payload), the `my_resources()` RPC and its SQL twin, wired into `checkAllGates` (proxy and slideshow route). Periods roll forward lazily. Top-ups never expire. Upgrade adds the difference; downgrade waits for the refill. Refining and Ask Jo chat never spend. | `useCreditMeter` still reads the old monthly meter. The tool form's cost line ("This usually needs about 30. You have 12.") is not on screen yet, though the server sends that exact message. |
| 2d Trial | **Partly** | `/api/trial/start` now starts `pro_trial`: 300 resources, ending 23:59:59 UK time on signup date + 10. One trial per email, ever (a hashed key that survives deletion). Disposable domains are refused. A device cookie flags (never blocks) a third account in 24 hours. The trial ends at the next request, never mid-generation. | Trial-pending accounts (launch day) starting at login. `grantApplicantTrial` (ambassador) unchanged. The admin list for flagged devices (the SQL function exists, there is no screen). The "verify before the second resource" rule is written and tested but not wired, because signup already makes everyone verify by a 6-digit code first. "3 days" copy is still in 10 files (section 5). |
| 2e Stripe | **Partly** | `app/lib/billing-rules.ts` (tested). The webhook now moves the balance on every plan change, ends a trial when someone pays, logs `subscribed`, `plan_changed` and `moved_to_free`, and sets or clears `payment_failed_at`. `?ref=CODE` is captured at signup like `?code=`. | Checkout does not apply `PRO-HALF-FIRST-MONTH` yet; it is only given on the second run-out, which is Phase 2 (P3b, E9b), so it belongs with Stage 3. The top-up route still sells the old pack and grants old-style credit; it needs switching to the config packs. Section 3 lists what you must create in Stripe. |
| 2f Features by plan | **Partly** | Decks on Free and Standard are forced to library photos on the server. `/api/generate-image` is refused with P5. The mark ("Made with Jooma") is added to PDF and Word exports from the shared exporter, based on the plan at export time. Free has 10 refines a week (`use_refine()`, `/api/modify` and `/api/jo`). | The mark on sheet exports (`sheetExport.tsx`, `lib/sheets/docx.ts`) and deck PowerPoint and PDF (`Editor.tsx`). `/api/sheet-picture` not gated. The P5 sheet UI. |
| 2g Pricing page and picker | **Content only** | `app/lib/pricing-view.ts` (tested): the four columns, phone order, yearly lines truncated to the spec's figures, Pro "Recommended", header button text, picker defaults (Pro, monthly) and the one-line "what changes" copy, plus the signed-out "Your 10 free days of Pro are already on." screen. | The pages themselves: `Pricing.tsx`, `/pricing`, the in-app plan picker, and pointing every upgrade button at it. |
| 2h Prompts | **Rules only** | `app/lib/prompts.ts` (tested): who sees what, one pop-up per visit, 7-day snooze (P3 and P5 never snoozed, P1 hides for the rest of the UK day), P2 once ever, nothing while presenting, and the copy for P1, P2, P3 (Free and trial), P5 and P12. | All prompt UI, and the "presenting" flag from `Editor.tsx` and `QuizPresenter`. |
| 2i Events and emails | **Partly** | `app_events` table plus `recordAppEvent()`. Scheduler rules in `app/lib/lifecycle.ts` (quiet hours 21:00 to 07:00, 16:30 and 07:30 sends, stop on pay, consent, at most one marketing email a day, never twice, never more than 12 hours late). Templates for E1, E5, E6, E7, E8, E12, E13 and E14 in `app/lib/lifecycle-emails.ts`. The cron at `/api/cron/lifecycle` is a **dry run unless `LIFECYCLE_EMAILS=on`**. | Not in `vercel.json` (see section 4). E12 to E14 are not yet sent from the webhook. The signup "Send me ideas and offers" box and the E8 switch in email settings are not on screen (the columns exist in the migration). |
| 2j Launch day | **Partly** | `app/lib/launch-day.ts` (tested) plus the admin-only SQL `launch_v45_move_accounts(apply)`, which previews by default and is not run by the migration. E16 copy. | The admin button, and sending E16. |

E2E specs for Stage 2 are **not written**. I spent the time on the server pieces instead. The screens they would test are not built yet either.

---

## 2. The migration

### `supabase/migrations/20261118000000_plans_engine.sql` (one file)

**What it changes.**

- `profiles.plan` may now be `pro_trial` (the check constraint is rewritten). New columns: `trial_ends_at`, `trial_pending`, `payment_failed_at`, `marketing_consent` (+ `_at`) and `sunday_emails`.
- The two guard triggers learn the new billing columns, so a teacher cannot extend their own trial or clear a failed payment. They can change their own consent; the consent time is stamped by the server.
- New tables, all with RLS on, no policies and no client grants:
  - `resource_accounts`: the balance state;
  - `trial_email_keys`: hashed emails, no user id and no address, so it outlives deletion;
  - `signup_devices`;
  - `app_events`;
  - `lifecycle_email_log`.
- New functions:
  - `my_resources()`: the caller's balance. It rolls the period forward, and ends an expired trial by moving the profile to Free with a fresh 50 and logging the events;
  - `use_refine()`;
  - `resources_period`, `resources_allowance`, `resources_spent` and `resources_topups`;
  - service-role only: `resources_start`, `resources_change_plan`, `claim_trial_email`, `trial_email_seen` and `record_signup_device`;
  - admin only: `admin_flagged_devices` and `launch_v45_move_accounts`.
- `my_generation_gate()`: an expired `pro_trial` now reads as `free`.
- `my_account_access()` is dropped and recreated with six more columns, including `resources_made`.

**Check before pushing.**

1. **Ship order: push this migration BEFORE deploying the code in this tree.** The code detects the missing migration and falls back to today's behaviour almost everywhere. The exception is `/api/trial/start`, which now writes `plan = 'pro_trial'` and `trial_ends_at`, so it would fail on a database without the migration. A new signup would then get no trial at all (not even the old 3-day one) until the migration is pushed.
2. **Spend measurement.** `resources_spent()` leaves out the token_usage slugs `modify`, `jo`, `edit-text` and `assistant`, because refining and Ask Jo chat never spend resources. A unit test holds this list equal to the one in `resource-gate.ts`. **Jo's voice (`/api/jo/speak`, `/api/jo/live`) still spends**, because it is expensive; say if you want it free.
3. **No `plan_config` row for `pro_trial`, on purpose.** Anything that inner-joins `plan_config` drops trial accounts, which is what `teacher_mrr()` wants. Please glance at the admin screens for any other inner join.
4. **Old audiences.** A `pro_trial` row has `subscription_status` NULL, so the old `trialing` and `trial_ending` audiences never pick it up. The old `trial_ending` automation should stay **off**; its wording says "3 day".
5. **A trial is ended lazily.** It moves to Free the first time the teacher's browser calls `my_resources()` after 23:59:59. Nothing yet tidies trials for teachers who never come back, so their profile still says `pro_trial`, which reads as Free everywhere. A nightly tidy-up can be added to the existing `ambassador-terms` cron.
6. **Old top-ups.** The balance counts top-ups as `allowance_grants` rows of kind `resources_topup`. The old `credit_gbp` grants are not counted in the new balance. Anyone who bought a £1.50 top-up this month loses it at launch. The old ones expired at month end anyway, but you may want to convert this month's.
7. **Launch-day moves.** After you push, run `select * from launch_v45_move_accounts(false)` as an admin on staging and read the counts before running it with `true`.

**How I checked it without applying it.** I installed PGlite (real Postgres 17, running in memory in Node) in my scratch folder, created stub versions of the tables it touches, and ran the whole file. It applied without errors. Then, against the stubs:

- **Period maths.** The SQL matched the TypeScript on every case I tried:
  - a Wednesday;
  - the clocks-forward night (28 March 2027);
  - a plan started on the 31st, in February and on 1 March;
  - the trial end, in winter and in summer.
- **A full flow.**
  - Trial: shows 300, then a spend takes it down.
  - Expiry: the trial moves to Free with 50, and `moved_to_free` and `trial_ended` are logged.
  - Refines: the cap raises `refine_limit` at 10.
  - Upgrade: Standard to Pro adds 500 and keeps the refill date.
  - Overspend: comes off top-ups when the period closes.

That flow found one real bug: a period could start before the refill that closed the previous one, which could count spend twice. It is fixed in both the SQL and the TypeScript, and has a regression test.

`scripts/verify-resources.mjs` is the real check on staging, through the anon key as throwaway users. **It has not been run, because the migration is not pushed.** Run it straight after pushing to staging.

---

## 3. Stripe: what you need to create (I only read, in the sandbox)

**What I read.** Sandbox `acct_1U03EDJLX6Udtw9T` only, read-only, on 18 Nov:

- **Prices:** Standard £4.99 / £47.99, Pro £7.99 / £71.99, Max £14.99 monthly / £143.99 yearly, an £8.49 monthly price, and the £1.50 one-off top-up.
- **Coupon:** `PRO-HALF-FIRST-MONTH` does **not** exist.

I made no production Stripe calls.

Create these in the **sandbox first, then production**:

1. **Max monthly £13.99**, on the existing Max product. Keep the £14.99 price active for existing payers (they keep it). Then point `plan_config.stripe_price_monthly` for `max` at the new price, or set `STRIPE_PRICE_MAX_MONTHLY`.
2. **Coupon `PRO-HALF-FIRST-MONTH`**: 50% off, duration "once", restricted to the Pro product. Not needed until Stage 3 (P3b and E9b), but it is cheap to have ready.
3. **Three one-off top-up prices**: 500 resources for £2.49, 1,500 for £5.99 and 4,000 for £12.99. Their ids must reach the app as `topup_packs` rows (or env vars) when the top-up route is switched over (not done yet). The pack ids the app uses are `pack-500`, `pack-1500` and `pack-4000`; never rename one after it has sold.
4. No webhook changes are needed. The same events are used: `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`.

---

## 4. Other things for you to set or decide

- **Vercel plan.** The scheduler is meant to run every 15 minutes. On Vercel Hobby, a cron that runs more than once a day makes the deploy **fail**, so I did not add it to `vercel.json`. If you are on Pro, add `{ "path": "/api/cron/lifecycle", "schedule": "*/15 * * * *" }`.
- **`LIFECYCLE_EMAILS=on`** turns real sending on. Leave it unset until you have approved the email wording. Without it the cron only counts who would be due.
- **Production reads tonight: none.** The tool estimates were pulled from production in the earlier session (17 Nov) and are unchanged.

---

## 5. Copy changes, and choices I made without you

**Copy changed:**

- **Card trial line:** "3 days free, no card needed. £X if you subscribe" is now "10 days of Pro free, no card needed. £X if you subscribe". The trial is always Pro, even on the Standard card.
- **Plan descriptions:**
  - Free: "50 resources a week, every tool".
  - Standard: "Every tool, 500 resources a month, clean exports".
  - Pro: "1,000 resources a month and generated pictures".
  - Max: "2,500 resources a month and generated pictures". "Priority building" is gone.
- **Free's plan name** is "Free" (it was "No plan"). The sidebar chip reads "Free" and, during the trial, "PRO TRIAL", but only once the migration is pushed.
- **Rate-limit message:** its long dash became a full stop.
- **Emails E1 to E14 and E16 follow Ash's text**, with "credits" changed to "resources". Changes forced by your red notes, which put the Jooma mark on trial exports too:
  - **P1:** sells "no Jooma mark" rather than "clean exports".
  - **E5:** reads "To keep generated pictures and 1,000 resources a month, choose Pro" instead of "To keep everything as it is now", because the trial also has the mark.
  - **E6:** says "exports with no Jooma mark".
  - **E8:** sends **without** the weekly idea line until Ash approves the ideas.

**Choices made in your absence (each one conservative; all easy to change):**

1. **Ambassador code versus the £3.99 offer.** Only one discount applies, so the **ambassador code wins**. Both halve the first month, and the code also pays the ambassador's commission.
2. **E16 consent.** Until the solicitor answers, E16 goes only to accounts that did not opt out under the old signup wording (soft opt-in) and are not on the opt-out list. It is not sent at all yet. Nothing is sent without your switch.
3. **Signup consent box (opt-in).** The database column is ready, but **I did not change the signup form**. Changing it before the migration would break signup, and Ash is still checking the wording with the solicitor.
4. **Free gets Ask Jo chat** once the migration is in. The plan says chat stays free behind the hourly limit. Before the migration, Free accounts stay locked out of chat as today.
5. **Jo's voice (speak, Live) still spends resources.** Only typing to Jo is free.
6. **Disposable emails.** They still get an account and Free; they just get no trial. The list is 20 well-known domains in `trial-guard.ts`. The admin setting "block_disposable_email" still shows as "Not enforced yet" in the console.
7. **One trial per email.** Matching ignores capital letters, spaces and "+tags", and for Gmail also dots and "googlemail.com". `jo.bloggs+x@gmail.com` and `jobloggs@gmail.com` count as the same person.
8. **Known gap: legacy Max payers in the cancel flow.** The cancel-flow retention screen quotes Max at the list price (£13.99), so a teacher still paying £14.99 sees the wrong figure. I noted this in the test; fixing it means reading their real Stripe price.
9. **Emails sent more than 12 hours late are dropped**, not sent. E1 waits for 07:00 if someone signs up at night, because of the quiet-hours rule.

**UK context, in case it helps:**

- **"Free resets on Sunday at 00:00 UK time."** UK time is GMT in winter and BST (one hour ahead) from the last Sunday of March to the last Sunday of October. All dates are worked out in `Europe/London`, so the reset is always midnight on the teacher's clock.
- **"Term"** is one of the three parts of the UK school year (autumn, spring and summer). That is why E15 is the Sunday before each one.

---

## 6. Tests

All unit tests were written **before** the code they test, and seen failing first (the module was missing). There were three lapses:

- In `account-access-v45.spec.ts`, the code went in the same step as the test.
- The `resources.ts` start-date fix and its regression test were written in the same step.
- The `resources-ledger` test was confirmed red by moving the finished module aside and running it.

New test files and results (`pnpm test:unit`):

| File | Tests | Result |
|---|---|---|
| `resources-ledger.spec.ts` | 29 | pass |
| `account-plan.spec.ts` | 18 | pass |
| `plan-features.spec.ts` | 12 | pass |
| `billing-rules.spec.ts` | 7 | pass |
| `pricing-view.spec.ts` | 11 | pass |
| `prompts.spec.ts` | 11 | pass |
| `lifecycle.spec.ts` | 19 | pass |
| `launch-day.spec.ts` | 7 | pass |
| `resource-gate.spec.ts` | 10 | pass |
| `account-access-v45.spec.ts` | 4 | pass |
| `export-mark.spec.ts` | 3 | pass |
| `plan-badge.spec.ts` (+4 new) | 20 | pass |

**Old tests changed because the plan changes what they pin** (13 failed after `plans.ts` moved to the config; each was checked against the plan before changing it):

- "3 days free" became "10 days of Pro free" in the card trial line: 6 tests.
- Max at £13.99: annual struck price £167.88, saving 14%, £23.89 a year, the end-of-trial half price £6.99, and the cancel offer 1399/699/2100.
- Standard is now clean: `watermark` is false, a Pro-to-Standard move no longer lists a watermark loss, and leaving Standard now does lose clean exports.

**Final run:**

- `pnpm test:unit`: 1893 passed, 0 failed.
- `npx tsc --noEmit -p .`: clean.
- `node scripts/check-language.mjs`: passed.
- eslint on every file I touched: 0 errors. The 2 warnings are in `batch3-resources.spec.ts`, which I didn't touch.

**Not run, waiting on the migration:**

- `scripts/verify-resources.mjs`: 20+ checks through the anon key.
- No E2E was run. The `:3000` server is the old production build, and the Stage 2 screens are not built.

**Deliberately left untested, and why:**

- **The route wiring** (proxy, webhook, trial start, slideshow route and cron). It needs the migration and a server; the verify script and the future E2E cover it.
- **The SQL itself on a real Supabase.** Only the PGlite stub run so far; the verify script is the real test.
- **Sending real email.** Forbidden tonight; the cron is guarded off.
- **The Stripe webhook against real events.** That needs the sandbox and you there.

---

## 7. Next steps, in order

1. Review and push `20261118000000_plans_engine.sql` to **staging**, then run `node scripts/verify-resources.mjs`.
2. Create the Stripe sandbox items in section 3.
3. Next session:
   - **Pricing and picker:** build the pricing page and plan picker from `pricing-view.ts`.
   - **Prompt UI:** the P1 chip and banner, P2, the P3 sheet with the cost line on tool open, P5, P12, and the presenting flag.
   - **Account plumbing:** switch `useCreditMeter` to `my_resources()`, add the mark to sheet and deck exports, and start pending trials at login.
   - **Billing:** move the top-up route to the config packs, and send E12 to E14 from the webhook (guarded).
   - **Signup and settings:** the signup consent box and the E8 switch.
   - **Locked state:** redirect `/free-tools` to `/dashboard` and remove the locked-state code.
   - **Launch day:** the admin launch button.
4. Remove the remaining "3 days" copy. It is still in:
   - `Pricing.tsx`
   - `StartTrialButton.tsx`
   - `welcome/page.tsx`
   - `copy.ts`
   - `admin/emails/TemplatesView.tsx`
   - `email-templates/samples.ts`
   - `badges.ts`
   - `terms/page.tsx` (legal: your call)

   The 3-day mentions in `process-deletions` and `accountDeletionReminder` are about account deletion, not the trial.
5. Then write the slim E2E (`tests/billing/`) and the staging screenshots before and after.

---

## 8. After the handover (18 Nov, with the owner)

- **Migration pushed to staging** by the owner. `verify-resources.mjs` then failed 3 of 20 checks.
- **The bug:** `my_resources()` ends an expired trial with an update to `profiles.plan`. That update runs in the teacher's own session, so the privileged-columns guard refused it. A trial could never end, and every balance read and refine for that teacher raised an error.
- **The fix:** `supabase/migrations/20261118000100_trial_expiry_guard.sql`. The guard now lets exactly one move through: an already-expired `pro_trial` going to `free`. Teachers still cannot change `trial_ends_at`, so it cannot be triggered early.
  - Applied to **staging only**, by Claude, with the owner's permission.
  - The staging migration history row was renumbered to `20261118000100`, so it sorts after `plans_engine`, as it will on production.
- **Script fix:** `verify-resources.mjs` now seeds `surname` and `username`, as `createTeacher()` does. It also gained a check that a running trial cannot move itself to Free.
- **Result on staging:** 21 passed, 0 failed.
- **Production:** push both migrations, in order (`20261118000000`, then `20261118000100`), before deploying this code.

---

## 9. Second session (18 Nov, while you were at work): the rest of Stage 2

### Stop first: Supabase has restricted BOTH projects

- From about **22:00 UTC on 17 Nov**, every API call to production and staging returns **402 "exceed_storage_size_quota"**. Teachers cannot sign in to jooma.ai.
- **Cause:** the Jooma organisation is on Supabase **Free**, which allows 1 GB of file storage for the whole organisation. Production holds 992 MB and staging about 104 MB.
- **Fix (owner only):** upgrade the organisation to Pro, or lift its spend cap, in the Supabase dashboard.
- **Not done by Claude:** deleting staging's test images and audio (about 104 MB) might bring the organisation just under 1 GB. It destroys staging data, may not lift the block at once, and production keeps growing, so it waits for your say.
- **Knock-on:** the E2E specs and `verify-resources.mjs` could not run, because they sign in through the blocked auth API.

### Done this session

| Item | What |
|---|---|
| Stripe sandbox | Created Max monthly £13.99 (`price_1Ucv3wJLX6Udtw9TL5nBLIEl`), coupon `PRO-HALF-FIRST-MONTH` (50% once, Pro product only), and three top-up prices: 500 £2.49 `price_1Ucv3xJLX6Udtw9T1YhUl8vF`, 1,500 £5.99 `price_1Ucv3yJLX6Udtw9T81ldCcV3`, 4,000 £12.99 `price_1Ucv3zJLX6Udtw9T8ctavv1a`. Staging `plan_config.max` points at the new price, recorded in `plan_price_history`; the £14.99 price is still active and still maps to Max. |
| Migration `20261118000200_resource_topups` | **Applied to staging.** The kind checks now allow `resources_topup` (the plans engine counted that kind, but nothing could insert it). Adds `topup_packs.pack_key` and the three packs with no price; staging's prices are set. `admin_grant_allowance` can give never-expiring goodwill resources. |
| Migration `20261118000300_v45_hero_copy` | **Applied to staging.** The `copy_blocks` hero line on both databases still said "Three days free on every plan". It now says "Ten days of Pro free. No card, nothing to cancel." Only rows still holding the old text are changed. |
| Meter | `useCreditMeter` reads `my_resources()` (`useResources`, one cached read, `refreshResources()`), with the old meter as the fallback. Sidebar: per week on Free ("Back to 50 on Sunday."), "in your trial" with the trial's end date, top up only on Standard, Pro and Max, and the picture row locked ("Pro and Max only") on Free and Standard. Today's "Picture slides" chip follows the plan. Live mode says "resources". |
| Top-ups | `/api/stripe/topup` sells config packs (`pack-*`), refused on Free and the trial (403). The webhook grants `resources_topup` from the config pack (never the amount paid), with no expiry. The top-up sheet lists the config packs and a "Worth knowing" box. |
| Jooma mark | Sheet PDF, Print and Word (footer) exports; deck PDF and PowerPoint (bottom right of every slide). |
| Sheet pictures | `/api/sheet-picture` turns any `ai`/`auto` request into a library photo on Free and Standard. |
| Prompts | P1 (sidebar block with the real date, never "days left"; banner on Today on days 7 to 10, hidden for the rest of the UK day once closed), P2 (once, with what was made and the hours saved), P3 (Free and trial versions; "Switch to Free now" ends the trial through `/api/trial/end`), P5 (slides image source and the server's P5 402), P12 (every screen; "Update card" opens the Stripe portal). Nothing shows while presenting (`useMarkPresenting` in Editor present mode and QuizPresenter). `prompt_shown`, `prompt_clicked` and `prompt_dismissed` are logged through `/api/prompt-event`. |
| Cost line | Every tool page shows "Usually about N resources. You have M." or "This usually needs about 30. You have 12." with "See options" (P3). Make is refused by the same check, and `UpgradeGate` opens P3. The form is never touched. |
| Pricing page | Rebuilt to screenshot 2, with the red notes: Standard clean, no "Priority building" on Max. Pro is the dark "Recommended" card and comes first on phones. Header button "Start with 10 days of Pro free. No card." A signed-out "Choose X" goes signup, then `/pricing?chosen=X` ("Your 10 free days of Pro are already on." with "Pay for Pro now" and "Use my free days first"). |
| Plan picker (`/pricing`) | With no subscription: Pro preselected (or `?plan=`), selectable cards, the one-line diff, one "Continue with Pro". Subscribers keep the existing switch flow with its confirmations. Every upgrade button already lands here; the 4.5 ones pass `?plan=pro`. |
| Emails E12 to E14 | The webhook logs `subscribed`, `cancelled` (new, logged once when a plan is set to end) and `payment_failed`. The 15-minute cron sends E12, E13 and E14 from those events: never in quiet hours, at most 12 hours late, one per event, and E14 only while the payment is still failing. Still off unless `LIFECYCLE_EMAILS=on`. |
| Signup consent | **Now opt-in**, as in the approved plan: one unticked "Send me ideas and offers" box on /signup and /complete-profile. Unticked means product email off (`email_opt_outs`) and `marketing_consent` false; ticked means both on. The product-news switch in Profile keeps `marketing_consent` in step. |
| E8 switch | "The Sunday email" switch in Profile, Emails (`sunday_emails`). The card has the `#email-settings` anchor the email footers link to. |
| Launch day | Admin, Plans: a "Jooma 4.5 launch day" card. It previews `launch_v45_move_accounts` and runs it only once MOVE is typed. Launch-day accounts with `trial_pending` start their 10 days of Pro at their next visit. E16 is NOT sent: it waits for the consent sign-off. |
| "3 days" copy | Changed on Today, StartTrialButton, `copy.ts`, /welcome, the hero copy block and the landing pricing. **Not changed: `terms/page.tsx`** (legal text, your call; it still says "3 day free trial"). |
| `?next=` | `/pricing` is now honoured after signup (query allowed; look-alikes such as `/pricingevil` refused). |

### Choices made without you (all easy to change)

1. **The picker is the `/pricing` page**, not a pop-up. Every upgrade button already went there, so "opens the picker" holds without a second component.
2. **E12 to E14 go out through the cron, not straight from the webhook.** This keeps the quiet hours, the duplicate lock and the `LIFECYCLE_EMAILS` switch in one place, at the cost of up to 15 minutes' delay.
3. **CPD decks** are checked against the slideshow estimate (about 15), because every deck is gated as `/api/slideshow`. The CPD cost line uses the same figure, so it never says "enough" and then refuses.
4. **Unticked consent also turns product email off**, so the box means one thing everywhere. This shrinks the audience for new signups, as the spec says. Reverse it in `complete-profile` if the solicitor says otherwise.
5. **Legacy locked-state code is still there** (`noPlanBlock`, `eligibleForTrial`, `TrialBanner`, `TrialEndedModal`, `/free-tools`). It cannot run on a 4.5 database: nobody is "locked", so `/free-tools` already forwards to the real tool. Delete it once production has the migrations.

### Tests

- **Unit:** 1945 passed, 0 failed. New files, each seen failing first:
  - `resource-meter-v45` (8)
  - `topups-v45` (6)
  - `sheet-picture-source` (3)
  - `prompt-views` (16)
  - `honoured-next` (4)
  - `pricing-cards` (9)
  - `lifecycle-events` (6)
- **Typecheck and lint:**
  - `tsc` is clean, and the language check passed.
  - eslint shows **0 errors in every changed file**.
  - `pnpm lint` still exits 1, on 17 errors in files this work did not touch (for example `app/verify/page.tsx`).
- **E2E written, NOT run** (staging auth is blocked):
  - `tests/billing/v45-plans.spec.ts` (new).
  - `tests/auth/signup-product-emails.spec.ts` (updated for opt-in).
  - `tests/tools/jo-live.spec.ts` and `tests/billing/no-card-trial.spec.ts` (wording).
- **Old billing specs written for the 3-day Standard trial** will fail on a 4.5 database by design: `no-card-trial`, `trial-offer`, `standard-plan`, and likely `sidebar-plan`, `credits` and `topup-packs`. Retire or rewrite them when staging is back.
- **Screenshots:** `docs/screenshots/2026-11-18-plans/after/pricing-desktop.png` and `pricing-phone.png` (signed out, from a temporary dev server on :3100, now stopped). There are no signed-in screenshots, because sign-in is blocked.

### When Supabase is back

1. Run `node scripts/verify-resources.mjs`, then `pnpm test:billing` and `pnpm test:auth`, against a fresh build (the :3000 `next start` is an old build).
2. Production, in this order:
   - push migrations `20261118000000`, `000100`, `000200` and `000300`;
   - in **live** Stripe, create the coupon and the three top-up prices. **Done 18 Nov:** Max £13.99 monthly, `price_1Ud7iuQzprauRkjWu5t0Pz1U`. Vercel `STRIPE_PRICE_MAX_MONTHLY` already points at it. That is safe early, because checkout reads `plan_config` first.
   - set the three `topup_packs.stripe_price_id` values;
   - deploy, and **at the same time** switch prod Max to £13.99. Not before: checkout would charge £13.99 while the live site still says £14.99. It does not depend on the migrations. Check `plan_price_history` for other required columns first.

     ```sql
     update plan_config
     set price_monthly = 13.99,
         stripe_price_monthly = 'price_1Ud7iuQzprauRkjWu5t0Pz1U',
         description = '2,500 resources a month and generated pictures.'
     where plan_id = 'max';

     insert into plan_price_history (plan_id, stripe_price_id)
     values ('max', 'price_1Ud7iuQzprauRkjWu5t0Pz1U');
     ```

     Old £14.99 subscribers stay on Max: their price `price_1UAONiQzprauRkjWgeyoErKm` is already in prod `plan_price_history`.
3. Decide `terms/page.tsx`, E16 consent, and the Vercel cron (needs Pro).

---

## 10. Third session (18 Nov, afternoon): Steps 1 to 8 finished, now at Step 10

Committed by the owner's request as `ad73168` on `staging` (not pushed). From here on progress is named by the spec's Steps 1 to 10.

### Built this session

- **Step 5, P11 cancel options:** "Switch to Free" and, on Pro and Max, "Move to Standard" above the reasons. The "what you lose" tiles, timeline and loss lines say leaving lands on Free (`lossInventory` and `cancelTimeline` on a 4.5 database, `planLosses(..., { v45 })`).
- **Step 7 events:** `signup_completed` (in `/api/trial/start`, new accounts only, with `ref_code` from the browser), `resource_made` and `activated` (`/api/resource-made`, called by `saveToolRun`; own fresh runs only, once per run), `credits_ran_out` (when P3 is shown), `checkout_started` (with `source_prompt` carried as `?from=` through the picker). Rules in `app/lib/app-event-rules.ts`.
- **Step 8, E16:** a service notice to every account, one version per launch group, read back from the profile after the move (`e16Group`, `e16Notice`). Sent from Admin, Plans with SEND through `/api/admin/launch-notice`; the `lifecycle_email_log` row (key `E16`) means once per account; it stops for time and continues on the next press.
- **"Credits" to "resources"** everywhere a teacher reads it (FAQ, plan cards, billing history, Live, cancel flow, llms.txt).
- **Lifecycle cron** scheduled every 15 minutes in `vercel.json` (still sends nothing unless `LIFECYCLE_EMAILS=on`).
- **Terms:** draft in `terms-draft.md`, not applied.
- **Tests:** old 3-day trial specs deleted; `annual-plan`, `max-plan`, `topup-packs`, `sidebar-plan` rewritten; event checks added to `v45-plans`. Unit: all green.
- **`scripts/with-staging-env.sh`:** `.env.production.local` (the owner's, for the production picture cleanup) outranks `.env.local` in `next build` and `next start`. Always build and serve through this script. One test build hit production before this was found; production showed zero rows written.

### Production state (read-only check, 18 Nov)

All five migrations `20261118000000` to `000400` are on production; production still runs the pre-4.5 code. Live Stripe has the Max £13.99 price (`price_1Ud7iuQzprauRkjWu5t0Pz1U`); the coupon and three top-up prices are still to create.

### Next

1. Finish testing what is built. **Billing E2E is green** (full run 82 passed, then the 3 failures fixed and rerun: 41 passed in max-plan and cancel-flow, plus interval-switch and v45-plans; the P5 picture test was flaky once). The fixes: the plan cards still said "Watermarked exports" on Standard and "Priority building" on Max (now clean, and gone), and P11 is tested in cancel-flow.spec with a real sandbox subscription. Still to run: `tests/tools`, `tests/profile`, `tests/shell`, then signed-in before and after screenshots.
2. Step 10: run Ash's checklist on staging, moving the clock by editing dates, and send the ticked list. Two items need P3b and E9b (or Ash's OK to move them).
3. The later items of Steps 5, 6 and 7 (due 10 Dec): P3b, P4, P6 to P10; E2a, E2b, E3, E4, E9a, E9b, E10, E11; Meta Conversions API events; signup questions; admin console reports.

---

## 11. Fourth session (night of 18 to 19 Nov, owner asleep): Step 10 run, five bugs fixed, first later items

Nothing committed or pushed. One migration applied to STAGING only (below).

### Screen tests, on a fresh staging build

| Suite | Result |
|---|---|
| `tests/profile` | 17 of 17 passed. |
| `tests/shell` | 82 passed, 14 failed, then fixed (all test-side): 6 landing demo tests retired (the hero demo was replaced by real free tries on 5 Oct, `b5073cf`); 5 pricing tests rewritten for the 4.5 four cards; 2 strict selectors; 1 sub-pixel 48px check. Rerun green. |
| `tests/tools` | 174 passed, 34 skipped (`LIVE_MODEL`), 3 failed: `sheet-pictures` expected a 402 for a planless account (rewritten: Free gets a library photo); the landing hero topic box never shrank back (fixed in `HeroTry.tsx`, the card's padding was counted as a line); the Ask Jo box test still fails (see Open). |
| Also touched | `slideshow-video-images` 8 of 8 after scoping a selector the 4.5 sidebar's "Resources" now clashes with; `auth/signup-product-emails` 2 of 2. |
| Unit | 2037 passed. Language check passed. |

### Step 10, as a spec

`tests/billing/step10.spec.ts`: one test per checklist line, real throwaway accounts on staging, sandbox Stripe with signed events to the local webhook, the clock moved by editing dates. 13 of 13 green on the final build.

### Bugs Step 10 found, all fixed with a test seen failing first

1. **A failed payment dropped Pro straight to Free.** The webhook ignored `planAfterStripeEvent` and treated `past_due` as no plan. Now Pro stays while Stripe retries (P12, E14), and Free comes when Stripe gives up.
2. **E13 could send twice.** Two deliveries of one "set to cancel" change both logged `cancelled`. The flag flip is now atomic; only the delivery that flips it logs.
3. **Standard to Pro added 1,000, not 500.** The billing page's balance read raced the webhook and both applied the change. Migration `20261119000000_resources_change_plan_once.sql` makes the change once (applied to staging).
4. **An early export on Free had no Jooma mark.** Exports now wait for the account read (`exportMarkNow`): deck PDF and PowerPoint, sheet PDF, print and Word.
5. **P2 never showed.** It marked itself seen on open, and the host remounts on the first Today visit. Now it is remembered only once the teacher closes it or presses a button.
6. Also: the phone top bar said "8d left" in the 4.5 trial (now P1's "Pro trial until Wed 25 Nov"), and P5 was missed if "Generated" was picked before the plan had loaded (now it reverts and opens P5 once the plan is known).

### Copy (Step 10, last line)

"AI" and long dashes taken out of about 50 teacher-facing files (tool descriptions, slide editor, deck picture options, worksheet pictures, form examples, billing, help, error messages). Left on purpose: terms, privacy, the trust page and sub-processors (factual), model prompts, logs and admin; the SEO tool pages ("AI lesson planner", owner's search choice); the dash before a quote's author inside generated slides.

### Later items built (Steps 5 and 6)

- **P3b and the offer.** `/api/run-out` logs `credits_ran_out` and decides on the server: the second run-out on Free in a different UK week opens `offer_opened` (half the first month of Pro, monthly only, once per account, ends 23:59 UK on day 7). Checkout reads that event and applies `PRO-HALF-FIRST-MONTH`; an ambassador code wins a tie, one discount only. Rules: `app/lib/run-out-offer.ts`.
- **P4.** The low line on Free under 20, in the tool's cost line.
- **E2a, E2b, E3, E4** (trial tips, 16:30 UK) and **E9a, E9b** (marketing, consent only, at most one a day). In the cron, which still sends nothing unless `LIFECYCLE_EMAILS=on`.

### Screenshots

`docs/screenshots/2026-11-19-v45-signed-in/after/`: 20 signed-in shots, desktop and phone. Remake them with `SCREENSHOTS=1 npx playwright test tests/screens/v45-signed-in.spec.ts`. There are no "before" shots: the pre-4.5 code cannot run on a 4.5 database.

### Open

- **Before `LIFECYCLE_EMAILS=on`:** E9a and E9b are marketing, and they link to email settings rather than a one-click unsubscribe. The unsubscribe needs per-teacher tokens (a small migration).
- `tests/tools/input-grow` Ask Jo on a phone: the test sentence now needs 7 lines in the 150px ceiling (the mic button narrowed the box). Decide: a taller ceiling or a shorter test sentence.
- `tests/growth/try-free` "a finished sheet is left in view" (phone): the "Jo filled this in" panel now starts as a collapsed pill, so "Yes, generate" is not on screen. Not touched tonight; the growth suite was not in this round.
- Phone top bar: the trial chip squeezes the page title to "To...".
- Still to build (due 10 Dec): P6 to P10; E10, E11; Meta Conversions API events; signup questions; admin console reports.
- Production, when deploying: push `20261119000000_resources_change_plan_once.sql` with the code.

### 11.x Tool cost estimates re-measured (19 Nov, later)

- `app/lib/tool-estimates.ts` now has a figure for every tool, and none falls back to the guessed 5. Six well-used tools (Slides, Worksheet, Comprehension, Lesson Plan, Quiz, Exam Questions) keep the production average (15 or more saved runs). The other 28 are the median of 5 real runs on staging on the uplifted prompts (`tests/tools/measure-tool-costs.spec.ts`, run with `MEASURE_COSTS=1`; staging `tool_settings` matched production). Raw results are in `docs/tool-costs/tool-costs.jsonl`.
- Biggest changes: EYFS Plan 58 to 21; Topic Map 16 to 21; Reports 0.1 to 4.4 (a class of 30); Behaviour plan 19 to 14; Homework 4 to 7. Risk Assessment 11, Inspection Prep 13 and EYFS Action Plan 11 were the guessed 5. A CPD deck now uses the slideshow figure.
- Slides: production split by picture source. 122 of 162 decks use library photos (about 17); Generated decks averaged 11 pictures (about 75); Auto averaged 2. The cost line and the server check now add the deck's generated pictures (`deckPictureCount`: one a slide plus the title, with Auto split by the pipeline's own counter). On library photos it reads about 15, and an all-generated 8-slide deck about 65. The deck form's note now gives the number instead of "use more credits".
