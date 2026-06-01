/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import ToolIcon from "@/app/components/ToolIcon";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";
import Card from "@/app/components/ui/Card";
import { minutesSavedFor } from "@/app/lib/tools";
import { listRecentRuns, type ToolRun } from "@/app/lib/toolRuns";
import { toolForSlug, typeLabel, formatDate } from "@/app/lib/toolRunDisplay";

export default function DashboardPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRecentRuns(100)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const count = (slug: string) => runs.filter((r) => r.tool_slug === slug).length;
    // Sum per-tool minute estimates (see TOOL_MINUTES_SAVED) and convert to hours.
    const minutes = runs.reduce((sum, r) => sum + minutesSavedFor(r.tool_slug), 0);
    return {
      lessonPlans: count("lesson-planner"),
      worksheets: count("worksheet-generator"),
      quizzes: count("quiz-generator"),
      hoursSaved: Math.round(minutes / 60),
    };
  }, [runs]);

  const recent = runs.slice(0, 8);

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F1EFE3" }}>
      <SideNav />
      <main className="grow flex flex-col overflow-y-auto">
        <TopBar title="Dashboard" />

        <div className="px-10 pb-16 space-y-4">
          {/* Activity overview */}
          <Card className="p-10">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-2xl font-medium">Here&apos;s your activity overview</h3>
              <button
                onClick={() => router.push("/analytics")}
                className="text-sm font-medium text-muted hover:text-dark transition-colors cursor-pointer"
              >
                See all
              </button>
            </div>
            <p className="text-sm text-muted font-light mb-6">
              {stats.hoursSaved} hours saved = more time for coffee or creativity!
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                bg="bg-[#EF233C]/10" icon={<img src="/icons/lesson-plan.svg" alt="" width={36} height={36} />}
                value={`${stats.lessonPlans} lesson plans`} sub="Created with Jooma"
              />
              <StatCard
                bg="bg-[#16DB65]/10" icon={<img src="/icons/clock.svg" alt="" width={36} height={36} />}
                value={`${stats.hoursSaved} hours`} sub="Estimated time saved"
              />
              <StatCard
                bg="bg-[#FFDC21]/10" icon={<img src="/icons/flashcards.svg" alt="" width={36} height={36} />}
                value={`${stats.quizzes} quizzes`} sub="Ready to play"
              />
              <StatCard
                bg="bg-[#3B6FF5]/10" icon={<img src="/icons/worksheet.svg" alt="" width={36} height={36} />}
                value={`${stats.worksheets} worksheets`} sub="Ready to use"
              />
            </div>
          </Card>

          {/* Recently added */}
          <Card className="p-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-medium">
                Recently added{" "}
                <span className="text-muted">({runs.length})</span>
              </h3>
              <button
                onClick={() => router.push("/analytics")}
                className="text-sm font-medium text-muted hover:text-dark transition-colors cursor-pointer"
              >
                See all
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-muted py-10 text-center">Loading…</p>
            ) : recent.length === 0 ? (
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
                  {recent.map((run) => {
                    const tool = toolForSlug(run.tool_slug);
                    const input = run.input as Record<string, unknown>;
                    const subject = (input.subject as string) || "—";
                    const year = (input.yearGroup as string) || "—";
                    return (
                      <tr
                        key={run.id}
                        onClick={() => tool && router.push(tool.href)}
                        className="border-b border-line/60 hover:bg-[#F1EFE3] transition-colors cursor-pointer"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <ToolIcon name={tool?.icon ?? ""} className="w-8 h-8 shrink-0" />
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
                            aria-label="More"
                            onClick={(e) => e.stopPropagation()}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:bg-white transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
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

function StatCard({
  bg, icon, value, sub,
}: {
  bg: string; icon: React.ReactNode; value: string; sub: string;
}) {
  return (
    <div className={`relative rounded-2xl p-6 ${bg} min-h-32 flex flex-col justify-end`}>
      <span className="absolute top-5 right-5">
        {icon}
      </span>
      <p className="text-xl font-semibold text-dark">{value}</p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
    </div>
  );
}
