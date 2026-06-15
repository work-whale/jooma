import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/app/lib/auth/admin";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import { nf, usd, fmtDateTime } from "../../format";

export const dynamic = "force-dynamic";

interface ReportRow {
  tool_slug: string;
  generations: number;
  total_tokens: number;
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
interface SlideRow {
  slide_label: string;
  cost_usd: number;
  created_at: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}>
      <p className="text-xs font-semibold mb-2" style={{ color: "#8a8078" }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>{value}</p>
    </div>
  );
}

export default async function AdminToolDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase } = await requireAdmin();
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

  return (
    <>
      <Link
        href="/admin/usage"
        className="inline-flex items-center gap-2 text-sm font-semibold mb-5 transition-colors hover:opacity-70"
        style={{ color: "#1a1a1a" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to usage
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        {typeLabel(slug)}
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        Usage across all users for {month}.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Generations" value={nf.format(Number(report?.generations ?? 0))} />
        <Stat label="Total tokens" value={nf.format(Number(report?.total_tokens ?? 0))} />
        <Stat label="Text cost" value={usd(Number(report?.text_cost_usd ?? 0))} />
        <Stat label="Total cost" value={usd(Number(report?.cost_usd ?? 0))} />
      </div>

      <h2 className="text-sm font-semibold mb-3" style={{ color: "#1a1a1a" }}>
        {isSlideshow ? "Each slideshow" : "Cost breakdown"}
      </h2>

      {!hasData ? (
        <div
          className="rounded-2xl p-6 border text-sm"
          style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0", color: "#6b6055" }}
        >
          {isSlideshow
            ? "No slideshows generated yet this month."
            : "No usage recorded yet this month."}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#8a8078" }} className="text-left">
                <th className="font-semibold px-4 py-3">{isSlideshow ? "Slideshow" : "Item"}</th>
                {isSlideshow && <th className="font-semibold px-4 py-3">Generated</th>}
                <th className="font-semibold px-4 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {isSlideshow
                ? slides.map((s, i) => (
                    <tr key={`${s.slide_label}:${i}`} className="border-t" style={{ borderColor: "#EEECE4" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "#1a1a1a" }}>{s.slide_label}</td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#8a8078" }}>{fmtDateTime(s.created_at)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>{usd(Number(s.cost_usd))}</td>
                    </tr>
                  ))
                : stepBreakdown.map((b, i) => (
                    <tr key={`${b.label}:${i}`} className="border-t" style={{ borderColor: "#EEECE4" }}>
                      <td className="px-4 py-3" style={{ color: "#1a1a1a" }}>{b.label}</td>
                      <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>{usd(b.cost_usd)}</td>
                    </tr>
                  ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "#DAD8D0" }}>
                <td className="px-4 py-3 font-bold" style={{ color: "#1a1a1a" }}>Total</td>
                {isSlideshow && <td />}
                <td className="px-4 py-3 text-right font-bold" style={{ color: "#1a1a1a" }}>
                  {usd(breakdownTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isSlideshow && (
        <p className="text-xs mt-4" style={{ color: "#8a8078" }}>
          Each row is one generated deck; its cost is the deck text (exact tokens) + AI images
          (per image, calibrated to the OpenAI console) + audio. The stat cards above are the
          month&apos;s totals across all slideshows.
        </p>
      )}
    </>
  );
}
