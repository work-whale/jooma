// ── Meta Conversions API ─────────────────────────────────────────────────────
// Purchase reported server side, from the Stripe webhook, after payment is
// actually confirmed.
//
// WHY SERVER SIDE AND NOT A BROWSER PIXEL
//
// invoice.paid arrives with no browser attached: the teacher is not on the site
// and may have closed the tab at the Stripe redirect minutes earlier. There is
// no fbq to call and no cookie to read. The invoice is also the only honest
// source of the amount actually charged once promotion codes, proration and
// ambassador discounts are accounted for, which is what the specification means
// by "actual transaction amount".
//
// NEVER THROWS. Same posture as app/lib/email.ts, and for a sharper reason: the
// Stripe webhook returns 500 deliberately to invite retries, and those retries
// re-run subscription syncing. A marketing pixel that threw would turn a Meta
// outage into a retry storm against billing. Everything here catches, logs with
// a [meta-capi] tag and returns a boolean.
//
// THE PAYLOAD ITSELF lives in meta-purchase.ts, which carries no `server-only`
// so the unit tests can reach it. See the header there.
//
// ENVIRONMENT
//   - META_CAPI_ACCESS_TOKEN    the secret. Absent is a logged no-op, NOT a
//                               throw at import: failing loud the way
//                               app/lib/stripe.ts does would take the whole
//                               webhook route down, and with it every
//                               subscription sync, over a marketing pixel.
//   - NEXT_PUBLIC_META_PIXEL_ID the pixel the events belong to. Shared with the
//                               browser pixel, and not a secret.
//   - META_TEST_EVENT_CODE      optional. Routes events to the Test Events tab
//                               in Events Manager instead of live reporting.
//   - META_CAPI_DISABLED        "1" switches sending off, matching the kill
//                               switches in tool-availability.ts and
//                               profile-gate.ts.
import "server-only";
import { buildPurchasePayload, hashedEmail, type PurchaseInput } from "./meta-purchase";

export { buildPurchasePayload, isReportablePurchase } from "./meta-purchase";
export type { PurchaseInput, MetaEventPayload } from "./meta-purchase";

/** Pinned rather than floating: Meta changes payload requirements between
 *  versions, and an unpinned URL would start failing on their schedule. */
const API_VERSION = "v21.0";

/** One event, posted to the pixel's endpoint.
 *
 *  Shared by both events so the credential handling, the kill switch and the
 *  error reporting cannot drift between them. Never throws: see the header. */
async function postEvent(
  event: object,
  label: string,
  reference: string,
): Promise<boolean> {
  if (process.env.META_CAPI_DISABLED === "1") {
    console.warn(`[meta-capi] disabled by META_CAPI_DISABLED, skipping ${label}`, reference);
    return false;
  }

  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  // The expected state until the token is added, so this is warn rather than
  // error. Same reasoning as the unconfigured branch in vercelAnalytics.ts.
  if (!token || !pixelId) {
    console.warn(`[meta-capi] not configured, skipping ${label}`, reference);
    return false;
  }

  const testCode = process.env.META_TEST_EVENT_CODE;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [event],
          access_token: token,
          ...(testCode ? { test_event_code: testCode } : {}),
        }),
      },
    );

    if (!res.ok) {
      // Meta puts the actual reason in the body; the status alone is almost
      // always a bare 400 and tells you nothing.
      const detail = await res.text().catch(() => "");
      console.error(`[meta-capi] Meta rejected ${label}`, {
        reference,
        status: res.status,
        detail,
      });
      return false;
    }

    // Logged on SUCCESS too, deliberately. Without this, "Meta accepted it" and
    // "this code never ran" are indistinguishable in the logs, which is the
    // exact question anyone reading them is trying to answer. Meta's own
    // reporting lags by minutes to hours, so the server log is the only
    // immediate confirmation there is.
    //
    // Says which pixel and whether it went to Test Events, because sending live
    // events while expecting test ones (or the reverse) is otherwise invisible.
    console.info(
      `[meta-capi] Meta accepted ${label}`,
      reference,
      process.env.META_TEST_EVENT_CODE ? "(test event)" : "(live)",
    );
    return true;
  } catch (err) {
    console.error(`[meta-capi] could not reach Meta for ${label}`, reference, err);
    return false;
  }
}

/**
 * Report a Free plan activation.
 *
 * `event_id` is the user id, which matters twice over. It dedupes this against
 * the browser's own fbq('track','StartTrial', {}, {eventID: userId}) so one
 * activation is not counted as two, AND it collapses a repeat submission of the
 * signup form into a single conversion: the profiles upsert is idempotent, so a
 * teacher who retries after a failed invite step would otherwise report twice.
 * Meta dedupes on event_id within 48 hours, which covers every realistic retry.
 *
 * Do not replace this with a random id without reading that sentence again.
 */
export async function sendStartTrialEvent(input: {
  userId: string;
  email: string | null;
  fbp: string | null;
  fbc: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}): Promise<boolean> {
  const user_data: Record<string, string> = {};

  const em = hashedEmail(input.email);
  if (em) user_data.em = em;
  // Raw, not hashed. These are Meta's own cookie values.
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;
  if (input.clientIpAddress) user_data.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) user_data.client_user_agent = input.clientUserAgent;

  if (Object.keys(user_data).length === 0) {
    console.warn("[meta-capi] no usable identifiers, skipping StartTrial", input.userId);
    return false;
  }

  return postEvent(
    {
      event_name: "StartTrial",
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.userId,
      action_source: "website",
      user_data,
    },
    "StartTrial",
    input.userId,
  );
}

/** Whether Purchase reporting is configured at all. Mirrors mailerConfigured()
 *  in app/lib/email.ts, for an admin screen that wants to show whether tracking
 *  is actually live. */
export function metaCapiConfigured(): boolean {
  return Boolean(
    process.env.META_CAPI_ACCESS_TOKEN && process.env.NEXT_PUBLIC_META_PIXEL_ID,
  );
}

/**
 * Send one Purchase to Meta.
 *
 * Returns true only when Meta accepted it. Never throws, never rejects: see the
 * header. A false return is already logged by the time it is returned, so the
 * caller does not need to log again.
 */
export async function sendPurchase(input: PurchaseInput): Promise<boolean> {
  const payload = buildPurchasePayload(input);

  // An event with no identifier at all cannot be matched to anyone, so it would
  // count as a conversion against no audience. Better to skip it and say so.
  if (Object.keys(payload.user_data).length === 0) {
    console.warn("[meta-capi] no usable identifiers, skipping Purchase", input.eventId);
    return false;
  }

  return postEvent(payload, "Purchase", input.eventId);
}
