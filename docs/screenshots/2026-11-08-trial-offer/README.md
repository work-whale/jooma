# Trial offer, trial UI and navbar fix (8 November 2026)

Before and after, taken on staging with a test teacher account. Same number = same screen.

| # | Screen | Before | After |
|---|---|---|---|
| 1 | Dashboard during the trial (desktop) | Purple strip across the top: "2 days left of your free trial" | Strip gone. The sidebar "Your plan" card says Free trial, 2 days left, with a progress bar |
| 2 | Dashboard during the trial (phone) | Same strip under the top bar | Strip gone. A small "2d left" chip in the top bar |
| 3 | Trial just ended (desktop) | One line across the top: "Your free trial has ended" | A popup: trial ended, 50% off the first month, live countdown, "Get 50% off" |
| 4 | Trial just ended (phone) | Same line | The same popup, sized for a phone. `4b`: after closing it, a "50% off: 6d 23h" chip in the top bar |
| 5 | Dashboard after the trial | Line across the top, plain "Choose a plan" in the sidebar | No line. The sidebar card turns orange: "50% off your first month, ends in 6d 23h, Claim 50% off" |
| 6 | Free tools page after the trial | Line across the top | No line |
| 7 | Plans page after the trial | Full prices | Countdown banner, first month at half price (£2.49 / £3.99 / £7.49). `7b`: the ambassador code field still asks for a code, so ambassadors are credited |
| 8 | A result page, scrolled (desktop) | The "My results" bar covered the top half of the page title | The top bar stays whole |
| 9 | A result page, scrolled (phone) | The top bar disappeared completely | The top bar stays whole |
| 10 | Admin, Emails, new Stats tab | (new) | One card per automatic email with sent, delivered, bounced and spam, plus the trial funnel through to paid |
| 11 | Stripe checkout with the offer | (new) | £2.49 today, then £4.99 a month, "Half price first month" applied with no code |

`after/walkthrough-trial-to-checkout.webm` is a screen recording of the whole journey: in the trial, the trial ends and the popup appears, "Get 50% off" goes to the plans page, the code field is still there, then Stripe's checkout at £2.49. It opens in any browser.

Staging has very few emails sent, so the Stats tab shows mostly zeros here; production will show real counts.
