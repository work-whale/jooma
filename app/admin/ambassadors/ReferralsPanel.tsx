"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { asPlanId } from "@/app/lib/plans";
import { planCardName } from "@/app/lib/plan-copy";
import {
  belowMinimum,
  gbp,
  MIN_PAYOUT_PENCE,
  periodLabel,
  periodOf,
  periodsBetween,
} from "@/app/lib/ambassador-commission";
import { Btn, C, PLAN_TONE, Table, Tag, Td, Th, Tr } from "../ui";
import { shortDate as fmtDateShort } from "./shared";
import { loadApplication, PayoutDetails, type ApplicationDetail } from "./ReviewDrawer";
import type { AmbassadorRow } from "./AmbassadorsView";

export interface Commission {
  id: string;
  kind: "recurring" | "annual" | "adjustment";
  plan: string | null;
  interval: string | null;
  amount_pence: number;
  status: "unpaid" | "paid" | "reversed";
  paid_at: string | null;
}

export interface ReferralRow {
  id: string;
  user_id: string;
  teacher_name: string;
  teacher_email: string;
  joined_at: string;
  first_paid_at: string | null;
  current_plan: string;
  state: "paying" | "trial" | "lapsed" | "signed_up";
  billing_interval: string | null;
  discount_failed_reason: string | null;
  code: string;
  commissions: Commission[];
}

const STATE_LABEL: Record<ReferralRow["state"], { label: string; tone: "ok" | "brand" | "plain" | "warn" }> = {
  paying: { label: "Paying", tone: "ok" },
  trial: { label: "In trial", tone: "brand" },
  lapsed: { label: "Stopped paying", tone: "warn" },
  signed_up: { label: "Signed up", tone: "plain" },
};

type PayoutFilter = "" | "none" | "unpaid" | "paid";

/** The payout state of a teacher for the month on screen. */
function monthState(r: ReferralRow): PayoutFilter {
  const live = r.commissions.filter((c) => c.status !== "reversed");
  if (live.length === 0) return "none";
  return live.some((c) => c.status === "unpaid") ? "unpaid" : "paid";
}

/**
 * Everything under one ambassador's row: the teachers they brought in, and for
 * the chosen month what each one earned and whether it has been paid.
 *
 * THE RULE THIS SCREEN SHOWS: only a payment earns. A teacher with nothing
 * billed that month (still on trial, stopped paying, a yearly plan after its
 * one-off, or a payment after the agreement ended) reads N/A with no control at
 * all, rather than a disabled button that invites hunting for a way round it.
 */
