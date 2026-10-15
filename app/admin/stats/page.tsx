import { adminAccess } from "../access";
import { loadTrueMrr } from "../trueMrr";
import {
  visitorsByCountryToday,
  visitorsByMonth,
  visitorsToday,
} from "@/app/lib/vercelAnalytics";
import type { GuestFunnelRow, GuestTryRow } from "./guestTries";
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
  // Paying subscriptions come from teacher_mrr, which is revenue and is gated
  // on see_money. Marketing lands here without it, so the panel is left out
  // for them rather than shown as an error.
  const seesMoney = access.can("see_money");

  // Every source in parallel. The Vercel calls cannot reject (they resolve to
  // { data: null, error }) so one unreachable service degrades its own panel
  // rather than the page.
  const [
    { data: byMonth },
    { data: byCountry },
    { data: bySource },
    { data: guestTries, error: guestTriesError },
    { data: guestFunnel, error: guestFunnelError },
    { data: mrrRows, error: mrrError },
    today,
    visitorMonths,
    countryVisitors,
  ] = await Promise.all([
    supabase.rpc("admin_signup_stats_by_month", { p_months: months }),
    supabase.rpc("admin_signup_stats_by_country", { p_months: months, p_limit: 10 }),
    supabase.rpc("admin_signup_stats_by_source", { p_months: months }),
    supabase.rpc("admin_guest_try_stats", { p_months: months }),
    supabase.rpc("admin_guest_try_funnel", { p_months: months }),
    // The subscriptions the dashboard counts as paying, so the monthly and
    // yearly split here describes the same people as its MRR.
    seesMoney ? supabase.rpc("teacher_mrr") : Promise.resolve({ data: null, error: null }),
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
    standard: Number(m.standard),
    pro: Number(m.pro),
    max: Number(m.max),
    paid: Number(m.paid),
    visitors: visitorsByStart.get(String(m.month_start).slice(0, 7)) ?? null,
  }));

  // Monthly against yearly is only known to Stripe: nothing in the database
  // records a subscription's interval. Never rejects; on failure the panel
  // says so and the rest of the page is unaffected.
  const payingSubIds =
    ((mrrRows ?? [])[0] as { paying_sub_ids?: string[] } | undefined)?.paying_sub_ids ?? [];
  const live = !seesMoney || mrrError ? null : await loadTrueMrr(payingSubIds);
  if (mrrError) console.warn("[stats] teacher_mrr failed:", mrrError.message);
  const subscriptionsError = mrrError
    ? "Paying subscriptions could not be loaded."
    : live?.error
      ? "Stripe could not be reached."
      : null;

  if (guestTriesError) console.warn("[stats] admin_guest_try_stats failed:", guestTriesError.message);
  if (guestFunnelError) console.warn("[stats] admin_guest_try_funnel failed:", guestFunnelError.message);

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
        channel: String(s.channel ?? "unknown"),
        signups: Number(s.signups),
        paid: Number(s.paid),
      }))}
      guestTries={((guestTries ?? []) as GuestTryRow[]).map((g) => ({
        ...g,
        month_start: String(g.month_start),
        tries: Number(g.tries),
        succeeded: Number(g.succeeded),
        failed: Number(g.failed),
        claimed: Number(g.claimed),
        guests: Number(g.guests),
      }))}
      // Its own error, not the page's: until the migration is pushed this one
      // panel says so and everything else renders as before.
      guestTriesError={guestTriesError ? "Free try figures could not be loaded." : null}
      guestFunnel={((guestFunnel ?? []) as GuestFunnelRow[]).map((f) => ({
        ...f,
        month_start: String(f.month_start),
        tried: Number(f.tried),
        new_accounts: Number(f.new_accounts),
        started_trial: Number(f.started_trial),
        paying: Number(f.paying),
        existing_logins: Number(f.existing_logins),
      }))}
      // Its own error again, so the funnel can be pushed after the tries.
      guestFunnelError={guestFunnelError ? "Signup figures could not be loaded." : null}
      showSubscriptions={seesMoney}
      subscriptions={
        live && !subscriptionsError
          ? { month: live.byInterval.month, year: live.byInterval.year }
          : null
      }
      subscriptionsError={subscriptionsError}
      visitorsToday={today.data?.visitors ?? null}
      visitorCountries={countryVisitors.data ?? []}
      analyticsError={today.error}
    />
  );
}
