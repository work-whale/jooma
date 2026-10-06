// ── Guests on /create: identity, settings and the free try gate ──────────────
//
// The request-bound half of guest-cookie.ts and trial-limits.ts. Everything a
// /api/try route needs before it spends money on someone with no account:
// who they are (the signed cookie), where they are (a hashed IP), whether the
// admin switch is on, and whether they have had today's free try.
//
// Server only, service role throughout: trial_generations and auth_rate have
// no policies and no grants, by design. See the migration
// 20261005000000_guest_trial_and_showcase.sql.
import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import {
  GUEST_COOKIE,
  GUEST_MAX_AGE_S,
  GUEST_WORK_FLAG,
  guestCookieValue,
  newGuestCookie,
  verifyGuestCookie,
} from "./guest-cookie";
import {
  COUNTED_STATUSES,
  DEFAULT_DAILY_CAP,
  TRIAL_WINDOW_MS,
  decideTrial,
  hashIp,
  settingBool,
  settingInt,
  type TrialDecision,
  type TrialTool,
} from "./trial-limits";

/**
 * The one secret behind the guest cookie, the hashed IPs and the internal
 * sub-request token. Null when unset, and every guest route refuses to run
 * without it: failing open here would mean unsigned cookies anyone could forge.
 */
export function trialSecret(): string | null {
  const s = process.env.TRIAL_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/**
 * The caller's IP, as far as it can be trusted.
 *
 * Deliberately the same rule as api/enquiries: on Vercel the platform appends
 * the real peer to x-forwarded-for, so the LAST entry is the one to use. A
 * spoofed header can only add hops in front of the attacker's own address.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export const guestCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: GUEST_MAX_AGE_S,
};

/** The verified guest id from this request's cookie, or null. */
export async function readGuestId(): Promise<string | null> {
  const secret = trialSecret();
  if (!secret) return null;
  const store = await cookies();
  return verifyGuestCookie(store.get(GUEST_COOKIE)?.value, secret);
}

/**
 * The guest id, minting and setting one when the request has none. Route
 * handlers only: a server component cannot set cookies, which is why /create
 * itself gets its cookie from proxy.ts instead.
 */
export async function ensureGuestId(): Promise<string | null> {
  const secret = trialSecret();
  if (!secret) return null;
  const store = await cookies();
  const existing = verifyGuestCookie(store.get(GUEST_COOKIE)?.value, secret);
  if (existing) {
    // Refresh the expiry: thirty days from the last visit, not the first.
    store.set(GUEST_COOKIE, guestCookieValue(existing, secret), guestCookieOptions);
    return existing;
  }
  const { guestId, value } = newGuestCookie(secret);
  store.set(GUEST_COOKIE, value, guestCookieOptions);
  return guestId;
}

/** Tell the signed in shell there is guest work to claim. Readable by the
 *  page on purpose, and carries nothing but a 1. */
export async function flagGuestWork(): Promise<void> {
  const store = await cookies();
  store.set(GUEST_WORK_FLAG, "1", { ...guestCookieOptions, httpOnly: false });
}

export async function clearGuestCookies(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
  store.delete(GUEST_WORK_FLAG);
}

/** The admin switches, read fresh: they are the brake, and a cached "on"
 *  would keep spending for a minute after someone pulled it. */
export async function trialSettings(): Promise<{ enabled: boolean; dailyCap: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["trial_enabled", "trial_daily_cap"]);
    if (error) throw error;
    const rows = (data ?? []) as { key: string; value: unknown }[];
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    return {
      enabled: settingBool(get("trial_enabled"), true),
      dailyCap: settingInt(get("trial_daily_cap"), DEFAULT_DAILY_CAP),
    };
  } catch (err) {
    // Fails CLOSED, unlike the teacher settings: a database we cannot read is
    // not a reason to hand out free generations nobody can see the cost of.
    console.warn("[guest] could not read trial settings:", err);
    return { enabled: false, dailyCap: 0 };
  }
}

