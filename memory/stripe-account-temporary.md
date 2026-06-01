---
name: stripe-account-temporary
description: Jooma temporarily bills through WorkWhale's Stripe account; branding mismatch is intentional
metadata:
  type: project
---

Jooma (jooma.ai) is launching its Stripe billing on **WorkWhale's (workwhale.ph) Stripe account** — they're the same company. This is temporary until Jooma sets up its own Stripe account.

**Why:** Lets billing ship now without waiting on a separate Stripe entity.

**How to apply:** Do NOT try to "fix" the WorkWhale-vs-Jooma branding mismatch (statement descriptor, receipt/Checkout logo showing WorkWhale). It's accepted as temporary. When Jooma's own account is ready, the only change needed is swapping `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY` (and the webhook secret) in `.env.local` — no code changes. Also note: charging in £ (GBP) on a PH-based account incurs a currency-conversion fee at settlement, knowingly accepted for now.
