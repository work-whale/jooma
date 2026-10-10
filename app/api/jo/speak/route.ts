// Jo's voice: one of Jo's replies, read aloud.
//
// gpt-4o-mini-tts, which takes a style instruction, so the voice can be asked
// for a warm British delivery. Signed in teachers only: the plan gate and the
// spend ceiling run in proxy.ts (isAssistantRequest, COST_BEARING_PATHS), and
// a guest has no route here at all.
import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/app/lib/openai";
import { currentUserId, recordAssetCost } from "@/app/lib/usage";

export const maxDuration = 60;

/** Long enough for a reply and its summary; a cap so a forged body cannot
 *  run up a bill. */
const MAX_CHARS = 1_500;
/** gpt-4o-mini-tts is billed by audio token, roughly $0.015 a minute of
 *  speech. Per character that comes out close to tts-1's $15 per million, so
 *  the same rate is used here as an estimate. */
const USD_PER_1M_CHARS = 15.0;

const VOICE = "nova";
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
    const speech = await getOpenAI().audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: VOICE,
      input: text,
      instructions: STYLE,
      response_format: "mp3",
    });
    const audio = await speech.arrayBuffer();
    // Awaited: the instance can be frozen once the response is returned, and
    // this row feeds the spend ceiling.
    await recordAssetCost("jo", "audio", text.length, (text.length / 1_000_000) * USD_PER_1M_CHARS, "speak", null, userId);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("[jo/speak] failed:", err);
    return NextResponse.json({ error: "Jo couldn't read that aloud. Please try again." }, { status: 502 });
  }
}
