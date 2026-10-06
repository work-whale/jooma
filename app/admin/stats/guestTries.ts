// The "Free tries from the hero" panel's arithmetic.
//
// Pure and DOM-free, like export.ts, so the totals and rates can be unit tested
// without the database. The rows come from admin_guest_try_stats(), one per
// month per tool.

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
  /** Claimed over succeeded, as a percentage. Zero when nothing succeeded. */
  signupRate: number;
}

export interface GuestTryMonth {
  month_start: string;
  label: string;
  /** Tries per tool key. */
  byTool: Record<string, number>;
  failed: number;
  claimed: number;
}

export interface GuestTrySummary {
  tools: GuestToolTotal[];
  months: GuestTryMonth[];
  total: { tries: number; succeeded: number; failed: number; claimed: number; signupRate: number };
}

function rate(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
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
    const succeeded = sum("succeeded");
    const claimed = sum("claimed");
    return {
      ...t,
      tries: sum("tries"),
      succeeded,
      failed: sum("failed"),
      claimed,
      guests: sum("guests"),
      signupRate: rate(claimed, succeeded),
    };
  });

  const byMonth = new Map<string, GuestTryMonth>();
  for (const r of rows) {
    const m =
      byMonth.get(r.month_start) ??
      { month_start: r.month_start, label: r.label, byTool: {}, failed: 0, claimed: 0 };
    m.byTool[r.tool] = (m.byTool[r.tool] ?? 0) + r.tries;
    m.failed += r.failed;
    m.claimed += r.claimed;
    byMonth.set(r.month_start, m);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month_start.localeCompare(b.month_start));

  const total = totals.reduce(
    (a, t) => ({
      tries: a.tries + t.tries,
      succeeded: a.succeeded + t.succeeded,
      failed: a.failed + t.failed,
      claimed: a.claimed + t.claimed,
    }),
    { tries: 0, succeeded: 0, failed: 0, claimed: 0 },
  );

  return { tools: totals, months, total: { ...total, signupRate: rate(total.claimed, total.succeeded) } };
}
