import { adsConsented, metaCookieFrom, metaEventId, metaIdentity, sendMetaEvent } from "@/app/lib/meta-capi";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { recordAppEvent } from "@/app/lib/app-events";
import { activation, isFreshRun, runUsesPictures } from "@/app/lib/app-event-rules";
import { loadFxRate } from "@/app/lib/fx";

// resource_made and activated (Jooma 4.5 spec Step 7). Called by the browser
// right after it saves a finished generation (saveToolRun), with the run's id.
//
// Nothing in the body is trusted beyond that id: the run is read through the
// teacher's own client (RLS: only their rows), must have been saved in the
// last few minutes, and is recorded once per run. The plan, the resources it
// used (its cost rows, by run_id) and whether it asked for pictures all come
// from the database. Never fails the page: anything odd is a quiet 204.

const PENCE_PER_RESOURCE = 0.15;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return new NextResponse(null, { status: 204 });

  const { data: run } = await supabase
    .from("tool_runs")
    .select("id, tool_slug, input, run_id, created_at")
    .eq("id", id)
    .maybeSingle();
  const now = new Date();
  if (!run || !isFreshRun(run.created_at as string, now)) return new NextResponse(null, { status: 204 });

  // Once per run, however often the browser calls.
  const { count: already } = await supabaseAdmin
    .from("app_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("name", "resource_made")
    .eq("props->>run", id);
  if ((already ?? 0) > 0) return new NextResponse(null, { status: 204 });

  const [{ data: account }, cost] = await Promise.all([
    supabase.rpc("my_resources"),
    run.run_id
      ? supabaseAdmin.from("token_usage").select("cost_usd").eq("run_id", run.run_id)
      : Promise.resolve({ data: [] as { cost_usd: number }[] }),
  ]);
  const plan = (Array.isArray(account) ? account[0] : account)?.plan ?? null;
  const usd = ((cost.data ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const fx = usd > 0 ? (await loadFxRate()).usdToGbp : 0;
  const credits = usd > 0 ? Math.round((usd * fx * 100) / PENCE_PER_RESOURCE) : null;

  await recordAppEvent(user.id, "resource_made", {
    run: id,
    tool: run.tool_slug,
    credits,
    plan,
    with_pictures: runUsesPictures(run.input as Record<string, unknown> | null),
  });

  // activated: the second resource inside 7 days of signup, once ever.
  const signupAt = user.created_at ? new Date(user.created_at) : null;
  if (signupAt && now.getTime() - signupAt.getTime() <= 8 * 86_400_000) {
    const [{ data: made }, { count: activated }] = await Promise.all([
      supabaseAdmin
        .from("app_events")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("name", "resource_made")
        .limit(50),
      supabaseAdmin
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("name", "activated"),
    ]);
    const decision = activation({
      signupAt,
      madeAt: ((made ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
      alreadyActivated: (activated ?? 0) > 0,
      now,
    });
    if (decision.activate) {
      await recordAppEvent(user.id, "activated", { days_since_signup: decision.daysSinceSignup });
      // Meta's custom Activated: the agency optimises on it (spec Step 7).
      // Once per account (event id act:<user>). Never throws.
      const cookieHeader = req.headers.get("cookie");
      const id = await metaIdentity(user.id);
      // Only on the cookie banner's Accept (privacy policy section 9).
      if (await adsConsented(user.id, cookieHeader)) await sendMetaEvent({
        eventName: "Activated",
        eventId: metaEventId("Activated", user.id),
        email: user.email ?? id.email,
        fbp: metaCookieFrom(cookieHeader, "_fbp") ?? id.fbp,
        fbc: metaCookieFrom(cookieHeader, "_fbc") ?? id.fbc,
        eventTimeUnix: Math.floor(now.getTime() / 1000),
        clientUserAgent: req.headers.get("user-agent"),
      });
    }
  }

  return new NextResponse(null, { status: 204 });
}
