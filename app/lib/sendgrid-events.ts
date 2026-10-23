// SendGrid's event webhook: what happened to an email after SendGrid accepted
// it. Bulk email records "sent" the moment SendGrid says yes; this is what
// later says delivered, bounced, dropped or reported as spam.
//
// PURE ON PURPOSE, like email-templates/broadcast.ts: the route does the I/O,
// and the unit runner tests these directly with a generated key pair.
//
// Only delivery matters here. Opens and clicks are not tracked at all (bulk
// sends turn tracking off), so those events are ignored if they ever arrive.

import { createPublicKey, verify } from "node:crypto";

/** How far a signed timestamp may be from now. Replaying an old batch could do
 *  no harm (email_record_events only ever escalates, and opt-outs ignore
 *  duplicates), so this is generous enough that a SendGrid retry is never
 *  refused for being late. */
export const MAX_SKEW_SECONDS = 24 * 60 * 60;

/**
 * Check a signed webhook request.
 *
 * SendGrid signs `timestamp + rawBody` with ECDSA P-256 over SHA-256 and sends
 * the signature base64 encoded (DER). The verification key from its dashboard
 * is a base64 DER public key. Any malformed input is simply "not verified".
 */
export function verifySendgridSignature(
  publicKeyB64: string,
  signatureB64: string,
  timestamp: string,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!publicKeyB64 || !signatureB64 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64.trim(), "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      "sha256",
      Buffer.from(timestamp + rawBody, "utf8"),
      key,
      Buffer.from(signatureB64.trim(), "base64"),
    );
  } catch {
    return false;
  }
}

/** The fields we read from one SendGrid event. Custom args arrive top level. */
export interface SendgridEvent {
  event?: string;
  email?: string;
  timestamp?: number;
  type?: string;
  reason?: string;
  response?: string;
  recipient_id?: string | number;
  campaign_id?: string;
}

export type Delivery = "delivered" | "bounced" | "dropped" | "spam";

/** The row shape email_record_events() takes. */
export interface EventRow {
  recipient_id: number | null;
  email: string;
  delivery: Delivery | null;
  reason: string | null;
  opt_out: "bounce" | "spam" | null;
  at: string | null;
}

function recipientId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * SendGrid events as rows, keeping only what changes anything.
 *
 *   delivered    delivery 'delivered'
 *   bounce       delivery 'bounced'. A hard bounce also opts the address out;
 *                a 'blocked' one is the receiving server refusing for now,
 *                which says nothing permanent about the address.
 *   dropped      delivery 'dropped'. SendGrid drops addresses already on its
 *                own suppression lists, and two of those reasons are worth
 *                copying into ours.
 *   spamreport   delivery 'spam', and an opt-out.
 *
 * Everything else (processed, deferred, open, click, unsubscribe) is ignored.
 * Events with neither a recipient row nor an opt-out are dropped too: they are
 * transactional mail delivering normally, which there is nothing to record for.
 */
export function mapEvents(events: unknown): EventRow[] {
  if (!Array.isArray(events)) return [];
  const rows: EventRow[] = [];
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as SendgridEvent;
    const email = typeof e.email === "string" ? e.email.trim().toLowerCase() : "";
    if (!email) continue;

    const reason = (e.reason || e.response || "").toString().slice(0, 500) || null;
    let delivery: Delivery | null = null;
    let optOut: EventRow["opt_out"] = null;

    switch (e.event) {
      case "delivered":
        delivery = "delivered";
        break;
      case "bounce":
        delivery = "bounced";
        if (e.type !== "blocked") optOut = "bounce";
        break;
      case "dropped":
        delivery = "dropped";
        if (/bounced address/i.test(reason ?? "")) optOut = "bounce";
        else if (/spam reporting address/i.test(reason ?? "")) optOut = "spam";
        break;
      case "spamreport":
        delivery = "spam";
        optOut = "spam";
        break;
      default:
        continue;
    }

    const id = recipientId(e.recipient_id);
    if (id === null && optOut === null) continue;

    rows.push({
      recipient_id: id,
      email,
      delivery,
      reason,
      opt_out: optOut,
      at: typeof e.timestamp === "number" ? new Date(e.timestamp * 1000).toISOString() : null,
    });
  }
  return rows;
}
