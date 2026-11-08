// What the automatic emails have done, and where the no-card trial goes.
//
// Two questions an admin actually asks: "is each automatic email going out and
// landing?" and "of the teachers who trialled, who heard from us and who paid?".
// The first is a card per automation: totals as figures, and one bar per day
// for what was sent. The second is the trial funnel, as a table of counts.
//
// Read on demand from the campaign and recipient rows (admin_email_automation_daily,
// admin_trial_funnel), so these never drift from History. Delivery, bounces and
// spam come from SendGrid's event webhook; opens and clicks are not tracked.

import { nf } from "../format";
import { C, Card, EmptyState, Table, Tag, Td, Th, Tr } from "../ui";
import type { AutomationRow, AutomationDailyRow, TrialFunnelRow } from "./types";

const DAY_MS = 86_400_000;

function lastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push(d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }));
  }
  return out;
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function pctOf(part: number, whole: number): string {
  if (!whole) return "";
  return ` (${Math.round((part / whole) * 100)}%)`;
}

/** One bar per day, sent count. Single series: no legend, the card names it. */
function DailyBars({ days, byDay }: { days: string[]; byDay: Map<string, AutomationDailyRow> }) {
  const max = Math.max(1, ...days.map((d) => byDay.get(d)?.sent ?? 0));
  const W = 300;
  const H = 56;
  const step = W / days.length;
  const barW = Math.max(2, step - 2); // 2px surface gap between bars
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 14}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Sent per day, last ${days.length} days`}
    >
      {/* Baseline, recessive. */}
      <line x1={0} x2={W} y1={H} y2={H} stroke={C.border} strokeWidth={1} />
      {days.map((d, i) => {
        const row = byDay.get(d);
        const v = row?.sent ?? 0;
        const h = v === 0 ? 0 : Math.max(3, (v / max) * (H - 4));
        const x = i * step + 1;
        return (
          <g key={d}>
            {/* Hit target the full column height, bigger than the mark. */}
            <rect x={i * step} y={0} width={step} height={H} fill="transparent">
              <title>
                {`${shortDay(d)}: ${v} sent` +
                  (row ? `, ${row.delivered} delivered, ${row.bounced} bounced` : "")}
              </title>
            </rect>
            {h > 0 && (
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={h}
                rx={Math.min(2, barW / 2)}
                fill={C.brand}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
      <text x={0} y={H + 12} fontSize={9} fill={C.muted}>
        {shortDay(days[0])}
      </text>
      <text x={W} y={H + 12} fontSize={9} fill={C.muted} textAnchor="end">
        {shortDay(days[days.length - 1])}
      </text>
    </svg>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums" style={{ color: tone ?? C.ink }}>
        {value}
      </p>
    </div>
  );
}

export default function StatsView({
  automations,
  daily,
  funnel,
  redemptions,
  days = 30,
}: {
  automations: AutomationRow[];
  daily: AutomationDailyRow[];
  funnel: TrialFunnelRow | null;
  /** Times the 50% trial offer coupon has been used, from Stripe. Null if unknown. */
  redemptions: number | null;
  days?: number;
}) {
  const range = lastDays(days);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-bold mb-1" style={{ color: C.ink }}>
          Automatic emails, last {days} days
        </h2>
        <p className="text-xs mb-3" style={{ color: C.muted }}>
          Delivered, bounced and spam come from SendGrid. Opens and clicks are not tracked. Hover a
          bar for that day.
        </p>
        {automations.length === 0 ? (
          <Card>
            <EmptyState title="No automatic emails" body="None are set up in this environment." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="automation-stats">
            {automations.map((a) => {
              const rows = daily.filter((r) => r.automation === a.key);
              const byDay = new Map(rows.map((r) => [r.day, r]));
              const sum = (k: keyof AutomationDailyRow) =>
                rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
              const sent = sum("sent");
              const delivered = sum("delivered");
              const bounced = sum("bounced");
              const spam = sum("spam");
              const failed = sum("failed");
              return (
                <div
                  key={a.key}
                  className="rounded-2xl p-5 border"
                  style={{ backgroundColor: C.surface, borderColor: C.border }}
                  data-testid={`automation-${a.key}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-bold" style={{ color: C.ink }}>
                      {a.name}
                    </p>
                    <Tag tone={a.live ? "ok" : "plain"}>{a.live ? "On" : "Off"}</Tag>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <Figure label="Sent" value={nf.format(sent)} />
                    <Figure label="Delivered" value={nf.format(delivered)} />
                    <Figure
                      label="Bounced"
                      value={nf.format(bounced)}
                      tone={bounced ? C.danger : undefined}
                    />
                    <Figure label="Spam" value={nf.format(spam)} tone={spam ? C.danger : undefined} />
                  </div>
                  <DailyBars days={range} byDay={byDay} />
                  {failed > 0 && (
                    <p className="text-xs mt-2" style={{ color: C.danger }}>
                      {nf.format(failed)} failed to send.
                    </p>
                  )}
                  <p className="text-xs mt-2" style={{ color: C.muted }}>
                    {a.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold mb-1" style={{ color: C.ink }}>
          No-card trial, trials started in the last {days} days
        </h2>
        <p className="text-xs mb-3" style={{ color: C.muted }}>
          Teachers who opted out of product emails at signup get none of these emails; they see the
          popup and the sidebar countdown instead.
        </p>
        <Card>
          {!funnel || funnel.started === 0 ? (
            <EmptyState title="No trials yet" body="Trials started in this window appear here." />
          ) : (
            <Table>
              <thead>
                <tr className="text-left">
                  <Th>Step</Th>
                  <Th>Teachers</Th>
                </tr>
              </thead>
              <tbody data-testid="trial-funnel">
                {(
                  [
                    ["Started a trial", funnel.started],
                    ["Still in their trial", funnel.in_trial],
                    ["Trial ended", funnel.ended],
                    ["Opted out of product emails", funnel.opted_out],
                    ["Got “Your free trial ends soon”", funnel.got_trial_ending],
                    ["Got “Free trial ended: 50% off”", funnel.got_offer_email],
                    ["Got “Your 50% off ends tomorrow”", funnel.got_offer_ending],
                    ["50% offer open right now", funnel.offer_open],
                    ["Paid", funnel.paid],
                  ] as [string, number][]
                ).map(([label, n]) => (
                  <Tr key={label}>
                    <Td>{label}</Td>
                    <Td>
                      <span className="tabular-nums font-semibold">{nf.format(n)}</span>
                      <span style={{ color: C.muted }}>{pctOf(n, funnel.started)}</span>
                    </Td>
                  </Tr>
                ))}
                <Tr>
                  <Td>Paid using the 50% offer (all time, from Stripe)</Td>
                  <Td>
                    <span className="tabular-nums font-semibold">
                      {redemptions === null ? "Unknown" : nf.format(redemptions)}
                    </span>
                  </Td>
                </Tr>
              </tbody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
