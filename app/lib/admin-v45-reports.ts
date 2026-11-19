/*
 * The Jooma 4.5 admin reports (spec Step 9, Phase 2): "Free back in the
 * funnel, trial cohorts, and results for each prompt and email". Every report
 * runs off the Step 7 events (app_events) and the lifecycle send log.
 *
 * "Paid" after a prompt or an email means that teacher's first payment
 * (subscribed) within 7 days of their click or the send. It is association,
 * not proof the prompt caused it; the page says so.
 *
 * Lifecycle emails have no open or click tracking, so email results are sends
 * and payments only.
 *
 * Pure.
 */

import { ukWeekKey } from "@/app/lib/run-out-offer";

export interface AppEventRow {
  user_id: string | null;
  name: string;
  props: Record<string, unknown> | null;
  created_at: string;
}

export interface SentRow {
  user_id: string;
  key: string;
  sent_at: string;
  status: string;
}

const DAY_MS = 86_400_000;
export const PAID_WINDOW_DAYS = 7;
const WINDOW_MS = PAID_WINDOW_DAYS * DAY_MS;

const t = (iso: string) => new Date(iso).getTime();
const prop = (e: AppEventRow, k: string) => (e.props ?? {})[k];

/** Every payment time, per teacher. */
function paymentsByUser(events: readonly AppEventRow[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const e of events) {
    if (e.name !== "subscribed" || !e.user_id) continue;
    m.set(e.user_id, [...(m.get(e.user_id) ?? []), t(e.created_at)]);
  }
  return m;
}

/** Paid within the window after any of these moments. */
function paidAfter(payments: number[] | undefined, moments: number[]): boolean {
  if (!payments) return false;
  return payments.some((p) => moments.some((m) => p >= m && p - m <= WINDOW_MS));
}

/* ── Prompts ────────────────────────────────────────────────────────────── */

export const PROMPT_ORDER = ["P1", "P2", "P3", "P3b", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12"] as const;

export interface PromptResult {
  id: string;
  shown: number;
  clicked: number;
  dismissed: number;
  /** checkout_started carrying this prompt as source_prompt. */
  checkouts: number;
  /** Teachers who paid within 7 days of clicking it. */
  paid: number;
}

export function promptResults(events: readonly AppEventRow[]): PromptResult[] {
  const payments = paymentsByUser(events);
  const rows = new Map<string, PromptResult>(
    PROMPT_ORDER.map((id) => [id, { id, shown: 0, clicked: 0, dismissed: 0, checkouts: 0, paid: 0 }]),
  );
  const clicks = new Map<string, Map<string, number[]>>();
  for (const e of events) {
    if (e.name === "checkout_started") {
      const src = prop(e, "source_prompt");
      const r = typeof src === "string" ? rows.get(src) : undefined;
      if (r) r.checkouts += 1;
      continue;
    }
    const id = prop(e, "prompt");
    const r = typeof id === "string" ? rows.get(id) : undefined;
    if (!r) continue;
    if (e.name === "prompt_shown") r.shown += 1;
    else if (e.name === "prompt_dismissed") r.dismissed += 1;
    else if (e.name === "prompt_clicked") {
      r.clicked += 1;
      if (e.user_id) {
        const byUser = clicks.get(r.id) ?? new Map<string, number[]>();
        byUser.set(e.user_id, [...(byUser.get(e.user_id) ?? []), t(e.created_at)]);
        clicks.set(r.id, byUser);
      }
    }
  }
  for (const [id, byUser] of clicks) {
    const r = rows.get(id)!;
    for (const [user, moments] of byUser) if (paidAfter(payments.get(user), moments)) r.paid += 1;
  }
  return [...rows.values()];
}

/* ── Emails ─────────────────────────────────────────────────────────────── */

export interface EmailResult {
  id: string;
  sent: number;
  /** Failed or skipped by the mailer. */
  notSent: number;
  /** Teachers who paid within 7 days of being sent it. */
  paid: number;
}

export function emailResults(sent: readonly SentRow[], events: readonly AppEventRow[]): EmailResult[] {
  const payments = paymentsByUser(events);
  const rows = new Map<string, EmailResult & { sends: Map<string, number[]> }>();
  for (const s of sent) {
    const id = s.key.split(":")[0];
    const r = rows.get(id) ?? { id, sent: 0, notSent: 0, paid: 0, sends: new Map<string, number[]>() };
    if (s.status === "sent") {
      r.sent += 1;
      r.sends.set(s.user_id, [...(r.sends.get(s.user_id) ?? []), t(s.sent_at)]);
    } else {
      r.notSent += 1;
    }
    rows.set(id, r);
  }
  const out: EmailResult[] = [];
  for (const r of rows.values()) {
    let paid = 0;
    for (const [user, moments] of r.sends) if (paidAfter(payments.get(user), moments)) paid += 1;
    out.push({ id: r.id, sent: r.sent, notSent: r.notSent, paid });
  }
  const order = (id: string) => [Number(id.replace(/\D/g, "")), id] as const;
  return out.sort((a, b) => order(a.id)[0] - order(b.id)[0] || a.id.localeCompare(b.id));
}

/* ── Trial cohorts ──────────────────────────────────────────────────────── */

export interface TrialCohort {
  /** The UK week the trial started, named by its Sunday. */
  week: string;
  started: number;
  activated: number;
  paidInTrial: number;
  paid: number;
  movedToFree: number;
}

export function trialCohorts(events: readonly AppEventRow[]): TrialCohort[] {
  const starts = new Map<string, { at: number; endsAt: number | null }>();
  const activated = new Set<string>();
  const moved = new Set<string>();
  for (const e of events) {
    if (!e.user_id) continue;
    if (e.name === "trial_started" && !starts.has(e.user_id)) {
      const ends = prop(e, "trial_ends_at");
      starts.set(e.user_id, { at: t(e.created_at), endsAt: typeof ends === "string" ? t(ends) : null });
    } else if (e.name === "activated") {
      activated.add(e.user_id);
    } else if (e.name === "moved_to_free" && prop(e, "from") === "trial") {
      moved.add(e.user_id);
    }
  }
  const payments = paymentsByUser(events);
  const weeks = new Map<string, TrialCohort>();
  for (const [user, s] of starts) {
    const week = ukWeekKey(new Date(s.at));
    const c = weeks.get(week) ?? { week, started: 0, activated: 0, paidInTrial: 0, paid: 0, movedToFree: 0 };
    c.started += 1;
    if (activated.has(user)) c.activated += 1;
    const pays = (payments.get(user) ?? []).filter((p) => p >= s.at);
    if (pays.length) c.paid += 1;
    if (s.endsAt !== null && pays.some((p) => p <= s.endsAt!)) c.paidInTrial += 1;
    if (moved.has(user)) c.movedToFree += 1;
    weeks.set(week, c);
  }
  return [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week));
}

