import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { sendTemplate } from "@/app/lib/email";
import { isUndeliverable } from "@/app/lib/email-templates/broadcast";
import {
  gbp,
  lastCompletedTaxYear,
  summariseTaxYear,
  taxYearBounds,
} from "@/app/lib/ambassador-commission";
import { activityStage, reviewDeadline } from "@/app/lib/ambassador-activity";

// Ends an ambassador's free Pro once their twelve months are up. Daily.
//
// The free year is a comp (see app/api/admin/ambassadors/grant-pro): plan
// 'pro' with no Stripe subscription, and an end date on the ambassador row.
// Nothing else would ever take it off, so this does, for every ambassador
// whose pro_until has passed AND whose plan is still that comp.
//
// An ambassador who subscribed in the meantime has a Stripe subscription id,
// and Stripe owns their plan from then on (their checkout billed from the day
// the free year ended). They are skipped, by the same test teacher_mrr() uses
// to tell a comp from a payer.
//
// Idempotent: a second run the same day finds nothing left to end.
//
// THREE MORE JOBS RIDE ON THE SAME DAILY RUN, rather than more crons to register:
//
//   - Keeping your place (agreement clause 5, app/lib/ambassador-activity.ts):
//     the one-quiet-month email, then Under review with its deadline, and
//     clearing both the day a new subscriber arrives. Ending an agreement is
//     left to an admin, who sees the expired review in the console.
//
//   - A month before an agreement ends, "do you want to carry on?", which the
//     agreement promises. Once per ambassador, stamped on
//     ambassadors.end_reminder_sent_at.
//   - The yearly tax summary for the UK tax year that most recently ended, to
//     every ambassador paid in it. Once per ambassador per tax year, recorded
//     in ambassador_tax_summaries. It goes out on the first run after 5 April,
//     and anyone missed (a failed send, a late payment record) is caught up on
//     a later day.
//
// All of them CLAIM before sending (the stamp or the row is written first, guarded so
// only one run can win it) and release the claim if the send fails, so a
// mailer outage means "retry tomorrow", never "sent twice" or "never sent".
//
// SETUP, as for the other crons (see mrr-snapshot):
//   - registered in vercel.json; crons only register from a PRODUCTION deploy.
//   - CRON_SECRET set in Vercel, production scope.
//   - /api/cron is in PUBLIC_PATHS in proxy.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  // Loud rather than open: a deploy that forgot the secret must fail, not turn
  // this into an unauthenticated endpoint that removes plans.
  if (!process.env.CRON_SECRET) {
    console.error("[cron/ambassador-terms] CRON_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("ambassadors")
    .select("id, user_id")
    .not("user_id", "is", null)
    .not("pro_until", "is", null)
    .lt("pro_until", now);
  if (error) {
    console.error("[cron/ambassador-terms] could not read ambassadors", error);
    return NextResponse.json({ error: "Could not read ambassadors" }, { status: 500 });
  }

  // No early return when nothing has expired, which is most days: the
  // emails below still have to run. (An early return here once skipped them.)
  const userIds = [...new Set((due ?? []).map((a) => a.user_id as string))];
  let endedIds: string[] = [];

  if (userIds.length > 0) {
    // The guard lives in the WHERE, not in a read beforehand, so a
    // subscription that lands between the two cannot be overwritten.
    const { data: ended, error: endError } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "free",
        subscription_status: null,
        cancel_at_period_end: false,
        current_period_end: null,
        updated_at: now,
      })
      .in("id", userIds)
      .eq("plan", "pro")
      .is("stripe_subscription_id", null)
      .select("id");
    if (endError) {
      console.error("[cron/ambassador-terms] could not end terms", endError);
      return NextResponse.json({ error: "Could not end terms" }, { status: 500 });
    }

    // The admin audit log (admin_log) needs an admin session, which a cron
    // does not have, so the record of what ended is the function log.
    // pro_until on the ambassador row already says when, for the admin table.
    endedIds = (ended ?? []).map((row) => row.id);
    if (endedIds.length > 0) {
      console.info("[cron/ambassador-terms] ended free Pro for", endedIds);
    }
  }

  // Review trials that have run out: Standard while an ambassador application
  // was read, no Stripe subscription (grantApplicantTrial). my_generation_gate()
  // already stopped them on time; this tidies the row so every page agrees.
  // Same predicate as the gate, guarded in the WHERE so a subscription that
  // lands in between is never touched.
  const { data: trialsEnded, error: trialError } = await supabaseAdmin
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: null,
      cancel_at_period_end: false,
      current_period_end: null,
      updated_at: now,
    })
    .eq("subscription_status", "trialing")
    .is("stripe_subscription_id", null)
    .lt("current_period_end", now)
    .select("id");
  if (trialError) {
    console.error("[cron/ambassador-terms] could not end review trials", trialError);
  } else if ((trialsEnded ?? []).length > 0) {
    console.info("[cron/ambassador-terms] ended review trials for", trialsEnded!.map((r) => r.id));
  }

  const reminders = await sendEndReminders(new Date());
  const summaries = await sendTaxSummaries(new Date());
  const activity = await sendActivityNotices(new Date());

  return NextResponse.json({
    ok: true,
    ended: endedIds.length,
    trialsEnded: (trialsEnded ?? []).length,
    reminders,
    summaries,
    activity,
  });
}

