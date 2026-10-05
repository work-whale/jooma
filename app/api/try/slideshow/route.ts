// A signed out visitor's free Slides deck, from /create.
//
// The full deck, the same as a teacher's: lib/slideshow-pipeline runs here
// exactly as it does behind /api/generate-slideshow. Only the gate differs.
// Instead of a session, profile and plan, this checks the signed guest cookie,
// today's free try for this guest and this IP, the admin switch and daily cap,
// and the admin's on/off switch for the Slides tool itself.
//
// Like the teacher route, this is excluded from proxy.ts (the proxy buffers
// SSE), so every check lives here.
//
// The deck is assembled in the browser, by the same lib/deck-events code the
// editor uses, and handed back once through ./finalize. The server cannot
// assemble it itself: the video slide's layout measures text on a canvas.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { isToolEnabled } from "@/app/lib/tool-availability";
import { slideshowStream, SSE_HEADERS, type RequestBody } from "@/app/lib/slideshow-pipeline";
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
import { signTrialToken, TRIAL_RUN_HEADER, TRIAL_TOKEN_HEADER } from "@/app/lib/trial-token";

export const maxDuration = 120; // AI image gen can push past the default

type Body = RequestBody & { website?: string };

function refuse(status: number, error: string, reason?: string) {
  return NextResponse.json({ error, reason }, { status });
}

export async function POST(req: NextRequest) {
  const secret = trialSecret();
  if (!secret) return refuse(403, "Free tries are not available right now.", "disabled");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return refuse(400, "Invalid JSON");
  }

  // Honeypot: an empty stream that looks like success, so a bot learns nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return new Response(":\n\n", { headers: SSE_HEADERS });
  }
  delete body.website;

  if (!body.topic?.trim()) return refuse(400, "Missing topic");

  if (!(await isToolEnabled(supabaseAdmin, "slideshow"))) {
    return refuse(403, "Slides are unavailable for the moment.", "disabled");
  }

  const guestId = await ensureGuestId();
  if (!guestId) return refuse(403, "Free tries are not available right now.", "disabled");
  const ipHash = hashIp(clientIp(req), secret);

  const decision = await checkTrial(guestId, ipHash, "slideshow");
  if (!decision.ok) {
    return refuse(
      decision.reason === "disabled" ? 403 : 429,
      trialRefusalMessage(decision.reason, "Slides"),
      decision.reason,
    );
  }

  // Minted here, never accepted from the client: a guest cannot choose which
  // run their spend is filed under.
  const runId = randomUUID();
  const params = { ...body, runId } as Record<string, unknown>;
  const trialId = await startTrialRun({
    guestId,
    ipHash,
    tool: "slideshow",
    runId,
    title: body.topic.trim(),
    params,
  });
  if (!trialId) return refuse(500, "Something went wrong. Please try again.");
  await flagGuestWork();

  // The run's outcome, written once. Kept as a promise so the stream below
  // can wait for it before it closes: once the response ends the instance may
  // be frozen, and a write still in flight would simply never land.
  let outcome: Promise<void> | null = null;
  let deckTitle: string | null = null;
  const settle = (status: "done" | "failed") => {
    if (outcome) return;
    outcome = finishTrialRun(trialId, { status, title: deckTitle });
  };

  const pipeline = slideshowStream({
    body: { ...body, runId },
    runId,
    userId: null,
    signal: req.signal,
    origin: req.nextUrl.origin,
    subrequestHeaders: {
      [TRIAL_TOKEN_HEADER]: signTrialToken(runId, secret),
      [TRIAL_RUN_HEADER]: runId,
    },
    onEvent: (event, data) => {
      if (event === "meta" || event === "complete") {
        const t = (data as { title?: string } | null)?.title;
        if (t) deckTitle = t;
      }
      if (event === "complete") settle("done");
      if (event === "error") settle("failed");
    },
  });

  // Pass every byte straight through, and hold the close until the outcome
  // has been written.
  const out = pipeline.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async flush() {
        // A stream that ended with neither event (the reader left mid deck and
        // the pipeline bailed) counts as failed, which also gives the visitor
        // their free try back.
        if (!outcome) settle("failed");
        await outcome;
      },
    }),
  );

  return new Response(out, { headers: { ...SSE_HEADERS, "x-trial-id": trialId } });
}
