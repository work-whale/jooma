import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSection } from "../../access";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import { nf, usd } from "../../format";
import SlideshowBreakdown, { type SlideRow } from "./SlideshowBreakdown";

export const dynamic = "force-dynamic";

interface ReportRow {
  tool_slug: string;
  generations: number;
  total_tokens: number;
  /** Billed as output and already inside total_tokens — shown as a sub-figure
   *  so an expensive month can be traced to thinking rather than answer length. */
  reasoning_tokens: number;
  /** Every model that actually ran this tool this month. More than one means it
   *  was switched mid-month, which is otherwise invisible on this page. */
  models: string[];
  text_cost_usd: number;
  asset_cost_usd: number;
  cost_usd: number;
  last_used: string | null;
}
interface StepRow {
  tool_slug: string;
  step: string;
  slide_label: string | null;
  generations: number;
  cost_usd: number;
}
function Stat({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5" }}>
      <p className="text-xs font-semibold mb-2" style={{ color: "#6D6683" }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: "#1D1730" }}>{value}</p>
      {foot && <p className="text-xs mt-1" style={{ color: "#6D6683" }}>{foot}</p>}
    </div>
  );
}

export default async function AdminToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase } = await requireSection("see_product");
  const isSlideshow = slug === "generate-slideshow";

  const [{ data: reportData }, { data: stepData }, slideRes] = await Promise.all([
    supabase.rpc("admin_tool_usage_report"),
    supabase.rpc("admin_tool_step_breakdown"),
    isSlideshow ? supabase.rpc("admin_slide_costs") : Promise.resolve({ data: [] }),
  ]);

  const report = ((reportData ?? []) as ReportRow[]).find((r) => r.tool_slug === slug);
  const steps = ((stepData ?? []) as StepRow[]).filter((s) => s.tool_slug === slug);
  // For the slideshow: one row per generated deck (newest first, as the RPC
  // returns). For other tools: the step/item breakdown.
  const slides = (slideRes?.data ?? []) as SlideRow[];
  const stepBreakdown = steps
    .map((s) => ({ label: s.slide_label ?? s.step, cost_usd: Number(s.cost_usd) }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const hasData = isSlideshow ? slides.length > 0 : stepBreakdown.length > 0;
  const breakdownTotal = isSlideshow
    ? slides.reduce((s, r) => s + Number(r.cost_usd), 0)
    : stepBreakdown.reduce((s, r) => s + r.cost_usd, 0);

  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const totalTokens = Number(report?.total_tokens ?? 0);
  const reasoningTokens = Number(report?.reasoning_tokens ?? 0);
  // Share of all tokens, matching the figure shown directly above it. A share
  // of completion alone would be a bigger, unrelated number.
  const reasoningPct = totalTokens > 0 ? Math.round((reasoningTokens / totalTokens) * 100) : 0;
  const models = report?.models ?? [];

  return (
    <>
      <Link
        href="/admin/usage"
        className="inline-flex items-center gap-2 text-sm font-semibold mb-5 transition-colors hover:opacity-70"
        style={{ color: "#1D1730" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to usage
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1D1730" }}>
        {typeLabel(slug)}
      </h1>
      <p className="text-sm mb-6" style={{ color: "#6D6683" }}>
        Usage across all users for {month}.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Stat label="Generations" value={nf.format(Number(report?.generations ?? 0))} />
        <Stat
          label="Total tokens"
          value={nf.format(totalTokens)}
          // Only when a reasoning model has run — a permanent "0% thinking" on
          // every gpt-4o tool would be noise, not information.
          foot={reasoningTokens > 0 ? `${reasoningPct}% thinking` : undefined}
        />
        <Stat
          label="Model"
          value={models.length === 0 ? "—" : models.length === 1 ? models[0] : `${models.length} models`}
          // Naming them matters: two models this month means the tool was
          // switched mid-month, and the cost figures below straddle both.
          foot={models.length > 1 ? models.join(", ") : undefined}
        />
        <Stat label="Text cost" value={usd(Number(report?.text_cost_usd ?? 0))} />
        <Stat label="Total cost" value={usd(Number(report?.cost_usd ?? 0))} />
      </div>

      <h2 className="text-sm font-semibold mb-3" style={{ color: "#1D1730" }}>
        {isSlideshow ? "Each slideshow" : "Cost breakdown"}
      </h2>

      {!hasData ? (
        <div
          className="rounded-2xl p-6 border text-sm"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5", color: "#3C3552" }}
        >
          {isSlideshow
            ? "No slideshows generated yet this month."
            : "No usage recorded yet this month."}
        </div>
      ) : isSlideshow ? (
        <SlideshowBreakdown slides={slides} />
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#6D6683" }} className="text-left">
                <th className="font-semibold px-4 py-3">Item</th>
                <th className="font-semibold px-4 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {stepBreakdown.map((b, i) => (
                <tr key={`${b.label}:${i}`} className="border-t" style={{ borderColor: "#F1ECFC" }}>
                  <td className="px-4 py-3" style={{ color: "#1D1730" }}>{b.label}</td>
                  <td className="px-4 py-3 text-right" style={{ color: "#3C3552" }}>{usd(b.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "#EAE6F5" }}>
                <td className="px-4 py-3 font-bold" style={{ color: "#1D1730" }}>Total</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: "#1D1730" }}>
                  {usd(breakdownTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isSlideshow && (
        <p className="text-xs mt-4" style={{ color: "#6D6683" }}>
          Each row is one generated deck — click it to break the cost down into deck text (exact
          tokens) + AI images (per image, calibrated to the OpenAI console) + audio. The stat cards
          above are the month&apos;s totals across all slideshows.
        </p>
      )}
    </>
  );
}
