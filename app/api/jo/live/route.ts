// Starting a Live call with Jo (lib/live).
//
// The browser sends its WebRTC offer here rather than to OpenAI, so the
// browser never holds a key and cannot open a call this server does not know
// about. The plan gate and the spend ceiling run in proxy.ts first
// (isAssistantRequest, COST_BEARING_PATHS); this works out what the session may
// spend, opens the call, and leaves lib/live-watch watching it after the
// answer has gone back.
import { createHash } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { loadFxRate } from "@/app/lib/fx";
import { AI_SPEND_CEILING_PENCE, asPlanId, can } from "@/app/lib/plans";
import { checkAllGates, quotaBlockBody, quotaBlockHeaders, quotaBlockStatus } from "@/app/lib/generation-guard";
import { LIVE_MAX_SECONDS, cleanDocLabel, liveBudgetUsd, liveSessionConfig, type LiveSurface } from "@/app/lib/live";
import { watchLiveCall } from "@/app/lib/live-watch";

// The watch runs in after(), inside this function's time: a ten minute call
// plus the goodbye and the last write.
export const maxDuration = 720;

/** An offer is a few kilobytes; anything far bigger is not one. */
const MAX_SDP = 30_000;

interface GateRow {
  plan: string | null;
  is_admin: boolean | null;
  spend_pence: number | string | null;
  credit_pence: number | string | null;
}

export async function POST(req: NextRequest) {
  let body: { sdp?: unknown; surface?: unknown; docLabel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sdp = typeof body.sdp === "string" ? body.sdp : "";
  const surface: LiveSurface = body.surface === "assistant" ? "assistant" : "panel";
  if (!sdp || sdp.length > MAX_SDP) return NextResponse.json({ error: "Missing offer" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to talk with Jo." }, { status: 401 });

  // Read here as well as in the proxy, because this needs the numbers, not
  // just the verdict: what is left is what the session may spend.
  const { data } = await supabase.rpc("my_generation_gate");
  const row = (Array.isArray(data) ? data[0] : data) as GateRow | undefined;
  const plan = asPlanId(row?.plan ?? null);
  const admin = !!row?.is_admin;
  if (!admin && !can(plan, "assistant")) {
    const block = await checkAllGates(supabase, { countsAsGeneration: false });
    if (block) return NextResponse.json(quotaBlockBody(block), { status: quotaBlockStatus(block), headers: quotaBlockHeaders(block) });
    return NextResponse.json({ error: "Live is part of the paid plans." }, { status: 402, headers: { "x-upgrade-required": "1" } });
  }

  const budgetUsd = admin
    ? null
    : liveBudgetUsd({
        spendPence: Number(row?.spend_pence ?? 0),
        ceilingPence: AI_SPEND_CEILING_PENCE[plan],
        creditPence: Number(row?.credit_pence ?? 0),
        usdToGbp: (await loadFxRate()).usdToGbp,
      });
  if (budgetUsd === 0) {
    const block = await checkAllGates(supabase, { countsAsGeneration: false });
    if (block) return NextResponse.json(quotaBlockBody(block), { status: quotaBlockStatus(block), headers: quotaBlockHeaders(block) });
  }

  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(liveSessionConfig(surface, cleanDocLabel(body.docLabel))));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      // Hashed, so OpenAI can tell users apart for abuse checks without
      // learning who they are.
      "OpenAI-Safety-Identifier": createHash("sha256").update(user.id).digest("hex"),
    },
    body: form,
  });
  if (!res.ok) {
    console.error("[jo/live] could not open the call:", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ error: "Live couldn't start just now. Please try again." }, { status: 502 });
  }

  // The call id is the last part of the Location header. Without it the call
  // cannot be watched, and so cannot be metered or ended: refuse it. The
  // browser never gets the answer, so the call never connects.
  const callId = res.headers.get("location")?.split("/").filter(Boolean).pop() ?? null;
  const answer = await res.text();
  if (!callId) {
    console.error("[jo/live] no call id in the response");
    return NextResponse.json({ error: "Live couldn't start just now. Please try again." }, { status: 502 });
  }

  after(() => watchLiveCall({ callId, userId: user.id, surface, budgetUsd }));

  return NextResponse.json({ sdp: answer, callId, maxSeconds: LIVE_MAX_SECONDS });
}
