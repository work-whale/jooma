import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { recordAppEvent } from "@/app/lib/app-events";

// prompt_shown / prompt_clicked / prompt_dismissed (Jooma 4.5 spec Step 5,
// rule 5), with the prompt id, so the admin console can see which prompts lead
// to payment. Signed in only; the user comes from the session, never the body.
// Never fails the page: a bad body is ignored with 204.

const IDS = new Set(["P1", "P2", "P3", "P3b", "P5", "P12"]);
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

  // credits_ran_out (Step 7) is logged by /api/run-out, which the sheet calls
  // as it opens and which also decides between P3 and P3b.
  return new NextResponse(null, { status: 204 });
}
