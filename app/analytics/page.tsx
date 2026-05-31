"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Trash2, Loader2, Sparkles, Clock, Wrench, CalendarDays } from "lucide-react";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";
import Card from "@/app/components/ui/Card";
import { minutesSavedFor } from "@/app/lib/tools";
import { listRecentRuns, deleteToolRun, type ToolRun } from "@/app/lib/toolRuns";
import { toolForSlug, typeLabel, formatDate, TAG_COLORS } from "@/app/lib/toolRunDisplay";

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listRecentRuns(1000)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const { totalMinutes, toolsUsed, thisWeek, breakdown } = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const byTool = new Map<string, { count: number; minutes: number }>();
    let minutes = 0;
    let week = 0;
    for (const r of runs) {
      const m = minutesSavedFor(r.tool_slug);
      minutes += m;
      if (new Date(r.created_at).getTime() >= weekAgo) week++;
      const cur = byTool.get(r.tool_slug) ?? { count: 0, minutes: 0 };
      cur.count++;
      cur.minutes += m;
      byTool.set(r.tool_slug, cur);
    }
    const list = [...byTool.entries()]
      .map(([slug, v]) => ({ slug, ...v }))
      .sort((a, b) => b.count - a.count);
    return { totalMinutes: minutes, toolsUsed: byTool.size, thisWeek: week, breakdown: list };
  }, [runs]);

  const maxCount = breakdown[0]?.count ?? 1;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteToolRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // leave row if delete fails
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F1EFE3" }}>
      <SideNav />
      <main className="grow flex flex-col overflow-y-auto">
        <TopBar title="Analytics" />

        <div className="px-10 pb-16 space-y-4">
          {/* Summary */}
          <Card className="p-10">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-dark transition-colors cursor-pointer mb-5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </button>

            <h3 className="text-2xl font-medium mb-6">Your activity</h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Summary icon={<Sparkles className="w-4 h-4 text-white" />} iconBg="bg-violet-500" bg="bg-violet-100"
                value={String(runs.length)} label="Total generations" />
              <Summary icon={<Clock className="w-4 h-4 text-white" />} iconBg="bg-emerald-500" bg="bg-emerald-100"
                value={`${Math.round(totalMinutes / 60)} hours`} label="Estimated time saved" />
              <Summary icon={<Wrench className="w-4 h-4 text-white" />} iconBg="bg-blue-500" bg="bg-blue-100"
                value={String(toolsUsed)} label="Tools used" />
              <Summary icon={<CalendarDays className="w-4 h-4 text-white" />} iconBg="bg-amber-400" bg="bg-amber-100"
                value={String(thisWeek)} label="This week" />
            </div>
          </Card>

          {/* Per-tool breakdown */}
          <Card className="p-10">
            <h3 className="text-xl font-medium mb-6">Usage by tool</h3>
            {loading ? (
              <p className="text-sm text-muted py-10 text-center">Loading…</p>
            ) : breakdown.length === 0 ? (
              <p className="text-sm text-muted py-10 text-center">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {breakdown.map((b) => (
                  <div key={b.slug} className="flex items-center gap-4">
                    <div className="w-48 shrink-0 text-sm font-medium text-dark truncate">
                      {toolForSlug(b.slug)?.label ?? typeLabel(b.slug)}
                    </div>
                    <div className="flex-1 h-6 rounded-full bg-[#F1EFE3] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stone-700"
                        style={{ width: `${Math.max(6, (b.count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <div className="w-12 shrink-0 text-sm font-semibold text-dark text-right tabular-nums">
                      {b.count}
                    </div>
                    <div className="w-20 shrink-0 text-xs text-muted text-right">
                      {formatHours(b.minutes)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Full activity list */}
          <Card className="p-10">
            <h3 className="text-xl font-medium mb-6">
              All activity <span className="text-muted">({runs.length})</span>
            </h3>
            {loading ? (
              <p className="text-sm text-muted py-10 text-center">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted py-10 text-center">
                Nothing yet — generate something with a tool and it&apos;ll appear here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-line">
                    <th className="font-normal pb-3 pr-4">Name</th>
                    <th className="font-normal pb-3 pr-4">Type</th>
                    <th className="font-normal pb-3 pr-4">Subject</th>
                    <th className="font-normal pb-3 pr-4">Year</th>
                    <th className="font-normal pb-3 pr-4">Date</th>
                    <th className="pb-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const tool = toolForSlug(run.tool_slug);
                    const colors = (tool && TAG_COLORS[tool.tag]) || { bg: "bg-gray-100", icon: "text-gray-600" };
                    const input = run.input as Record<string, unknown>;
                    const subject = (input.subject as string) || "—";
                    const year = (input.yearGroup as string) || "—";
                    return (
                      <tr
                        key={run.id}
                        onClick={() => tool && router.push(tool.href)}
                        className="group border-b border-line/60 hover:bg-[#F1EFE3] transition-colors cursor-pointer"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                              <FileText className={`w-4 h-4 ${colors.icon}`} />
                            </span>
                            <span className="font-medium text-dark truncate max-w-xs">
                              {run.title?.trim() || "Untitled"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted">{typeLabel(run.tool_slug)}</td>
                        <td className="py-3 pr-4 text-muted">{subject}</td>
                        <td className="py-3 pr-4 text-muted">{year}</td>
                        <td className="py-3 pr-4 text-muted whitespace-nowrap">{formatDate(run.created_at)}</td>
                        <td className="py-3">
                          <button
                            aria-label="Delete"
                            onClick={(e) => handleDelete(e, run.id)}
                            disabled={deletingId === run.id}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-white transition-all cursor-pointer"
                          >
                            {deletingId === run.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function Summary({
  icon, iconBg, bg, value, label,
}: {
  icon: React.ReactNode; iconBg: string; bg: string; value: string; label: string;
}) {
  return (
    <div className={`relative rounded-2xl p-6 ${bg} min-h-32 flex flex-col justify-end`}>
      <span className={`absolute top-5 right-5 w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
        {icon}
      </span>
      <p className="text-2xl font-semibold text-dark">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
