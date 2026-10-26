import Link from "next/link";

/*
 * "Cancel subscription": the way into the cancel flow at /profile/cancel.
 *
 * This used to open a losses panel here and then hand off to the Stripe
 * portal's subscription_cancel flow. The flow now owns all of it: the reason,
 * an offer that fits it, what they lose (the same planLosses lines this panel
 * showed), and the cancel itself, which still schedules rather than cancels.
 * ResumeButton still undoes it.
 *
 * A Link, so the flow's loading skeleton shows the moment it is pressed.
 */
export default function CancelSubscriptionButton() {
  return (
    <Link
      href="/profile/cancel"
      className="inline-block py-2.5 px-5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer"
      style={{
        backgroundColor: "transparent",
        color: "var(--j-body)",
        border: "1px solid var(--j-line-2)",
      }}
    >
      Cancel subscription
    </Link>
  );
}
