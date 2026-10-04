"use client";

// ── Shared admin primitives ──────────────────────────────────────────────────
// Before this file, `Stat` was duplicated across two pages with divergent
// props, PLAN_STYLE/STATUS_STYLE were duplicated between the teachers table and
// the drawer, and the modal shell + field styles were copy-pasted between both
// modals. Everything shared now lives here.
//
// Styling convention matches the rest of the admin area: inline `style={{}}`
// hex, Tailwind for layout only. See the palette block below.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { nf } from "./format";

// ── Palette ──────────────────────────────────────────────────────────────────
// Mirrors the V2 brand tokens on :root in app/globals.css. Literal hex rather
// than var(--j-*) because this console styles through inline style={{}}, which
// takes a value not a custom property reference. Keep the two in step: if a
// token moves in globals.css, move it here.
export const C = {
  page: "#F7F5FC", // --j-bg
  surface: "#FFFFFF", // --j-card
  white: "#FFFFFF",
  border: "#EAE6F5", // --j-line
  divider: "#F1ECFC", // --j-tint
  ink: "#1D1730", // --j-ink
  ink2: "#3C3552", // --j-body
  muted: "#6D6683", // --j-muted
  nav: "#3C3552", // --j-body
  // Status colours keep their semantic job — an admin reads these at a glance
  // in dense tables — and are only retuned to sit beside the purple ramp.
  ok: "#0F6E56",
  okBg: "#E1F5EE",
  warn: "#8A3C12",
  warnBg: "#FBF3DF",
  danger: "#B3261E",
  dangerBg: "#FBECEB",
  /** Resource consumption. Reserved — never used for anything else. */
  ai: "#5B2ED6", // --j-purple
  aiBg: "#F1ECFC", // --j-tint
  /** AI-IMAGE credits ONLY. They cost 33x a resource, so they never share a
   *  colour with anything else in the console. */
  img: "#C2551F", // --j-orange
  imgBg: "#FDF1EA", // --j-orange-bg
  brand: "#5B2ED6", // --j-purple
  brandBg: "#F1ECFC", // --j-tint
} as const;

export const fieldClass =
  "w-full px-3.5 py-2.5 border rounded-xl bg-white text-sm font-medium placeholder-[#9A93AD] focus:outline-none focus:border-[#5B2ED6] transition-colors";
export const fieldStyle: React.CSSProperties = { borderColor: C.border };

export const inputClass = "text-sm rounded-lg border px-3 py-1.5";
export const inputStyle: React.CSSProperties = {
  borderColor: C.border,
  backgroundColor: C.white,
  color: C.ink,
};

