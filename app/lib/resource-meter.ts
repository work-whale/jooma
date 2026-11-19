/*
 * The sidebar's resources meter, from the v4 prototype.
 *
 * Calm until it matters: with plenty left it states the allowance and shows no
 * bar, because a bar on a full tank is noise. Below 40% a bar and "N left";
 * below 15% it is low and a top-up is offered (where the plan allows one).
 */

export type MeterState = "calm" | "watch" | "low";
export type MeterPeriod = "week" | "month" | "trial";

export const WATCH_BELOW = 0.4;
export const LOW_AT = 0.15;

export function meterState(left: number, allowance: number): MeterState {
  if (allowance <= 0) return "low";
  const fraction = Math.max(0, left) / allowance;
  if (fraction > WATCH_BELOW) return "calm";
  if (fraction > LOW_AT) return "watch";
  return "low";
}

export function meterValue(m: { left: number; allowance: number; period: MeterPeriod }): string {
  if (meterState(m.left, m.allowance) === "calm") {
    const amount = m.allowance.toLocaleString("en-GB");
    return m.period === "trial" ? `${amount} in your trial` : `${amount} a ${m.period}`;
  }
  return `${Math.max(0, Math.round(m.left)).toLocaleString("en-GB")} left`;
}

/* ── Jooma 4.5: the meter from my_resources() ─────────────────────────────── */

/** The my_resources() columns the meter reads. */
export interface ResourcesMeterRow {
  plan: string | null;
  allowance: number | null;
  total: number | null;
  topup_left?: number | null;
  next_refill_at: string | null;
  trial_ends_at?: string | null;
}

export interface ResourcesMeter {
  metered: boolean;
  /** What is left now: allowance left plus top-ups, floored at 0. */
  remaining: number;
  /** The allowance set at each refill (300 once, for the trial). */
  allowance: number;
  /** remaining / allowance, 0 to 1. Top-ups past the allowance read as full. */
  fraction: number;
  /** Top-up resources still unspent. */
  topUps: number;
  period: MeterPeriod;
  /** The next refill. Null for the trial, which never refills. */
  refillsOn: Date | null;
  /** When the trial ends. Null on every other plan. */
  endsOn: Date | null;
  plan: string;
}

const PERIOD: Record<string, MeterPeriod> = {
  free: "week",
  pro_trial: "trial",
  standard: "month",
  pro: "month",
  max: "month",
};

function date(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Null when there is no row (the read failed), so the hook keeps what it had. */
export function meterFromResources(row: ResourcesMeterRow | null | undefined): ResourcesMeter | null {
  if (!row) return null;
  const plan = row.plan ?? "free";
  const period = PERIOD[plan];
  const allowance = Math.max(0, Math.round(Number(row.allowance ?? 0)));
  const remaining = Math.max(0, Math.floor(Number(row.total ?? 0)));
  const fraction = allowance > 0 ? Math.min(1, remaining / allowance) : 0;
  return {
    metered: Boolean(period),
    remaining,
    allowance,
    fraction,
    topUps: Math.max(0, Math.floor(Number(row.topup_left ?? 0))),
    period: period ?? "month",
    refillsOn: period === "trial" ? null : date(row.next_refill_at),
    endsOn: period === "trial" ? date(row.trial_ends_at) : null,
    plan,
  };
}
