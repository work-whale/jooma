"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { PLANS } from "@/app/lib/plans";
import { downloadCsv, toCsv } from "@/app/lib/csv";
import { reachLabel, sourceLabel } from "@/app/lib/ambassador-application";
import {
  AMBASSADOR_RATES,
  gbp,
  payoutDateFor,
  periodOf,
  rateShares,
} from "@/app/lib/ambassador-commission";
import { planCardName } from "@/app/lib/plan-copy";
import { nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Modal,
  Note,
  PageHead,
  Stat,
  Table,
  Tag,
  Td,
  Th,
  Tr,
  fieldClass,
  fieldStyle,
  useToast,
} from "../ui";
import ShareLinkBox from "./ShareLinkBox";
import ReviewDrawer from "./ReviewDrawer";
import ReferralsPanel from "./ReferralsPanel";
import { CodeChip, GOLD, Person, ago, shortDate } from "./shared";
import { AMB_RANGES, AMB_RANGE_LABEL, type AmbRange } from "./range";
import styles from "./ambassadors.module.css";

export interface AmbassadorRow {
  id: string;
  full_name: string;
  email: string;
  status: string;
  user_id: string | null;
  notes: string | null;
  created_at: string;
  codes: string[];
  referrals: number;
  subscribers: number;
  active_subscribers: number;
  this_month_pence: number;
  all_time_pence: number;
  owed_pence: number;
  /** When their free Pro ends. Null when never granted. */
  pro_until: string | null;
  pro_granted_at: string | null;
  source: string | null;
  approved_at: string | null;
  agreement_ends_at: string | null;
  end_requested_at: string | null;
  application_id: string | null;
  payout_method: string | null;
}

export interface ApplicationRow {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  submitted_at: string;
  reach: string;
  channels: string[];
  signed_at: string;
  requested_code: string;
  status: string;
  source: string | null;
}

export interface ProgrammeSummary {
  commission_pence: number;
  referred_revenue_pence: number;
  active_ambassadors: number;
  invited: number;
  awaiting_review: number;
  oldest_submitted_at: string | null;
  subscribers_via_codes: number;
  all_paying: number;
  invites_unopened: number;
  free_pro_seats: number;
}

/** What Stripe says about a code right now. */
export interface CodeLive {
  offer: string;
  redeemed: number;
  usable: boolean;
}

/** Live, paused, or past the end of the agreement. */
function ambassadorState(a: AmbassadorRow): { label: string; tone: "ok" | "plain" | "warn" } {
  if (a.status !== "active") return { label: "Paused", tone: "plain" };
  if (a.agreement_ends_at && new Date(a.agreement_ends_at).getTime() < Date.now()) {
    return { label: "Ended", tone: "warn" };
  }
  return { label: "Live", tone: "ok" };
}

/**
 * The ambassador programme, laid out as the v4 console mockup: KPIs, the invite
 * link maker and the rate card, applications waiting for review, live
 * ambassadors (each with the dropdown of teachers they brought in and a
 * month-by-month payout toggle), the links sent, and what it all costs.
 */
