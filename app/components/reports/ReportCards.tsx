"use client";

import { useState } from "react";
import { Check, Copy, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { reportsCsv, reportsMarkdown, type PupilRow, type ReportsDoc } from "@/app/lib/reports/reports";
import { scrubText, swapIn } from "@/app/lib/reports/privacy";

/*
 * The written reports, one card per pupil: the report and the next step,
 * editable, each with a copy button, because they are pasted one by one into
 * the school's reporting system. Names are put back in only here: what is
 * stored keeps "[PUPIL]".
 */

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      disabled={!text}
      data-testid={testId}
      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

function Card({ pupil, nextSteps, busy, onEdit, onRewrite }: { pupil: PupilRow; nextSteps: boolean; busy: boolean; onEdit: (patch: Partial<PupilRow>) => void; onRewrite: () => void }) {
  const comment = swapIn(pupil.comment, pupil.name);
  const target = swapIn(pupil.target, pupil.name);
  // An edit is stored with the name back out, so it reads the same way as
  // what was written.
  const store = (text: string) => scrubText(text, pupil.name, []);
  return (
    <article className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-testid="report-card" data-status={pupil.status}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-gray-900 mr-auto">{pupil.name}</h3>
        {pupil.status === "writing" && <span className="flex items-center gap-1 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing</span>}
        {pupil.status === "error" && <span className="text-xs font-semibold text-red-600">Not written</span>}
        <span className="text-xs text-gray-400">{words(comment)} words · {comment.length} characters</span>
      </header>
      <textarea
        value={comment}
        onChange={(e) => onEdit({ comment: store(e.target.value) })}
        // Grows with its text (field-sizing), with a row estimate for browsers
        // without it.
        rows={Math.max(3, Math.ceil(comment.length / 60))}
        aria-label={`Report for ${pupil.name}`}
        placeholder={pupil.status === "error" ? "This one did not come back. Rewrite it." : "Writing..."}
        className="w-full field-sizing-content resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
      />
      {nextSteps && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Next step</label>
          <textarea
            value={target}
            onChange={(e) => onEdit({ target: store(e.target.value) })}
            rows={Math.max(2, Math.ceil(target.length / 60))}
            aria-label={`Next step for ${pupil.name}`}
            className="w-full field-sizing-content resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
      )}
      <footer className="flex flex-wrap gap-2">
        <CopyButton text={comment} label="Copy report" testId="copy-report" />
        {nextSteps && <CopyButton text={target} label="Copy next step" />}
        <button type="button" onClick={onRewrite} disabled={busy} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Rewrite this one
        </button>
      </footer>
    </article>
  );
}

export default function ReportCards({
  doc,
  busy,
  saveState,
  onEdit,
  onRewrite,
}: {
  doc: ReportsDoc;
  busy: boolean;
  saveState: string | null;
  onEdit: (id: string, patch: Partial<PupilRow>) => void;
  onRewrite: (id: string) => void;
}) {
  const written = doc.pupils.filter((p) => p.comment || p.status !== "pending");
  const base = `reports-${(doc.settings.yearGroup || "class").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="bg-stone-50 border border-gray-200 rounded-3xl p-4 sm:p-6 space-y-4" data-testid="report-cards">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-gray-900 mr-auto">
          Reports <span className="text-sm font-normal text-gray-500">{doc.pupils.filter((p) => p.comment).length} of {doc.pupils.length} written</span>
          {saveState && <span className="ml-2 text-sm font-normal text-gray-500" data-testid="report-save-state">· {saveState}</span>}
        </h2>
        <CopyButton text={reportsMarkdown(doc, swapIn)} label="Copy all" />
        <button
          type="button"
          onClick={() => triggerDownload(new Blob(["﻿" + reportsCsv(doc, swapIn)], { type: "text/csv;charset=utf-8;" }), `${base}.csv`)}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button
          type="button"
          onClick={async () => {
            const { exportToDocx } = await import("@/app/lib/exportUtils");
            await exportToDocx(reportsMarkdown(doc, swapIn), base);
          }}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" /> Word
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {written.map((p) => (
          <Card key={p.id} pupil={p} nextSteps={doc.settings.nextSteps} busy={busy} onEdit={(patch) => onEdit(p.id, patch)} onRewrite={() => onRewrite(p.id)} />
        ))}
      </div>
    </section>
  );
}
