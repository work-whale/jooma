import Link from "next/link";
import { requireSection } from "../access";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import {
  emailResults,
  freeFunnel,
  PAID_WINDOW_DAYS,
  promptResults,
  trialCohorts,
  type AppEventRow,
  type SentRow,
} from "@/app/lib/admin-v45-reports";
import { DEFAULT_IDEAS } from "@/app/lib/e10-ideas";
import { C, Card, CardBody, CardHeader, CardTitle, Note, PageHead } from "../ui";
import IdeasEditor, { type IdeaRow } from "./IdeasEditor";

/*
 * Jooma 4.5 admin reports (spec Step 9, Phase 2): Free back in the funnel,
 * trial cohorts, and results for each prompt and email, plus the E10 idea
 * list. Behind the same permission as Plans & pricing.
 *
 * app_events and lifecycle_email_log have no client grants, so they are read
 * here with the service role, after requireSection has checked the admin.
 * The maths is in app/lib/admin-v45-reports.ts (unit tested).
 */

export const dynamic = "force-dynamic";

const RANGES = [30, 90, 365] as const;
const NAMES = [
  "prompt_shown",
  "prompt_clicked",
  "prompt_dismissed",
  "checkout_started",
  "subscribed",
  "trial_started",
  "activated",
  "moved_to_free",
  "resource_made",
  "credits_ran_out",
];
const PAGE = 1000;
const MAX_ROWS = 200_000;

async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export default async function PlansResultsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireSection("see_money");
  const { days: raw } = await searchParams;
  const days = RANGES.find((d) => String(d) === raw) ?? 90;
  const since = sinceDaysAgo(days);

  const [events, sent, seen, ideas] = await Promise.all([
    readAll<AppEventRow>((a, b) =>
      supabaseAdmin
        .from("app_events")
        .select("user_id, name, props, created_at")
        .in("name", NAMES)
        .gte("created_at", since)
        .order("id")
        .range(a, b),
    ),
    readAll<SentRow>((a, b) =>
      supabaseAdmin.from("lifecycle_email_log").select("user_id, key, sent_at, status").gte("sent_at", since).order("sent_at").range(a, b),
    ),
    readAll<{ id: string; last_seen_at: string }>((a, b) =>
      supabaseAdmin.from("profiles").select("id, last_seen_at").not("last_seen_at", "is", null).gte("last_seen_at", since).order("id").range(a, b),
    ),
    supabaseAdmin.from("lifecycle_ideas").select("id, text, tool_slug, sort, active").eq("kind", "e10").order("sort"),
  ]);

  const lastSeen = new Map(seen.map((r) => [r.id, new Date(r.last_seen_at)]));
  const prompts = promptResults(events);
  const emails = emailResults(sent, events);
  const cohorts = trialCohorts(events);
  const funnel = freeFunnel(events, lastSeen);
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

  return (
    <>
      <PageHead
        title="Plans results"
        sub={`The last ${days} days of the 4.5 events. "Paid" means a first payment within ${PAID_WINDOW_DAYS} days of a click or a send: a link, not proof it caused the payment.`}
      >
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/admin/funnel?days=${d}`}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ borderColor: C.border, color: d === days ? C.brand : C.ink2, fontWeight: d === days ? 700 : 400 }}
          >
            {d} days
          </Link>
        ))}
      </PageHead>

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Free back in the funnel</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm mb-3" style={{ color: C.muted }}>
              Each teacher&apos;s latest move to Free in this range, and what they did after it. Came back uses the last
              visit, recorded from 19 Nov 2026.
            </p>
            <Table
              head={["From", "Moved", "Came back", "Made something", "Ran out", "Checkout", "Paid"]}
              rows={[funnel.all, ...funnel.byFrom].map((r) => [
                r.from === "all" ? "All" : r.from === "failed_payment" ? "Failed payment" : r.from === "cancel" ? "Cancelled" : "Trial ended",
                r.moved,
                cell(r.cameBack, pct(r.cameBack, r.moved)),
                cell(r.made, pct(r.made, r.moved)),
                cell(r.ranOut, pct(r.ranOut, r.moved)),
                cell(r.checkout, pct(r.checkout, r.moved)),
                cell(r.paid, pct(r.paid, r.moved)),
              ])}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trial cohorts</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm mb-3" style={{ color: C.muted }}>
              By the UK week the Pro trial started (named by its Sunday). Activated: a second resource within 7 days.
            </p>
            {cohorts.length === 0 ? (
              <Note>No trials started in this range yet.</Note>
            ) : (
              <Table
                head={["Week of", "Started", "Activated", "Paid in trial", "Paid", "Moved to Free"]}
                rows={cohorts.map((c) => [
                  c.week,
                  c.started,
                  cell(c.activated, pct(c.activated, c.started)),
                  cell(c.paidInTrial, pct(c.paidInTrial, c.started)),
                  cell(c.paid, pct(c.paid, c.started)),
                  cell(c.movedToFree, pct(c.movedToFree, c.started)),
                ])}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm mb-3" style={{ color: C.muted }}>
              P8 counts one &quot;shown&quot; per teacher a day. P11 is the cancel flow&apos;s first screen.
            </p>
            <Table
              head={["Prompt", "Shown", "Clicked", "Not now", "Checkouts", "Paid"]}
              rows={prompts.map((p) => [p.id, p.shown, cell(p.clicked, pct(p.clicked, p.shown)), p.dismissed, p.checkouts, p.paid])}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emails</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm mb-3" style={{ color: C.muted }}>
              Lifecycle emails have no open or click tracking, so this is sends and payments. Nothing sends until
              it is switched on in Emails &amp; templates.
            </p>
            {emails.length === 0 ? (
              <Note>No lifecycle emails sent in this range.</Note>
            ) : (
              <Table
                head={["Email", "Sent", "Not sent", "Paid"]}
                rows={emails.map((e) => [e.id, e.sent, e.notSent, cell(e.paid, pct(e.paid, e.sent))])}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>E10 ideas</CardTitle>
          </CardHeader>
          <CardBody>
            <IdeasEditor
              initial={(ideas.data ?? []) as IdeaRow[]}
              defaults={DEFAULT_IDEAS.map((i) => ({ text: i.text, tool_slug: i.toolSlug }))}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function sinceDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function cell(n: number, share: string) {
  return share ? `${n} (${share})` : String(n);
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`py-2 pr-3 font-semibold ${i === 0 ? "text-left" : "text-right"}`}
                style={{ color: C.muted }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: C.divider }}>
              {r.map((v, j) => (
                <td key={j} className={`py-2 pr-3 tabular-nums ${j === 0 ? "text-left" : "text-right"}`} style={{ color: C.ink }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
