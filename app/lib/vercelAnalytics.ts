import "server-only";

/**
 * Visitor figures from Vercel Web Analytics.
 *
 * The @vercel/analytics package mounted in app/layout.tsx is a WRITE path only:
 * it beacons page views to Vercel and stores nothing we can query. Reading them
 * back is a REST call against Vercel's API, which is what this does.
 *
 * WHY THERE IS NO "ON SITE RIGHT NOW"
 *
 * The API floors every window to whole days. A 30 minute range comes back as a
 * whole day, and asking for the last few minutes returns zero rather than a
 * small number. There is no granularity below a day at any parameter, so a live
 * presence count cannot be built on this. The page says "Visitors today"
 * instead, which is the finest figure this source can honestly support.
 *
 * FAILURE POSTURE, borrowed from trueMrr.ts
 *
 * Never throws. Every function returns null data and an `error` string when the
 * token is missing or Vercel is unreachable, and the page renders the panel as
 * unavailable rather than 500ing. Visitor counts are the least important thing
 * on the Stats page; they must never be able to take the page down.
 *
 * SETUP THIS DEPENDS ON
 *
 * ONE token covers every environment: a Vercel API token is account level, not
 * project level, so the same VERCEL_API_TOKEN works for staging and production.
 * The PROJECT is what differs, and that is why the id is an env var rather than
 * a constant: staging and production are separate Vercel projects with separate
 * analytics, and a hardcoded id would quietly show production's visitor numbers
 * on the staging console.
 *
 *   - VERCEL_API_TOKEN, read scope. Vercel, Account Settings, Tokens. The same
 *     value in .env.local and in both projects' environment variables.
 *   - VERCEL_TEAM_ID, the team that owns the project.
 *
 * There is currently ONE Vercel project (`jooma`), with staging and production
 * as branches of it, so both read the same analytics and neither needs a
 * project id set by hand. Should staging ever become its own Vercel project,
 * set VERCEL_ANALYTICS_PROJECT_ID on it, or it will report production's
 * visitors as its own with nothing on screen to say so.
 */

// https://vercel.com/docs/analytics/web-analytics-api
// Note the shape: /v1/query/web-analytics/visits/<verb>, on api.vercel.com.
// Not vercel.com/api/..., which 404s with a perfectly valid token and so reads
// as an auth problem rather than a wrong URL.
const BASE = "https://api.vercel.com/v1/query/web-analytics/visits";

/** The project whose analytics to read.
 *
 *  VERCEL_PROJECT_ID is injected automatically on Vercel but does NOT exist
 *  when running `next dev`, so the literal is the local fallback: without it
 *  the panels stay dark on a developer's machine even with a valid token, which
 *  reads as a broken feature rather than a missing variable. The explicit env
 *  var still wins, so pointing a deploy at another project's data needs no
 *  code change. */
const DEFAULT_PROJECT_ID = "prj_bDKQFMQomGvqDwMLeCu1lmQCweej";

function projectId(): string | null {
  return (
    process.env.VERCEL_ANALYTICS_PROJECT_ID ??
    process.env.VERCEL_PROJECT_ID ??
    DEFAULT_PROJECT_ID
  );
}

/** Same reasoning as the project id: VERCEL_ORG_ID is injected on Vercel and
 *  absent locally, so the team the project actually belongs to is the fallback. */
const DEFAULT_TEAM_ID = "team_XDlzoBFQq6Wf7oLxj47xla0W";

function teamId(): string | null {
  return process.env.VERCEL_TEAM_ID ?? process.env.VERCEL_ORG_ID ?? DEFAULT_TEAM_ID;
}

export interface VisitorPoint {
  /** Start of the bucket, ISO. */
  timestamp: string;
  visitors: number;
  pageviews: number;
}

export interface CountryVisitors {
  country: string;
  visitors: number;
  pageviews: number;
}

export interface VisitorTotals {
  visitors: number;
  pageviews: number;
}

interface Result<T> {
  data: T | null;
  error: string | null;
}

/** What Vercel actually sends back. The payload is nested under `data`, beside
 *  the echoed query. Unwrapping it is not cosmetic: returning the envelope makes
 *  every caller's `.data` an object rather than the array or totals they expect,
 *  and because the response is cast rather than parsed, the compiler cannot see
 *  the difference. It surfaces as "x is not iterable" at request time instead. */
interface Envelope<T> {
  version?: number;
  query?: unknown;
  data?: T;
}

function fail<T>(message: string): Result<T> {
  return { data: null, error: message };
}

async function call<T>(path: string, params: Record<string, string>): Promise<Result<T>> {
  const token = process.env.VERCEL_API_TOKEN;
  const project = projectId();
  const team = teamId();

  if (!token || !project) {
    // Not an error worth logging on every render: this is the expected state
    // until the token is added, and the page is built to show it plainly.
    return fail("Vercel analytics is not configured.");
  }

  const query = new URLSearchParams({
    projectId: project,
    environment: "production",
    ...params,
  });
  // Personal accounts have no team. Sending an empty teamId is rejected, so it
  // is added only when there is one.
  if (team) query.set("teamId", team);

  try {
    const res = await fetch(`${BASE}${path}?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Visitor counts change slowly and the page is force-dynamic. Ten minutes
      // keeps a burst of admin navigation from making ten identical calls.
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[analytics] Vercel returned", res.status, body.slice(0, 300));
      return fail(
        res.status === 403
          ? "The Vercel token cannot read this project."
          : `Vercel analytics returned ${res.status}.`,
      );
    }

    const body = (await res.json()) as Envelope<T>;
    if (body?.data === undefined || body.data === null) {
      // A 200 whose body is not the documented shape. Treated as a failure so
      // the panel says so, rather than handing the page an undefined it will
      // only fail on later.
      console.error("[analytics] unexpected response shape from Vercel");
      return fail("Vercel analytics returned an unexpected response.");
    }

    return { data: body.data, error: null };
  } catch (err) {
    console.error("[analytics] could not reach Vercel", err);
    return fail("Could not reach Vercel analytics.");
  }
}

/** Whole-day window covering today, in the shape the API expects. */
function todayRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { since: start.toISOString(), until: end.toISOString() };
}

/** Months back from the start of the current month, whole months. */
function monthRange(months: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { since: start.toISOString(), until: end.toISOString() };
}

/** Visitors and page views so far today. The closest honest figure to "now". */
export async function visitorsToday(): Promise<Result<VisitorTotals>> {
  return call<VisitorTotals>("/count", todayRange());
}

/** One row per month, oldest first. Months before tracking began return zero. */
export async function visitorsByMonth(months = 12): Promise<Result<VisitorPoint[]>> {
  return call<VisitorPoint[]>("/aggregate", { ...monthRange(months), by: "month", limit: "24" });
}

/** Top countries by visitors today, for the strip beside the headline count. */
export async function visitorsByCountryToday(limit = 6): Promise<Result<CountryVisitors[]>> {
  return call<CountryVisitors[]>("/aggregate", {
    ...todayRange(),
    by: "country",
    limit: String(limit),
  });
}
