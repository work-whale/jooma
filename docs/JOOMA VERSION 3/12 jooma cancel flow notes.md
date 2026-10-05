# Jooma cancellation flow — build notes

Prototype: `12-jooma-cancel-flow.html`. Open it and use the dark bar at the top to jump between screens. **That bar is prototype chrome — delete `.proto` and its markup before shipping.**

---

## 1. Read this before you build it

This flow is designed to be persuasive and to be **legal**. Those are not in tension, but the second one is easy to lose while chasing the first, so it is written down here.

### The rules the flow is built around

1. **A forward route to cancellation is on every screen from step 2 onwards, always.** Screens 2a–2d carry a plain text link reading `No thanks, continue cancelling`, and screen 3 carries a `Continue cancelling` button. These are deliberately quieter than the save buttons, which is fine, but they must never be removed, disabled or hidden behind another click. The whole flow is four screens and a person who wants out reaches the end in four taps without hunting for anything.

   Screen 1 has no shortcut to the end, so **selecting a reason is required**. One tap, seven options including "something went wrong", and the next screen is reached immediately. That is a normal, defensible pattern. What would not be defensible is removing the forward links from 2a–2d or 3, or adding screens beyond four — that is the line between a save flow and a maze, and a maze costs more in chargebacks and one-star reviews than it earns in saves.
2. **Nothing on screen is a claim we cannot keep.** Every number and every consequence on the "what you lose" screen reads from `ACCOUNT` and `POLICY` at the top of the script. If the backend behaves differently from `POLICY`, the copy is a misrepresentation, not a design choice. Wire those two objects to real values; do not hard code the words.
3. **Every offer shown must be honoured automatically.** If someone accepts half price, the discount applies without anyone having to email support.
4. **No fake scarcity.** The "offer open for 14 days" line is only there because `POLICY.offerOpenDays` says so. If you do not actually hold it open for 14 days, change the number or remove the line.

### The legal position, which Ash needs to check

The UK's **Digital Markets, Competition and Consumers Act 2024** contains a subscription-contracts regime covering exactly this: how easy cancellation has to be, what reminders you must send before a renewal or before a free trial converts, and cooling-off rights. The relevant provisions were being brought into force in stages around 2025–26 and I cannot confirm from here what is in force today or what the final guidance says.

The **3-day free trial that auto-converts to a paid plan is the highest-risk part of the new pricing**, not the cancellation flow. Short auto-converting trials attract the most scrutiny and the most chargebacks. At minimum you will want a reminder before the first charge.

Because teachers in California and New York are on the live map, the **FTC's negative-option / "click to cancel" rulemaking** is also in scope for those users.

**Get a consumer-law solicitor to review the trial terms and this flow before launch.** It is an hour of someone's time against a regulator's view of your whole subscriber base. Nothing in this document is legal advice.

---

## 2. The flow

```
Account → Subscription → Cancel
        │
        ▼
   1. REASON  ─────────────────────────────┐
        │  (routes by reason)              │
        ├── cost, found-something-else  → 2a DISCOUNT
        ├── not-using, one-term-only    → 2b PAUSE
        ├── missing, something-wrong    → 2c FIX IT
        └── school-licence              → 2d SCHOOLS
                    │                     │
                    ▼                     │
             3. WHAT YOU LOSE  ←──────────┘  (skip link from any screen)
                    │
                    ▼
             4. CONFIRM
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
      SAVED                5. CANCELLED
```

### Screen 1 — Reason

Ask first, offer second. A discount aimed at someone who is leaving because a tool is missing is wasted money and reads as tone deaf.

Seven reasons, single select, `Continue` disabled until one is chosen. Each carries `data-next` so the routing lives in the markup, not in a switch statement.

There is no skip on this screen: a reason is required to go forward. Keep the list broad enough that nobody has to lie to proceed — that is what "something went wrong" and "I have found something else" are for. If support ever starts hearing "I couldn't find my reason", add one rather than letting people pick the nearest wrong answer, because a reason nobody means is worse than no reason at all.

The reason is the single most valuable thing this flow produces. Even people who cancel have told you why.

### Screen 2 — The offer, branched

| Reason | Screen | Primary offer | Alternatives |
|---|---|---|---|
| Costs too much | 2a | 50% off for 3 months | Downgrade to Standard · Switch to annual · Pause |
| Found something else | 2a | 50% off for 3 months | as above |
| Not using it enough | 2b | Pause 1, 2 or 3 months | Downgrade to Standard · Half price |
| Only needed it this term | 2b | Pause | as above |
| Something is missing | 2c | Tell us, 30-day free hold | Callback |
| Something went wrong | 2c | Tell us, 30-day free hold | Callback |
| School is buying a licence | 2d | Introduce to schools team | 60-day free hold |

