// Jo editing a visitor's free try, from /create.
//
// The same turn as /api/jo (lib/jo/pipeline), behind the guest gate instead of
// a session: the signed cookie, the hourly per IP brake shared with the old
// guest chat, and GUEST_JO_PROMPTS messages per free generation. A prompt is
// taken BEFORE the model is called, atomically in the database, and given
// back if the turn produced nothing, so a broken turn never costs the visitor
// one and a burst of requests cannot get past the limit.
import { NextResponse } from "next/server";
import { JO_REFUSAL_HEADER, runJoTurn } from "@/app/lib/jo/pipeline";
import type { JoTurnBody } from "@/app/lib/jo/types";
import { clientIp, guestCallAllowed, readGuestId, spendTrialJoPrompt, trialJoPromptsUsed } from "@/app/lib/guest";
import { GUEST_JO_PROMPTS, joPromptsLeft } from "@/app/lib/trial-limits";

export const maxDuration = 120;

const PER_HOUR = 40;
const LEFT_HEADER = "x-jo-prompts-left";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function limitReached() {
  return NextResponse.json(
    { error: "That's your free messages with Jo for this one. Sign up free to keep editing.", code: "jo_trial_limit", left: 0 },
    { status: 403, headers: { [LEFT_HEADER]: "0" } },
  );
}

/** How many prompts are left on one free try, for the panel's counter. */
export async function GET(req: Request) {
  const guestId = await readGuestId();
  const trialId = new URL(req.url).searchParams.get("trialId") ?? "";
  if (!guestId || !UUID.test(trialId)) return NextResponse.json({ left: GUEST_JO_PROMPTS });
  const used = await trialJoPromptsUsed(trialId, guestId);
  return NextResponse.json({ left: used === null ? GUEST_JO_PROMPTS : joPromptsLeft(used) });
}

export async function POST(req: Request) {
  const guestId = await readGuestId();
  if (!guestId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: JoTurnBody;
  try {
    body = (await req.json()) as JoTurnBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot. A bot gets an empty answer and learns nothing about the field.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return new Response(JSON.stringify({ reply: "", clarify: null, ops: [], summary: "" }), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const trialId = typeof body.trialId === "string" ? body.trialId : "";
  if (!UUID.test(trialId)) return NextResponse.json({ error: "Missing free try" }, { status: 400 });

  if (!(await guestCallAllowed(clientIp(req), "guest_chat_ip", PER_HOUR))) {
    return NextResponse.json(
      { error: "Jo needs a short break. Try again in a few minutes, or sign up to keep going." },
      { status: 429 },
    );
  }

  const spent = await spendTrialJoPrompt(trialId, guestId, GUEST_JO_PROMPTS);
  if (!spent) return limitReached();

  const giveBack = () => spendTrialJoPrompt(trialId, guestId, GUEST_JO_PROMPTS, true);

  // A streamed turn that fails gives its prompt back from inside the stream;
  // one answered without the model (an error, or the off-topic refusal) gives
  // it back here.
  const response = await runJoTurn(body, {
    guest: { runId: spent.runId },
    onFinish: async (ok) => {
      if (!ok) await giveBack();
    },
  });
  const unanswered = !response.ok || response.headers.has(JO_REFUSAL_HEADER);
  if (unanswered) await giveBack();

  const headers = new Headers(response.headers);
  // The count if this turn goes through. A stream that fails part way gives its
  // prompt back, which the next GET shows.
  headers.set(LEFT_HEADER, String(joPromptsLeft(unanswered ? spent.used - 1 : spent.used)));
  return new Response(response.body, { status: response.status, headers });
}
