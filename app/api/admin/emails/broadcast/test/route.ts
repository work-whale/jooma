// "Send test to me" on the Compose tab.
//
// Goes to the signed-in admin's own address and nowhere else. There is no "to"
// field on purpose: a test that could be aimed anywhere would be a way to send
// one-off mail as Jooma without a campaign or an audit entry.
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { mailerConfigured, sendBroadcastEmail } from "@/app/lib/email";
import {
  isPurpose,
  renderBroadcast,
  respectsOptOut,
  unsubscribePageUrl,
  validateBroadcast,
  type BroadcastContent,
} from "@/app/lib/email-templates/broadcast";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireAdminRoute("send_email_campaigns");
  if (gate.error) return gate.error;

  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "SendGrid is not configured here, so nothing can send." },
      { status: 503 },
    );
  }

  let payload: { purpose?: string; content?: BroadcastContent };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { purpose, content } = payload;
  if (!isPurpose(purpose) || !content) {
    return NextResponse.json({ error: "Choose what kind of email this is." }, { status: 400 });
  }
  const problem = validateBroadcast(content);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const to = gate.user.email;
  if (!to) return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });

  const { data: profile } = await gate.supabase
    .from("profiles")
    .select("first_name")
    .eq("id", gate.user.id)
    .maybeSingle();

  const rendered = renderBroadcast(
    content,
    { email: to, firstName: profile?.first_name ?? null },
    // A token that matches no recipient row: the link shows the real page, and
    // pressing the button there does nothing.
    { purpose, unsubscribeUrl: respectsOptOut(purpose) ? unsubscribePageUrl("test") : null },
  );

  const outcome = await sendBroadcastEmail(
    to,
    { ...rendered, subject: `[Test] ${rendered.subject}` },
    { purpose, oneClickUrl: null },
  );

  if (outcome.status === "failed") {
    return NextResponse.json({ error: outcome.error ?? "Delivery failed." }, { status: 502 });
  }
  return NextResponse.json({ status: outcome.status, to });
}
