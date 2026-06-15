import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/app/lib/auth/server";
import UsageTable, { type ReportRow } from "./UsageTable";

// Usage report: per-tool cost for the current calendar month, with per-generation
// cost and 10x/100x projections. Figures are exact — text from completion.usage
// (what OpenAI bills on), images/audio priced per unit. See app/lib/usage.ts and
// the my_tool_usage_report() RPC. The interactive table (Select / Reset) lives in
// UsageTable; this server component just fetches the rows.
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_tool_usage_report");
  const rows = (data ?? []) as ReportRow[];

  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: "#F1EFE3" }}>
      <div className="max-w-5xl mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold mb-6 transition-colors hover:opacity-70"
          style={{ color: "#1a1a1a" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
          Usage
        </h1>
        <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
          Cost per tool for {month}, with per-generation cost and projected cost at 10 and 100
          generations. Text from exact token counts; images and audio priced per unit.
        </p>

        <UsageTable rows={rows} />

        <p className="text-xs mt-4" style={{ color: "#8a8078" }}>
          Average per gen is this month&apos;s actual cost divided by generations; average per 10 and
          ~100x are linear estimates at that average. Text cost is from exact token counts; image cost is per image
          (calibrated to the OpenAI console) and audio is gpt-4o script tokens plus tts-1 at $15 per
          million characters. Reset permanently deletes a tool&apos;s recorded usage.
        </p>
      </div>
    </div>
  );
}
