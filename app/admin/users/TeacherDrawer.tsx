"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";
import { AI_SPEND_CEILING_PENCE, PLANS, asPlanId } from "@/app/lib/plans";
import { typeLabel, formatDate } from "@/app/lib/toolRunDisplay";
import Link from "next/link";
import { fmtRelative, gbp, gbpFromUsd, nf } from "../format";
import { AiChip, Meter, StatusTag } from "../ui";
import GrantModal, { type GrantKind } from "./GrantModal";
import ActivityLogModal from "./ActivityLogModal";
import ChangePlanModal from "./ChangePlanModal";
import RefundModal from "./RefundModal";
import SuspendModal from "./SuspendModal";
import { usePermissions } from "./usePermissions";

// Small outline/filled/danger button, matching the style already used in
// AdminTeachersHeaderActions and AddTeacherModal.
function DrawerBtn({
  children,
  onClick,
  variant = "default",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { borderColor: "#EAE6F5", color: "#1D1730", backgroundColor: "transparent" },
    primary: { borderColor: "#5B2ED6", color: "#fff", backgroundColor: "#5B2ED6" },
    danger: { borderColor: "#F3D3D0", color: "#B3261E", backgroundColor: "transparent" },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-xs font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

interface TeacherDetail {
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  dial_code: string | null;
  phone: string | null;
  country: string | null;
  plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  is_admin: boolean;
  created_at: string;
  generations: number;
  generations_this_month: number;
  cost_usd: number;
  suspended_at: string | null;
  suspended_reason: string | null;
}

interface NoteRow {
  id: string;
  body: string;
  author_email: string | null;
  created_at: string;
}

interface Allowance {
  resources_used: number;
  resources_topup: number;
  ai_used: number;
  ai_topup: number;
}

/** Measured AI spend against the plan's monthly ceiling, both in pence.
 *  This is what actually blocks a paid teacher — not the unit meters above. */
interface AiSpend {
  spend_pence: number;
  credit_pence: number;
}

interface ThreadRow {
  id: string;
  reference: string;
  subject: string;
  status: string;
  priority: string;
  message_count: number;
  updated_at: string;
}

interface RunRow {
  id: string;
  tool_slug: string;
  title: string | null;
  created_at: string;
  approx_cost_usd: number;
  /** True when the cost was joined by run_id — an exact total for this
   *  generation. False for runs recorded before run_id existed, where cost is
   *  still inferred from a time window and may be under-stated. */
  cost_is_exact: boolean;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: "#E1F5EE", color: "#0F6E56" },
  trialing: { bg: "#F1ECFC", color: "#5B2ED6" },
  past_due: { bg: "#FBECEB", color: "#B3261E" },
  canceled: { bg: "#F1ECFC", color: "#6D6683" },
};

/**
 * Plan → pill colours, mirroring PLAN_TONE in ../ui.tsx (free plain, pro ok,
 * max ai, school brand) in the inline-hex form the rest of this drawer's pills
 * use.
 *
 * This was a two-branch "free is grey, everything else is green", which gave
 * Max the same green as Pro and made a £14.99 subscriber indistinguishable from
 * a £7.99 one at a glance.
 */
const PLAN_STYLE: Record<string, { bg: string; color: string }> = {
  free: { bg: "#F1ECFC", color: "#6D6683" },
  standard: { bg: "#FBF3DF", color: "#8A5A12" },
  pro: { bg: "#E1F5EE", color: "#0F6E56" },
  max: { bg: "#F1ECFC", color: "#5B2ED6" },
  school: { bg: "#F1ECFC", color: "#5B2ED6" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function TeacherDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TeacherDetail | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [aiSpend, setAiSpend] = useState<AiSpend | null>(null);
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [grantKind, setGrantKind] = useState<GrantKind | null>(null);
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const { can } = usePermissions();
  const [error, setError] = useState<string | null>(null);
  // Mounts closed (off-screen, scrim transparent) then flips open on the next
  // frame so the browser actually animates the transition instead of
  // starting already in its end state. Same drawer.on / scrim.on pattern as
  // the CEO's mockup — a translateX slide + opacity fade, ~220ms ease-out.
  const [open, setOpen] = useState(false);
  // None of these actions have real backend yet (no grant/refund/suspend/
  // plan-change/view-as routes) — same honest-stub pattern as Export/Invite:
  // clicking says so instead of silently doing nothing.
  const [notice, setNotice] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    setOpen(false);
    window.setTimeout(onClose, 220);
  };

  const fire = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3000);
  };

  // Pulled out so a successful grant can refresh the allowance without
  // reopening the drawer.
  const loadAllowance = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: spend }] = await Promise.all([
      supabase.rpc("monthly_allowance", { uid: userId }),
      supabase.rpc("monthly_ai_spend", { uid: userId }),
    ]);
    if (data && data.length > 0) setAllowance(data[0] as Allowance);
    if (spend && spend.length > 0) setAiSpend(spend[0] as AiSpend);
  }, [userId]);

  const reloadDetail = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("admin_teacher_detail", { uid: userId });
    if (data && data.length > 0) setDetail(data[0] as TeacherDetail);
  }, [userId]);

  const resetPassword = async () => {
    if (resetting || !detail) return;
    setResetting(true);
    const res = await fetch("/api/admin/teachers/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json().catch(() => ({}));
    setResetting(false);
    fire(
      !res.ok
        ? (json.error ?? "Could not send the reset email.")
        : json.sent
          ? `Password reset link sent to ${detail.email}.`
          : (json.error ?? "Email isn't configured, so nothing was sent."),
    );
  };

  const copyPortalLink = async () => {
    if (portalBusy) return;
    setPortalBusy(true);
    const res = await fetch("/api/admin/teachers/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json().catch(() => ({}));
    setPortalBusy(false);
    if (!res.ok || !json.url) {
      fire(json.error ?? "Could not create a portal link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(json.url);
      // Said plainly because it matters: this link is a bearer credential to
      // their billing details, and it expires.
      fire("Link copied. It expires shortly and lets anyone holding it edit their billing.");
    } catch {
      fire(json.url);
    }
  };

  const saveNote = async () => {
    const body = noteText.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("admin_add_teacher_note", {
      uid: userId,
      p_body: body,
    });
    if (err) {
      fire(err.message);
      setSavingNote(false);
      return;
    }
    // Re-read rather than optimistically splicing: the note's id, author email
    // and server timestamp all come from the DB, and this list is short.
    const { data } = await supabase.rpc("admin_teacher_notes", { uid: userId, lim: 20 });
    setNotes((data ?? []) as NoteRow[]);
    setNoteText("");
    setSavingNote(false);
    fire("Note saved.");
  };

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const [{ data: d, error: dErr }, { data: r }, { data: a }, { data: th }, { data: n }, { data: sp }] =
        await Promise.all([
          supabase.rpc("admin_teacher_detail", { uid: userId }),
          supabase.rpc("admin_teacher_recent_runs", { uid: userId, lim: 10 }),
          supabase.rpc("monthly_allowance", { uid: userId }),
          supabase.rpc("admin_teacher_threads", { uid: userId }),
          supabase.rpc("admin_teacher_notes", { uid: userId, lim: 20 }),
          supabase.rpc("monthly_ai_spend", { uid: userId }),
        ]);
      if (cancelled) return;
      if (dErr || !d || d.length === 0) {
        setError("Could not load this teacher.");
        return;
      }
      setDetail(d[0] as TeacherDetail);
      setRuns((r ?? []) as RunRow[]);
      if (a && a.length > 0) setAllowance(a[0] as Allowance);
      setThreads((th ?? []) as ThreadRow[]);
      setNotes((n ?? []) as NoteRow[]);
      if (sp && sp.length > 0) setAiSpend(sp[0] as AiSpend);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = detail ? [detail.first_name, detail.surname].filter(Boolean).join(" ") : "";
  const plan = detail?.plan ?? "free";
  const p = PLANS[asPlanId(plan)];
  const status = detail?.subscription_status ?? "";
  const ss = STATUS_STYLE[status];
  const suspended = Boolean(detail?.suspended_at);
  // Free and School have no spend ceiling (they're gated by counts / pooled
  // seats instead), so there is nothing to meter for them.
  const ceilingPence = AI_SPEND_CEILING_PENCE[asPlanId(plan)];
  const spendBlocked =
    ceilingPence !== null &&
    aiSpend !== null &&
    Number(aiSpend.spend_pence) >= ceilingPence + Number(aiSpend.credit_pence);
  const dial = detail?.dial_code ? `+${detail.dial_code.replace(/^\+/, "")}` : null;

  return (
    <div className="fixed inset-0 z-1000" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-180"
        style={{ opacity: open ? 1 : 0 }}
        onClick={handleClose}
      />
      <aside
        className="absolute top-0 right-0 h-screen w-full max-w-md shadow-2xl border-l flex flex-col"
        style={{
          borderColor: "#EAE6F5",
          backgroundColor: "#FFFFFF",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {!detail && !error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: "#6D6683" }}>
              Loading…
            </p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-sm" style={{ color: "#B3261E" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="text-sm font-semibold rounded-xl border px-4 py-2 transition-colors hover:bg-black/5"
              style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 p-5 pb-4 border-b shrink-0" style={{ borderColor: "#EAE6F5" }}>
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ backgroundColor: "#F1ECFC", color: "#1D1730" }}
              >
                {(name || detail!.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold truncate" style={{ color: "#1D1730" }}>
                  {name || detail!.email}
                </h2>
                <p className="text-sm truncate" style={{ color: "#6D6683" }}>
                  {detail!.email}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={PLAN_STYLE[plan] ? { backgroundColor: PLAN_STYLE[plan].bg, color: PLAN_STYLE[plan].color } : { backgroundColor: "#F1ECFC", color: "#6D6683" }}
                  >
                    {p.name}
                  </span>
                  {status && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                      style={ss ? { backgroundColor: ss.bg, color: ss.color } : { backgroundColor: "#F1ECFC", color: "#6D6683" }}
                    >
                      {status.replace("_", " ")}
                    </span>
                  )}
                  {detail!.is_admin && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: "#1D1730", color: "#fff" }}>
                      ADMIN
                    </span>
                  )}
                  {suspended && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#FBECEB", color: "#B3261E" }}
                      title={detail!.suspended_reason ?? "No reason recorded"}
                    >
                      Suspended
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-black/5 shrink-0"
                style={{ color: "#6D6683" }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  This month
                </h3>
                <div className="rounded-xl border p-3.5 space-y-3" style={{ borderColor: "#EAE6F5", backgroundColor: "#fff" }}>
                  {detail!.is_admin && (
                    <div
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{ backgroundColor: "#F1ECFC", color: "#5B2ED6" }}
                    >
                      <b>Admin account — bypasses the generation cap.</b> This usage is
                      internal, isn&apos;t billable, and doesn&apos;t count against any plan
                      limit.
                    </div>
                  )}
                  <div>
                    <div className="text-sm mb-1.5" style={{ color: "#3C3552" }}>
                      Resources
                    </div>
                    {detail!.is_admin ? (
                      <span className="text-sm tabular-nums" style={{ color: "#1D1730" }}>
                        {nf.format(allowance?.resources_used ?? detail!.generations_this_month)}{" "}
                        used
                        <span style={{ color: "#6D6683" }}> · no cap</span>
                      </span>
                    ) : (
                      <Meter
                        used={allowance?.resources_used ?? detail!.generations_this_month}
                        allow={p.limits.monthlyGenerations}
                        topup={allowance?.resources_topup ?? 0}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "#3C3552" }}>AI-image slideshows</span>
                    {/* Note aiImageSlideshows is not enforced anywhere — it
                        appears in meters and the cost model, never in a gate.
                        It's shown as the plan's stated allowance, and a grant
                        raises it, but what actually stops a paid teacher is the
                        AI spend ceiling on the row below. */}
                    <AiChip
                      used={allowance?.ai_used ?? 0}
                      allow={p.limits.aiImageSlideshows}
                      topup={allowance?.ai_topup ?? 0}
                    />
                  </div>
                  {/* The gate that actually stops a paid teacher generating.
                      Free accounts are capped on counts instead, so showing
                      them a spend ceiling they don't have would mislead. */}
                  {ceilingPence !== null && aiSpend && (
                    <div className="flex items-center justify-between text-sm">
                      <span style={{ color: "#3C3552" }}>AI spend this month</span>
                      <span
                        className="font-semibold"
                        style={{ color: spendBlocked ? "#B3261E" : "#1D1730" }}
                      >
                        {gbp(Number(aiSpend.spend_pence) / 100)} of{" "}
                        {gbp((ceilingPence + Number(aiSpend.credit_pence)) / 100)}
                        {Number(aiSpend.credit_pence) > 0 && (
                          <span style={{ color: "#6D6683", fontWeight: 400 }}>
                            {" "}
                            (incl. {gbp(Number(aiSpend.credit_pence) / 100)} credit)
                          </span>
                        )}
                        {spendBlocked && (
                          <span style={{ fontWeight: 600 }}> · blocked</span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "#3C3552" }}>Costs us</span>
                    <span className="font-semibold" style={{ color: "#1D1730" }}>
                      {gbpFromUsd(detail!.cost_usd)}
                    </span>
                  </div>
                  {/* Resources are a Free-plan concept: paid plans have
                      monthlyGenerations = null, so there is no count to top up.
                      AI images are offered on both — Free is metered against
                      its cap, and on paid plans the grant still shows in the
                      teacher's own allowance.

                      Credit is paid-only, and it is the one that lifts a real
                      block: the £1.50 AI spend ceiling is what actually stops a
                      Pro teacher generating (see generation-guard.ts), and no
                      unit grant moves it. */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {plan === "free" && (
                      <DrawerBtn onClick={() => setGrantKind("resource")}>Grant resources</DrawerBtn>
                    )}
                    <DrawerBtn onClick={() => setGrantKind("ai_image")}>Grant AI images</DrawerBtn>
                    {ceilingPence !== null && (
                      <DrawerBtn onClick={() => setGrantKind("credit_gbp")}>Grant AI credit (£)</DrawerBtn>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  Account
                </h3>
                <dl className="text-sm">
                  <Row label="User ID" value={<span className="font-mono text-xs">{detail!.id}</span>} />
                  <Row label="Joined" value={fmtDate(detail!.created_at)} />
                  <Row label="Phone" value={detail!.phone ? `${dial ?? ""} ${detail!.phone}`.trim() : "—"} />
                  <Row label="Country" value={detail!.country ?? "—"} />
                  <Row label="Generations (all time)" value={nf.format(detail!.generations)} />
                </dl>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  Subscription
                </h3>
                <dl className="text-sm">
                  <Row label="Plan" value={p.name} />
                  <Row
                    label="Billing"
                    value={detail!.stripe_customer_id ? "Card · Stripe" : plan === "free" ? "None" : "—"}
                  />
                  <Row
                    label="Renews"
                    value={
                      detail!.current_period_end
                        ? status === "canceled"
                          ? `Access ends ${fmtDate(detail!.current_period_end)}`
                          : fmtDate(detail!.current_period_end)
                        : "—"
                    }
                  />
                  <Row
                    label="Payment status"
                    value={
                      status === "past_due" ? (
                        <span style={{ color: "#B3261E", fontWeight: 600 }}>Past due</span>
                      ) : status ? (
                        status.replace("_", " ")
                      ) : (
                        "—"
                      )
                    }
                  />
                </dl>
                {/* "Offer annual" used to sit here. There is no annual price —
                    see app/lib/stripe.ts: billing is monthly only — so the
                    button could never have done anything. */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <DrawerBtn
                    onClick={() => setShowPlan(true)}
                    disabled={!can("change_plan")}
                    title={can("change_plan") ? undefined : "Your admin role can't change plans"}
                  >
                    Change plan
                  </DrawerBtn>
                  {detail!.stripe_customer_id && (
                    <DrawerBtn
                      onClick={copyPortalLink}
                      disabled={!can("change_plan") || portalBusy}
                      title={can("change_plan") ? undefined : "Your admin role can't do this"}
                    >
                      {portalBusy ? "Creating…" : "Copy card update link"}
                    </DrawerBtn>
                  )}
                  {detail!.stripe_customer_id && (
                    <DrawerBtn
                      onClick={() => setShowRefund(true)}
                      disabled={!can("issue_refunds")}
                      title={can("issue_refunds") ? undefined : "Your admin role can't issue refunds"}
                    >
                      Refund
                    </DrawerBtn>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  Recent activity
                </h3>
                {runs === null ? (
                  <p className="text-sm" style={{ color: "#6D6683" }}>
                    Loading…
                  </p>
                ) : runs.length === 0 ? (
                  <p className="text-sm" style={{ color: "#6D6683" }}>
                    No generations yet.
                  </p>
                ) : (
                  <ol className="relative pl-4" style={{ borderLeft: "1px solid #EAE6F5" }}>
                    {runs.map((r, i) => (
                      <li key={r.id} className="relative pb-4 last:pb-0">
                        <span
                          className="absolute -left-5.25 top-1 w-2.5 h-2.5 rounded-full border-2"
                          style={
                            i === 0
                              ? { backgroundColor: "#1D1730", borderColor: "#1D1730" }
                              : { backgroundColor: "#FFFFFF", borderColor: "#EAE6F5" }
                          }
                        />
                        <p className="text-sm font-medium" style={{ color: "#1D1730" }}>
                          {r.title || typeLabel(r.tool_slug)}
                        </p>
                        <p className="text-xs font-mono" style={{ color: "#6D6683" }}>
                          {typeLabel(r.tool_slug)} ·{" "}
                          <span
                            title={
                              r.cost_is_exact
                                ? "Exact — every cost row for this generation"
                                : "Approximate — recorded before per-run cost tracking, matched by time"
                            }
                          >
                            {r.approx_cost_usd > 0
                              ? `${r.cost_is_exact ? "" : "~"}${gbpFromUsd(r.approx_cost_usd)}`
                              : "—"}
                          </span>{" "}
                          · {formatDate(r.created_at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  type="button"
                  onClick={() => setShowActivity(true)}
                  className="text-xs font-semibold mt-1 hover:underline"
                  style={{ color: "#1D1730" }}
                >
                  See full activity log →
                </button>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  Support history
                </h3>
                {threads === null ? (
                  <p className="text-sm" style={{ color: "#6D6683" }}>
                    Loading…
                  </p>
                ) : threads.length === 0 ? (
                  <p className="text-sm" style={{ color: "#6D6683" }}>
                    No tickets yet.
                  </p>
                ) : (
                  <div className="space-y-1 mb-2">
                    {threads.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 py-1.5 border-b last:border-b-0"
                        style={{ borderColor: "#F1ECFC" }}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium truncate"
                            style={{ color: "#1D1730" }}
                          >
                            {t.subject}
                          </div>
                          <div className="text-xs font-mono" style={{ color: "#6D6683" }}>
                            {t.reference} · {nf.format(Number(t.message_count))} message
                            {Number(t.message_count) === 1 ? "" : "s"} ·{" "}
                            {fmtRelative(t.updated_at)}
                          </div>
                        </div>
                        <StatusTag status={t.status} />
                      </div>
                    ))}
                  </div>
                )}
                {/* Was a DrawerBtn nested inside a Link — invalid HTML (a
                    button inside an anchor) and the empty onClick swallowed the
                    click. A styled anchor does the job, deep-linked to this
                    teacher's newest thread when they have one. */}
                <Link
                  href={threads && threads.length > 0 ? `/admin/inbox?thread=${threads[0].id}` : "/admin/inbox"}
                  className="inline-block text-xs font-semibold rounded-lg border px-3 py-1.5 transition-colors hover:bg-black/5"
                  style={{ borderColor: "#EAE6F5", color: "#1D1730" }}
                >
                  Open inbox
                </Link>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6D6683" }}>
                  Internal notes
                </h3>
                {notes && notes.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border px-3 py-2"
                        style={{ borderColor: "#F1ECFC", backgroundColor: "#F1ECFC" }}
                      >
                        <p className="text-sm whitespace-pre-wrap" style={{ color: "#1D1730" }}>
                          {n.body}
                        </p>
                        <p className="text-xs font-mono mt-1" style={{ color: "#6D6683" }}>
                          {n.author_email ?? "unknown"} · {fmtRelative(n.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Only your team sees this."
                  className="w-full px-3 py-2.5 border rounded-xl bg-white text-sm placeholder-[#9A93AD] focus:outline-none focus:border-[#1D1730] transition-colors resize-none"
                  style={{ borderColor: "#EAE6F5" }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <DrawerBtn onClick={saveNote} disabled={!noteText.trim() || savingNote}>
                    {savingNote ? "Saving…" : "Save note"}
                  </DrawerBtn>
                  {/* Notes are append-only by design — the table has no UPDATE
                      policy, since editing one would rewrite the record of what
                      staff believed at the time. */}
                  <span className="text-xs" style={{ color: "#6D6683" }}>
                    Notes can&rsquo;t be edited once saved.
                  </span>
                </div>
              </section>
            </div>

            <div
              className="shrink-0 border-t px-5 py-3.5"
              style={{ borderColor: "#EAE6F5", backgroundColor: "#F7F5FC" }}
            >
              {notice && (
                <p className="text-xs mb-2" style={{ color: "#8A3C12" }}>
                  {notice}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <DrawerBtn
                  onClick={resetPassword}
                  disabled={!can("reset_passwords") || resetting}
                  title={can("reset_passwords") ? undefined : "Your admin role can't reset passwords"}
                >
                  {resetting ? "Sending…" : "Reset password"}
                </DrawerBtn>
                <div className="flex-1" />
                <DrawerBtn
                  variant={suspended ? "default" : "danger"}
                  onClick={() => setShowSuspend(true)}
                  disabled={!can("suspend_accounts")}
                  title={can("suspend_accounts") ? undefined : "Your admin role can't suspend accounts"}
                >
                  {suspended ? "Lift suspension" : "Suspend"}
                </DrawerBtn>
              </div>
            </div>
          </>
        )}
      </aside>

      {showActivity && detail && (
        <ActivityLogModal
          userId={detail.id}
          name={name || detail.email}
          onClose={() => setShowActivity(false)}
        />
      )}

      {showPlan && detail && (
        <ChangePlanModal
          userId={detail.id}
          name={name || detail.email}
          currentPlan={plan}
          hasCustomer={Boolean(detail.stripe_customer_id)}
          // admin_teacher_detail doesn't return stripe_subscription_id, and the
          // modal only needs this to word the warning. A paid plan carrying a
          // subscription_status is a live subscription; a comp has neither.
          // The route re-reads the real column before touching Stripe, so the
          // decision that matters isn't made here.
          hasSubscription={plan !== "free" && Boolean(status)}
          onClose={() => setShowPlan(false)}
          onChanged={(msg) => {
            fire(msg);
            // Cases 2 and 3 are applied by the Stripe webhook, so the row may
            // not reflect the change for a moment. Re-read anyway: the comp and
            // direct paths are immediate, and a stale drawer is worse than one
            // that catches up on the next open.
            void reloadDetail();
            router.refresh();
          }}
        />
      )}

      {showRefund && detail && (
        <RefundModal
          userId={detail.id}
          name={name || detail.email}
          onClose={() => setShowRefund(false)}
          onRefunded={(msg) => fire(msg)}
        />
      )}

      {showSuspend && detail && (
        <SuspendModal
          userId={detail.id}
          name={name || detail.email}
          suspend={!suspended}
          onClose={() => setShowSuspend(false)}
          onDone={(msg) => {
            fire(msg);
            void reloadDetail();
            router.refresh();
          }}
        />
      )}

      {grantKind && detail && (
        <GrantModal
          userId={detail.id}
          name={name || detail.email}
          kind={grantKind}
          onClose={() => setGrantKind(null)}
          onGranted={(msg) => {
            fire(msg);
            // Reflect the new top-up in the meter straight away rather than
            // making the admin close and reopen the drawer to see it.
            void loadAllowance();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b" style={{ borderColor: "#F1ECFC" }}>
      <dt style={{ color: "#6D6683" }}>{label}</dt>
      <dd className="text-right" style={{ color: "#1D1730" }}>
        {value}
      </dd>
    </div>
  );
}
