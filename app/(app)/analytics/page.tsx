"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  FileText,
  Trash,
  CircleNotch,
  Clock,
  Wrench,
  CalendarBlank,
} from "@phosphor-icons/react/dist/ssr";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { ToolTile } from "@/app/components/v2/Squircle";
import { minutesSavedFor, v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { listRecentRuns, deleteToolRun, type ToolRun } from "@/app/lib/toolRuns";
import { typeLabel, formatDate } from "@/app/lib/toolRunDisplay";
import app from "@/app/components/v2/app.module.css";
import styles from "./analytics.module.css";

function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function AnalyticsPage() {
  useAppShell({ title: "Activity" });

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

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();

    // Ask first: there is no undo, and the delete now also removes the pictures
    // and audio the resource owned. A plain confirm because this page has no
    // modal of its own; the Library has the designed dialog.
    const ok = window.confirm(
      `Delete "${title}"? This cannot be undone, and removes any pictures or audio that belong to it.`,
    );
    if (!ok) return;

    setDeletingId(id);
    try {
      await deleteToolRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // Leave the row in place if the delete fails, rather than removing it
      // optimistically and having it reappear on the next load.
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <p className={styles.crumbs}>
        <Link href="/dashboard" className={styles.crumbLink}>
          <CaretLeft className={styles.crumbIcon} />
          Today
        </Link>
      </p>

      <div className={app.hello}>
        <p className={app.helloWhen}>Your activity</p>
        <h1>Everything you have made</h1>
      </div>

      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statIcon} data-tone="violet">
            <FileText weight="fill" />
          </span>
          <div>
            <b>{loading ? "-" : runs.length}</b>
            <span>Resources made</span>
          </div>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon} data-tone="green">
            <Clock weight="fill" />
          </span>
          <div>
            {/* Never a zero headline, the same rule as Today. */}
            <b>
              {loading
                ? "-"
                : runs.length === 0
                  ? "Let us find out"
                  : formatHours(totalMinutes)}
            </b>
            <span>Time saved</span>
          </div>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon} data-tone="blue">
            <Wrench weight="fill" />
          </span>
          <div>
            <b>{loading ? "-" : toolsUsed}</b>
            <span>Tools used</span>
          </div>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon} data-tone="amber">
            <CalendarBlank weight="fill" />
          </span>
          <div>
            <b>{loading ? "-" : thisWeek}</b>
            <span>This week</span>
          </div>
        </div>
      </div>

      <div className={app.sh}>
        <div className={app.shTitle}>
          <h2>Usage by tool</h2>
        </div>
      </div>
      <section className={app.panel}>
        {loading ? (
          <p className={styles.quiet}>Loading…</p>
        ) : breakdown.length === 0 ? (
          <div className={app.empty}>
            <span className={app.emptyIcon}>
              <Wrench weight="fill" />
            </span>
            <p className={app.emptyTitle}>Nothing to chart yet</p>
            <p className={app.emptyBody}>Make something and it shows up here.</p>
          </div>
        ) : (
          <div className={styles.bars}>
            {/* Below the breakpoint the label takes its own line: 280px of fixed
                columns left the bar itself with no width at all on a phone. */}
            {breakdown.map((b) => (
              <div key={b.slug} className={styles.bar}>
                <span className={styles.barName}>
                  {v2ToolForSlug(b.slug)?.name ?? typeLabel(b.slug)}
                </span>
                <span className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    style={{ width: `${Math.max(6, (b.count / maxCount) * 100)}%` }}
                  />
                </span>
                <span className={styles.barCount}>{b.count}</span>
                <span className={styles.barTime}>{formatHours(b.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={app.sh}>
        <div className={app.shTitle}>
          <h2>All activity</h2>
          {!loading && runs.length > 0 && (
            <span className={app.shSub}>
              {runs.length} {runs.length === 1 ? "resource" : "resources"}
            </span>
          )}
        </div>
      </div>
      <section className={app.panel}>
        {loading ? (
          <p className={styles.quiet}>Loading…</p>
        ) : runs.length === 0 ? (
          <div className={app.empty}>
            <span className={app.emptyIcon}>
              <FileText weight="fill" />
            </span>
            <p className={app.emptyTitle}>Nothing here yet</p>
            <p className={app.emptyBody}>
              Make something with any tool and it appears in this list.
            </p>
          </div>
        ) : (
          <div className={app.rows}>
            {runs.map((run) => {
              const tool = v2ToolForSlug(run.tool_slug);
              const input = run.input as Record<string, unknown>;
              const subject = (input.subject as string) || null;
              const year = (input.yearGroup as string) || null;
              const meta = [tool?.name ?? run.tool_slug, year, subject, formatDate(run.created_at)]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={run.id}
                  className={app.row}
                  role="button"
                  tabIndex={0}
                  onClick={() => tool && router.push(`${tool.href}?run=${run.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (tool) router.push(`${tool.href}?run=${run.id}`);
                    }
                  }}
                >
                  <ToolTile
                    icon={tool?.icon ?? "file-text"}
                    solid={toolSolid(tool)}
                    size="sm"
                  />
                  <span className={app.rowMain}>
                    <span className={app.rowTitle}>{run.title?.trim() || "Untitled"}</span>
                    <span className={app.rowMeta}>{meta}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${run.title?.trim() || "this resource"}`}
                    onClick={(e) => handleDelete(e, run.id, run.title?.trim() || "Untitled")}
                    disabled={deletingId === run.id}
                    className={styles.del}
                  >
                    {deletingId === run.id ? (
                      <CircleNotch className={`${styles.delIcon} ${styles.spin}`} />
                    ) : (
                      <Trash className={styles.delIcon} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
