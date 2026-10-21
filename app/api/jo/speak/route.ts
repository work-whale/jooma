// Jo's voice: one of Jo's replies, read aloud.
//
// Through lib/speech, which takes a style instruction, so the voice can be
// asked for a warm British delivery. Signed in teachers only: the plan gate and
// the spend ceiling run in proxy.ts (isAssistantRequest, COST_BEARING_PATHS),
// and a guest has no route here at all.
import { NextRequest, NextResponse } from "next/server";
import { JO_VOICE, saidVerbatim, synthesize } from "@/app/lib/speech";
import { currentUserId, recordAssetCost } from "@/app/lib/usage";

export const maxDuration = 60;

/** Long enough for a reply and its summary; a cap so a forged body cannot
 *  run up a bill. */
const MAX_CHARS = 1_500;

const STYLE =
  "A warm, friendly British primary school teacher speaking to a colleague. Southern English accent. Calm, clear and encouraging, at a relaxed pace.";

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  text = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  if (!text) return NextResponse.json({ error: "Nothing to read" }, { status: 400 });

  const userId = await currentUserId();
  try {
    const speech = await synthesize(text, { voice: JO_VOICE, style: STYLE });
    if (!saidVerbatim(text, speech.transcript)) {
      console.warn("[jo/speak] said something other than the text:", { text, said: speech.transcript });
    }
    // Awaited: the instance can be frozen once the response is returned, and
    // this row feeds the spend ceiling.
    await recordAssetCost("jo", "audio", text.length, speech.costUsd, "speak", null, userId);
    return new Response(new Uint8Array(speech.mp3), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("[jo/speak] failed:", err);
    return NextResponse.json({ error: "Jo couldn't read that aloud. Please try again." }, { status: 502 });
  }
}
