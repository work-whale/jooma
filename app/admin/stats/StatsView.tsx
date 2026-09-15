"use client";

import { useMemo } from "react";
import { nf } from "../format";
import NotBuiltBanner from "../NotBuiltBanner";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Note,
  PageHead,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "../ui";
import RangeTabs from "./RangeTabs";
import { conversionOf, toCsv, type MonthRow } from "./export";
import type { Range } from "./range";

export type { MonthRow };

export interface CountryRow {
  country: string;
  signups: number;
  paid: number;
}

export interface SourceRow {
  source: string;
  signups: number;
  paid: number;
}

interface CountryVisitors {
  country: string;
  visitors: number;
}

const PLAN_COLOUR = { free: C.divider, pro: C.brand, max: C.ok } as const;

const SOURCE_LABEL: Record<string, string> = {
  ambassador: "Ambassador code",
  invited: "Invited by someone",
  unattributed: "Not attributed",
};

/** Share of a total, guarded against the zero denominator that would otherwise
 *  render NaN% on an empty month. */
function share(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export default function StatsView({
  range,
  months,
  countries,
  sources,
  visitorsToday,
  visitorCountries,
  analyticsError,
}: {
  range: Range;
  months: MonthRow[];
  countries: CountryRow[];
  sources: SourceRow[];
  visitorsToday: number | null;
  visitorCountries: CountryVisitors[];
  analyticsError: string | null;
}) {
  const totals = useMemo(
    () =>
      months.reduce(
        (a, m) => ({
          signups: a.signups + m.signups,
          free: a.free + m.free,
          pro: a.pro + m.pro,
          max: a.max + m.max,
          paid: a.paid + m.paid,
        }),
        { signups: 0, free: 0, pro: 0, max: 0, paid: 0 },
      ),
    [months],
  );

  const latest = months[months.length - 1];
  // Floor of 1 so a run of empty months cannot divide by zero and blank the
  // whole chart. Same guard the dashboard uses.
  const tallest = Math.max(1, ...months.map((m) => m.signups));
  const visitorTotal = Math.max(
    1,
    visitorCountries.reduce((a, c) => a + c.visitors, 0),
  );

  const download = () => {
    const blob = new Blob([toCsv(months)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jooma-stats-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Stats"
        sub="Signups, plans, geography and attribution."
      >
        <div className="flex items-center gap-2">
          <RangeTabs />
          <Btn variant="primary" onClick={download}>
            Export CSV
          </Btn>
        </div>
      </PageHead>

      {/* ── Visitors today ─────────────────────────────────────────────────
          Labelled "today", not "right now". Vercel's analytics API floors
          every window to a whole day, so a live presence count is not
          available from this source at any granularity. */}
      <Card>
        <CardHeader>
          <CardTitle>Visitors today</CardTitle>
        </CardHeader>
        <CardBody>
          {analyticsError ? (
            <Note tone="warn">
              {analyticsError} Visitor figures come from Vercel Web Analytics, which needs
              a <b>VERCEL_API_TOKEN</b> with read access. Everything else on this page
              comes from the database and is unaffected.
            </Note>
          ) : (
            <div className="flex flex-wrap items-center gap-8">
              <div>
                <p className="text-4xl font-bold tabular-nums" style={{ color: C.ink }}>
                  {nf.format(visitorsToday ?? 0)}
                </p>
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  people, so far today
                </p>
              </div>
              <div className="flex flex-wrap gap-5">
                {visitorCountries.map((c) => (
                  <div key={c.country} className="min-w-22.5">
                    <div
                      className="h-1.5 rounded-full mb-1.5"
                      style={{ backgroundColor: C.divider }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${share(c.visitors, visitorTotal)}%`,
                          backgroundColor: C.brand,
                        }}
                      />
                    </div>
                    <p className="text-sm font-bold tabular-nums" style={{ color: C.ink }}>
                      {nf.format(c.visitors)}
                    </p>
                    <p className="text-xs" style={{ color: C.muted }}>
                      {c.country}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardBody>
        <CardFooter>
          Counted per day, not live. Vercel reports whole days only, so there is no
          honest way to show who is on the site this minute.
        </CardFooter>
      </Card>

      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4 mt-6">
        <Stat label="Signups" value={nf.format(totals.signups)} foot="in this range" />
        <Stat
          label="This month"
          value={nf.format(latest?.signups ?? 0)}
          foot={latest?.label ?? "no data"}
        />
        <Stat
          label="Paying teachers"
          value={nf.format(totals.paid)}
          foot="Pro and Max, with a live subscription"
        />
        <Stat
          label="Free to paid"
          value={conversionOf(totals)}
          foot="of signups in this range"
        />
      </div>

      {/* ── Signups by month ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Signups by month</CardTitle>
            <div className="flex gap-3.5">
              {(["free", "pro", "max"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: C.muted }}>
                  <i
                    className="w-2.5 h-2.5 rounded-sm block"
                    style={{ backgroundColor: PLAN_COLOUR[k] }}
                  />
                  {k === "max" ? "Max" : k === "pro" ? "Pro" : "Free"}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardBody>
            {months.length === 0 ? (
              <EmptyState title="No signups in this range" />
            ) : (
              <>
                <div className="flex items-end gap-1.5 h-40">
                  {months.map((m) => (
                    <div key={m.month_start} className="flex-1 flex flex-col justify-end h-full">
                      {/* Stacked most valuable at the top, so the paid band is
                          the one the eye lands on. */}
                      {(["max", "pro", "free"] as const).map((k) => {
                        const n = m[k];
                        if (n === 0) return null;
                        return (
                          <div
                            key={k}
                            style={{
                              height: `${(n / tallest) * 100}%`,
                              minHeight: 2,
                              backgroundColor: PLAN_COLOUR[k],
                            }}
                            title={`${m.label}: ${n} ${k}`}
                          />
                        );
                      })}
                      {m.signups === 0 && (
                        <div style={{ height: 1, backgroundColor: C.divider }} />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {months.map((m) => (
                    <div
                      key={m.month_start}
                      className="flex-1 text-center text-[11px] font-mono"
                      style={{ color: C.muted }}
                    >
                      {m.label.slice(0, 3)}
                      <div className="tabular-nums" style={{ color: C.ink2 }}>
                        {nf.format(m.signups)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardBody>
          <CardFooter>
            Counted from completed profiles, so accounts that signed up but never finished
            onboarding are not here. They are under Teachers, as incomplete signups. Plan
            shown is the plan each teacher is on <b>today</b>, not the one they started on:
            nothing records plan history, so an upgrade is credited to the month they
            joined.
          </CardFooter>
        </Card>
      </div>

      {/* ── Geography and attribution ─────────────────────────────────────── */}
      <div className="grid gap-3.5 mt-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <CardHeader>
            <CardTitle>Where teachers are</CardTitle>
          </CardHeader>
          <CardBody tight>
            {countries.length === 0 ? (
              <EmptyState title="No country data" />
            ) : (
              <Table>
                <thead>
                  <tr className="text-left">
                    <Th>Country</Th>
                    <Th align="right">Signups</Th>
                    <Th width="90px">&nbsp;</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Conv</Th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((c) => (
                    <Tr key={c.country}>
                      <Td>{c.country}</Td>
                      <Td align="right" mono>
                        {nf.format(c.signups)}
                      </Td>
                      <Td>
                        <span
                          className="block h-1.5 rounded-full"
                          style={{ backgroundColor: C.divider }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${share(c.signups, countries[0].signups)}%`,
                              backgroundColor: C.brand,
                            }}
                          />
                        </span>
                      </Td>
                      <Td align="right" mono>
                        {nf.format(c.paid)}
                      </Td>
                      <Td align="right" mono>
                        {conversionOf(c)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
          <CardFooter>
            Self declared at signup and editable afterwards, so this is where teachers say
            they are now, not where they were when they joined.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How teachers reached us</CardTitle>
          </CardHeader>
          <CardBody tight>
            {sources.length === 0 ? (
              <EmptyState title="No signups in this range" />
            ) : (
              <Table>
                <thead>
                  <tr className="text-left">
                    <Th>Route in</Th>
                    <Th align="right">Signups</Th>
                    <Th width="90px">&nbsp;</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Conv</Th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <Tr key={s.source}>
                      <Td>{SOURCE_LABEL[s.source] ?? s.source}</Td>
                      <Td align="right" mono>
                        {nf.format(s.signups)}
                      </Td>
                      <Td>
                        <span
                          className="block h-1.5 rounded-full"
                          style={{ backgroundColor: C.divider }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${share(s.signups, totals.signups)}%`,
                              backgroundColor: C.brand,
                            }}
                          />
                        </span>
                      </Td>
                      <Td align="right" mono>
                        {nf.format(s.paid)}
                      </Td>
                      <Td align="right" mono>
                        {conversionOf(s)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
          <CardFooter>
            Only what is actually recorded: an ambassador code, or an invite. Everything
            else is one bucket, because no referrer or campaign is stored at signup.
          </CardFooter>
        </Card>
      </div>

      {/* ── Acquisition channel, deliberately empty ───────────────────────── */}
      <div className="mt-6">
        <NotBuiltBanner>
          <b>Acquisition channel</b> is not reported. Nothing records a referrer or a
          campaign when someone signs up, so organic, search, social and paid cannot be
          told apart. The panel above shows the two routes that <i>are</i> recorded.
          Reporting this properly means capturing a source at signup first.
        </NotBuiltBanner>
      </div>

      {/* ── Monthly detail ────────────────────────────────────────────────── */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly detail</CardTitle>
          </CardHeader>
          {/* No overflow wrapper: Table already provides one. */}
          <CardBody tight>
            <Table>
                <thead>
                  <tr className="text-left">
                    <Th>Month</Th>
                    <Th align="right">Visitors</Th>
                    <Th align="right">Signups</Th>
                    <Th align="right">Free</Th>
                    <Th align="right">Pro</Th>
                    <Th align="right">Max</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Conversion</Th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <Tr key={m.month_start}>
                      <Td>{m.label}</Td>
                      <Td align="right" mono>
                        {m.visitors === null ? "—" : nf.format(m.visitors)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(m.signups)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(m.free)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(m.pro)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(m.max)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(m.paid)}
                      </Td>
                      <Td align="right" mono>
                        {conversionOf(m)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
            </Table>
          </CardBody>
          <CardFooter>
            A dash under Visitors means that month was never recorded, which is not the
            same as nobody visiting. Analytics began partway through the product&apos;s
            life. This table is exactly what the CSV export contains.
          </CardFooter>
        </Card>
      </div>

      {/* MRR over time is absent on purpose: nothing has stored a monthly
          revenue figure until now, so there is no history to draw. The daily
          snapshot lands with the cron; this panel arrives once it has rows. */}
    </>
  );
}
