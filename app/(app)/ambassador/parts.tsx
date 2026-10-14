import Link from "next/link";
import s from "@/app/components/ambassador/programme.module.css";

// Small server-rendered pieces shared by the five ambassador tabs.

export const PLAN_COLOUR: Record<string, string> = {
  standard: "#0F8A63",
  pro: "var(--j-purple)",
  max: "#C08A1E",
};

export const PLAN_NAME: Record<string, string> = {
  standard: "Standard",
  pro: "Pro",
  max: "Max",
  free: "No plan",
};

export function PlanSwatch({ plan }: { plan: string | null }) {
  const p = plan ?? "free";
  return (
    <span className={s.planSw}>
      <i style={{ backgroundColor: PLAN_COLOUR[p] ?? "var(--j-faint)" }} />
      {PLAN_NAME[p] ?? p}
    </span>
  );
}

export function Metric({
  label,
  value,
  sub,
  icon,
  hero = false,
  testId,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  hero?: boolean;
  testId?: string;
}) {
  return (
    <div className={`${s.mt} ${hero ? s.mtHero : ""}`} data-testid={testId}>
      <p className={s.mtLabel}>
        {icon}
        {label}
      </p>
      <p className={s.mtValue}>{value}</p>
      {sub && <p className={s.mtSub}>{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  first = false,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={s.panel} style={first ? { marginTop: 0 } : undefined}>
      <div className={s.panelHead}>
        <h2>{title}</h2>
        {right && <span className={s.panelRight}>{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** A segmented control made of links, so the choice lives in the URL. */
export function SegLinks({
  options,
}: {
  options: { href: string; label: string; on: boolean }[];
}) {
  return (
    <span className={s.segm}>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.on ? "true" : undefined}
          className={o.on ? s.segOn : undefined}
        >
          {o.label}
        </Link>
      ))}
    </span>
  );
}

/**
 * Twelve bars, one series, plain HTML. The value shows on hover or focus, and
 * the latest bar is labelled; the table beside it carries every figure.
 */
export function Bars({
  points,
  format,
  label,
}: {
  points: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  label: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className={s.chart} role="img" aria-label={label}>
      {points.map((p, i) => (
        <div key={p.key} className={s.col} tabIndex={0}>
          <span className={s.tip}>
            {p.label}: {format(p.value)}
          </span>
          {i === points.length - 1 && <span className={s.colVal}>{format(p.value)}</span>}
          <div
            className={`${s.bar} ${i === points.length - 1 ? s.barGold : ""}`}
            style={{ height: `${(p.value / max) * 100}%` }}
          />
          <span className={s.colLab}>{p.label.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

export const longDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