interface Contact {
  id: string;
  firstName: string;
  email: string;
  code: string;
  agreementEndsAt: string | null;
}

/** Where to write to an ambassador: the contact email on their application,
 *  which they can update, falling back to the one on the ambassador row. */
async function contactsFor(ids: string[]): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (ids.length === 0) return out;

  const { data: ambassadors } = await supabaseAdmin
    .from("ambassadors")
    .select("id, full_name, email, agreement_ends_at, application_id")
    .in("id", ids);
  const appIds = (ambassadors ?? []).map((a) => a.application_id).filter(Boolean) as string[];
  const [{ data: apps }, { data: codes }] = await Promise.all([
    appIds.length
      ? supabaseAdmin.from("ambassador_applications").select("id, first_name, email").in("id", appIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; email: string }[] }),
    supabaseAdmin
      .from("ambassador_codes")
      .select("ambassador_id, code, created_at")
      .in("ambassador_id", ids)
      .order("created_at", { ascending: true }),
  ]);
  const appById = new Map((apps ?? []).map((a) => [a.id, a]));

  for (const a of ambassadors ?? []) {
    const app = a.application_id ? appById.get(a.application_id) : undefined;
    out.set(a.id, {
      id: a.id,
      firstName: app?.first_name ?? String(a.full_name).split(" ")[0],
      email: app?.email ?? a.email,
      code: (codes ?? []).find((c) => c.ambassador_id === a.id)?.code ?? "",
      agreementEndsAt: a.agreement_ends_at,
    });
  }
  return out;
}

const longDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });

/** A month before the agreement ends: ask whether they want to carry on. */
async function sendEndReminders(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  // Claim first: only rows still unstamped, so a second run cannot double send.
  const { data: claimed, error } = await supabaseAdmin
    .from("ambassadors")
    .update({ end_reminder_sent_at: now.toISOString() })
    .eq("status", "active")
    .is("end_reminder_sent_at", null)
    .gt("agreement_ends_at", now.toISOString())
    .lte("agreement_ends_at", horizon)
    .select("id");
  if (error) {
    console.error("[cron/ambassador-terms] could not claim reminders", error);
    return 0;
  }

  const contacts = await contactsFor((claimed ?? []).map((r) => r.id));
  let sent = 0;
  for (const c of contacts.values()) {
    // A reserved test address (@jooma.test) is never sent to, and keeps its
    // claim so it is not retried every day.
    if (isUndeliverable(c.email) || !c.agreementEndsAt) continue;
    const ok = await sendTemplate("ambassador_agreement_ending", c.email, {
      firstName: c.firstName,
      endDate: longDate(c.agreementEndsAt),
      code: c.code,
    });
    if (ok) {
      sent += 1;
    } else {
      // Release the claim so tomorrow's run tries again.
      await supabaseAdmin.from("ambassadors").update({ end_reminder_sent_at: null }).eq("id", c.id);
      console.warn("[cron/ambassador-terms] reminder not sent, will retry", c.id);
    }
  }
  return sent;
}

