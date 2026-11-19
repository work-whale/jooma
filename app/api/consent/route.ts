import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { saveAdsConsent } from "@/app/lib/meta-capi";

/*
 * The cookie banner's choice, saved on a signed-in teacher's profile so that
 * server-side Meta events (sent from Stripe webhooks, with no browser) follow
 * it too. Identity comes from the session; the body carries only the choice.
 * Signed out: nothing to save (the choice is kept on the profile at signup by
 * /api/trial/start). Always 204: the banner does not wait on it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { choice?: unknown } | null;
  const choice = body?.choice;
  if (choice !== "accepted" && choice !== "rejected") return new NextResponse(null, { status: 204 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await saveAdsConsent(user.id, choice);
  return new NextResponse(null, { status: 204 });
}
