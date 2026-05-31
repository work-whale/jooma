"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Trash2, Loader2 } from "lucide-react";
import Card from "@/app/components/ui/Card";
import { listToolRuns, deleteToolRun, type ToolRun } from "@/app/lib/toolRuns";

interface ToolHistoryPanelProps {
  toolSlug: string;
  onRestore: (run: ToolRun) => void;
  /** Bump to refetch after a new run is saved. */
  reloadSignal?: number;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ToolHistoryPanel({
  toolSlug,
  onRestore,
  reloadSignal = 0,
}: ToolHistoryPanelProps) {
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listToolRuns(toolSlug)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [toolSlug]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteToolRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // leave the row in place if the delete failed
    } finally {
      setDeletingId(null);
    }
  };

  // Nothing to show yet (and not loading) — keep the sidebar uncluttered.
  if (!loading && runs.length === 0) return null;

  return (
    <Card className="p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-muted" />
        <h2 className="text-md font-semibold text-gray-900">Recent</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <ul className="space-y-1">
          {runs.map((run) => (
            <li key={run.id}>
              <div className="group flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-[#F1EFE3] transition-colors">
                <button
                  type="button"
                  onClick={() => onRestore(run)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {run.title?.trim() || "Untitled"}
                  </p>
                  <p className="text-xs text-muted">{relativeTime(run.created_at)}</p>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, run.id)}
                  disabled={deletingId === run.id}
                  aria-label="Delete from history"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-white transition-all cursor-pointer"
                >
                  {deletingId === run.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
