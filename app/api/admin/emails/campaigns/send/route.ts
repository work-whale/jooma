// Send the next batch of a campaign that is already sending.
//
// The Compose tab calls this in a loop after "Send now" and moves its progress
// bar with each answer. If the admin closes the tab part way, the rest waits
// until someone presses Resume sending in History, which calls this same loop.
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { mailerConfigured } from "@/app/lib/email";
import { sendBatch } from "@/app/lib/email-campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const gate = await requireAdminRoute("send_email_campaigns");
  if (gate.error) return gate.error;

  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "SendGrid is not configured here, so nothing can send." },
      { status: 503 },
    );
  }

  let id: string | undefined;
  try {
    ({ id } = (await req.json()) as { id?: string });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "No such email." }, { status: 400 });
  }

  try {
    return NextResponse.json(await sendBatch(id));
  } catch (e) {
    console.error("[campaigns/send] batch failed", id, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sending failed." },
      { status: 500 },
    );
  }
}
