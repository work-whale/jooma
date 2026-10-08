// A signed out visitor's free Comprehension, from /create.
//
// The same prompt and model as /api/comprehension-generator (both build their
// messages through lib/comprehension-prompt), behind the guest gate instead of
// a session: the signed cookie, today's free try for this guest and this IP,
// and the admin switch and daily cap. The finished text is kept in
// trial_generations until the visitor signs up and it moves into their library.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { streamChat } from "@/app/lib/usage";
import { modelFor } from "@/app/lib/tool-model";
import { comprehensionMessages, type GenerateRequest } from "@/app/lib/comprehension-prompt";
import { finishSheet } from "@/app/lib/sheets/context";
import {
  checkTrial,
  clientIp,
  ensureGuestId,
  finishTrialRun,
  flagGuestWork,
  hashIp,
  startTrialRun,
  trialSecret,
} from "@/app/lib/guest";
import { trialRefusalMessage } from "@/app/lib/trial-limits";

type Body = GenerateRequest & { website?: string; formState?: Record<string, unknown> };

export async function POST(req: Request) {
  const secret = trialSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Free tries are not available right now.", reason: "disabled" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // Honeypot. A bot that fills every field gets an empty, successful stream and
  // learns nothing; a 4xx would teach it which field to leave alone.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return new Response("", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const built = comprehensionMessages(body);
  if ("error" in built) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const guestId = await ensureGuestId();
  if (!guestId) {
    return NextResponse.json({ error: "Free tries are not available right now.", reason: "disabled" }, { status: 403 });
  }
  const ipHash = hashIp(clientIp(req), secret);

  const decision = await checkTrial(guestId, ipHash);
  if (!decision.ok) {
    return NextResponse.json(
      { error: trialRefusalMessage(decision.reason), reason: decision.reason },
      { status: decision.reason === "disabled" ? 403 : 429 },
    );
  }

  const runId = randomUUID();
  const title = (body.textSource === "generate" ? body.topic : "") || "Comprehension";
  const trialId = await startTrialRun({
    guestId,
    ipHash,
    tool: "comprehension-generator",
    runId,
    title,
    // The raw form, so the claimed run restores into the form exactly as the
    // visitor left it. Falls back to the request if an old page omitted it.
    params: body.formState ?? (body as unknown as Record<string, unknown>),
  });
  if (!trialId) {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  // Set now, while the response can still carry headers. A failed run leaves
  // nothing to claim, and the claim route simply finds no finished rows.
  await flagGuestWork();

  let streamed: Response;
  try {
    streamed = await streamChat({
      toolSlug: "comprehension-generator",
      ...(await modelFor("comprehension-generator", "gpt-4o")),
      max_completion_tokens: 8000,
      messages: built.messages,
      response_format: built.response_format,
      runId,
      onComplete: async (text, ok) => {
        // Stored as the finished sheet, exactly as the browser normalises it,
        // so a claimed run opens in the tool as a sheet (with the teacher's own
        // passage placed back where the model never saw it).
        const sheet = ok ? finishSheet("comprehension", text, body) : null;
        await finishTrialRun(
          trialId,
          sheet ? { status: "done", output: { text: sheet } } : { status: "failed" },
        );
      },
    });
  } catch (err) {
    console.error("[try/comprehension] generation failed to start:", err);
    await finishTrialRun(trialId, { status: "failed" });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const headers = new Headers(streamed.headers);
  headers.set("x-trial-id", trialId);
  return new Response(streamed.body, { status: streamed.status, headers });
}
