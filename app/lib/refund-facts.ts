/*
 * What the admin refund console needs to know about each of a teacher's
 * charges before it can say what the refund policy allows for them.
 *
 * Server only. Everything here is BEST EFFORT: the list of charges must load
 * even when Stripe is slow to answer one of these side questions, or a row is
 * missing. A fact that cannot be found stays null, and the rules in
 * refund-policy.ts withhold any option that needs it (unknown usage is never
 * treated as no usage). Nothing here is a reason to refuse a refund.
 */

import "server-only";
import type Stripe from "stripe";
import { stripe, planForPriceId } from "@/app/lib/stripe";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { balance, rollForward, type ResourceAccount } from "@/app/lib/resources";
import type { AccountPlan } from "@/app/lib/plan-config";
import {
  describeCharge,
  inPolicy,
  intervalFromStripe,
  reasonFromBilling,
  refundOptions,
  REFUND_WINDOWS,
  topUpGrantToReverse,
  topUpLeftForPack,
  windowEnd,
  type ChargeFacts,
  type RefundOption,
} from "@/app/lib/refund-policy";

export interface ChargeAdvice {
  /** What it was, in a few words: "Pro, monthly, renewal". */
  label: string;
  /** The facts the rules were run on, dates as ISO strings. */
  facts: Omit<ChargeFacts, "chargedAt" | "periodEnd"> & { chargedAt: string; periodEnd: string | null };
  options: RefundOption[];
  inPolicy: boolean;
}

interface InvoiceInfo {
  reason: ChargeFacts["reason"];
  interval: ChargeFacts["interval"];
  periodEnd: Date | null;
  planLabel: string | null;
}

function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

/** "pro" to "Pro". The console's short plan name, not the marketing one. */
function shortPlan(plan: string | null): string | null {
  return plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;
}

/**
 * Stripe's invoices for the customer, keyed by the payment intent and the
 * charge that paid them. One list call with the payments expanded, rather than
 * a call per charge: Invoice.charge and Invoice.payment_intent no longer exist
 * in this SDK, the InvoicePayment sub-object replaced them (see
 * chargeIdForInvoice in the Stripe webhook).
 */
async function invoicesByPayment(customer: string): Promise<Map<string, InvoiceInfo>> {
  const out = new Map<string, InvoiceInfo>();
  const priceCache = new Map<string, Promise<ChargeFacts["interval"]>>();
  const intervalOfPrice = (priceId: string) => {
    let hit = priceCache.get(priceId);
    if (!hit) {
      hit = stripe.prices
        .retrieve(priceId)
        .then((p) => intervalFromStripe(p.recurring?.interval))
        .catch(() => null);
      priceCache.set(priceId, hit);
    }
    return hit;
  };

  const list = await stripe.invoices.list({ customer, limit: 24, expand: ["data.payments"] });
  for (const inv of list.data) {
    // The line that paid for the newest period, among those that charged money.
    const lines = (inv.lines?.data ?? []).filter((l) => l.amount > 0);
    const line = lines.sort((a, b) => b.period.end - a.period.end)[0];
    const priceRef = line?.pricing?.price_details?.price;
    const priceId = idOf(priceRef as string | { id: string } | undefined);

    const info: InvoiceInfo = {
      reason: reasonFromBilling(inv.billing_reason),
      interval: priceId ? await intervalOfPrice(priceId) : null,
      periodEnd: line ? new Date(line.period.end * 1000) : null,
      planLabel: priceId ? shortPlan(await planForPriceId(priceId)) : null,
    };

    for (const p of inv.payments?.data ?? []) {
      if (p.status !== "paid") continue;
      const piId = idOf(p.payment.payment_intent as string | { id: string } | undefined);
      const chId = idOf(p.payment.charge as string | { id: string } | undefined);
      if (piId) out.set(piId, info);
      if (chId) out.set(chId, info);
    }
  }
  return out;
}

/** What is left of the teacher's unspent top ups right now, the same sum
 *  my_resources() makes (balance() is its TypeScript twin). Null if unreadable. */
