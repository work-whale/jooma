// SendGrid's event webhook. Public by necessity: SendGrid has no session. The
// signature is the credential, checked against SENDGRID_WEBHOOK_PUBLIC_KEY
// (SendGrid dashboard: Settings, Mail Settings, Event Webhook, Signed Event
// Webhook). An unsigned or wrongly signed request writes nothing.
//
// The write goes through email_record_events(), granted to the service role
// only. It records delivery against bulk email recipients and turns hard
// bounces and spam complaints into opt-outs. See app/lib/sendgrid-events.ts for
// which events count.
//
// Answers fast and plainly: SendGrid retries anything that is not a 2xx, so a
// genuine server error should fail (and be retried), and a bad signature gets a
// 401 it will keep failing on, which shows in SendGrid's own webhook stats.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { mapEvents, verifySendgridSignature } from "@/app/lib/sendgrid-events";

export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
const TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

export async function POST(req: Request) {
  const key = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  if (!key) {
    console.warn("[sendgrid-events] SENDGRID_WEBHOOK_PUBLIC_KEY not set, refusing events");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // The raw text, not req.json(): the signature covers the exact bytes sent.
  const raw = await req.text();
  const ok = verifySendgridSignature(
    key,
    req.headers.get(SIGNATURE_HEADER) ?? "",
    req.headers.get(TIMESTAMP_HEADER) ?? "",
    raw,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature." }, { status: 401 });

  let events: unknown;
  try {
    events = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Expected a JSON array." }, { status: 400 });
  }

  const rows = mapEvents(events);
  if (rows.length === 0) return NextResponse.json({ ok: true, recorded: 0 });

  const { data, error } = await supabaseAdmin.rpc("email_record_events", { p_events: rows });
  if (error) {
    console.error("[sendgrid-events] record failed", error);
    return NextResponse.json({ error: "Could not record events." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