// ── Page header ──────────────────────────────────────────────────────────────
export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: C.ink }}>
          {title}
        </h1>
        {sub && (
          <p className="text-sm" style={{ color: C.muted }}>
            {sub}
          </p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border overflow-hidden ${className}`}
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b"
      style={{ borderColor: C.divider }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold flex-1" style={{ color: C.ink }}>
      {children}
    </h2>
  );
}

export function CardBody({
  children,
  tight = false,
}: {
  children: React.ReactNode;
  tight?: boolean;
}) {
  return <div className={tight ? "" : "p-4"}>{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 border-t text-xs"
      style={{ borderColor: C.divider, color: C.muted }}
    >
      {children}
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  delta,
  dir,
  foot,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  dir?: "up" | "down";
  foot?: string;
  /** Alias for `foot`, kept so existing callers don't break. */
  hint?: string;
}) {
  const tail = foot ?? hint;
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: C.ink }}>
        {value}
      </p>
      {(delta || tail) && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          {delta && (
            <span
              className="font-semibold"
              style={{ color: dir === "down" ? C.danger : dir === "up" ? C.ok : C.muted }}
            >
              {delta}
            </span>
          )}
          {delta && tail ? " · " : ""}
          {tail}
        </p>
      )}
    </div>
  );
}

// ── Tag / badge ──────────────────────────────────────────────────────────────
export type Tone = "ok" | "warn" | "danger" | "brand" | "ai" | "img" | "plain";

const TONE: Record<Tone, { bg: string; color: string }> = {
  ok: { bg: C.okBg, color: C.ok },
  warn: { bg: C.warnBg, color: C.warn },
  danger: { bg: C.dangerBg, color: C.danger },
  brand: { bg: C.brandBg, color: C.brand },
  ai: { bg: C.aiBg, color: C.ai },
  img: { bg: C.imgBg, color: C.img },
  plain: { bg: C.divider, color: C.muted },
};

export function Tag({
  children,
  tone = "plain",
  dot = false,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  title?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap"
      style={{ backgroundColor: t.bg, color: t.color }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

/** Plan → tone. Single definition; was duplicated in two files. */
export const PLAN_TONE: Record<string, Tone> = {
  free: "plain",
  standard: "warn",
  pro: "ok",
  max: "ai",
  school: "brand",
};

/** Subscription/record status → tone + label. */
export const STATUS_TONE: Record<string, { tone: Tone; label: string }> = {
  active: { tone: "ok", label: "Active" },
  trialing: { tone: "brand", label: "Trialing" },
  invited: { tone: "plain", label: "Invited" },
  suspended: { tone: "danger", label: "Suspended" },
  past_due: { tone: "warn", label: "Past due" },
  cancelling: { tone: "warn", label: "Cancelling" },
  canceled: { tone: "plain", label: "Canceled" },
  live: { tone: "ok", label: "Live" },
  onboarding: { tone: "warn", label: "Onboarding" },
  pending: { tone: "plain", label: "Not started" },
  paused: { tone: "warn", label: "Paused" },
  open: { tone: "warn", label: "Open" },
  closed: { tone: "ok", label: "Closed" },
  paid: { tone: "ok", label: "Paid" },
  sent: { tone: "plain", label: "Sent" },
  overdue: { tone: "danger", label: "Overdue" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "plain", label: "Refunded" },
  draft: { tone: "plain", label: "Draft" },
  retired: { tone: "plain", label: "Retired" },
  review: { tone: "warn", label: "Needs review" },
  confirmed: { tone: "danger", label: "Confirmed" },
  cleared: { tone: "ok", label: "Cleared" },
  // Enquiries. "new" is brand rather than warn: an unanswered lead is the thing
  // to pick up next, not a problem, and warn is already carrying past_due and
  // paused elsewhere in the console.
  new: { tone: "brand", label: "New" },
  in_progress: { tone: "warn", label: "In progress" },
};

/**
 * Marks an account that bypasses the monthly generation cap. Admins skip the
 * gate entirely (generation-guard.ts returns null before any limit check), so
 * their usage and margin figures are not comparable to a teacher's — without
 * this, an admin's 58 uncapped generations reads as a free teacher blowing
 * through a 5-generation limit.
 */
export function BypassTag({ compact = false }: { compact?: boolean }) {
  return (
    <Tag
      tone="ai"
      title="Admin account — bypasses the monthly generation cap, so this usage is not billable and not comparable to a teacher's"
    >
      {compact ? "bypass" : "Admin · no cap"}
    </Tag>
  );
}

export function StatusTag({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: C.muted }}>—</span>;
  const s = STATUS_TONE[status] ?? { tone: "plain" as Tone, label: status.replace(/_/g, " ") };
  return (
    <Tag tone={s.tone} dot>
      {s.label}
    </Tag>
  );
}

// ── Resource meter ───────────────────────────────────────────────────────────
/**
 * The signature component: one visual language for "how much fuel is left".
 * Used in tables, drawers, school pools and the top-up flow. Never restyle it
 * per context — a teacher's meter and a school's pool must read identically.
 */
export function Meter({
  used,
  allow,
  topup = 0,
  compact = false,
}: {
  used: number;
  allow: number | null;
  topup?: number;
  compact?: boolean;
}) {
  // A null allowance means unlimited — there is no denominator to meter
  // against, so show the raw count rather than a misleading full bar.
  if (allow === null) {
    return (
      <span className="text-xs tabular-nums" style={{ color: C.ink2 }}>
        {nf.format(used)} used
      </span>
    );
  }

  const total = allow + topup;
  if (!total) {
    return (
      <span className="text-xs" style={{ color: C.muted }}>
        —
      </span>
    );
  }

  const pct = Math.min(100, Math.round((used / total) * 100));
  const remain = Math.max(0, total - used);
  const ratio = remain / total;
  const fill = remain === 0 ? C.danger : ratio < 0.15 ? C.warn : C.ai;
  const topPct = topup ? Math.round((topup / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1 min-w-[118px]">
      <div
        className="h-1.5 rounded flex overflow-hidden"
        style={{ backgroundColor: C.divider }}
      >
        <div style={{ width: `${pct}%`, backgroundColor: fill }} />
        {topPct > 0 && (
          <div
            style={{
              width: `${Math.max(0, Math.min(topPct, 100 - pct))}%`,
              backgroundColor: C.ok,
              opacity: 0.75,
            }}
          />
        )}
      </div>
      {!compact && (
        <div className="text-[11px] tabular-nums" style={{ color: C.ink2 }}>
          <b style={{ color: C.ink }}>{nf.format(remain)}</b> left of {nf.format(total)}
          {topup > 0 && <span style={{ color: C.ok }}> (+{nf.format(topup)} top-up)</span>}
        </div>
      )}
    </div>
  );
}

// ── AI-image credit chip ─────────────────────────────────────────────────────
/**
 * Deliberately a different colour and shape from the resource meter. AI-image
 * slideshows cost ~33x a text resource, so the two must never be confused at a
 * glance. Amber = the `--img` reservation from the spec.
 */
export function AiChip({
  used,
  allow,
  topup = 0,
}: {
  used: number;
  allow: number;
  topup?: number;
}) {
  const total = allow + topup;
  if (!total) {
    return <Tag title="Not on this plan">—</Tag>;
  }
  const over = used > total;
  const near = !over && (total - used) / total < 0.2;
  return (
    <Tag
      tone={over ? "danger" : near ? "warn" : "img"}
      dot
      title={`${nf.format(used)} of ${nf.format(total)} AI-image slideshows used this month`}
    >
      {nf.format(used)} / {nf.format(total)}
      {topup > 0 && <span style={{ opacity: 0.7 }}>+{nf.format(topup)}</span>}
    </Tag>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
export function Btn({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { borderColor: C.border, color: C.ink, backgroundColor: "transparent" },
    primary: { borderColor: C.ink, color: "#fff", backgroundColor: C.ink },
    danger: { borderColor: "#F3D3D0", color: C.danger, backgroundColor: "transparent" },
    ghost: { borderColor: "transparent", color: C.muted, backgroundColor: "transparent" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`font-semibold rounded-lg border transition-colors hover:bg-black/5 disabled:opacity-45 disabled:cursor-not-allowed ${
        size === "sm" ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"
      }`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────────
export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
      style={{ backgroundColor: on ? C.ink : C.border }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
        style={{
          transform: on ? "translateX(16px)" : "none",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}

/** A labelled row with a control on the right — the settings/rules pattern. */
export function ToggleRow({
  title,
  desc,
  children,
}: {
  // A node rather than a string so a row can carry an inline badge — e.g. the
  // "Not wired up" pill on pricing rules nothing reads yet.
  title: React.ReactNode;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 py-3 border-b last:border-b-0"
      style={{ borderColor: C.divider }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: C.ink }}>
          {title}
        </div>
        {desc && (
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>
            {desc}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Note / callout ───────────────────────────────────────────────────────────
export function Note({
  children,
  tone = "brand",
}: {
  children: React.ReactNode;
  tone?: "brand" | "warn" | "danger";
}) {
  const map = {
    brand: { bg: C.brandBg, border: "#D9CBF7" },
    warn: { bg: C.warnBg, border: "#EFDFB4" },
    danger: { bg: C.dangerBg, border: "#F3D3D0" },
  }[tone];
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm"
      style={{ backgroundColor: map.bg, borderColor: map.border, color: C.ink }}
    >
      {children}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center px-5 py-11">
      <p className="text-sm font-semibold mb-1" style={{ color: C.ink2 }}>
        {title}
      </p>
      {body && (
        <p className="text-sm" style={{ color: C.muted }}>
          {body}
        </p>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// ── Definition list ──────────────────────────────────────────────────────────
export function DL({ children }: { children: React.ReactNode }) {
  return <dl className="text-sm">{children}</dl>;
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: C.divider }}
    >
      <dt style={{ color: C.muted }}>{label}</dt>
      <dd className="text-right" style={{ color: C.ink }}>
        {value}
      </dd>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────
export function Timeline({ children }: { children: React.ReactNode }) {
  return (
    <ol className="relative pl-4" style={{ borderLeft: `1px solid ${C.border}` }}>
      {children}
    </ol>
  );
}

export function TimelineItem({
  title,
  meta,
  highlight = false,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <li className="relative pb-4 last:pb-0">
      <span
        className="absolute -left-5.25 top-1 w-2.5 h-2.5 rounded-full border-2"
        style={
          highlight
            ? { backgroundColor: C.ink, borderColor: C.ink }
            : { backgroundColor: C.surface, borderColor: C.border }
        }
      />
      <p className="text-sm font-medium" style={{ color: C.ink }}>
        {title}
      </p>
      {meta && (
        <p className="text-xs font-mono" style={{ color: C.muted }}>
          {meta}
        </p>
      )}
    </li>
  );
}

// ── Checklist ────────────────────────────────────────────────────────────────
export function CheckItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div
      className="flex items-start gap-2.5 py-2.5 border-b last:border-b-0"
      style={{ borderColor: C.divider }}
    >
      <span
        className="w-[17px] h-[17px] rounded-md border-[1.5px] shrink-0 mt-px grid place-items-center text-[10px] text-white"
        style={
          done
            ? { backgroundColor: C.ok, borderColor: C.ok }
            : { borderColor: C.border, backgroundColor: "transparent" }
        }
      >
        {done ? "✓" : ""}
      </span>
      <span
        className="flex-1 text-sm"
        style={done ? { color: C.muted, textDecoration: "line-through" } : { color: C.ink }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex gap-0 mb-6 overflow-x-auto">
      {steps.map((s, i) => {
        const n = i + 1;
        const on = n === current;
        const done = n < current;
        return (
          <div key={s} className="flex items-center gap-2 pr-4 shrink-0">
            <span
              className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0"
              style={
                on
                  ? { backgroundColor: C.ink, color: "#fff" }
                  : done
                    ? { backgroundColor: C.okBg, color: C.ok }
                    : { backgroundColor: C.divider, color: C.muted }
              }
            >
              {done ? "✓" : n}
            </span>
            <span
              className="text-xs font-semibold whitespace-nowrap"
              style={{ color: on ? C.ink : C.muted }}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
              <span className="w-6 h-px ml-2" style={{ backgroundColor: C.border }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
/** Fire-and-forget confirmation. Returns [node, fire]. */
export function useToast(): [React.ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const fire = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2800);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = msg ? (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-1100 px-4 py-2.5 rounded-lg text-sm shadow-lg"
      style={{ backgroundColor: C.ink, color: "#fff" }}
      role="status"
    >
      {msg}
    </div>
  ) : null;

  return [node, fire];
}

// ── Drawer ───────────────────────────────────────────────────────────────────
/**
 * Right-hand slide-over. Mounts closed then flips open on the next frame so the
 * browser actually animates the transition instead of starting in its end
 * state; closing waits out the 220ms before unmounting.
 */
export function Drawer({
  onClose,
  children,
  width = "max-w-md",
}: {
  onClose: () => void;
  /** Either plain children, or a render prop receiving the animated `close`
   *  so buttons inside can dismiss with the transition rather than snapping. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = () => {
    setOpen(false);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-1000" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-180"
        style={{ opacity: open ? 1 : 0 }}
        onClick={close}
      />
      <aside
        className={`absolute top-0 right-0 h-screen w-full ${width} shadow-2xl border-l flex flex-col`}
        style={{
          borderColor: C.border,
          backgroundColor: C.surface,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {typeof children === "function"
          ? (children as (close: () => void) => React.ReactNode)(close)
          : children}
      </aside>
    </div>
  );
}

export function DrawerHeader({
  title,
  sub,
  tags,
  avatar,
  onClose,
}: {
  title: string;
  sub?: string;
  tags?: React.ReactNode;
  avatar?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="flex items-start gap-3 p-5 pb-4 border-b shrink-0"
      style={{ borderColor: C.border }}
    >
      {avatar && (
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ backgroundColor: C.divider, color: C.ink }}
        >
          {avatar.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-bold truncate" style={{ color: C.ink }}>
          {title}
        </h2>
        {sub && (
          <p className="text-sm truncate" style={{ color: C.muted }}>
            {sub}
          </p>
        )}
        {tags && <div className="flex flex-wrap items-center gap-1.5 mt-2">{tags}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-black/5 shrink-0"
        style={{ color: C.muted }}
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function DrawerBody({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>;
}

export function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="shrink-0 border-t px-5 py-3.5"
      style={{ borderColor: C.border, backgroundColor: "#F7F5FC" }}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: C.muted }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${width} rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[90vh]`}
        style={{ borderColor: C.border, backgroundColor: C.surface }}
      >
        <div className="px-5 pt-5 pb-1 shrink-0">
          <h2 className="font-bold" style={{ color: C.ink }}>
            {title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div
            className="shrink-0 flex justify-end gap-2 px-5 py-3.5 border-t"
            style={{ borderColor: C.divider }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="block text-xs font-semibold mb-1.5" style={{ color: C.ink2 }}>
        {label}
      </label>
      {children}
      {help && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          {help}
        </p>
      )}
    </div>
  );
}

