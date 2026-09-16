"use client";

// ── Stats charts ─────────────────────────────────────────────────────────────
// Recharts rather than the hand-rolled divs this page used to draw, which had
// no axes, no grid and no hover: a bar was a coloured block whose value you had
// to read off a label underneath it.
//
// WHY EVERY CHART IS WRAPPED IN ResponsiveContainer
//
// Recharts needs pixel width and height. Inside the admin's flex and grid
// panels the parent width is not known until layout, so a fixed width either
// overflows the card or leaves a gap. The container measures the parent and
// re-renders on resize, which is what makes these survive the sidebar
// collapsing at 820px.
//
// Colours come from `C` and the local ramp, never from Recharts' defaults, so
// a chart cannot quietly introduce a colour the rest of the console does not
// use. The plan colours in particular are fixed across all three charts: free
// is always the palest, max always green.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { nf } from "../format";
import { C } from "../ui";

/** The plan ramp, palest to strongest. Shared by the stacked bars and the
 *  donut so a reader can carry the colour between the two panels. */
export const PLAN_COLOUR = { free: "#DDD2F7", pro: C.brand, max: C.ok } as const;

/** Axis and grid furniture. Muted enough to sit behind the data: an axis that
 *  competes with the bars is noise. */
const AXIS = {
  tick: { fill: C.muted, fontSize: 11, fontWeight: 600 },
  tickLine: false,
  axisLine: false,
} as const;

const GRID = { stroke: C.border, strokeDasharray: "0" } as const;

/** Shared tooltip shell, so all three charts hover identically instead of
 *  each inheriting Recharts' white box with a black border. */
function TooltipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <p className="font-bold mb-1" style={{ color: C.ink }}>
        {title}
      </p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4" style={{ color: C.muted }}>
          <span>{k}</span>
          <span className="tabular-nums font-semibold" style={{ color: C.ink2 }}>
            {v}
          </span>
        </p>
      ))}
    </div>
  );
}

export interface ChartMonth {
  label: string;
  short: string;
  signups: number;
  free: number;
  pro: number;
  max: number;
  paid: number;
  conversion: number;
}

// ── Signups by month ─────────────────────────────────────────────────────────
/**
 * Stacked bars, free at the bottom through to max at the top.
 *
 * Stack order is the reverse of the old hand-rolled chart, which drew max
 * first. Recharts stacks in render order from the baseline up, so listing free
 * first is what puts the paid bands on top where the mockup has them.
 */
export function SignupsChart({ data }: { data: ChartMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        {/* Horizontal lines only: vertical ones would box in every bar. */}
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="short" {...AXIS} />
        <YAxis {...AXIS} width={52} tickFormatter={(v: number) => nf.format(v)} />
        <Tooltip
          cursor={{ fill: C.divider, opacity: 0.55 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const m = payload[0].payload as ChartMonth;
            return (
              <TooltipBox
                title={m.label}
                rows={[
                  ["Signups", nf.format(m.signups)],
                  ["Free", nf.format(m.free)],
                  ["Pro", nf.format(m.pro)],
                  ["Max", nf.format(m.max)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="free" stackId="plan" fill={PLAN_COLOUR.free} />
        <Bar dataKey="pro" stackId="plan" fill={PLAN_COLOUR.pro} />
        {/* Only the top band is rounded, so the stack reads as one bar. */}
        <Bar dataKey="max" stackId="plan" fill={PLAN_COLOUR.max} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Free to paid conversion ──────────────────────────────────────────────────
/**
 * An area line, matching the mockup's conversion panel.
 *
 * Percentages, not counts, so the Y axis is pinned to a sensible ceiling rather
 * than letting Recharts autoscale a flat 9% line into a dramatic mountain.
 */
export function ConversionChart({ data }: { data: ChartMonth[] }) {
  const peak = Math.max(...data.map((d) => d.conversion), 1);
  // Rounded up to a clean step so the axis reads 0/25/50/75 rather than the
  // 0/25/50/84 that an arbitrary ceiling produces.
  const step = peak <= 10 ? 5 : peak <= 25 ? 10 : 25;
  // Capped at 100: a share of signups cannot exceed it, and headroom above
  // 100% would draw an axis reaching somewhere the data can never go.
  const ceiling = Math.min(100, Math.ceil((peak * 1.15) / step) * step);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brand} stopOpacity={0.24} />
            <stop offset="100%" stopColor={C.brand} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="short" {...AXIS} />
        {/* Wider than the bar chart's axis: "100%" is five characters and gets
            clipped to "00%" at 52px, which reads as a real number. */}
        <YAxis
          {...AXIS}
          width={60}
          domain={[0, ceiling]}
          tickCount={ceiling / step + 1}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ stroke: C.border }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const m = payload[0].payload as ChartMonth;
            return (
              <TooltipBox
                title={m.label}
                rows={[
                  ["Conversion", `${m.conversion.toFixed(1)}%`],
                  ["Paid", nf.format(m.paid)],
                  ["Signups", nf.format(m.signups)],
                ]}
              />
            );
          }}
        />
        {/* Linear, not monotone. These are twelve discrete monthly cohorts, and
            a smoothed curve draws values between them that were never measured,
            overshooting past the real peak on a sparse range. */}
        <Area
          type="linear"
          dataKey="conversion"
          stroke={C.brand}
          strokeWidth={2.5}
          fill="url(#convFill)"
          dot={{ r: 3, fill: C.brand, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Plan mix ─────────────────────────────────────────────────────────────────
/** The donut from the mockup, with the paid share in the hole. One ring over
 *  the whole range rather than per month: it answers "what is the mix now". */
export function PlanMixChart({
  free,
  pro,
  max,
  conversion,
}: {
  free: number;
  pro: number;
  max: number;
  conversion: string;
}) {
  const slices = [
    { key: "Free", value: free, fill: PLAN_COLOUR.free },
    { key: "Pro", value: pro, fill: PLAN_COLOUR.pro },
    { key: "Max", value: max, fill: PLAN_COLOUR.max },
  ].filter((s) => s.value > 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            innerRadius={58}
            outerRadius={86}
            startAngle={90}
            endAngle={-270}
            paddingAngle={1.5}
            stroke="none"
            // Animation off: the ring is read alongside the table under it,
            // and a spin on every range change is motion without information.
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.fill} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as { key: string; value: number };
              return <TooltipBox title={s.key} rows={[["Teachers", nf.format(s.value)]]} />;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centred over the hole. pointer-events-none so it cannot swallow the
          hover that belongs to the ring behind it. */}
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums" style={{ color: C.ink }}>
            {conversion}
          </p>
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: C.muted }}
          >
            Paid
          </p>
        </div>
      </div>
    </div>
  );
}