/* ── Free back in the funnel ────────────────────────────────────────────── */

export type FreeFrom = "trial" | "cancel" | "failed_payment";

export interface FunnelRow {
  from: FreeFrom | "all";
  /** Teachers whose latest move to Free is in the data. */
  moved: number;
  /** Visited again after the move (profiles.last_seen_at). */
  cameBack: number;
  /** Made a resource after the move. */
  made: number;
  ranOut: number;
  checkout: number;
  paid: number;
}

const FROMS: FreeFrom[] = ["trial", "cancel", "failed_payment"];

export function freeFunnel(
  events: readonly AppEventRow[],
  lastSeen: ReadonlyMap<string, Date>,
): { all: FunnelRow; byFrom: FunnelRow[] } {
  // Each teacher's LATEST move to Free.
  const latest = new Map<string, { at: number; from: FreeFrom }>();
  for (const e of events) {
    if (e.name !== "moved_to_free" || !e.user_id) continue;
    const at = t(e.created_at);
    const from = prop(e, "from");
    const prev = latest.get(e.user_id);
    if (!prev || at > prev.at) {
      latest.set(e.user_id, { at, from: (FROMS as string[]).includes(from as string) ? (from as FreeFrom) : "trial" });
    }
  }
  const after = (user: string, name: string, test?: (e: AppEventRow) => boolean) => {
    const m = latest.get(user)!;
    return events.some((e) => e.user_id === user && e.name === name && t(e.created_at) > m.at && (!test || test(e)));
  };
  const blank = (from: FunnelRow["from"]): FunnelRow => ({ from, moved: 0, cameBack: 0, made: 0, ranOut: 0, checkout: 0, paid: 0 });
  const all = blank("all");
  const byFrom = new Map<FreeFrom, FunnelRow>(FROMS.map((f) => [f, blank(f)]));
  for (const [user, m] of latest) {
    const seen = lastSeen.get(user);
    const stages = {
      moved: true,
      cameBack: Boolean(seen && seen.getTime() > m.at),
      made: after(user, "resource_made"),
      ranOut: after(user, "credits_ran_out", (e) => prop(e, "plan") === "free"),
      checkout: after(user, "checkout_started"),
      paid: after(user, "subscribed"),
    };
    for (const row of [all, byFrom.get(m.from)!]) {
      for (const k of Object.keys(stages) as (keyof typeof stages)[]) if (stages[k]) row[k] += 1;
    }
  }
  return { all, byFrom: [...byFrom.values()] };
}
