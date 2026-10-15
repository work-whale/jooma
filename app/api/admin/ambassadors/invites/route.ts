import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/app/lib/auth/admin-route";
import { hashInviteToken, newInviteToken } from "@/app/lib/invites";
import { siteUrl } from "@/app/lib/email-templates/markup";

// One-person invite links to the ambassador programme.
//
// One click, nothing to fill in: the admin makes a link and sends it wherever
// they found the person. The person signs in to their own Jooma account and
// applies, and the application carries their name and details. Every new link
// is recorded with the source "other", since nobody picks one any more.
//
// The token is a bearer credential, so only its hash is stored (the same scheme
// as teacher invites, app/lib/invites.ts) and the link is returned once, here.
// It works for 14 days and for one application.

export async function POST() {
  const gate = await requireAdminRoute("change_plan");
  if (gate.error) return gate.error;

  const token = newInviteToken();
  const { data: id, error } = await gate.supabase.rpc("admin_create_ambassador_invite", {
    p_full_name: null,
    p_source: "other",
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
