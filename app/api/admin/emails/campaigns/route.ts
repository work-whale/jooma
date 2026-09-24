// Create a bulk email and start sending it. Manual sends go out straight away;
// there is no scheduling (the nightly cron only runs the signup reminders).
//
// The campaign row is written through admin_create_email_campaign() on the
// admin's OWN session, so the database re-checks the permission and the audit
// log records who sent it. Only the next step, turning the audience into
// addresses, uses the service role, because those addresses must never be
// returned to the browser.
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { mailerConfigured } from "@/app/lib/email";
import { materialiseCampaign } from "@/app/lib/email-campaigns";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import {
  AUDIENCES,
  contentToRow,
  isPurpose,
  parseEmailList,
  validateBroadcast,
  type AudienceKind,
  type BroadcastContent,
} from "@/app/lib/email-templates/broadcast";

export const dynamic = "force-dynamic";

interface Body {
  purpose?: string;
  templateId?: string | null;
  content?: BroadcastContent;
  audience?: { kind?: string; emails?: string[] | string };
}

export async function POST(req: Request) {
  const gate = await requireAdminRoute("send_email_campaigns");
  if (gate.error) return gate.error;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { purpose, content } = body;
  if (!isPurpose(purpose) || !content) {
    return NextResponse.json({ error: "Choose what kind of email this is." }, { status: 400 });
  }
  const problem = validateBroadcast(content);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const kind = body.audience?.kind;
  if (!kind || !(AUDIENCES as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Choose who it goes to." }, { status: 400 });
  }
  const audience: { kind: AudienceKind; emails?: string[] } = { kind: kind as AudienceKind };
  if (kind === "emails") {
    const raw = body.audience?.emails;
    audience.emails = parseEmailList(Array.isArray(raw) ? raw.join("\n") : (raw ?? ""));
  }

  // Refuse before writing anything: a campaign created now with no provider
  // would sit in History claiming to be sending.
  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "SendGrid is not configured here, so nothing can send." },
      { status: 503 },
    );
  }

  const { data: id, error } = await gate.supabase.rpc("admin_create_email_campaign", {
    payload: {
      ...contentToRow(content),
      purpose,
      template_id: body.templateId || null,
      audience,
      scheduled_for: null,
    },
  });
  if (error || !id) {
    return NextResponse.json({ error: error?.message ?? "Could not create the email." }, { status: 400 });
  }

  try {
    const recipients = await materialiseCampaign(id as string);
    return NextResponse.json({ id, status: recipients === 0 ? "sent" : "sending", recipients });
  } catch (e) {
    // Nothing went out. Close the row as failed rather than leave it waiting
    // for a scheduler that does not pick manual sends up.
    console.error("[campaigns] materialise failed", id, e);
    await supabaseAdmin
      .from("email_campaigns")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "scheduled");
    return NextResponse.json(
      { error: "Could not work out who this goes to, so nothing was sent. Try again." },
      { status: 500 },
    );
  }
}
