// Ambassador invite links, resolved on the server.
//
// The raw token in /ambassador/invite/<token> is a bearer credential; only its
// hash is stored (hashInviteToken, as for teacher invites). Looked up with the
// service role because ambassador_invites has no policies at all. The only thing
// returned is the name the admin typed, if they typed one (links made since
// 15 October 2026 have none), to the person holding the link.
import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { hashInviteToken } from "./invites";

export type AmbassadorInviteLookup =
  | { ok: true; id: string; name: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function lookupAmbassadorInvite(
  token: string,
  opts: { markOpened?: boolean } = {},
): Promise<AmbassadorInviteLookup> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid" };

  const { data } = await supabaseAdmin
    .from("ambassador_invites")
    .select("id, full_name, expires_at, opened_at, used_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (!data || data.revoked_at) return { ok: false, reason: "invalid" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  // Recorded once, for the admin's "invites unopened" figure.
  if (opts.markOpened && !data.opened_at) {
    await supabaseAdmin
      .from("ambassador_invites")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("opened_at", null);
  }

  return { ok: true, id: data.id as string, name: (data.full_name as string | null) ?? null };
}
