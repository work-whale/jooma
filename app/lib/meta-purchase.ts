// ── The Purchase payload, as pure functions ──────────────────────────────────
// Split out of meta-capi.ts, which carries `server-only` and therefore cannot be
// imported by tests/unit: that module is a Next bundler alias rather than a real
// package, so a plain Node runner cannot resolve it. Every other unit-tested lib
// in this repo (plans.ts, subscriptionValue.ts, badges.ts) is likewise free of
// it. The same split, and the same reason, as email-templates/shared.ts sitting
// outside email.ts.
//
// Nothing here touches the network, process.env or a Stripe client. The send
// itself, and the credentials it needs, stay in meta-capi.ts.
//
// Everything below is silently wrong when it is wrong: a bad hash or a pence
// error does not raise, it just reports nonsense to Meta for months. That is
// exactly why it is here, where tests/unit/meta-capi.spec.ts can reach it.
import { createHash } from "crypto";
import type Stripe from "stripe";

/** What the caller knows about one confirmed purchase. Deliberately plain data
 *  rather than a Stripe.Invoice, so the payload can be built and asserted
 *  without constructing a whole Stripe object. */
export interface PurchaseInput {
  /** Stripe's invoice id. Meta dedupes on this within 48 hours, which is what
   *  makes a webhook retry safe. */
  eventId: string;
  email: string | null;
  /** The Meta browser cookies captured at signup, replayed here so a purchase
   *  weeks later still matches the click that brought them in. Raw, never
   *  hashed — see hashed() below. */
  fbp: string | null;
  fbc: string | null;
  /** MINOR units, as Stripe reports them. Converted on the way out. */
  valueMinor: number;
  /** As Stripe reports it, lowercase. Uppercased on the way out. */
  currency: string;
  /** Seconds since epoch. Meta rejects events more than seven days old. */
  eventTimeUnix: number;
  /** Best effort, and only available where a real request exists. Never faked
   *  from the webhook: Stripe's IP is not the teacher's. */
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export type MetaEventName = "CompleteRegistration" | "StartTrial" | "Activated" | "Subscribe" | "Purchase";

export interface MetaEventPayload {
  event_name: MetaEventName;
  event_time: number;
  event_id: string;
  action_source: "website";
  user_data: Record<string, string>;
  custom_data?: { value: number; currency: string };
}

/**
 * Jooma 4.5 Step 7. One stable id per account for the once-only events, so a
 * retry (or the browser and the server both sending) counts once in Meta.
 * StartTrial keeps the bare user id it has always used.
 */
export function metaEventId(name: "CompleteRegistration" | "Activated" | "StartTrial", userId: string): string {
  if (name === "CompleteRegistration") return `reg:${userId}`;
  if (name === "Activated") return `act:${userId}`;
  return userId;
}

/** A subscription invoice's Meta name: the first payment is Subscribe; a
 *  renewal or an upgrade's proration stays Purchase (owner's choice, 19 Nov). */
export function metaNameForInvoice(billingReason: string | null | undefined): "Subscribe" | "Purchase" {
  return billingReason === "subscription_create" ? "Subscribe" : "Purchase";
}

export interface MetaEventInput {
  eventName: MetaEventName;
  eventId: string;
  email: string | null;
  fbp: string | null;
  fbc: string | null;
  eventTimeUnix: number;
  /** Minor units (pence), with `currency`, for Subscribe and Purchase. */
  valueMinor?: number;
  currency?: string;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

/** Any Step 7 event's body. Pure. */
export function buildMetaEvent(input: MetaEventInput): MetaEventPayload {
  const user_data: Record<string, string> = {};
  const em = hashedEmail(input.email);
  if (em) user_data.em = em;
  // NOT hashed: Meta's own cookie values.
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;
  if (input.clientIpAddress) user_data.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) user_data.client_user_agent = input.clientUserAgent;
  const body: MetaEventPayload = {
    event_name: input.eventName,
    event_time: input.eventTimeUnix,
    event_id: input.eventId,
    action_source: "website",
    user_data,
  };
  if (typeof input.valueMinor === "number" && input.currency) {
    body.custom_data = { value: input.valueMinor / 100, currency: input.currency.toUpperCase() };
  }
  return body;
}

/**
 * SHA-256 of a normalised value, as Meta requires for personal identifiers.
 *
 * Returns null for absent or empty input rather than the digest of an empty
 * string. That distinction matters: the digest of "" is a real, constant hash
 * that would match every other user with a missing email, so sending it is
 * worse than sending nothing.
 *
 * Normalisation (trim, lowercase) has to happen before hashing or the match
 * silently fails, since Meta hashes the user's address the same way and
 * compares digests.
 */
export function hashedEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalised = value.trim().toLowerCase();
  if (!normalised) return null;
  return createHash("sha256").update(normalised).digest("hex");
}

/** Is this invoice a subscription payment we should report as a Purchase?
 *
 *  The same check markReferralPaid makes in the Stripe webhook, and for the
 *  same reason: a one-off credit top-up is not a subscription, and `parent.type`
 *  is how a real invoice says which it is. That check is verified against the
 *  live account, so it is reused rather than reinvented. */
export function isReportablePurchase(inv: Stripe.Invoice): boolean {
  const parentType = (inv as unknown as { parent?: { type?: string } }).parent?.type;
  return parentType === "subscription_details";
}

/** Build the event body. Pure, so every rule it encodes is testable with no
 *  network and no credentials. */
/** Subscribe and Purchase always carry a value. */
export type PurchasePayload = MetaEventPayload & { custom_data: { value: number; currency: string } };

export function buildPurchasePayload(input: PurchaseInput & { eventName?: "Subscribe" | "Purchase" }): PurchasePayload {
  const user_data: Record<string, string> = {};

  const em = hashedEmail(input.email);
  if (em) user_data.em = em;

  // NOT hashed. These are Meta's own cookie values, and hashing them destroys
  // the match without any error to show for it.
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;

  if (input.clientIpAddress) user_data.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) user_data.client_user_agent = input.clientUserAgent;

  return {
    event_name: input.eventName ?? "Purchase",
    event_time: input.eventTimeUnix,
    event_id: input.eventId,
    action_source: "website",
    user_data,
    custom_data: {
      // Minor to major units. Stripe counts in pence, Meta expects pounds, and
      // sending 799 for a GBP 7.99 subscription overstates revenue a
      // hundredfold with nothing on screen to say so.
      value: input.valueMinor / 100,
      // Stripe reports "gbp", Meta expects "GBP".
      currency: input.currency.toUpperCase(),
    },
  };
}

/** A Meta cookie (_fbp, _fbc) from a raw Cookie header. */
export function metaCookieFrom(header: string | null, name: "_fbp" | "_fbc"): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}
