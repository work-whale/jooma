import { adminAccess } from "../access";
import {
  visitorsByCountryToday,
  visitorsByMonth,
  visitorsToday,
} from "@/app/lib/vercelAnalytics";
import { monthsFor, parseRange } from "./range";
import StatsView, {
  type CountryRow,
  type MonthRow,
  type SourceRow,
} from "./StatsView";
import { Card, CardBody, EmptyState, PageHead } from "../ui";

// Signups, plans, geography and attribution.
//
// WHY THIS PAGE DOES NOT REDIRECT
//
// It is the landing page for the marketing role, which means it is the TARGET
// of the redirect in app/admin/page.tsx. If it redirected on a failed check,
// those two pages could bounce a request between them forever. So it renders
// the refusal inline instead, and the console has exactly one redirect edge,
// pointing away from /admin.
export const dynamic = "force-dynamic";

export default async function AdminStatsPage(props: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const { supabase, access } = await adminAccess();

  if (!access.can("see_stats")) {
    return (
      <>
        <PageHead title="Stats" />
        <Card>
          <CardBody>
            <EmptyState
              title="No access to this section"
              body="Your role does not include this area. Ask an owner to change your permissions if you need it."
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const searchParams = await props.searchParams;
  const range = parseRange(searchParams?.range);
  const months = monthsFor(range);

  // Every source in parallel. The Vercel calls cannot reject (they resolve to
  // { data: null, error }) so one unreachable service degrades its own panel
  // rather than the page.
  const [
    { data: byMonth },
    { data: byCountry },
    { data: bySource },
    today,
    visitorMonths,
    countryVisitors,
  ] = await Promise.all([
    supabase.rpc("admin_signup_stats_by_month", { p_months: months }),
    supabase.rpc("admin_signup_stats_by_country", { p_months: months, p_limit: 10 }),
    supabase.rpc("admin_signup_stats_by_source", { p_months: months }),
    visitorsToday(),
    visitorsByMonth(months),
    visitorsByCountryToday(6),
  ]);

  // Visitors are keyed by month start so the table can line them up with the
  // signup rows. Vercel returns whole months; anything it does not report stays
  // null, which renders as "not recorded" rather than zero.
  const visitorsByStart = new Map<string, number>();
  for (const point of visitorMonths.data ?? []) {
    visitorsByStart.set(point.timestamp.slice(0, 7), point.visitors);
  }

  const months_: MonthRow[] = ((byMonth ?? []) as MonthRow[]).map((m) => ({
    ...m,
    signups: Number(m.signups),
    free: Number(m.free),
    pro: Number(m.pro),
    max: Number(m.max),
    paid: Number(m.paid),
    visitors: visitorsByStart.get(String(m.month_start).slice(0, 7)) ?? null,
  }));

  return (
    <StatsView
      range={range}
      months={months_}
      countries={((byCountry ?? []) as CountryRow[]).map((c) => ({
        ...c,
        signups: Number(c.signups),
        paid: Number(c.paid),
      }))}
      sources={((bySource ?? []) as SourceRow[]).map((s) => ({
        ...s,
        signups: Number(s.signups),
        paid: Number(s.paid),
      }))}
      visitorsToday={today.data?.visitors ?? null}
      visitorCountries={countryVisitors.data ?? []}
      analyticsError={today.error}
    />
  );
}
