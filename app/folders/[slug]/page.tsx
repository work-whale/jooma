"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Folder, FileText, Trash2, Loader2 } from "lucide-react";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";
import Card from "@/app/components/ui/Card";
import { listToolRuns, deleteToolRun, type ToolRun } from "@/app/lib/toolRuns";
import { toolForSlug, typeLabel, formatDate, TAG_COLORS } from "@/app/lib/toolRunDisplay";

export default function FolderDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tool = toolForSlug(slug);
  const colors = (tool && TAG_COLORS[tool.tag]) || { bg: "bg-gray-100", icon: "text-gray-600" };

  useEffect(() => {
    listToolRuns(slug).then(setRuns).catch(() => setRuns([])).finally(() => setLoading(false));
  }, [slug]);

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
        <TopBar title="Folders" />

        <div className="px-10 pb-16 space-y-4">
          <Card className="p-10">
            <button
              onClick={() => router.push("/folders")}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-dark transition-colors cursor-pointer mb-5"
            >
              <ArrowLeft className="w-4 h-4" />
              All folders
            </button>

            <div className="flex items-center gap-4 mb-8">
              <span className={`w-12 h-12 rounded-2xl ${colors.bg} flex items-center justify-center shrink-0`}>
                <Folder className={`w-6 h-6 ${colors.icon}`} />
              </span>
              <div>
                <h3 className="text-2xl font-medium">{tool?.label ?? typeLabel(slug)}</h3>
                <p className="text-sm text-muted">{runs.length} {runs.length === 1 ? "item" : "items"}</p>
              </div>
              {tool && (
                <button
                  onClick={() => router.push(tool.href)}
                  className="ml-auto px-5 py-2.5 rounded-xl bg-[#030303] text-white text-sm font-medium hover:bg-black transition-colors cursor-pointer"
                >
                  Open tool
                </button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted py-10 text-center">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted py-10 text-center">This folder is empty.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-line">
                    <th className="font-normal pb-3 pr-4">Name</th>
                    <th className="font-normal pb-3 pr-4">Subject</th>
                    <th className="font-normal pb-3 pr-4">Year</th>
                    <th className="font-normal pb-3 pr-4">Date</th>
                    <th className="pb-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
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
