"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "./usePermissions";
import { PLANS, ADMIN_ASSIGNABLE_PLANS, asPlanId } from "@/app/lib/plans";
import { downloadCsv, toCsv } from "@/app/lib/csv";
import { FX_USD_TO_GBP, gbpFromUsd, nf } from "../format";
import { AiChip, Meter, PLAN_TONE, Tag } from "../ui";
import TeacherDrawer from "./TeacherDrawer";

export interface TeacherRow {
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  plan: string | null;
  subscription_status: string | null;
  is_admin: boolean;
  created_at: string;
  generations: number;
  generations_this_month: number;
  cost_usd: number;
  /** AI-image slideshows this month, from asset_cost. */
  ai_images_this_month: number;
  /** Extra resources granted this month by an admin. */
  resources_topup: number;
  /** Extra AI images granted this month by an admin. */
  ai_topup: number;
  school_id: string | null;
  school_name: string | null;
  /** Set when the account is suspended — sign-in is blocked. */
  suspended_at: string | null;
}

/** Progress and outcome of one bulk action across the selected teachers. */
interface BulkRun {
  label: string;
  done: number;
  total: number;
  failures: { email: string; error: string }[];
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: "#E1F5EE", color: "#0F6E56" },
  trialing: { bg: "#F1ECFC", color: "#5B2ED6" },
  past_due: { bg: "#FBECEB", color: "#B3261E" },
  canceled: { bg: "#F1ECFC", color: "#6D6683" },
};

const STATUS_OPTIONS = ["active", "trialing", "past_due", "canceled"];

/** Monthly revenue for this teacher, in GBP — list price of their plan. There's
 *  no billing-interval column yet to distinguish monthly vs. annual seats, so
 *  this uses the plan's flat monthly price, same as Free contributing £0. */
function monthlyRevenue(plan: string): number {
  return PLANS[asPlanId(plan)].priceMonthly ?? 0;
}

/** Margin = (revenue - AI cost this month) / revenue, both in GBP. Free
 *  teachers have no revenue to divide by, so they show cost only.
 *  Note this is contribution before card fees and overheads — the drawer shows
 *  the fuller breakdown. */
function marginPct(plan: string, costUsd: number): number | null {
  const revenue = monthlyRevenue(plan);
  if (revenue <= 0) return null;
  return (revenue - costUsd * FX_USD_TO_GBP) / revenue;
}

const EXPORT_HEADERS = [
  "User ID", "Email", "First name", "Surname", "Plan", "Subscription status",
  "School", "Joined", "Generations (all time)", "Generations this month",
  "Resource allowance", "Resource top-up", "AI images this month",
  "AI image allowance", "AI image top-up", "Cost this month (USD)",
  "Monthly revenue (GBP)", "Margin %",
];

/** One teacher → one CSV row, in EXPORT_HEADERS order.
 *
 *  Cost stays in USD because that is the unit token_usage/asset_cost record;
 *  converting here would bake in today's FX rate and silently disagree with the
 *  figures on every other admin page. Revenue and margin are GBP, since those
 *  come from our own price list. Both units are named in the headers. */
function exportRow(u: TeacherRow): unknown[] {
  const plan = u.plan ?? "free";
  const limits = PLANS[asPlanId(plan)].limits;
  const m = marginPct(plan, Number(u.cost_usd));
  return [
    u.id,
    u.email,
    u.first_name ?? "",
    u.surname ?? "",
    plan,
    u.subscription_status ?? "",
    u.school_name ?? "Individual",
    u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "",
    u.generations,
    u.generations_this_month,
    // Admins bypass the cap entirely, and an unlimited plan has no denominator.
    u.is_admin ? "no cap" : (limits.monthlyGenerations ?? "unlimited"),
    u.resources_topup,
    u.ai_images_this_month,
    limits.aiImageSlideshows,
    u.ai_topup,
    Number(u.cost_usd).toFixed(4),
    monthlyRevenue(plan).toFixed(2),
    m === null ? "" : Math.round(m * 100),
  ];
}

