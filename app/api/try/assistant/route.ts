// Ask Jo, for a guest on /create.
//
// The same turn as the signed in assistant (lib/assistant-pipeline): the
// off-topic guardrail, the tool-selection pass and the streamed reply, with the
// same headers. Three differences, all passed as `guest`: Jo may only fill or
// ask about the one tool the visitor is using, nothing is saved as a chat, and
// the admin model lab is out of reach. Throttled per IP, with the prefill.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runAssistantTurn, type AssistantBody } from "@/app/lib/assistant-pipeline";
import { clientIp, guestCallAllowed, readGuestId } from "@/app/lib/guest";
import { guestSlugFor, guestToolName } from "@/app/lib/guest-tools";

const PER_HOUR = 40;

export async function POST(req: Request) {
  const guestId = await readGuestId();
  if (!guestId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: AssistantBody & { guestTool?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = guestSlugFor(body.guestTool);
  if (!slug) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });

  if (!(await guestCallAllowed(clientIp(req), "guest_chat_ip", PER_HOUR))) {
    return NextResponse.json(
      { error: "Jo needs a short break. Try again in a few minutes, or sign up to keep going." },
      { status: 429 },
    );
  }

  const name = guestToolName(slug);
  return runAssistantTurn(
    {
      messages: body.messages,
      // Not forced: a visitor asking "which reading level should I pick?"
      // wants an answer, not the form refilled. Jo fills it when they describe
      // what they want made.
      tool: null,
      askCount: body.askCount,
      // No attachments for guests.
      attachment: null,
    },
    {
      guest: {
        allowedSlugs: [slug],
        runId: randomUUID(),
        systemExtra: `\n\nThis visitor is trying Jooma's ${name} tool without an account. Its form is on screen beside this chat and they will press Generate themselves. Help them choose its settings, or fill it from what they describe. Keep every reply to two or three short sentences.`,
      },
    },
  );
}