async function topUpPoolLeft(userId: string, now: Date): Promise<number | null> {
  const { data: row } = await supabaseAdmin
    .from("resource_accounts")
    .select("plan, period_start, next_refill_at, allowance, anchor_day, topup_spent")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;

  const topups = await supabaseAdmin.rpc("resources_topups", { p_uid: userId });
  if (topups.error) return null;
  const spentSince = async (since: Date) => {
    const r = await supabaseAdmin.rpc("resources_spent", { p_uid: userId, p_since: since.toISOString() });
    return r.error ? null : Number(r.data ?? 0);
  };

  let acc: ResourceAccount = {
    plan: row.plan as AccountPlan,
    periodStart: new Date(row.period_start),
    nextRefillAt: row.next_refill_at ? new Date(row.next_refill_at) : null,
    allowance: Number(row.allowance ?? 0),
    anchorDay: Number(row.anchor_day ?? 1),
    topupSpent: Number(row.topup_spent ?? 0),
  };
  const topupsBought = Number(topups.data ?? 0);

  // The stored period can be behind: it rolls forward when the teacher next
  // opens the app. Settle it the same way my_resources() would.
  let spent = await spentSince(acc.periodStart);
  if (spent === null) return null;
  const rolled = rollForward(acc, { spent, topupsBought }, now);
  if (rolled.rolled) {
    acc = rolled.account;
    spent = await spentSince(acc.periodStart);
    if (spent === null) return null;
  }
  return balance(acc, { spent, topupsBought }).topupLeft;
}

/** The teacher's resources packs bought inside the top up refund window that
 *  still have their bought grant, keyed by payment intent. Throws on a read
 *  error, so the caller can withhold the rule rather than guess. */
async function livePacksInWindow(userId: string, now: Date): Promise<{ id: string; units: number }[]> {
  // A day of slack: the exact window is checked per pack below.
  const since = new Date(now.getTime() - (REFUND_WINDOWS.topUpDays + 2) * 86_400_000).toISOString();
  const [purchases, grants] = await Promise.all([
    supabaseAdmin
      .from("topup_purchases")
      .select("user_id, units, created_at, stripe_payment_intent_id")
      .eq("user_id", userId)
      .eq("kind", "resources_topup")
      .gte("created_at", since),
    supabaseAdmin
      .from("allowance_grants")
      .select("id, user_id, kind, amount, granted_by, created_at")
      .eq("user_id", userId)
      .eq("kind", "resources_topup")
      .is("granted_by", null),
  ]);
  if (purchases.error) throw purchases.error;
  if (grants.error) throw grants.error;

  return (purchases.data ?? [])
    .filter(
      (p) =>
        p.stripe_payment_intent_id &&
        now.getTime() <= windowEnd(new Date(p.created_at), REFUND_WINDOWS.topUpDays).getTime() &&
        topUpGrantToReverse(
          { user_id: p.user_id, units: Number(p.units), created_at: p.created_at },
          (grants.data ?? []).map((g) => ({ ...g, amount: Number(g.amount) })),
        ) !== null,
    )
    .map((p) => ({ id: p.stripe_payment_intent_id as string, units: Number(p.units) }));
}

/**
 * Advice for each charge, by charge id. A charge that nothing could be learned
 * about is still given an entry (kind "other"), so the fault option is always
 * there for an admin to pick.
 */
