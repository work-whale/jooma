"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  ATTRIBUTION_SINCE,
  CHANNEL_LABEL,
  labelForSource,
} from "@/app/lib/attribution";
import { nf } from "../format";
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
  Table,
  Td,
  Th,
  Tr,
} from "../ui";
import RangeTabs from "./RangeTabs";
import {
  ConversionChart,
  PLAN_COLOUR,
  PlanMixChart,
  SignupsChart,
  type ChartMonth,
} from "./Charts";
import { conversionOf, deltaOf, toCsv, type Delta, type MonthRow } from "./export";
import { RANGE_PHRASE, type Range } from "./range";

export type { MonthRow };

export interface CountryRow {
  country: string;
  signups: number;
  paid: number;
}

export interface SourceRow {
  source: string;
  /** Coarse grouping, so the table stays readable at fifteen rows and nothing
   *  has to parse a "utm:" prefix in the view. */
  channel: string;
  signups: number;
  paid: number;
}

interface CountryVisitors {
  country: string;
  visitors: number;
}

/** The deep end of the purple ramp (--j-deep), used only by the visitors strip.
 *  Not in `C` because nothing else in the console has a dark panel. */
const DEEP = "#3A1C8F";
/** Lilac for text and bars on that dark panel, where C.muted is unreadable. */
const LILAC = "#CDBCF7";

/** Share of a total, guarded against the zero denominator that would otherwise
 *  render NaN% on an empty month. */
function share(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/** Built in, so a two letter code becomes a country without a lookup table to
 *  maintain. Constructed once rather than per row. */
const COUNTRY_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en-GB"], { type: "region" })
    : null;

/**
 * "GB" as "United Kingdom".
 *
 * Anything that is not a resolvable region code passes through unchanged, which
 * covers the two values this data actually carries besides real codes: the
 * literal "Not given" from a teacher who never set one, and a stray code Intl
 * does not know. `of()` throws on a malformed input rather than returning
 * undefined, hence the try.
 */
function countryName(code: string): string {
  if (!COUNTRY_NAMES || code.length !== 2) return code;
  try {
    return COUNTRY_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** The movement pill under a KPI figure. Green for a rise, amber for a fall,
 *  and brand purple for "new" or "no change", which are statements about the
 *  data rather than good or bad news. */
function DeltaChip({ delta }: { delta: Delta }) {
  const tone =
    delta.dir === "up"
      ? { bg: C.okBg, color: C.ok }
      : delta.dir === "down"
        ? { bg: C.warnBg, color: C.warn }
        : { bg: C.brandBg, color: C.brand };

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ backgroundColor: tone.bg, color: tone.color }}
    >
      {/* The arrow carries the direction for anyone reading colour poorly, and
          is hidden from screen readers because the label beside it says it. */}
      {delta.dir === "up" && <ArrowUp size={11} strokeWidth={3} aria-hidden />}
      {delta.dir === "down" && <ArrowDown size={11} strokeWidth={3} aria-hidden />}
      {delta.label}
    </span>
  );
}

/** A KPI tile with the mockup's pill delta beside its footnote.
 *
 *  Local rather than a change to the shared `Stat`, whose delta is plain text
 *  and is used that way by several other admin pages. */
