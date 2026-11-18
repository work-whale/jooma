import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { recordAppEvent } from "@/app/lib/app-events";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

// prompt_shown / prompt_clicked / prompt_dismissed (Jooma 4.5 spec Step 5,
// rule 5), with the prompt id, so the admin console can see which prompts lead
// to payment. Signed in only; the user comes from the session, never the body.
// Never fails the page: a bad body is ignored with 204.

const IDS = new Set(["P1", "P2", "P3", "P5", "P12"]);
const KINDS = { shown: "prompt_shown", clicked: "prompt_clicked", dismissed: "prompt_dismissed" } as const;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; kind?: unknown; button?: unknown } | null;
  const id = typeof body?.id === "string" && IDS.has(body.id) ? body.id : null;
  const kind = typeof body?.kind === "string" && body.kind in KINDS ? (body.kind as keyof typeof KINDS) : null;
  if (!id || !kind) return new NextResponse(null, { status: 204 });
  const button = typeof body?.button === "string" ? body.button.slice(0, 40) : undefined;

  await recordAppEvent(user.id, KINDS[kind], { prompt: id, ...(button ? { button } : {}) });

  // credits_ran_out (Step 7): fires when P3 is shown, whether from opening a
  // tool or a refused Make, with the plan and how many times so far.
  if (id === "P3" && kind === "shown") {
    const [{ data: account }, { count }] = await Promise.all([
      supabase.rpc("my_resources"),
      supabaseAdmin
        .from("app_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("name", "credits_ran_out"),
    ]);
    const plan = (Array.isArray(account) ? account[0] : account)?.plan ?? null;
    await recordAppEvent(user.id, "credits_ran_out", { plan, times_ran_out: (count ?? 0) + 1 });
  }
  return new NextResponse(null, { status: 204 });
}
