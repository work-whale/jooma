import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { isToolEnabled } from "@/app/lib/tool-availability";
import { hasProfile, profileGateBody } from "@/app/lib/profile-gate";
import {
  checkAllGates,
  quotaBlockBody,
  quotaBlockHeaders,
  quotaBlockStatus,
} from "@/app/lib/generation-guard";
import { slideshowStream, SSE_HEADERS, type RequestBody } from "@/app/lib/slideshow-pipeline";

export const maxDuration = 120; // AI image gen can push past the default

// The deck itself is built in lib/slideshow-pipeline, shared with the guest
// route on /create. This file is the teacher's gate in front of it.

// ── Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // This route is excluded from proxy.ts (the proxy buffers SSE streams), so it
  // authenticates itself here instead of relying on the proxy's auth gate.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // And again: the proxy gates teachers who never finished onboarding, but it
  // cannot see this route. A profile-less account is invisible to the admin
  // console and coalesced to 'free' by my_generation_gate(), so leaving the
  // product's most expensive endpoint open to one is exactly the hole the gate
  // was written to close.
  if (!(await hasProfile(supabase, user.id))) {
    return NextResponse.json(profileGateBody(), { status: 403 });
  }

  // Same reason again: the proxy enforces tool_settings.enabled for every other
  // tool, but it never sees this route. Without this check, switching the
  // Slideshow Generator off in /admin/tools would stop the tool page and leave
  // the single most expensive endpoint in the product still serving.
  //
  // Keyed to "slideshow" — the tool_settings slug for the teacher-facing tool —
  // not to this endpoint's name.
  if (!(await isToolEnabled(supabase, "slideshow"))) {
    return NextResponse.json(
      { error: "This tool is currently unavailable.", code: "tool_disabled" },
      { status: 403 },
    );
  }

  // Same reason: the proxy can't gate this route, so the quota check happens
  // here. It MUST stay before the SSE stream opens — once we start streaming we
  // can no longer return a status code the client can act on. A deck is the
  // most expensive thing the product makes, so leaving it ungated would let a
  // capped account spend freely.
  const quota = await checkAllGates(supabase, { countsAsGeneration: true });
  if (quota) {
    return NextResponse.json(quotaBlockBody(quota), {
      status: quotaBlockStatus(quota),
      headers: quotaBlockHeaders(quota),
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  // One id for everything this deck spends — its own text call, the images,
  // and the audio/YouTube sub-routes it calls. Stamped on every cost row so the
  // admin console can total a deck exactly instead of inferring it from
  // timestamps, which cannot tell one slow deck from two quick ones.
  //
  // The client sends it and stores the same value on its tool_runs row. The
  // fallback only matters if an older client omits it: the rows then group
  // together correctly but have no run to join to, which is no worse than
  // before.
  const runId = body.runId ?? crypto.randomUUID();

  const stream = slideshowStream({
    body,
    runId,
    userId: user.id,
    signal: req.signal,
    origin: req.nextUrl.origin,
    // Forward the caller's session cookie so the auth proxy doesn't redirect
    // the audio and YouTube sub-requests to the /login HTML page.
    subrequestHeaders: { cookie: req.headers.get("cookie") ?? "" },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
