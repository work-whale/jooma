import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { hashInviteToken, newInviteToken } from "@/app/lib/invites";
import { siteUrl } from "@/app/lib/email-templates/markup";
import { SOURCE_OPTIONS } from "@/app/lib/ambassador-application";

// One-person invite links to the ambassador programme.
//
// Only a name and where we found them. No email: the person signs in to their
// own Jooma account and applies, and the application carries their details.
//
// The token is a bearer credential, so only its hash is stored (the same scheme
// as teacher invites, app/lib/invites.ts) and the link is returned once, here.
// It works for 14 days and for one application.

export async function POST(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const source = typeof body?.source === "string" ? body.source : "";

  if (!fullName) {
    return NextResponse.json({ error: "Enter their name." }, { status: 400 });
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "That name is too long." }, { status: 400 });
  }
  if (!SOURCE_OPTIONS.some((o) => o.value === source)) {
    return NextResponse.json({ error: "Choose where you found them." }, { status: 400 });
  }

  const token = newInviteToken();
  const { data: id, error } = await gate.supabase.rpc("admin_create_ambassador_invite", {
    p_full_name: fullName,
    p_source: source,
    p_token_hash: hashInviteToken(token),
  });
  if (error) {
    console.error("[admin/ambassadors/invites] create failed", error);
    return NextResponse.json({ error: error.message || "Could not create the link." }, { status: 400 });
  }

  return NextResponse.json({ id, url: `${siteUrl()}/ambassador/invite/${token}` });
}

/** Withdraw a link that has not been used yet. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const { error } = await gate.supabase.rpc("admin_revoke_ambassador_invite", { p_id: id });
  if (error) {
    console.error("[admin/ambassadors/invites] revoke failed", error);
    return NextResponse.json({ error: "Could not withdraw the link." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
