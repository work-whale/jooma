import { requireAdmin } from "@/app/lib/auth/admin";
import { TOOLS } from "@/app/lib/tools";
import AdminUsageTable, { type AdminUsageRow } from "./AdminUsageTable";

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

export default async function AdminUsagePage() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: stepData }, { data: slideData }] = await Promise.all([
    supabase.rpc("admin_tool_usage_report"),
    supabase.rpc("admin_tool_step_breakdown"),
    supabase.rpc("admin_slide_costs"),
  ]);
  const report = (data ?? []) as ReportRow[];
  const steps = (stepData ?? []) as StepRow[];
  const slideCosts = (slideData ?? []) as { slide_label: string; cost_usd: number; created_at: string }[];

  // Breakdown children per tool. The slideshow is broken down PER SLIDE (each
  // slide's all-in cost, from slide_cost). Every other multi-step tool uses its
  // step breakdown (deck text / audio script / etc.).
  const childrenBySlug = new Map<string, { label: string; cost_usd: number }[]>();
  for (const s of steps) {
    if (s.tool_slug === "generate-slideshow") continue; // per-slide handled below
    const arr = childrenBySlug.get(s.tool_slug) ?? [];
    arr.push({ label: s.slide_label ?? s.step, cost_usd: Number(s.cost_usd) });
    childrenBySlug.set(s.tool_slug, arr);
  }
  if (slideCosts.length > 0) {
    childrenBySlug.set(
      "generate-slideshow",
      slideCosts
        .map((s) => ({ label: s.slide_label, cost_usd: Number(s.cost_usd) }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
    );
  }

  // Merge the full tool catalog with what's been used so every tool shows,
  // even at zero. Append any recorded slug that isn't in the catalog (sub-assets
  // like generate-slideshow / generate-audio).
  const bySlug = new Map(report.map((r) => [r.tool_slug, r]));
  const catalogSlugs = TOOLS.map((t) => t.href.replace("/tools/", ""));
  const allSlugs = Array.from(new Set([...catalogSlugs, ...report.map((r) => r.tool_slug)]));

  const rows: AdminUsageRow[] = allSlugs
    .map((slug) => {
      const r = bySlug.get(slug);
      const children = childrenBySlug.get(slug);
      return {
        tool_slug: slug,
        generations: r ? Number(r.generations) : 0,
        cost_usd: r ? Number(r.cost_usd) : 0,
        last_used: r?.last_used ?? null,
        children: children && children.length > 1 ? children : undefined,
      };
    })
    .sort((a, b) => b.cost_usd - a.cost_usd || a.tool_slug.localeCompare(b.tool_slug));

  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Usage
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        Cost per tool across all users for {month}, with per-generation cost and 10x / 100x
        projections. Every tool is listed; unused tools show zero. Use Select to reset a tool&apos;s
        recorded usage.
      </p>

      <AdminUsageTable rows={rows} />
    </>
  );
}