/** Each April: what each ambassador was paid in the tax year just ended. */
async function sendTaxSummaries(now: Date): Promise<number> {
  const taxYear = lastCompletedTaxYear(now);
  const { from, to } = taxYearBounds(taxYear);

  const { data: rows, error } = await supabaseAdmin
    .from("ambassador_commissions")
    .select("ambassador_id, amount_pence, status, paid_at")
    .eq("status", "paid")
    .gte("paid_at", from.toISOString())
    .lt("paid_at", to.toISOString());
  if (error) {
    console.error("[cron/ambassador-terms] could not read paid commission", error);
    return 0;
  }

  const byAmbassador = new Map<string, { amount_pence: number; status: string; paid_at: string | null }[]>();
  for (const r of rows ?? []) {
    const list = byAmbassador.get(r.ambassador_id) ?? [];
    list.push(r);
    byAmbassador.set(r.ambassador_id, list);
  }
  if (byAmbassador.size === 0) return 0;

  const { data: done } = await supabaseAdmin
    .from("ambassador_tax_summaries")
    .select("ambassador_id")
    .eq("tax_year", taxYear);
  const already = new Set((done ?? []).map((d) => d.ambassador_id));
  const due = [...byAmbassador.keys()].filter((id) => !already.has(id));
  const contacts = await contactsFor(due);

  const lastDay = new Date(to.getTime() - 86_400_000);
  const period = `${longDate(from)} to ${longDate(lastDay)}`;
  let sent = 0;

  for (const id of due) {
    const c = contacts.get(id);
    if (!c) continue;
    const summary = summariseTaxYear(byAmbassador.get(id) ?? [], taxYear);
    if (summary.payments === 0) continue;

    // Claim: the unique (ambassador_id, tax_year) row lets one run win.
    const { data: claim, error: claimError } = await supabaseAdmin
      .from("ambassador_tax_summaries")
      .insert({
        ambassador_id: id,
        tax_year: taxYear,
        paid_pence: summary.paidPence,
        payments: summary.payments,
      })
      .select("id")
      .single();
    if (claimError || !claim) continue;
    if (isUndeliverable(c.email)) continue;

    const ok = await sendTemplate("ambassador_tax_summary", c.email, {
      firstName: c.firstName,
      taxYear,
      totalPaid: gbp(summary.paidPence),
      payments: String(summary.payments),
      period,
    });
    if (ok) {
      sent += 1;
    } else {
      await supabaseAdmin.from("ambassador_tax_summaries").delete().eq("id", claim.id);
      console.warn("[cron/ambassador-terms] tax summary not sent, will retry", id);
    }
  }
  return sent;
}

interface ActivityRow {
  id: string;
  approved_at: string;
  application_id: string;
  quiet_notice_sent_at: string | null;
  review_started_at: string | null;
}

/**
 * Keeping your place (clause 5): a heads-up after one quiet month, Under review
 * after two, and both cleared once a new subscriber arrives. Only ambassadors
 * whose signed agreement has the clause; activityStage() reads the version.
 */