export async function adviseCharges(
  userId: string,
  customer: string,
  charges: Stripe.Charge[],
  now: Date = new Date(),
): Promise<Map<string, ChargeAdvice>> {
  let invoices = new Map<string, InvoiceInfo>();
  try {
    invoices = await invoicesByPayment(customer);
  } catch (err) {
    console.error("[refund-facts] invoices", err);
  }

  const piOf = (c: Stripe.Charge) => idOf(c.payment_intent as string | { id: string } | null);

  // Top ups bought through checkout have a purchase row, not an invoice.
  const purchases = new Map<string, { units: number; kind: string }>();
  try {
    const pis = charges.map(piOf).filter((x): x is string => !!x);
    if (pis.length > 0) {
      const { data } = await supabaseAdmin
        .from("topup_purchases")
        .select("stripe_payment_intent_id, units, kind")
        .in("stripe_payment_intent_id", pis);
      for (const r of data ?? []) {
        purchases.set(r.stripe_payment_intent_id as string, { units: Number(r.units), kind: r.kind as string });
      }
    }
  } catch (err) {
    console.error("[refund-facts] purchases", err);
  }

  // Only worth reading if there is a resources top up among the charges.
  let poolLeft: number | null = null;
  if ([...purchases.values()].some((p) => p.kind === "resources_topup")) {
    try {
      poolLeft = await topUpPoolLeft(userId, now);
    } catch (err) {
      console.error("[refund-facts] pool", err);
    }
  }

  // Every resources pack still inside its refund window whose resources the
  // teacher still holds (a live bought grant; a full refund deletes it, a
  // partial one does not). Read from the database, not from the Stripe list
  // above, which stops at 10 charges and could miss a pack. Each pack is then
  // judged against the pool minus all the others (topUpLeftForPack), so one
  // unspent pool is never counted twice. Keyed by payment intent.
  let packsInWindow: { id: string; units: number }[] = [];
  if (poolLeft !== null) {
    try {
      packsInWindow = await livePacksInWindow(userId, now);
    } catch (err) {
      console.error("[refund-facts] packs in window", err);
      // Unknown which packs share the pool: withhold the top up rule.
      poolLeft = null;
    }
  }

  const out = new Map<string, ChargeAdvice>();
  await Promise.all(
    charges.map(async (c) => {
      const pi = piOf(c);
      const chargedAt = new Date(c.created * 1000);
      const inv = invoices.get(c.id) ?? (pi ? invoices.get(pi) : undefined);
      const purchase = pi ? purchases.get(pi) : undefined;

      let facts: ChargeFacts;
      let planLabel: string | null = null;
      if (inv) {
        facts = {
          kind: "subscription",
          interval: inv.interval,
          reason: inv.reason,
          chargedAt,
          amount: c.amount,
          amountRefunded: c.amount_refunded,
          periodEnd: inv.periodEnd,
          spentSinceCharge: null,
          topUp: null,
        };
        planLabel = inv.planLabel;
        // Only a renewal's "have you used it since" decision needs the spend.
        if (inv.reason === "renewal") {
          try {
            const r = await supabaseAdmin.rpc("resources_spent", {
              p_uid: userId,
              p_since: chargedAt.toISOString(),
            });
            if (!r.error) facts.spentSinceCharge = Number(r.data ?? 0);
          } catch (err) {
            console.error("[refund-facts] spend", err);
          }
        }
      } else if (purchase) {
        const resources = purchase.kind === "resources_topup";
        facts = {
          kind: "topup",
          interval: null,
          reason: null,
          chargedAt,
          amount: c.amount,
          amountRefunded: c.amount_refunded,
          periodEnd: null,
          spentSinceCharge: null,
          topUp:
            resources && poolLeft !== null
              ? { units: purchase.units, left: topUpLeftForPack(pi!, packsInWindow, poolLeft) }
              : null,
        };
      } else {
        facts = {
          kind: "other",
          interval: null,
          reason: null,
          chargedAt,
          amount: c.amount,
          amountRefunded: c.amount_refunded,
          periodEnd: null,
          spentSinceCharge: null,
          topUp: null,
        };
      }

      const options = refundOptions(facts, now);
      out.set(c.id, {
        label: describeCharge(
          facts,
          planLabel,
          purchase && purchase.kind === "resources_topup" ? purchase.units : null,
        ),
        facts: {
          ...facts,
          chargedAt: facts.chargedAt.toISOString(),
          periodEnd: facts.periodEnd ? facts.periodEnd.toISOString() : null,
        },
        options,
        inPolicy: inPolicy(options),
      });
    }),
  );
  return out;
}