// ── Table shell ──────────────────────────────────────────────────────────────
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
}) {
  return (
    <th
      className={`font-semibold px-4 py-3 whitespace-nowrap text-${align}`}
      style={{ color: C.muted, width }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  onClick,
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-${align} ${mono ? "tabular-nums font-mono" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  clickable = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <tr
      className="border-t hover:bg-black/2"
      style={{ borderColor: C.divider, cursor: clickable ? "pointer" : undefined }}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

/** Filter bar above a table. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-3 border-b"
      style={{ borderColor: C.divider }}
    >
      {children}
    </div>
  );
}

// ── Collapsible section ──────────────────────────────────────────────────────
/**
 * A heading that hides a heavy section until it is asked for.
 *
 * Collapsed by default, deliberately: the point is that the page above it
 * should be readable and decidable on its own. The "Every tool" table on
 * /admin/usage is 35 rows of detail that answers a question you only ask after
 * the summary has told you where to look — expanded by default it just pushed
 * the summary off the screen.
 *
 * The chevron convention matches the per-row expansion in AdminUsageTable so
 * the two read as the same gesture at different scales.
 */
export function Disclosure({
  title,
  sub,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  sub?: string;
  /** Shown beside the title so the section can be sized without opening it. */
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-start gap-2 text-left w-full"
      >
        <span className="mt-0.5 shrink-0" style={{ color: C.muted }}>
          {open ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: C.ink }}>
              {title}
            </span>
            {count && <Tag>{count}</Tag>}
          </span>
          {sub && (
            <span className="block text-xs mt-0.5" style={{ color: C.muted }}>
              {sub}
            </span>
          )}
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ── Skeleton (for loading.tsx) ───────────────────────────────────────────────
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded animate-pulse ${className}`}
      style={{ backgroundColor: C.divider }}
    />
  );
}