async function sendActivityNotices(now: Date): Promise<{ quiet: number; review: number; closed: number }> {
  const out = { quiet: 0, review: 0, closed: 0 };

  const { data: rows, error } = await supabaseAdmin
    .from("ambassadors")
    .select("id, approved_at, application_id, quiet_notice_sent_at, review_started_at")
    .eq("status", "active")
    .not("approved_at", "is", null)
    .not("application_id", "is", null);
  if (error) {
    console.error("[cron/ambassador-terms] could not read ambassadors for activity", error);
    return out;
  }
  const ambassadors = (rows ?? []) as ActivityRow[];
  if (ambassadors.length === 0) return out;

  const ids = ambassadors.map((a) => a.id);
  const [{ data: apps }, { data: referrals }] = await Promise.all([
    supabaseAdmin
      .from("ambassador_applications")
      .select("id, agreement_version")
      .in("id", ambassadors.map((a) => a.application_id)),
    supabaseAdmin
      .from("ambassador_referrals")
      .select("ambassador_id, user_id, first_paid_at")
      .in("ambassador_id", ids)
      .not("first_paid_at", "is", null),
  ]);
  const versionByApp = new Map((apps ?? []).map((a) => [a.id, a.agreement_version as string | null]));

  // Who is paying today, by ambassador_referral_state()'s rule: a real Stripe
  // subscription on a paid plan, never a comp.
  const paidUserIds = [...new Set((referrals ?? []).map((r) => r.user_id as string))];
  const paying = new Set<string>();
  for (let i = 0; i < paidUserIds.length; i += 500) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, plan, subscription_status, stripe_subscription_id")
      .in("id", paidUserIds.slice(i, i + 500));
    for (const p of profiles ?? []) {
      if (
        p.stripe_subscription_id &&
        (p.subscription_status === "active" || p.subscription_status === "past_due") &&
        (p.plan === "standard" || p.plan === "pro" || p.plan === "max")
      ) {
        paying.add(p.id);
      }
    }
  }

  const toEmail: { id: string; template: "ambassador_quiet_month" | "ambassador_under_review"; deadline?: Date }[] = [];

  for (const a of ambassadors) {
    const mine = (referrals ?? []).filter((r) => r.ambassador_id === a.id);
    const last = mine.reduce<number>((max, r) => Math.max(max, new Date(r.first_paid_at as string).getTime()), 0);
    const stage = activityStage({
      approvedAt: new Date(a.approved_at),
      lastFirstPaidAt: last ? new Date(last) : null,
      activeSubscribers: mine.filter((r) => paying.has(r.user_id as string)).length,
      agreementVersion: versionByApp.get(a.application_id) ?? null,
      now,
    });

    if (stage === "ok" || stage === "exempt") {
      // A new subscriber: the review closes and nothing changes.
      if (a.quiet_notice_sent_at || a.review_started_at) {
        const { error: clearError } = await supabaseAdmin
          .from("ambassadors")
          .update({ quiet_notice_sent_at: null, review_started_at: null, review_deadline: null })
          .eq("id", a.id)
          .eq("status", "active");
        if (!clearError) out.closed += 1;
      }
    } else if (stage === "quiet" && !a.quiet_notice_sent_at) {
      const { data: claimed } = await supabaseAdmin
        .from("ambassadors")
        .update({ quiet_notice_sent_at: now.toISOString() })
        .eq("id", a.id)
        .is("quiet_notice_sent_at", null)
        .select("id");
      if ((claimed ?? []).length > 0) toEmail.push({ id: a.id, template: "ambassador_quiet_month" });
    } else if (stage === "review" && !a.review_started_at) {
      // Stamps the quiet notice too, so a first run that lands straight on
      // review does not send the one-month email afterwards.
      const deadline = reviewDeadline(now);
      const { data: claimed } = await supabaseAdmin
        .from("ambassadors")
        .update({
          review_started_at: now.toISOString(),
          review_deadline: deadline.toISOString(),
          quiet_notice_sent_at: a.quiet_notice_sent_at ?? now.toISOString(),
        })
        .eq("id", a.id)
        .is("review_started_at", null)
        .select("id");
      if ((claimed ?? []).length > 0) toEmail.push({ id: a.id, template: "ambassador_under_review", deadline });
    }
    // "hold" (August) and a review already running change nothing.
  }

  const contacts = await contactsFor(toEmail.map((e) => e.id));
  for (const e of toEmail) {
    const c = contacts.get(e.id);
    if (!c || isUndeliverable(c.email)) continue;
    const ok =
      e.template === "ambassador_quiet_month"
        ? await sendTemplate("ambassador_quiet_month", c.email, { firstName: c.firstName, code: c.code })
        : await sendTemplate("ambassador_under_review", c.email, {
            firstName: c.firstName,
            code: c.code,
            deadline: longDate(e.deadline!),
          });
    if (ok) {
      if (e.template === "ambassador_quiet_month") out.quiet += 1;
      else out.review += 1;
    } else {
      // Release the claim so tomorrow's run tries again.
      await supabaseAdmin
        .from("ambassadors")
        .update(
          e.template === "ambassador_quiet_month"
            ? { quiet_notice_sent_at: null }
            : { review_started_at: null, review_deadline: null },
        )
        .eq("id", e.id);
      console.warn("[cron/ambassador-terms] activity email not sent, will retry", e.template, e.id);
    }
  }
  return out;
}

// Vercel Cron sends GET. POST is kept for a manual run with the same secret,
// matching the other cron routes.
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
