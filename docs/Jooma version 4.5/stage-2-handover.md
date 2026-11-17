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
