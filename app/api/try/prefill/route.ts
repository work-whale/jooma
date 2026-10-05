// Jo's first pass for a guest on /create: read the topic from the hero box and
// fill in what it implies (the year group, the slide count, the curriculum).
// One cheap call through the same selectTool the signed in assistant uses,
// forced to the tool the visitor chose. The fields come back validated and
// encoded, ready for useToolLaunch to type into the form.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { selectTool } from "@/app/lib/assistant-pipeline";
import { encodePrefill } from "@/app/lib/toolPrefill";
import { clientIp, guestCallAllowed, readGuestId } from "@/app/lib/guest";
import { guestSlugFor } from "@/app/lib/guest-tools";

/** Shared with Ask Jo: both are a model call per request. */
const PER_HOUR = 40;

export async function POST(req: Request) {
  const guestId = await readGuestId();
  if (!guestId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { tool?: string; topic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = guestSlugFor(body.tool);
  const topic = (body.topic ?? "").trim().slice(0, 300);
  if (!slug || !topic) return NextResponse.json({ prefill: null });

  if (!(await guestCallAllowed(clientIp(req), "guest_chat_ip", PER_HOUR))) {
    return NextResponse.json({ error: "Please wait a little before trying again." }, { status: 429 });
  }

  const decision = await selectTool([{ role: "user", content: topic }], null, {
    forcedSlug: slug,
    canAsk: false,
    runId: randomUUID(),
  });
  if (decision?.kind !== "prefill") return NextResponse.json({ prefill: null });

  return NextResponse.json({ prefill: encodePrefill(decision.prefill) });
}
