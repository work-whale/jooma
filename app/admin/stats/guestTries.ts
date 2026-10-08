// The "Free tries from the hero" panel's arithmetic.
//
// Pure and DOM-free, like export.ts, so the totals and rates can be unit tested
// without the database. Two sources:
//
//   admin_guest_try_stats()   RUNS, one row per month per tool. Activity only.
//   admin_guest_try_funnel()  PEOPLE, one row per month of first try: tried,
//                             new account, started the trial, paying now.
//
// Signups come only from the funnel. The runs' `claimed` count moves for a
// login as much as a signup, and once per deck, so it is not shown as one.

export interface GuestTryRow {
  month_start: string;
  label: string;
  tool: string;
  tries: number;
  succeeded: number;
  failed: number;
  claimed: number;
  guests: number;
}

export interface GuestTryTool {
  tool: string;
  label: string;
  /** Not on the hero yet. Shown as "Coming soon" while it has no tries. */
  soon?: boolean;
}

/** The free tools in the order the panel shows them. */
export const GUEST_TRY_TOOLS: readonly GuestTryTool[] = [
  { tool: "slideshow", label: "Slides" },
  { tool: "comprehension-generator", label: "Comprehension" },
  { tool: "worksheet-generator", label: "Worksheet", soon: true },
];

export interface GuestToolTotal extends GuestTryTool {
  tries: number;
  succeeded: number;
  failed: number;
  claimed: number;
  /** Summed per month, so a guest active in two months counts twice. */
  guests: number;
}

export interface GuestTryMonth {
  month_start: string;
  label: string;
  /** Tries per tool key. */
  byTool: Record<string, number>;
  failed: number;
}

export interface GuestTrySummary {
  tools: GuestToolTotal[];
  months: GuestTryMonth[];
  total: { tries: number; succeeded: number; failed: number };
}

export function summariseGuestTries(rows: GuestTryRow[]): GuestTrySummary {
  // Known tools first, in their fixed order, then anything the function
  // returns that this file has not heard of yet, under its raw key, so a new
  // guest tool shows up as soon as it has data rather than being dropped.
  const tools: GuestTryTool[] = [...GUEST_TRY_TOOLS];
  for (const r of rows) {
    if (!tools.some((t) => t.tool === r.tool)) tools.push({ tool: r.tool, label: r.tool });
  }

  const totals = tools.map<GuestToolTotal>((t) => {
    const mine = rows.filter((r) => r.tool === t.tool);
    const sum = (k: "tries" | "succeeded" | "failed" | "claimed" | "guests") =>
      mine.reduce((a, r) => a + r[k], 0);
    return {
      ...t,
      tries: sum("tries"),
      succeeded: sum("succeeded"),
      failed: sum("failed"),
      claimed: sum("claimed"),
      guests: sum("guests"),
    };
  });

  const byMonth = new Map<string, GuestTryMonth>();
  for (const r of rows) {
    const m =
      byMonth.get(r.month_start) ??
      { month_start: r.month_start, label: r.label, byTool: {}, failed: 0 };
    m.byTool[r.tool] = (m.byTool[r.tool] ?? 0) + r.tries;
    m.failed += r.failed;
    byMonth.set(r.month_start, m);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month_start.localeCompare(b.month_start));

  const total = totals.reduce(
    (a, t) => ({
      tries: a.tries + t.tries,
      succeeded: a.succeeded + t.succeeded,
      failed: a.failed + t.failed,
    }),
    { tries: 0, succeeded: 0, failed: 0 },
  );

  return { tools: totals, months, total };
}

// ── The funnel: people, not runs ─────────────────────────────────────────────

export interface GuestFunnelRow {
  month_start: string;
  label: string;
  /** Distinct people whose first try fell in this month. */
  tried: number;
  /** Their account was created after their first try. */
  new_accounts: number;
  /** Of the new accounts, went through checkout and started the trial. */
  started_trial: number;
  /** Of the new accounts, the subscription is active now: the trial charged. */
  paying: number;
  /** Had an account before trying and logged in. Not a conversion. */
  existing_logins: number;
}

type FunnelCounts = Omit<GuestFunnelRow, "month_start" | "label">;

export interface GuestFunnelSummary {
  total: FunnelCounts & {
    /** New accounts over tried, as a percentage. */
    newRate: number;
    /** Trials over new accounts. */
    trialRate: number;
    /** Paying over trials. */
    payRate: number;
  };
  /** Keyed by month_start, to line up with the runs table. */
  byMonth: Record<string, FunnelCounts>;
}

/** Each step as a percentage of the step before it. Zero, not NaN, when the
 *  step before is empty. */
function rate(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function summariseGuestFunnel(rows: GuestFunnelRow[]): GuestFunnelSummary {
  const zero: FunnelCounts = { tried: 0, new_accounts: 0, started_trial: 0, paying: 0, existing_logins: 0 };
  const keys = Object.keys(zero) as (keyof FunnelCounts)[];

  const byMonth: Record<string, FunnelCounts> = {};
  const t = { ...zero };
  for (const r of rows) {
    const m = (byMonth[r.month_start] ??= { ...zero });
    for (const k of keys) {
      m[k] += r[k];
      t[k] += r[k];
    }
  }

  return {
    total: {
      ...t,
      newRate: rate(t.new_accounts, t.tried),
      trialRate: rate(t.started_trial, t.new_accounts),
      payRate: rate(t.paying, t.started_trial),
    },
    byMonth,
  };
}