/** Whether this guest may start another free run now, of either tool. */
export async function checkTrial(guestId: string, ipHash: string): Promise<TrialDecision> {
  const settings = await trialSettings();
  if (!settings.enabled) return { ok: false, reason: "disabled" };

  const since = new Date(Date.now() - TRIAL_WINDOW_MS).toISOString();
  const counted = COUNTED_STATUSES as unknown as string[];
  const base = () =>
    supabaseAdmin
      .from("trial_generations")
      .select("id", { count: "exact", head: true })
      .gt("created_at", since)
      .in("status", counted);

  const [all, byGuest, byIp] = await Promise.all([
    base(),
    base().eq("guest_id", guestId),
    base().eq("ip_hash", ipHash),
  ]);
  if (all.error || byGuest.error || byIp.error) {
    console.warn("[guest] trial count failed:", all.error ?? byGuest.error ?? byIp.error);
    return { ok: false, reason: "disabled" };
  }

  return decideTrial({
    enabled: settings.enabled,
    dailyCap: settings.dailyCap,
    startedToday: all.count ?? 0,
    guestRuns: byGuest.count ?? 0,
    ipRuns: byIp.count ?? 0,
  });
}

/** Start a guest run. Returns the row id. */
export async function startTrialRun(input: {
  guestId: string;
  ipHash: string;
  tool: TrialTool;
  runId: string;
  title: string;
  params: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("trial_generations")
    .insert({
      guest_id: input.guestId,
      ip_hash: input.ipHash,
      tool: input.tool,
      run_id: input.runId,
      title: input.title.slice(0, 200),
      input: input.params,
      status: "running",
    })
    .select("id")
    .single();
  if (error) {
    console.error("[guest] could not start trial run:", error);
    return null;
  }
  return data.id as string;
}

export async function finishTrialRun(
  id: string,
  patch: { status: "done" | "failed"; output?: Record<string, unknown> | null; title?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = { status: patch.status };
  if (patch.output !== undefined) update.output = patch.output;
  if (patch.title) update.title = patch.title.slice(0, 200);
  const { error } = await supabaseAdmin.from("trial_generations").update(update).eq("id", id);
  if (error) console.error("[guest] could not finish trial run:", error);
}

/**
 * The per IP brake on the cheap guest calls: Ask Jo, the prefill and the
 * slideshow wizard's helpers. They cost pennies, but they cost them on every
 * keystroke a script can send.
 */
export async function guestCallAllowed(
  ip: string,
  kind: "guest_chat_ip" | "guest_helper_ip",
  limitPerHour: number,
): Promise<boolean> {
  if (ip === "unknown") return true;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("auth_rate")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("identifier", ip)
    .gt("created_at", since);
  if (error) {
    console.warn("[guest] rate check failed:", error);
    return false;
  }
  if ((count ?? 0) >= limitPerHour) return false;
  await supabaseAdmin.from("auth_rate").insert({ kind, identifier: ip });
  return true;
}

export { hashIp };

export interface GuestRunSummary {
  id: string;
  tool: TrialTool;
  title: string | null;
  status: string;
  created_at: string;
}

/** This guest's finished, unclaimed tries from the last thirty days, newest
 *  first. Summaries only: a deck's output can be megabytes. */
export async function listGuestRuns(guestId: string): Promise<GuestRunSummary[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("trial_generations")
    .select("id, tool, title, status, created_at")
    .eq("guest_id", guestId)
    .eq("status", "done")
    .not("output", "is", null)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("[guest] could not list runs:", error);
    return [];
  }
  return (data ?? []) as GuestRunSummary[];
}

/** One of this guest's runs with its output, for reopening it on /create. */
export async function getGuestRun(
  guestId: string,
  id: string,
): Promise<(GuestRunSummary & { output: Record<string, unknown> | null; input: Record<string, unknown> | null }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseAdmin
    .from("trial_generations")
    .select("id, tool, title, status, created_at, output, input")
    .eq("id", id)
    .eq("guest_id", guestId)
    .maybeSingle();
  if (error || !data) return null;
  return data as GuestRunSummary & { output: Record<string, unknown> | null; input: Record<string, unknown> | null };
}