export default function ReferralsPanel({
  ambassador,
  onToast,
  onFreePro,
}: {
  ambassador: AmbassadorRow;
  onToast: (message: string) => void;
  onFreePro: (revoke: boolean) => void;
}) {
  const router = useRouter();
  const current = periodOf(new Date());
  const start = periodOf(new Date(ambassador.approved_at ?? ambassador.created_at));
  const months = useMemo(() => periodsBetween(start, current), [start, current]);

  const [period, setPeriod] = useState(current);
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState("");
  const [payout, setPayout] = useState<PayoutFilter>("");
  const [showPayout, setShowPayout] = useState(false);
  const [app, setApp] = useState<ApplicationDetail | null>(null);

  // Which month the rows on screen belong to. A response for any other month
  // is dropped: switching months while the previous month is still loading
  // must not let the slower, older answer land on top of the new one (caught
  // by tests/growth/ambassadors.spec.ts, which showed October's commission
  // under September).
  const latest = useRef(period);

  const load = useCallback(async () => {
    const asked = period;
    latest.current = asked;
    setFailed(false);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_ambassador_referrals", {
      p_ambassador_id: ambassador.id,
      p_period: asked,
    });
    if (latest.current !== asked) return;
    if (error) {
      setFailed(true);
      return;
    }
    setRows((data ?? []) as ReferralRow[]);
  }, [ambassador.id, period]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!showPayout || app || !ambassador.application_id) return;
    loadApplication(ambassador.application_id).then(setApp);
  }, [showPayout, app, ambassador.application_id]);

  const patch = async (body: Record<string, unknown>, okMessage: string, key: string) => {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/ambassadors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        onToast(json.error ?? "Could not save.");
        return;
      }
      onToast(okMessage);
      await load();
      // The header figures (this month, owed) come from the server.
      router.refresh();
    } catch {
      onToast("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const list = rows ?? [];
  const shown = list.filter((r) => {
    if (plan && r.current_plan !== plan) return false;
    if (payout && monthState(r) !== payout) return false;
    return true;
  });

  const monthRows = list.flatMap((r) => r.commissions.filter((c) => c.status !== "reversed"));
  const earned = monthRows.reduce((a, c) => a + c.amount_pence, 0);
  const owed = monthRows.filter((c) => c.status === "unpaid").reduce((a, c) => a + c.amount_pence, 0);
  const count = (fn: (r: ReferralRow) => boolean) => list.filter(fn).length;
  const paused = ambassador.status !== "active";
  const proLive = Boolean(ambassador.pro_until) && new Date(ambassador.pro_until!).getTime() > Date.now();

  return (
    <div className="px-6 py-4 space-y-4" data-testid="referrals-panel">
      {/* The month, its totals, and paying it. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.muted }}>
          MONTH
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Month"
            className="text-sm rounded-lg border px-3 py-1.5 font-semibold"
            style={{ borderColor: C.border, color: C.ink, backgroundColor: C.surface }}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
                {m === current ? " (so far)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm" style={{ color: C.ink2 }}>
          Earned <b style={{ color: C.ink }}>{gbp(earned)}</b> · owed <b style={{ color: C.ink }}>{gbp(owed)}</b>
        </span>
        {belowMinimum(owed) && (
          <Tag tone="warn" title={`Balances under ${gbp(MIN_PAYOUT_PENCE)} roll into the next month.`}>
            Below {gbp(MIN_PAYOUT_PENCE)}, rolls forward
          </Tag>
        )}
        <div className="flex-1" />
        <Btn
          size="sm"
          variant="primary"
          disabled={owed <= 0 || busy !== null}
          onClick={() =>
            patch(
              { ambassadorId: ambassador.id, period, markAllPaid: true },
              `Marked ${periodLabel(period, false)} paid for ${ambassador.full_name}.`,
              "all",
            )
          }
        >
          {busy === "all" ? "Saving…" : `Mark all paid for ${periodLabel(period, false)}`}
        </Btn>
      </div>

      {/* Running the ambassador. */}
      <div className="flex flex-wrap items-center gap-2">
        {proLive ? (
          <>
            <Tag tone="ok">Free Pro until {fmtDateShort(ambassador.pro_until)}</Tag>
            <Btn size="sm" onClick={() => onFreePro(true)}>
              Revoke Pro
            </Btn>
          </>
        ) : (
          <Btn size="sm" onClick={() => onFreePro(false)}>
            {ambassador.pro_until ? "Grant Pro again" : "Grant 12 months of Pro"}
          </Btn>
        )}
        <Btn
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            patch(
              { ambassadorId: ambassador.id, ambassadorStatus: paused ? "active" : "paused" },
              paused ? "Code resumed." : "Code paused. Nobody new can use it.",
              "status",
            )
          }
        >
          {paused ? "Resume code" : "Pause code"}
        </Btn>
        {ambassador.application_id && (
          <Btn size="sm" variant="ghost" onClick={() => setShowPayout((s) => !s)}>
            {showPayout ? "Hide payout details" : "Payout details"}
          </Btn>
        )}
      </div>

      {showPayout && (
        <div
          className="rounded-xl border p-4 max-w-xl"
          style={{ borderColor: C.border, backgroundColor: C.surface }}
        >
          {app ? <PayoutDetails app={app} /> : <p className="text-sm" style={{ color: C.muted }}>Loading…</p>}
        </div>
      )}

      {failed ? (
        <p className="text-sm" style={{ color: C.danger }}>
          Could not load the teachers for this ambassador.
        </p>
      ) : rows === null ? (
        <p className="text-sm" style={{ color: C.muted }}>
          Loading teachers…
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>
          Nobody has used {ambassador.full_name}&apos;s code yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <PillGroup label="Plan">
              <Pill label="All" count={list.length} active={plan === ""} onClick={() => setPlan("")} />
              {(["free", "standard", "pro", "max"] as const).map((p) => (
                <Pill
                  key={p}
                  label={planCardName(asPlanId(p))}
                  count={count((r) => r.current_plan === p)}
                  active={plan === p}
                  onClick={() => setPlan(p)}
                />
              ))}
            </PillGroup>
            <PillGroup label={`Payout, ${periodLabel(period, false)}`}>
              <Pill label="All" active={payout === ""} onClick={() => setPayout("")} />
              <Pill
                label="N/A"
                count={count((r) => monthState(r) === "none")}
                active={payout === "none"}
                onClick={() => setPayout("none")}
              />
              <Pill
                label="Unpaid"
                count={count((r) => monthState(r) === "unpaid")}
                active={payout === "unpaid"}
                onClick={() => setPayout("unpaid")}
              />
              <Pill
                label="Paid"
                count={count((r) => monthState(r) === "paid")}
                active={payout === "paid"}
                onClick={() => setPayout("paid")}
              />
            </PillGroup>
          </div>

          <Table>
            <thead>
              <tr className="text-left">
                <Th>Teacher</Th>
                <Th>Joined</Th>
                <Th>Plan</Th>
                <Th>How they pay</Th>
                <Th align="right">{periodLabel(period, false)}</Th>
                <Th align="right">Payout</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span style={{ color: C.ink }}>{r.teacher_name || "Unnamed teacher"}</span>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {r.teacher_email}
                    </div>
                    {r.discount_failed_reason && (
                      <div className="text-xs" style={{ color: C.warn }}>
                        Code was refused at checkout, so they paid full price
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs">{fmtDateShort(r.joined_at)}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Tag tone={PLAN_TONE[r.current_plan] ?? "plain"}>
                        {planCardName(asPlanId(r.current_plan))}
                      </Tag>
                      <Tag tone={STATE_LABEL[r.state].tone}>{STATE_LABEL[r.state].label}</Tag>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-xs">
                      {r.billing_interval === "year"
                        ? "Yearly"
                        : r.billing_interval === "month"
                          ? "Monthly"
                          : "Not paid yet"}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {r.commissions.length === 0 ? (
                      <span style={{ color: C.muted }}>Nothing</span>
                    ) : (
                      r.commissions.map((c) => (
                        <div key={c.id} className="text-xs">
                          <span
                            style={{
                              color: c.status === "reversed" ? C.muted : C.ink,
                              textDecoration: c.status === "reversed" ? "line-through" : undefined,
                            }}
                          >
                            {gbp(c.amount_pence)}
                          </span>{" "}
                          <span style={{ color: C.muted }}>
                            {c.kind === "annual" ? "yearly, once" : c.kind === "adjustment" ? "refund" : "monthly"}
                          </span>
                        </div>
                      ))
                    )}
                  </Td>
                  <Td align="right">
                    <PayoutCell
                      row={r}
                      busy={busy}
                      month={periodLabel(period, false)}
                      onSet={(c, status) =>
                        patch(
                          { commissionId: c.id, status },
                          status === "paid" ? "Marked as paid." : "Marked as unpaid.",
                          c.id,
                        )
                      }
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {shown.length === 0 && (
            <p className="text-sm" style={{ color: C.muted }}>
              No teachers match those filters.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One teacher's payout for the month. N/A, with NO control, when nothing was
 * billed: there is nothing an admin can do, and a greyed-out button invites
 * hunting for the way to enable it.
 */
function PayoutCell({
  row,
  busy,
  month,
  onSet,
}: {
  row: ReferralRow;
  busy: string | null;
  month: string;
  onSet: (c: Commission, status: "paid" | "unpaid") => void;
}) {
  if (row.commissions.length === 0) {
    return (
      <span title={`Nothing was billed for this teacher in ${month}, so there is nothing to pay.`}>
        <Tag tone="plain">N/A</Tag>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {row.commissions.map((c) =>
        c.status === "reversed" ? (
          <Tag key={c.id} tone="plain" title="The teacher was refunded, so this was never owed.">
            Refunded
          </Tag>
        ) : c.status === "paid" ? (
          <div key={c.id} className="flex items-center justify-end gap-2">
            <Tag tone="ok" dot>
              Paid{c.paid_at ? ` ${fmtDateShort(c.paid_at)}` : ""}
            </Tag>
            <Btn size="sm" disabled={busy !== null} onClick={() => onSet(c, "unpaid")}>
              Undo
            </Btn>
          </div>
        ) : (
          <div key={c.id} className="flex items-center justify-end gap-2">
            <Tag tone="warn" dot>
              Unpaid
            </Tag>
            <Btn size="sm" variant="primary" disabled={busy !== null} onClick={() => onSet(c, "paid")}>
              {busy === c.id ? "Saving…" : "Mark paid"}
            </Btn>
          </div>
        ),
      )}
    </div>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: C.muted }}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** One pill. Selected is solid brand; the rest are outlined. */
function Pill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-xs font-semibold rounded-full px-3 py-1 border transition-colors"
      style={
        active
          ? { backgroundColor: C.brand, borderColor: C.brand, color: "#fff" }
          : { backgroundColor: C.surface, borderColor: C.border, color: C.ink2 }
      }
    >
      {label}
      {count !== undefined && <span style={{ opacity: 0.7 }}> {count}</span>}
    </button>
  );
}
