import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/auth/server";
import { trialStartedBy } from "@/app/lib/stripe";
import StartTrialPixel from "./StartTrialPixel";

/*
 * Where Stripe Checkout sends a teacher back to, and the last step of signing
 * up: the moment their card is on file and the free trial has started.
 *
 * It exists for the browser half of Meta's StartTrial. The agency's
 * specification asks for the event from the pixel AND from the server, sharing
 * one event_id so Meta counts it once. The server copy is sent by the Stripe
 * webhook (reportTrialStart); this page fires the browser copy with the same
 * id, the user id. Before Free was withdrawn both fired when the profile form
 * finished, because that was when the free plan began. The trial now begins at
 * Checkout, so the browser copy lives here.
 *
 * Fires only when Stripe confirms this checkout started a trial for THIS user
 * (see isTrialCheckout). A returning subscriber pays straight away and sees no
 * event, and an edited or shared session id fires nothing.
 *
 * Then forwards on. Nothing is rendered for long enough to read.
 */

export const dynamic = "force-dynamic";

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; from?: string }>;
}) {
  const { session_id: sessionId, from } = await searchParams;

  // Allowlisted rather than taken from the URL, so this cannot be turned into
  // an open redirect. Billing goes straight to its real home under /profile
  // rather than through the /account/billing redirect, saving a hop.
  const next =
    from === "welcome"
      ? "/tools?checkout=success"
      : "/profile?section=subscription&checkout=success";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await trialStartedBy(sessionId, user.id))) redirect(next);

  return <StartTrialPixel eventId={user.id} next={next} />;
}