export default function AmbassadorsView({
  range,
  rows,
  summary,
  applications,
  shareLink,
  live,
  stripeError,
}: {
  range: AmbRange;
  rows: AmbassadorRow[];
  summary: ProgrammeSummary | null;
  applications: ApplicationRow[];
  /** The programme's one link: the full URL to copy, and the short form shown. */
  shareLink: { url: string; display: string };
  live: Record<string, CodeLive>;
  stripeError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [toastNode, fire] = useToast();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [proFor, setProFor] = useState<{ row: AmbassadorRow; revoke: boolean } | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((a) =>
      `${a.full_name} ${a.email} ${a.codes.join(" ")}`.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const s = summary;
  const proPence = Math.round((PLANS.pro.priceMonthly ?? 0) * 100);
  const monthsInRange =
    range === "month"
      ? 1
      : range === "3m"
        ? 3
        : Math.max(
            1,
            ...rows
              .filter((a) => a.approved_at)
              .map((a) => {
                const [y, m] = periodOf(new Date(a.approved_at!)).split("-").map(Number);
                const [cy, cm] = periodOf(new Date()).split("-").map(Number);
                return (cy - y) * 12 + (cm - m) + 1;
              }),
          );
  const seatCost = (s?.free_pro_seats ?? 0) * proPence * monthsInRange;
  const commission = Number(s?.commission_pence ?? 0);
  const revenue = Number(s?.referred_revenue_pence ?? 0);
  const costShare = revenue > 0 ? (commission / revenue) * 100 : null;
  const viaShare =
    s && Number(s.all_paying) > 0 ? (Number(s.subscribers_via_codes) / Number(s.all_paying)) * 100 : null;
  const rangePhrase =
    range === "month" ? `Paid ${shortDayMonth(payoutDateFor(periodOf(new Date())))}` : AMB_RANGE_LABEL[range].toLowerCase();

  const shares = rateShares();
  const worst = Math.max(...shares.map((r) => r.sharePct));
  const totalSubscribers = rows.reduce((a, r) => a + Number(r.active_subscribers), 0);
  const liveCount = rows.filter((a) => ambassadorState(a).label === "Live").length;

  const exportCsv = () => {
    const csv = toCsv(
      [
        "Ambassador",
        "Email",
        "Code",
        "Found on",
        "Subscribers now",
        "Teachers referred",
        "This month (GBP)",
        "All time (GBP)",
        "Owed (GBP)",
        "Agreement ends",
        "Status",
        "Paid by",
      ],
      rows.map((a) => [
        a.full_name,
        a.email,
        a.codes.join(" "),
        a.source ? sourceLabel(a.source) : "",
        a.active_subscribers,
        a.referrals,
        (Number(a.this_month_pence) / 100).toFixed(2),
        (Number(a.all_time_pence) / 100).toFixed(2),
        (Number(a.owed_pence) / 100).toFixed(2),
        a.agreement_ends_at ? a.agreement_ends_at.slice(0, 10) : "",
        ambassadorState(a).label,
        a.payout_method === "paypal" ? "PayPal" : a.payout_method === "bank" ? "Bank" : "",
      ]),
    );
    downloadCsv(csv, `jooma-ambassadors-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <>
      <PageHead
        title="Ambassador programme"
        sub="Invite links, applications, live ambassadors and what the programme costs."
      >
        <div
          className="inline-flex rounded-full p-1 border"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          {AMB_RANGES.map((r) => (
            <Link
              key={r}
              href={`${pathname}?range=${r}`}
              scroll={false}
              aria-current={r === range ? "page" : undefined}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={r === range ? { backgroundColor: C.brand, color: "#fff" } : { color: C.muted }}
            >
              {AMB_RANGE_LABEL[r]}
            </Link>
          ))}
        </div>
        <Btn onClick={exportCsv} disabled={rows.length === 0}>
          <span className="inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </span>
        </Btn>
      </PageHead>

      {/* ── KPIs ── */}
      <div
        className="grid gap-3.5 mb-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        data-testid="programme-kpis"
      >
        <div
          className={`${styles.goldKpi} rounded-2xl p-5 border`}
          data-testid="kpi-commission"
        >
          <p className="text-xs font-semibold mb-2" style={{ color: GOLD.ink }}>
            Commission, {AMB_RANGE_LABEL[range].toLowerCase()}
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: GOLD.ink }}>
            {gbp(commission)}
          </p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>
            {rangePhrase}
          </p>
        </div>
        <Stat
          label="Active ambassadors"
          value={nf.format(Number(s?.active_ambassadors ?? 0))}
          foot="live now"
        />
        <Stat
          label="Awaiting review"
          value={nf.format(Number(s?.awaiting_review ?? 0))}
          foot={s?.oldest_submitted_at ? `oldest ${ago(s.oldest_submitted_at)}` : "Nothing waiting"}
        />
        <Stat
          label="Subscribers via codes"
          value={nf.format(Number(s?.subscribers_via_codes ?? 0))}
          foot={viaShare !== null ? `${viaShare.toFixed(0)}% of all paying` : "No paying teachers yet"}
        />
        <Stat
          label="Programme cost"
          value={costShare !== null ? `${costShare.toFixed(1)}%` : "None yet"}
          foot="commission, of referred revenue"
        />
      </div>

      {stripeError && (
        <div className="mb-4">
          <Note tone="warn">
            <b>Could not reach Stripe.</b> {stripeError} Commission and payouts below are
            unaffected, but each code&apos;s offer and whether it still works cannot be shown.
          </Note>
        </div>
      )}

      {/* ── Share link and rate card ── */}
      <div className="grid gap-3 mb-4 xl:grid-cols-[1.1fr_1fr]">
        <ShareLinkBox url={shareLink.url} display={shareLink.display} />
        <Card>
          <CardHeader>
            <CardTitle>Commission rates</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              Applies to every ambassador
            </span>
          </CardHeader>
          <div className="px-4 pb-4">
            <Table>
              <thead>
                <tr className="text-left">
                  <Th>Plan</Th>
                  <Th align="right">Plan price</Th>
                  <Th align="right">Monthly, each month</Th>
                  <Th align="right">Yearly, once</Th>
                  <Th align="right">Share of revenue</Th>
                </tr>
              </thead>
              <tbody>
                {shares.map((r) => (
                  <Tr key={r.plan}>
                    <Td>
                      <span className="font-semibold" style={{ color: C.ink }}>
                        {planCardName(r.plan)}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {gbp(r.priceMonthlyPence)} / {gbp(r.priceYearlyPence)}
                    </Td>
                    <Td align="right" mono>
                      {gbp(AMBASSADOR_RATES.month[r.plan])}
                    </Td>
                    <Td align="right" mono>
                      {gbp(AMBASSADOR_RATES.year[r.plan])}
                    </Td>
                    <Td align="right" mono>
                      <span style={{ color: C.warn }}>{r.sharePct.toFixed(1)}%</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="text-xs mt-3" style={{ color: C.muted }}>
              Share of revenue is the commission against that plan&apos;s own price, monthly and
              yearly averaged. Worked out from the live plan prices and the rate card, so it moves
              when either does.
            </p>
            <div className="mt-3">
              <Note tone="warn">
                The rates take up to <b>{worst.toFixed(1)}%</b> of a referred subscription. Against a
                gross margin around 80% that is roughly <b>{(worst / 0.8).toFixed(0)}% of the margin</b>{" "}
                on every referred teacher, for as long as the ambassador&apos;s agreement runs. A
                change of rate applies to payments from then on, with 60 days&apos; notice.
              </Note>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Awaiting review ── */}
      <div className="mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Awaiting review</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              {applications.length === 0
                ? "Nothing waiting"
                : `${applications.length} application${applications.length === 1 ? "" : "s"} · oldest submitted ${ago(applications[0].submitted_at)}`}
            </span>
          </CardHeader>
          {applications.length === 0 ? (
            <EmptyState
              title="No applications waiting"
              body="When someone applies through the link, they appear here to review."
            />
          ) : (
            <Table>
              <thead>
                <tr className="text-left">
                  <Th>Applicant</Th>
                  <Th>Submitted</Th>
                  <Th>Reach</Th>
                  <Th>Channels</Th>
                  <Th>Code</Th>
                  <Th>Signed</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Person name={a.full_name} sub={a.source && a.source !== "other" ? `Found on ${sourceLabel(a.source)}` : "Applicant"} />
                    </Td>
                    <Td>
                      <span className="text-xs">{ago(a.submitted_at)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs">{reachLabel(a.reach)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: C.muted }}>
                        {a.channels.join(", ")}
                      </span>
                    </Td>
                    <Td>
                      <CodeChip code={a.requested_code} />
                    </Td>
                    <Td>
                      <span className="text-xs">{shortDate(a.signed_at)}</span>
                    </Td>
                    <Td align="right">
                      <Btn size="sm" variant="primary" onClick={() => setReviewing(a.id)}>
                        Review
                      </Btn>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* ── Live ambassadors ── */}
      <div className="mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Active ambassadors</CardTitle>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or code"
              className="text-sm rounded-lg border px-3 py-1.5"
              style={{ borderColor: C.border, minWidth: 210 }}
            />
            <span className="text-xs" style={{ color: C.muted }}>
              {nf.format(liveCount)} live · {nf.format(totalSubscribers)} subscribers between them
            </span>
          </CardHeader>
          {filtered.length === 0 ? (
            <EmptyState
              title={rows.length === 0 ? "No ambassadors yet" : "Nothing matches that"}
              body={
                rows.length === 0
                  ? "Share the link above. When you approve an application, they appear here with their code."
                  : "Try clearing the search."
              }
            />
          ) : (
            <Table>
              <thead>
                <tr className="text-left">
                  <Th width="32px"> </Th>
                  <Th>Ambassador</Th>
                  <Th>Code</Th>
                  <Th align="right">Subscribers</Th>
                  <Th align="right">This month</Th>
                  <Th align="right">All time</Th>
                  <Th align="right">Owed</Th>
                  <Th>Agreement ends</Th>
                  <Th align="right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const open = expanded.has(a.id);
                  const state = ambassadorState(a);
                  return (
                    <Fragment key={a.id}>
                      <Tr clickable onClick={() => toggle(a.id)}>
                        <Td>
                          <span style={{ color: C.muted }}>
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </span>
                        </Td>
                        <Td>
                          <Person
                            name={a.full_name}
                            sub={a.source && a.source !== "other" ? `Ambassador · ${sourceLabel(a.source)}` : a.email}
                            gold
                          />
                        </Td>
                        <Td>
                          {a.codes.length === 0 ? (
                            <span className="text-xs" style={{ color: C.muted }}>
                              No code
                            </span>
                          ) : (
                            a.codes.map((code) => {
                              const info = live[code.toUpperCase()];
                              return (
                                <div key={code} className="mb-0.5">
                                  <CodeChip code={code} />
                                  {info && (
                                    <div className="text-xs mt-1" style={{ color: C.muted }}>
                                      {info.offer}
                                      {!info.usable && " · not usable"}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </Td>
                        <Td align="right" mono>
                          {nf.format(Number(a.active_subscribers))}
                        </Td>
                        <Td align="right" mono>
                          {gbp(Number(a.this_month_pence))}
                        </Td>
                        <Td align="right" mono>
                          {gbp(Number(a.all_time_pence))}
                        </Td>
                        <Td align="right" mono>
                          {Number(a.owed_pence) > 0 ? (
                            <Tag tone="warn">{gbp(Number(a.owed_pence))}</Tag>
                          ) : (
                            <span style={{ color: C.muted }}>{gbp(0)}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="text-xs">
                            {a.agreement_ends_at ? shortDate(a.agreement_ends_at) : "No agreement"}
                          </span>
                        </Td>
                        <Td align="right">
                          <div className="flex flex-col items-end gap-1">
                            <Tag tone={state.tone} dot>
                              {state.label}
                            </Tag>
                            {a.end_requested_at && <Tag tone="warn">Asked to end</Tag>}
                          </div>
                        </Td>
                      </Tr>

                      {open && (
                        <tr>
                          {/* Set off by a tinted gutter and a top border, not a
                              fill behind the rows, so the row separators stay
                              visible and the text stays on the card surface. */}
                          <td
                            colSpan={9}
                            style={{
                              backgroundColor: C.surface,
                              padding: 0,
                              borderTop: `2px solid ${GOLD.main}`,
                              boxShadow: `inset 4px 0 0 ${GOLD.bg}`,
                            }}
                          >
                            <ReferralsPanel
                              ambassador={a}
                              onToast={fire}
                              onFreePro={(revoke) => setProFor({ row: a, revoke })}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* ── Costs ── */}
      <div className="grid gap-3">
        <Card>
          <CardHeader>
            <CardTitle>What the programme costs</CardTitle>
            <span className="text-xs" style={{ color: C.muted }}>
              {AMB_RANGE_LABEL[range]}
            </span>
          </CardHeader>
          <div className="px-4 pb-4">
            <Table>
              <tbody>
                <Tr>
                  <Td>Commission earned by ambassadors</Td>
                  <Td align="right" mono>
                    {gbp(commission)}
                  </Td>
                </Tr>
                <Tr>
                  <Td>
                    Free Pro accounts, {nf.format(Number(s?.free_pro_seats ?? 0))} × {gbp(proPence)}
                    {monthsInRange > 1 ? ` × ${monthsInRange} months` : ""}
                  </Td>
                  <Td align="right" mono>
                    {gbp(seatCost)}
                  </Td>
                </Tr>
                <Tr>
                  <Td>Revenue from referred subscribers</Td>
                  <Td align="right" mono>
                    {gbp(revenue)}
                  </Td>
                </Tr>
                <Tr>
                  <Td>
                    <b style={{ color: C.ink }}>Net contribution</b>
                  </Td>
                  <Td align="right" mono>
                    <b style={{ color: C.ink }}>{gbp(revenue - commission - seatCost)}</b>
                  </Td>
                </Tr>
              </tbody>
            </Table>
            <div className="mt-3">
              <Note tone="warn">
                <b>Watch this.</b> Monthly commission keeps running for as long as each
                ambassador&apos;s agreement does, so the cost line grows with every teacher they keep,
                even in a month with no new ambassadors. Review it against referred revenue every
                quarter.
              </Note>
            </div>
          </div>
        </Card>
      </div>

      {reviewing && (
        <ReviewDrawer
          applicationId={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {proFor && (
        <FreeProModal
          row={proFor.row}
          revoke={proFor.revoke}
          onClose={() => setProFor(null)}
          onDone={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function shortDayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function FreeProModal({
  row,
  revoke,
  onClose,
  onDone,
}: {
  row: AmbassadorRow;
  revoke: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ambassadors/grant-pro", {
        method: revoke ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambassadorId: row.id, reason }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return;
      }
      onDone(json.message ?? "Saved.");
      onClose();
    } catch {
      setSaving(false);
      setError("Could not reach the server.");
    }
  };

  return (
    <Modal
      title={revoke ? `End ${row.full_name}'s free Pro` : `Give ${row.full_name} free Pro`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : revoke ? "End free Pro" : "Grant 12 months of Pro"}
          </Btn>
        </>
      }
    >
      <p className="text-sm mb-4" style={{ color: C.ink2 }}>
        {revoke
          ? "Their free Pro ends now. If they have since subscribed themselves, their subscription is left alone."
          : "Pro, free for 12 months from today, with no card on file. It ends by itself after that, and they are shown a countdown in the last 30 days. Anyone already paying through Stripe has to be cancelled first."}
      </p>
      <Field label="Reason" help="Goes in the audit log.">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={revoke ? "Stepped down as an ambassador" : "Joined the ambassador programme"}
          className={fieldClass}
          style={fieldStyle}
        />
      </Field>
      {error && (
        <p className="text-sm mt-2" role="alert" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