export default function AdminTeachersTable({ rows }: { rows: TeacherRow[] }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [school, setSchool] = useState("");
  const [margin, setMargin] = useState("");

  // Distinct schools present in the current rows — no extra query needed, and
  // it can't offer a school that has no teachers to filter to.
  const schools = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of rows) {
      if (u.school_id && u.school_name) seen.set(u.school_id, u.school_name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkRun | null>(null);
  const router = useRouter();
  const { can } = usePermissions();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((u) => {
      if (needle) {
        const name = [u.first_name, u.surname].filter(Boolean).join(" ");
        const hay = `${name} ${u.email} ${u.id}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (plan && (u.plan ?? "free") !== plan) return false;
      // Suspension isn't a subscription_status — it's a separate column — so it
      // gets its own branch rather than being compared against one.
      if (status === "suspended" && !u.suspended_at) return false;
      if (status && status !== "suspended" && (u.subscription_status ?? "") !== status) return false;
      if (school === "none" && u.school_id) return false;
      if (school && school !== "none" && u.school_id !== school) return false;
      if (margin) {
        const m = marginPct(u.plan ?? "free", Number(u.cost_usd));
        if (margin === "low" && !(m !== null && m < 0.35)) return false;
        if (margin === "neg" && !(m !== null && m < 0)) return false;
      }
      return true;
    });
  }, [rows, q, plan, status, school, margin]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((u) => u.id)));

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    setBulk(null);
  };

  /**
   * Run one action across the selected teachers, one at a time.
   *
   * Sequential rather than Promise.all: these hit Stripe and SendGrid, both of
   * which rate-limit, and a serial loop is what makes the "4 of 12" counter and
   * the per-teacher failure list honest. One teacher failing must not abandon
   * the rest — that's how you end up with half a job done and no record of
   * which half.
   */
  const runBulk = async (
    label: string,
    body: (u: TeacherRow) => Record<string, unknown>,
    path: string,
  ) => {
    const targets = filtered.filter((u) => selected.has(u.id));
    if (targets.length === 0) return;
    setBulk({ label, done: 0, total: targets.length, failures: [] });

    const failures: { email: string; error: string }[] = [];
    for (let i = 0; i < targets.length; i++) {
      const u = targets[i];
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body(u)),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          failures.push({ email: u.email, error: json.error ?? `HTTP ${res.status}` });
        }
      } catch {
        failures.push({ email: u.email, error: "Network error" });
      }
      setBulk({ label, done: i + 1, total: targets.length, failures: [...failures] });
    }

    router.refresh();
  };

  // Exports exactly what's on screen — the same `filtered` array the table
  // renders — so the file always matches the "N shown" count next to it.
  // Generated in the browser from data that's already loaded: no route, no
  // second query, and no new service-role surface for personal data.
  const exportCsv = (rows: TeacherRow[], scope: "" | "selected-") => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      toCsv(EXPORT_HEADERS, rows.map(exportRow)),
      `jooma-teachers-${scope}${stamp}.csv`,
    );
  };

  const clearFilters = () => {
    setQ("");
    setPlan("");
    setStatus("");
    setSchool("");
    setMargin("");
  };

  const hasFilters = q || plan || status || school || margin;

  const selectStyle: React.CSSProperties = {
    borderColor: "#EAE6F5",
    backgroundColor: "#fff",
    color: "#1D1730",
  };

  return (
    <>
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5" }}
      >
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "#F1ECFC" }}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email or user ID"
            className="text-sm rounded-lg border px-3 py-1.5 min-w-[220px]"
            style={selectStyle}
          />
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={selectStyle}
          >
            <option value="">All plans</option>
            {/* No plan, then the plans we actually sell: Standard, Pro and
                Max. School isn't built, so listing it here reads as bloat. A
                teacher somehow holding it still renders their badge correctly
                below. */}
            {ADMIN_ASSIGNABLE_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={selectStyle}
          >
            <option value="">Any status</option>
            <option value="suspended">Suspended</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={selectStyle}
          >
            <option value="">Any school</option>
            <option value="none">No school (individual)</option>
            {schools.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={selectStyle}
          >
            <option value="">Any margin</option>
            <option value="low">Margin under 35%</option>
            <option value="neg">Losing money</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold rounded-lg px-3 py-1.5 transition-colors hover:bg-black/5"
              style={{ color: "#6D6683" }}
            >
              Clear
            </button>
          )}

          <div className="flex-1" />

          <span
            className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
            style={{ backgroundColor: "#F1ECFC", color: "#6D6683" }}
          >
            {nf.format(filtered.length)} shown
          </span>

          {!selecting ? (
            <>
              <button
                type="button"
                onClick={() => exportCsv(filtered, "")}
                disabled={filtered.length === 0 || !can("export_personal_data")}
                title={
                  !can("export_personal_data")
                    ? "Your admin role can't export personal data"
                    : hasFilters
                      ? "Download the teachers matching your current filters as a CSV"
                      : "Download all teachers as a CSV"
                }
                className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5 disabled:opacity-40"
                style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
                style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
              >
                Select
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ backgroundColor: "#F1ECFC", color: "#6D6683" }}>
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
                style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
              <button
                type="button"
                onClick={exitSelect}
                className="text-sm font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
                style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {selecting && selected.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b"
            style={{ borderColor: "#F1ECFC", backgroundColor: "#F7F5FC" }}
          >
            <span className="text-xs font-semibold" style={{ color: "#3C3552" }}>
              {nf.format(selected.size)} selected
            </span>

            <button
              type="button"
              onClick={() => exportCsv(filtered.filter((u) => selected.has(u.id)), "selected-")}
              className="text-xs font-semibold rounded-lg border px-2.5 py-1 transition-colors hover:bg-black/5"
              style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
            >
              Export selected
            </button>

            <button
              type="button"
              disabled={!can("reset_passwords") || bulk !== null}
              title={can("reset_passwords") ? undefined : "Your admin role can't reset passwords"}
              onClick={() => {
                if (!confirm(`Send a password reset email to ${selected.size} teacher(s)?`)) return;
                void runBulk(
                  "Sending password resets",
                  (u) => ({ userId: u.id }),
                  "/api/admin/teachers/reset-password",
                );
              }}
              className="text-xs font-semibold rounded-lg border px-2.5 py-1 transition-colors hover:bg-black/5 disabled:opacity-40"
              style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
            >
              Send password reset
            </button>

            <button
              type="button"
              disabled={!can("suspend_accounts") || bulk !== null}
              title={can("suspend_accounts") ? undefined : "Your admin role can't suspend accounts"}
              onClick={() => {
                const reason = prompt(
                  `Suspend ${selected.size} teacher(s)? They'll be signed out and blocked from signing in.\n\nReason (goes in the audit log):`,
                );
                if (reason === null) return;
                void runBulk(
                  "Suspending",
                  (u) => ({ userId: u.id, suspend: true, reason }),
                  "/api/admin/teachers/suspend",
                );
              }}
              className="text-xs font-semibold rounded-lg border px-2.5 py-1 transition-colors hover:bg-black/5 disabled:opacity-40"
              style={{ borderColor: "#F3D3D0", color: "#B3261E" }}
            >
              Suspend
            </button>

            <button
              type="button"
              disabled={!can("suspend_accounts") || bulk !== null}
              title={can("suspend_accounts") ? undefined : "Your admin role can't suspend accounts"}
              onClick={() => {
                if (!confirm(`Lift the suspension on ${selected.size} teacher(s)?`)) return;
                void runBulk(
                  "Lifting suspensions",
                  (u) => ({ userId: u.id, suspend: false }),
                  "/api/admin/teachers/suspend",
                );
              }}
              className="text-xs font-semibold rounded-lg border px-2.5 py-1 transition-colors hover:bg-black/5 disabled:opacity-40"
              style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
            >
              Unsuspend
            </button>

            <div className="flex-1" />

            {bulk && (
              <span className="text-xs" style={{ color: "#3C3552" }}>
                {bulk.done < bulk.total
                  ? `${bulk.label}… ${bulk.done} of ${bulk.total}`
                  : bulk.failures.length === 0
                    ? `Done — ${bulk.total} succeeded.`
                    : `Done — ${bulk.total - bulk.failures.length} succeeded, ${bulk.failures.length} failed.`}
              </span>
            )}
          </div>
        )}

        {/* Partial failures are listed rather than folded into a count: knowing
            WHICH teacher didn't get their email is the whole point. */}
        {bulk && bulk.done === bulk.total && bulk.failures.length > 0 && (
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "#F1ECFC", backgroundColor: "#FBECEB" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#B3261E" }}>
              These didn&rsquo;t go through:
            </p>
            <ul className="space-y-0.5">
              {bulk.failures.map((f) => (
                <li key={f.email} className="text-xs font-mono" style={{ color: "#B3261E" }}>
                  {f.email} — {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#6D6683" }} className="text-left">
                {selecting && (
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                <th className="font-semibold px-4 py-3">Teacher</th>
                <th className="font-semibold px-4 py-3">Plan</th>
                <th className="font-semibold px-4 py-3">School</th>
                <th className="font-semibold px-4 py-3">Resources this month</th>
                <th className="font-semibold px-4 py-3">AI images</th>
                <th className="font-semibold px-4 py-3">Status</th>
                <th className="font-semibold px-4 py-3 text-right">Costs us</th>
                <th className="font-semibold px-4 py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={selecting ? 9 : 8} className="px-4 py-10 text-center" style={{ color: "#6D6683" }}>
                    No teachers match that.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const name = [u.first_name, u.surname].filter(Boolean).join(" ");
                  const p = u.plan ?? "free";
                  const st = u.subscription_status ?? "";
                  const ss = STATUS_STYLE[st];
                  const cost = Number(u.cost_usd);
                  const m = marginPct(p, cost);
                  return (
                    <tr
                      key={u.id}
                      className="border-t hover:bg-black/2"
                      style={{ borderColor: "#F1ECFC", cursor: selecting ? "default" : "pointer" }}
                      onClick={() => {
                        if (!selecting) setOpenId(u.id);
                      }}
                    >
                      {selecting && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium whitespace-nowrap" style={{ color: "#1D1730" }}>
                            {name || u.email}
                          </span>
                          {u.is_admin && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: "#1D1730", color: "#fff" }}
                              title="Admin account — bypasses the monthly generation cap"
                            >
                              ADMIN
                            </span>
                          )}
                        </div>
                        {name && (
                          <div className="text-xs" style={{ color: "#6D6683" }}>
                            {u.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize">
                          <Tag tone={PLAN_TONE[p] ?? "plain"}>{p}</Tag>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#3C3552" }}>
                        {u.school_name ?? (
                          <span style={{ color: "#6D6683" }}>Individual</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_admin ? (
                          // Admins skip the cap entirely, so metering them
                          // against one would read as "0 left of 5" while they
                          // generate freely. Show the raw count instead.
                          <span className="text-xs tabular-nums" style={{ color: "#3C3552" }}>
                            {nf.format(Number(u.generations_this_month))} used
                            <span style={{ color: "#6D6683" }}> · no cap</span>
                          </span>
                        ) : (
                          <Meter
                            used={Number(u.generations_this_month)}
                            allow={PLANS[asPlanId(p)].limits.monthlyGenerations}
                            topup={Number(u.resources_topup)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <AiChip
                          used={Number(u.ai_images_this_month)}
                          allow={PLANS[asPlanId(p)].limits.aiImageSlideshows}
                          topup={Number(u.ai_topup)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {/* Suspension outranks billing status here: a suspended
                            teacher can't sign in at all, which matters more
                            than whether their card is current. */}
                        {u.suspended_at ? (
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
                            style={{ backgroundColor: "#FBECEB", color: "#B3261E" }}
                          >
                            Suspended
                          </span>
                        ) : st ? (
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full capitalize whitespace-nowrap"
                            style={ss ? { backgroundColor: ss.bg, color: ss.color } : { backgroundColor: "#F1ECFC", color: "#6D6683" }}
                          >
                            {st.replace("_", " ")}
                          </span>
                        ) : (
                          <span style={{ color: "#6D6683" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap" style={{ color: "#1D1730" }}>
                        {gbpFromUsd(cost)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {m === null ? (
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{ backgroundColor: "#F1ECFC", color: "#6D6683" }}
                          >
                            costs {gbpFromUsd(cost)}
                          </span>
                        ) : (
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={
                              m < 0
                                ? { backgroundColor: "#FBECEB", color: "#B3261E" }
                                : m < 0.35
                                  ? { backgroundColor: "#FBF3DF", color: "#8A3C12" }
                                  : { backgroundColor: "#E1F5EE", color: "#0F6E56" }
                            }
                          >
                            {Math.round(m * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t text-xs" style={{ borderColor: "#F1ECFC", color: "#6D6683" }}>
          Showing {nf.format(filtered.length)} of {nf.format(rows.length)} teachers
        </div>
      </div>

      {openId && <TeacherDrawer userId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
