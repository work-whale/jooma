import { requireSection } from "../access";
import { TOOLS } from "@/app/lib/tools";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import AdminUsageTable, { type AdminUsageRow } from "./AdminUsageTable";
import UsageView, {
  type FairUseRule,
  type MarginRow,
  type ModelRow,
  type UsageSummary,
} from "./UsageView";

// Slugs recorded by the Slideshow Generator editor when its actions are used
// standalone (no parentTool). They're grouped under the generate-slideshow
// umbrella row rather than listed as separate top-level tools.
const SLIDESHOW_SUBTOOLS = [
  "generate-audio",
  "generate-lesson-outline",
  "suggest-vocabulary",
  "suggest-subject",
  "find-youtube",
  "edit-text",
  "generate-activity",
];

// The fair-use settings live in app_settings; this page shows the subset that
// governs generation limits and abuse.
//
// Only two, deliberately. Three more used to sit here and were read by nothing:
// flag_concurrent_sessions and log_generation_cost were deleted outright, and
// block_disposable_email moved to the access section beside signups_open, since
// it belongs to the signup path rather than the generation path. See
// 20260812130049_fair_use_honesty.sql for the reasoning.
const FAIR_USE_KEYS = ["rate_limit_per_hour", "alert_negative_margin"];

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
  const { supabase } = await requireSection("see_product");

  const [
    { data },
    { data: stepData },
    { data: summaryData },
    { data: marginData },
    { data: modelData },
    { data: settingsData },
  ] = await Promise.all([
    supabase.rpc("admin_tool_usage_report"),
    supabase.rpc("admin_tool_step_breakdown"),
    supabase.rpc("admin_usage_summary"),
    supabase.rpc("admin_thinnest_margins", { lim: 8 }),
    supabase.rpc("admin_model_routing"),
    supabase.rpc("admin_settings"),
  ]);

  const report = (data ?? []) as ReportRow[];
  const steps = (stepData ?? []) as StepRow[];

  // Step-breakdown children for non-slideshow multi-step tools (deck text /
  // audio script / etc.). The slideshow gets its own sub-tool breakdown below.
  type ChildRow = NonNullable<AdminUsageRow["children"]>[number];
  const childrenBySlug = new Map<string, ChildRow[]>();
  for (const s of steps) {
    if (s.tool_slug === "generate-slideshow") continue;
    const arr = childrenBySlug.get(s.tool_slug) ?? [];
    arr.push({ label: s.slide_label ?? s.step, cost_usd: Number(s.cost_usd) });
    childrenBySlug.set(s.tool_slug, arr);
  }

  // Merge the full tool catalog with what's been used so every tool shows,
  // even at zero.
  const bySlug = new Map(report.map((r) => [r.tool_slug, r]));
  const catalogSlugs = TOOLS.map((t) => t.href.replace("/tools/", ""));
  const allSlugs = Array.from(new Set([...catalogSlugs, ...report.map((r) => r.tool_slug)]));

  const toRow = (slug: string): AdminUsageRow => {
    const r = bySlug.get(slug);
    const children = childrenBySlug.get(slug);
    return {
      tool_slug: slug,
      generations: r ? Number(r.generations) : 0,
      cost_usd: r ? Number(r.cost_usd) : 0,
      last_used: r?.last_used ?? null,
      children: children && children.length > 1 ? children : undefined,
    };
  };

  // The slideshow editor sub-tools become children of the generate-slideshow
  // umbrella rather than separate top-level rows.
  const subtools = new Set(SLIDESHOW_SUBTOOLS);
  const subtoolChildren = SLIDESHOW_SUBTOOLS.map((slug) => bySlug.get(slug))
    .filter((r): r is ReportRow => !!r && Number(r.generations) > 0)
    .map((r) => ({
      label: typeLabel(r.tool_slug),
      cost_usd: Number(r.cost_usd),
      generations: Number(r.generations),
      last_used: r.last_used,
      tool_slug: r.tool_slug,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const rows: AdminUsageRow[] = allSlugs
    .filter((slug) => slug !== "generate-slideshow" && !subtools.has(slug))
    .map(toRow);

  if (bySlug.has("generate-slideshow") || subtoolChildren.length > 0) {
    const own = toRow("generate-slideshow");
    const childCost = subtoolChildren.reduce((sum, c) => sum + c.cost_usd, 0);
    const children = [
      {
        label: "Decks (text, images & audio)",
        cost_usd: own.cost_usd,
        generations: own.generations,
        last_used: own.last_used,
        tool_slug: "generate-slideshow",
      },
      ...subtoolChildren,
    ];
    rows.push({
      ...own,
      cost_usd: own.cost_usd + childCost,
      children: children.length > 1 ? children : undefined,
    });
  }

  rows.sort((a, b) => b.cost_usd - a.cost_usd || a.tool_slug.localeCompare(b.tool_slug));

  // "Where the money goes" — the top ten by spend, with a share bar.
  const topTools = rows
    .filter((r) => r.cost_usd > 0)
    .slice(0, 10)
    .map((r) => ({
      tool_slug: r.tool_slug,
      label: typeLabel(r.tool_slug),
      generations: r.generations,
      cost_usd: r.cost_usd,
      cost_per_run: r.generations > 0 ? r.cost_usd / r.generations : 0,
    }));

  const settings = (settingsData ?? []) as FairUseRule[];

  return (
    <UsageView
      summary={((summaryData ?? [])[0] ?? null) as UsageSummary | null}
      topTools={topTools}
      margins={(marginData ?? []) as MarginRow[]}
      models={(modelData ?? []) as ModelRow[]}
      fairUse={settings.filter((s) => FAIR_USE_KEYS.includes(s.key))}
      toolTable={<AdminUsageTable rows={rows} />}
      toolCount={rows.length}
    />
  );
}