**Pause is the most valuable offer on this list for a teacher**, and it is under-used in this market. Teaching has a summer. A teacher who pauses in July comes back in September; a teacher who cancels in July is gone, because in September they are starting fresh and comparing options again. Expect pause to beat the discount on retained revenue over twelve months even though it looks worse this month.

**Half price for three months costs £11.97.** Against an £8–12 blended CAC that is cheap retention. Against a subscriber who was going to churn next month anyway, it is pure gain. Cap it: one acceptance per account per twelve months, enforced server side, or it becomes a renewable discount that teachers tell each other about.

### Screen 3 — What you lose

The strongest screen, because it is specific and true. Six tiles from the real account, each with what happens to it — in orange where something is lost, in green where it is not.

Keeping "42 hours saved — yours, that does not go anywhere" in green is deliberate. A screen that is only threats reads as a shakedown. One honest reassurance makes the other five believable.

Below it, a dated timeline. People cancel because they are afraid of the next charge, not because they want to lose their work. Telling them plainly that nothing is deleted today removes the panic — and a calm person is more likely to take a pause than a frightened one.

### Screen 4 — Confirm

No new offer, no new argument. Repeat the three facts that matter — access until the period end, no further charge, nothing deleted — and give two buttons.

### Screen 5 — Cancelled

Still working for you. It carries the library download, a one-click reactivate, the offer held open, and one last human line for teachers who are leaving the profession or changing school. That last one is not a retention tactic; it is the right thing to do and it is how you get them back in two years.

---

## 3. What the developer sets

Two objects at the top of the script. Everything on screen reads from them.

```js
var ACCOUNT = {
  name, plan, price, billing,
  periodEnd, daysLeft,
  resources, badges, streak, hoursSaved,
  creditsMonthly, creditsLeft, colleagues, sharedItems,
  memberSince
};

var POLICY = {
  accessUntilPeriodEnd : true,
  libraryAfter         : 'view-only',   // 'view-only' | 'deleted' | 'kept'
  graceDays            : 90,
  deleteDate           : '1 February',
  warnAt               : [30, 7],
  streakResets         : true,
  badgesKept           : true,
  creditsRollOver      : false,
  exportAlwaysAvailable: true,
  offerOpenDays        : 14
};
```

### The retention policy is a decision Ash has to make

The prototype assumes: library goes **view-only** at period end, stays readable and downloadable for **90 days**, then is deleted with warnings at 30 and 7 days. Export is always available, subscribed or not.

That is a deliberate middle path. Deleting a teacher's work the moment they stop paying is hostile, generates refund demands, and under UK GDPR you would need a defensible retention rationale for destroying personal data on a schedule you set for commercial reasons. Keeping it forever removes the loss that makes this screen work. View-only with a long, warned grace period gives real loss aversion without being punitive, and it makes reactivation frictionless, which is where the money actually is.

**Whatever you choose, the backend has to do it and the copy has to say it.** Change `POLICY` and the screens follow.

---

## 4. Analytics

Every screen view, reason, offer acceptance and completed cancellation fires `track()` into `dataLayer`. Wire it to whatever you use. The numbers worth watching weekly:

- **Save rate by reason** — which offers are earning their cost
- **Step drop-off** — if people are leaving at screen 3 without reaching 4, the inventory screen is frightening rather than persuading
- **Forward-link usage on 2a–2d** — high usage means the offers are not credible, not that the links should be hidden
- **Reason distribution** — a reason taking a suspiciously large share usually means the list is missing the real one and people are picking the nearest fit
- **Reactivation within 90 days** — the real measure of whether the grace period is worth its storage cost
- **Pause → resume rate** — if resume is below ~60%, pause is just a slower cancel and the length options need rethinking

---

## 5. Still to build

- **Pre-charge reminder email before the 3-day trial converts.** Highest-risk item in the new pricing and the one most likely to be legally required.
- **Email sequence after cancellation**: day 0 confirmation with download link, day 30 and day 83 deletion warnings, a win-back around the start of the next term.
- **A reason-specific win-back.** Someone who left over price gets a different email from someone who left because a tool was missing — especially once that tool exists.
- **Annual plan cancellation.** This flow assumes monthly. Annual needs its own handling for the remaining months and a refund position, which does not exist yet.
