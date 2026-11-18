import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { sendBroadcastEmail } from "@/app/lib/email";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";
import { e16Group, e16Notice, type LaunchMove } from "@/app/lib/launch-day";

// E16, the launch-day service notice (owner's decision, 18 Nov: a plain notice
// to every account about what launch day did to it, whatever their marketing
// consent). Run from Admin, Plans, AFTER launch_v45_move_accounts, because the
// group is read back from each profile (e16Group).
//
//   POST {}                       preview: how many of each group are still due
//   POST { send: true, confirm }  send, with confirm === "SEND"
//
// The lifecycle_email_log row (key "E16") is the lock: it is written before the
// send, so a double click or a second admin can never send anyone two. Sending
// stops after a time budget and reports what is left; press again to continue.
// The admin check here is the security boundary, since everything below runs
// under the service role.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE = 500;
const BUDGET_MS = 240_000;
const KEY = "E16";

interface Row {
  id: string;
  plan: string | null;
  is_admin: boolean | null;
  trial_pending: boolean | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  deletion_scheduled_for: string | null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute();
  if (gate.error) return gate.error;

  const body = (await req.json().catch(() => null)) as { send?: unknown; confirm?: unknown } | null;
  const send = body?.send === true;
  if (send && body?.confirm !== "SEND") {
    return NextResponse.json({ error: "Type SEND to send the notice." }, { status: 400 });
  }

  const started = Date.now();
  const now = new Date();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jooma.ai";
  const due: Record<LaunchMove, number> = { free_trial_pending: 0, free: 0, trial_runs_out: 0, keep: 0 };
  let sent = 0;
  let failed = 0;
  let outOfTime = false;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, plan, is_admin, trial_pending, subscription_status, stripe_subscription_id, current_period_end, deletion_scheduled_for",
      )
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[admin/launch-notice] read failed", error);
      return NextResponse.json({ error: "Could not read accounts." }, { status: 500 });
    }
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    const { data: log } = await supabaseAdmin
      .from("lifecycle_email_log")
      .select("user_id")
      .eq("key", KEY)
      .in(
        "user_id",
        rows.map((r) => r.id),
      );
    const done = new Set(((log ?? []) as { user_id: string }[]).map((l) => l.user_id));

    for (const r of rows) {
      if (done.has(r.id)) continue;
      const group = e16Group(
        {
          plan: r.plan,
          isAdmin: Boolean(r.is_admin),
          trialPending: Boolean(r.trial_pending),
          subscriptionStatus: r.subscription_status,
          stripeSubscriptionId: r.stripe_subscription_id,
          currentPeriodEnd: r.current_period_end,
          deletionScheduled: r.deletion_scheduled_for !== null,
        },
        now,
      );
      if (!group) continue;
      if (!send || outOfTime) {
        due[group] += 1;
        continue;
      }
      if (Date.now() - started > BUDGET_MS) {
        outOfTime = true;
        due[group] += 1;
        continue;
      }

      const { data: auth } = await supabaseAdmin.auth.admin.getUserById(r.id);
      const to = auth?.user?.email;
      if (!to) continue;
      // The lock, before the send.
      const { error: lockError } = await supabaseAdmin
        .from("lifecycle_email_log")
        .insert({ user_id: r.id, key: KEY, status: "sent" });
      if (lockError) continue;

      const n = e16Notice(group, r.plan);
      const result = await sendBroadcastEmail(
        to,
        {
          subject: n.subject,
          html: lifecycleHtml(n.subject, n.body, n.button, site + n.path, `${site}/profile#email-settings`),
          text: `${n.body}\n\n${n.button}: ${site}${n.path}`,
        },
        { purpose: "service", oneClickUrl: null },
      );
      if (result.status === "sent") sent += 1;
      else {
        failed += 1;
        await supabaseAdmin
          .from("lifecycle_email_log")
          .update({ status: result.status === "skipped" ? "skipped" : "failed" })
          .eq("user_id", r.id)
          .eq("key", KEY);
      }
    }
    if (rows.length < PAGE) break;
  }

  return NextResponse.json({ due, sent, failed, finished: !outOfTime });
}
