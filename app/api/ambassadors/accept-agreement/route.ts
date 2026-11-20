import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { validateAcceptance } from "@/app/lib/ambassador-agreement-status";
import { signerIp } from "@/app/lib/signer-ip";
import { loadAgreementState } from "@/app/(app)/ambassador/data";

// An ambassador, or an applicant still waiting, accepting the current version
// of the agreement in place of the one they signed.
//
// THE WRITE IS SERVICE-ROLE ONLY (accept_ambassador_agreement), as with the
// first signature: this route checks the session, passes the user id, and is
// the only thing that knows the caller's real IP. Only the current version can
// be accepted, so nobody agrees to text they were not shown.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { version?: unknown; signature_name?: unknown } | null;
  const check = validateAcceptance(body ?? {});
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // The same rule that shows the Accept panel, checked again here: only an
  // active, unexpired ambassador or a waiting applicant on an older version.
  const state = await loadAgreementState();
  if (!state.offer) {
    return NextResponse.json({ error: "There is no new agreement for you to accept." }, { status: 403 });
  }

  const { data: acceptedAt, error } = await supabaseAdmin.rpc("accept_ambassador_agreement", {
    p_user_id: user.id,
    p_version: body!.version as string,
    p_signature_name: check.signature_name,
    p_ip: signerIp(req),
    p_user_agent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
  });

  if (error) {
    // The function's own messages are written for the person ("You already
    // signed this version."); anything else gets a general one.
    const friendly = error.code === "P0001" ? error.message : "Could not record that. Try again.";
    console.error("[ambassadors/accept-agreement] failed", error);
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
  return NextResponse.json({ ok: true, accepted_at: acceptedAt });
}