function Kpi({
  label,
  value,
  delta,
  foot,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  foot?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums mt-2 mb-2" style={{ color: C.ink }}>
        {value}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: C.muted }}>
        {delta && <DeltaChip delta={delta} />}
        {foot}
      </p>
    </div>
  );
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
          // Only months that actually reported. A missing month counted as
          // zero would read as a traffic collapse rather than a gap.
          visitors: m.visitors === null ? a.visitors : (a.visitors ?? 0) + m.visitors,
        }),
        { signups: 0, free: 0, pro: 0, max: 0, paid: 0, visitors: null as number | null },
      ),
    [months],
  );

  const latest = months[months.length - 1];
  const previous = months[months.length - 2];

  /** Every KPI's movement is the latest month against the one before it, which
   *  is the comparison the footnote claims. Computed together so a range with
   *  a single month yields nulls everywhere rather than a mix. */
  const deltas = useMemo(
    () => ({
      signups: deltaOf(latest?.signups ?? null, previous?.signups),
      paid: deltaOf(latest?.paid ?? null, previous?.paid),
      visitors: deltaOf(latest?.visitors ?? null, previous?.visitors),
      conversion: deltaOf(
        latest && latest.signups > 0 ? (latest.paid / latest.signups) * 100 : null,
        previous && previous.signups > 0 ? (previous.paid / previous.signups) * 100 : undefined,
      ),
    }),
    [latest, previous],
  );

  /** Chart rows. `short` is the axis label; the full label stays for tooltips,
   *  because "Sep" alone is ambiguous across a 12 month range. */
  const chartData: ChartMonth[] = useMemo(
    () =>
      months.map((m) => ({
        label: m.label,
        short: m.label.slice(0, 3),
        signups: m.signups,
        free: m.free,
        pro: m.pro,
        max: m.max,
        paid: m.paid,
        conversion: m.signups > 0 ? (m.paid / m.signups) * 100 : 0,
      })),
    [months],
  );

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
      <PageHead title="Stats" sub="Signups, plans, geography and attribution.">
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
          available from this source at any granularity. The panel takes the
          mockup's deep purple, but not its "on site right now" wording. */}
      {analyticsError ? (
        <Card>
          <CardBody>
            <Note tone="warn">
              {analyticsError} Visitor figures come from Vercel Web Analytics, which needs a{" "}
              <b>VERCEL_API_TOKEN</b> with read access. Everything else on this page comes
              from the database and is unaffected.
            </Note>
          </CardBody>
        </Card>
      ) : (
        <div
          className="rounded-2xl p-5 sm:p-6 grid gap-6 sm:grid-cols-[auto_1fr] items-center"
          style={{ backgroundColor: DEEP }}
        >
          <div>
            <div className="flex items-baseline gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full self-center"
                style={{ backgroundColor: "#4ADE80" }}
              />
              <p
                className="text-4xl font-bold tabular-nums tracking-tight"
                style={{ color: C.white }}
              >
                {nf.format(visitorsToday ?? 0)}
              </p>
            </div>
            <p
              className="text-xs font-bold uppercase tracking-widest mt-1.5"
              style={{ color: LILAC }}
            >
              People here so far today
            </p>
          </div>
          <div className="flex flex-wrap gap-5">
            {visitorCountries.map((c) => (
              <div key={c.country} className="min-w-26">
                <div
                  className="h-1.5 rounded-full mb-2 overflow-hidden"
                  style={{ backgroundColor: "rgba(205,188,247,.25)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${share(c.visitors, visitorTotal)}%`,
                      backgroundColor: LILAC,
                    }}
                  />
                </div>
                <p className="text-base font-bold tabular-nums" style={{ color: C.white }}>
                  {nf.format(c.visitors)}
                </p>
                <p className="text-xs" style={{ color: LILAC }}>
                  {countryName(c.country)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs mt-2 mb-6" style={{ color: C.muted }}>
        Counted per day, not live. Vercel reports whole days only, so there is no honest way
        to show who is on the site this minute.
      </p>

      {/* ── KPIs ───────────────────────────────────────────────────────────
          Deltas compare the newest month to the one before it, so the figure
          under a range total still answers "and is that going up". */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Total signups"
          value={nf.format(totals.signups)}
          delta={deltas.signups}
          foot={RANGE_PHRASE[range]}
        />
        <Kpi
          label="This month"
          value={nf.format(latest?.signups ?? 0)}
          delta={deltas.signups}
          foot={latest?.label ?? "no data"}
        />
        <Kpi
          label="Paying teachers"
          value={nf.format(totals.paid)}
          delta={deltas.paid}
          foot="Pro and Max"
        />
        <Kpi
          label="Free to paid"
          value={conversionOf(totals)}
          delta={deltas.conversion}
          foot={RANGE_PHRASE[range]}
        />
        <Kpi
          label="Visitors"
          value={totals.visitors === null ? "—" : nf.format(totals.visitors)}
          delta={deltas.visitors}
          foot={totals.visitors === null ? "not recorded" : RANGE_PHRASE[range]}
        />
      </div>

      {/* ── Signups by month, and the plan mix beside it ───────────────────── */}
      <div className="grid gap-3.5 mt-6 grid-cols-1 xl:grid-cols-[1.75fr_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Signups by month</CardTitle>
            <div className="flex gap-3.5">
              {(["free", "pro", "max"] as const).map((k) => (
                <span
                  key={k}
                  className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: C.muted }}
                >
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
              <SignupsChart data={chartData} />
            )}
          </CardBody>
          <CardFooter>
            {/* One span, because CardFooter is a flex row: a bare <b> among the
                text becomes its own flex item and floats out of the sentence. */}
            <span>
              Counted from completed profiles, so accounts that signed up but never finished
              onboarding are not here. They are under Teachers, as incomplete signups. Plan
              shown is the plan each teacher is on <b>today</b>, not the one they started on:
              nothing records plan history, so an upgrade is credited to the month they
              joined.
            </span>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan mix</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              {RANGE_PHRASE[range]}
            </span>
          </CardHeader>
          <CardBody>
            {totals.signups === 0 ? (
              <EmptyState title="No signups in this range" />
            ) : (
              <>
                <PlanMixChart
                  free={totals.free}
                  pro={totals.pro}
                  max={totals.max}
                  conversion={conversionOf(totals)}
                />
                <div className="mt-4 flex flex-col gap-2">
                  {(["free", "pro", "max"] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: k === "max" ? C.okBg : k === "pro" ? C.brandBg : C.page,
                          color: k === "max" ? C.ok : k === "pro" ? C.brand : C.muted,
                        }}
                      >
                        {k === "max" ? "Max" : k === "pro" ? "Pro" : "Free"}
                      </span>
                      <span
                        className="ml-auto tabular-nums font-semibold"
                        style={{ color: C.ink2 }}
                      >
                        {nf.format(totals[k])}
                      </span>
                      <span
                        className="tabular-nums w-14 text-right"
                        style={{ color: C.muted }}
                      >
                        {share(totals[k], totals.signups).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Free to paid conversion ────────────────────────────────────────── */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Free to paid conversion</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              Share of each month&apos;s signups now on a paid plan
            </span>
          </CardHeader>
          <CardBody>
            {months.length === 0 ? (
              <EmptyState title="No signups in this range" />
            ) : (
              <ConversionChart data={chartData} />
            )}
          </CardBody>
          <CardFooter>
            <span>
              Each point is that month&apos;s cohort measured <b>today</b>, not within a
              fixed window, so recent months look weaker simply because their teachers have
              had less time to upgrade.
            </span>
          </CardFooter>
        </Card>
      </div>

      {/* ── Geography and acquisition, side by side ────────────────────────────
          A 1fr/1fr pair matching the spec's .grid2b, stacking to one column on a
          narrow screen. The titles are the spec's too: "Where signups come from"
          is the COUNTRY table there, and the source table is "Acquisition
          channel". Worth stating because the obvious reading is the other way
          round, and an earlier draft of this page had them swapped. */}
      <div className="grid gap-3.5 mt-6 grid-cols-1 xl:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Where signups come from</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              Top {countries.length || 10} countries
            </span>
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
                    <Th align="right">Paid</Th>
                    <Th align="right">Conv</Th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((c) => (
                    <Tr key={c.country}>
                      {/* Body weight, not heading weight: the name is a label
                          for the row, and at bold near-black it read heavier
                          than the numbers it introduces. */}
                      <Td>
                        <span style={{ color: C.ink2 }}>{countryName(c.country)}</span>
                      </Td>
                      <Td align="right" mono>
                        {nf.format(c.signups)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(c.paid)}
                      </Td>
                      <Td align="right" mono>
                        <span style={{ color: C.muted }}>{conversionOf(c)}</span>
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
            <CardTitle>Acquisition channel</CardTitle>
          </CardHeader>
          <CardBody tight>
            {sources.length === 0 ? (
              <EmptyState title="No signups in this range" />
            ) : (
              <Table>
                <thead>
                  <tr className="text-left">
                    <Th>Source</Th>
                    <Th align="right">Signups</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Conv</Th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <Tr key={s.source}>
                      {/* The channel rides under the source rather than in its
                          own column: at half width the extra column crushes
                          the numbers, and the grouping is a hint rather than
                          something anyone scans down. */}
                      <Td>
                        <span style={{ color: C.ink2 }}>{labelForSource(s.source)}</span>
                        <div className="text-xs" style={{ color: C.muted }}>
                          {CHANNEL_LABEL[s.channel] ?? s.channel}
                        </div>
                      </Td>
                      <Td align="right" mono>
                        {nf.format(s.signups)}
                      </Td>
                      <Td align="right" mono>
                        {nf.format(s.paid)}
                      </Td>
                      <Td align="right" mono>
                        <span style={{ color: C.muted }}>{conversionOf(s)}</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
          <CardFooter>
            <span>
              One row per teacher, credited to the campaign tag first, then an invite, then an
              ambassador code, then the linking site. A code redeemed after an ad click counts
              as the ad, so read total ambassador signups on the Ambassadors page. Accounts
              created before {ATTRIBUTION_SINCE} sit under Not recorded permanently. Paid
              social is a floor, not a total: an in app browser that hands sign in to Google
              loses the source on the way.
            </span>
          </CardFooter>
        </Card>
      </div>

      {/* ── How to tag a link ─────────────────────────────────────────────────
          On the page the marketing team actually reads, so a missing tag is
          self diagnosing rather than something to chase over email. */}
      <div className="mt-3.5">
        <Note>
          A campaign only appears above if its link carries a tag. Point ads at{" "}
          <b>jooma.ai?utm_source=facebook&amp;utm_medium=cpc&amp;utm_campaign=autumn</b>,
          changing the three values per campaign. An untagged link still counts under the site
          that sent it, but without the campaign name.
        </Note>
      </div>

      {/* ── Monthly detail ────────────────────────────────────────────────── */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly detail</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              This is the table the CSV export produces
            </span>
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
                    <Td>
                      <span style={{ color: C.ink2 }}>{m.label}</span>
                    </Td>
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
                      <span style={{ color: C.muted }}>{conversionOf(m)}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
          <CardFooter>
            A dash under Visitors means that month was never recorded, which is not the same
            as nobody visiting. Analytics began partway through the product&apos;s life. This
            table is exactly what the CSV export contains.
          </CardFooter>
        </Card>
      </div>

      {/* MRR over time is absent on purpose: nothing has stored a monthly
          revenue figure until now, so there is no history to draw. The daily
          snapshot lands with the cron; this panel arrives once it has rows. */}
    </>
  );
}
