import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { sendTemplate, siteUrl } from "@/app/lib/email";
import { ADMIN_ASSIGNABLE_PLANS } from "@/app/lib/plans";
import { newInviteToken, hashInviteToken, inviteExpiry } from "@/app/lib/invites";

// Invites teachers by email.
//
// An invite is a row in `pending_invites` plus an emailed link to
// /signup?invite=<token>. The teacher then signs up normally — Google or email
// — and /api/invites/accept matches, verifies and consumes the invite.
//
// This deliberately does NOT use auth.admin.generateLink, which the earlier
// version did. That created the auth.users row up front, which broke the flow
// twice over: the resulting user has no password, so /create-password's
// signUp() failed with "already registered" and left the teacher stuck; and the
// emailed verify link returns its session in the URL fragment, which never
// reaches the server, so /auth/callback couldn't see it and bounced them to
// /login with "Could not sign you in."
//
// Sequential, not Promise.all: 200 parallel calls would hit SendGrid hard, and
// per-address results are more useful to the admin than a single rejected
// promise.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAILS = 200;

type Result = {
  email: string;
  status: "sent" | "exists" | "failed";
  error?: string;
};

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("invite_teachers");
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const rawEmails: unknown = body?.emails;
  const plan = typeof body?.plan === "string" ? body.plan : "free";

  if (!Array.isArray(rawEmails)) {
    return NextResponse.json({ error: "emails must be an array." }, { status: 400 });
  }
  // Validate the plan server-side too. The dropdown offers "No plan" (the
  // invitee subscribes themselves, with the trial) and the plans on sale, and a
  // crafted request must not be able to place someone on an unbuilt plan.
  if (!ADMIN_ASSIGNABLE_PLANS.some((p) => p.id === plan)) {
    return NextResponse.json({ error: `Can't invite anyone onto the ${plan} plan.` }, { status: 400 });
  }

  const emails = [
    ...new Set(
      rawEmails
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  ];

  if (emails.length === 0) {
    return NextResponse.json({ error: "No valid email addresses." }, { status: 400 });
  }
  if (emails.length > MAX_EMAILS) {
    return NextResponse.json(
      { error: `That's ${emails.length} addresses — ${MAX_EMAILS} is the most we'll send at once.` },
      { status: 400 },
    );
  }

  const results: Result[] = [];

  // Addresses that already belong to a fully onboarded teacher. One call for
  // the whole batch rather than a lookup per address — see
  // existing_member_emails() in 20260812000200_invite_tokens.sql.
  //
  // Inviting an existing member is reported as "exists" rather than sent: they
  // have nothing to accept, and re-inviting would otherwise be a way to quietly
  // change an established teacher's plan.
  const { data: memberRows } = await gate.supabase.rpc("existing_member_emails", {
    p_emails: emails,
  });
  const members = new Set(
    (memberRows ?? []).map((r: { email: string }) => r.email.toLowerCase()),
  );

  for (const email of emails) {
    if (members.has(email)) {
      results.push({ email, status: "exists" });
      continue;
    }

    const token = newInviteToken();

    // Re-inviting an address replaces its open invite, so the newest link is
    // the only one that works and an admin isn't blocked by a stale invite
    // they've forgotten about. Delete-then-insert rather than upsert: the
    // uniqueness is enforced by a PARTIAL index (lower(email) where accepted_at
    // is null), which ON CONFLICT can't infer from a column name.
    // One statement so the replace can't half-happen, and matched on
    // lower(email) to mirror the partial unique index — a row stored with
    // different casing would survive an exact-match delete and then collide on
    // the insert. See upsert_invite() in 20260812000200_invite_tokens.sql.
    //
    // gate.supabase (the admin's own session), not supabaseAdmin: the function
    // gates on is_admin(), which reads auth.uid() and is therefore false under
    // the service-role key. requireAdminRoute above already proved the caller.
    const { error } = await gate.supabase.rpc("upsert_invite", {
      p_email: email,
      p_plan: plan,
      p_token_hash: hashInviteToken(token),
      p_invited_by: gate.user.id,
      p_expires_at: inviteExpiry(),
    });

    if (error) {
      results.push({ email, status: "failed", error: "Could not create the invite." });
      continue;
    }

    const sent = await sendTemplate("teacher_invite", email, {
      inviteUrl: `${siteUrl()}/signup?invite=${encodeURIComponent(token)}`,
      inviterName: gate.user.email ?? "",
    });

    results.push(
      sent
        ? { email, status: "sent" }
        : { email, status: "failed", error: "Account created, but the email couldn't be sent." },
    );
  }

  const sent = results.filter((r) => r.status === "sent").length;
  await gate.supabase.rpc("admin_log_invites", {
    p_sent: sent,
    p_requested: emails.length,
    p_plan: plan,
  });

  // 200 even when some rows failed: the client renders a per-address report,
  // which is more useful than a blanket error for a partially-successful batch.
  return NextResponse.json({ sent, requested: emails.length, results });
}
