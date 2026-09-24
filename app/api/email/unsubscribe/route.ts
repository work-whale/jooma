// Unsubscribe from Jooma's bulk email. Public: the reader is usually signed out.
//
// Two callers:
//
//   * A mail client acting on the List-Unsubscribe header (RFC 8058). It POSTs
//     `List-Unsubscribe=One-Click` as a form body to ?t=<token>. No page, no
//     honeypot possible, and none needed: link scanners do not POST.
//   * The confirm button on /unsubscribe, which POSTs JSON {token, website}.
//     `website` is a honeypot, answered with the same 200 as a real request.
//
// THE WRITE goes through email_unsubscribe(), a definer function granted to
// anon and called on the caller's own (anonymous) client, the same shape as
// submit_enquiry(). The credential is the per-recipient uuid token: unguessable,
// tied to one address, and the function only ever answers whether it existed.
// On top of that, a per-IP throttle through auth_rate.
//
// A GET never acts. Some clients open the header's URL in a browser instead of
// posting to it, and a scanner would too; both are sent to the confirm page.
import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/auth/server";
import { supabaseAdmin } from "@/app/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per IP per hour. Generous: a school's staff share one address, and every
 *  one of them may press the button on the same newsletter. */
const IP_LIMIT = 60;

/**
 * The caller's IP, as far as it can be trusted. Copied, like the password-link
 * route's copy, from app/api/enquiries/route.ts: on Vercel the platform appends
 * the real peer, so the LAST x-forwarded-for entry is the one to use.
 */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Fails open on a read error, for the same reason password-link does: an
 *  outage must not stop people leaving a mailing list. */
async function overLimit(ip: string): Promise<boolean> {
  if (ip === "unknown") return false;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("auth_rate")
    .select("id", { count: "exact", head: true })
    .eq("kind", "unsub_ip")
    .eq("identifier", ip)
    .gt("created_at", since);
  if (error) {
    console.error("[unsubscribe] throttle read failed, allowing", error);
    return false;
  }
  return (count ?? 0) >= IP_LIMIT;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";
  let source: "link" | "one_click" = "one_click";

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { token?: string; website?: string };
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return NextResponse.json({ ok: true });
    }
    token = body.token ?? token;
    source = "link";
  }

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  }

  const ip = clientIp(req);
  if (await overLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait an hour and try again." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  if (ip !== "unknown") {
    await supabaseAdmin.from("auth_rate").insert({ kind: "unsub_ip", identifier: ip });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_unsubscribe", {
    p_token: token,
    p_source: source,
  });
  if (error) {
    console.error("[unsubscribe] rpc failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, url.origin), 303);
}
