"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  Loader2,
  Palette,
  Pencil,
  Printer,
  Redo2,
  Undo2,
} from "lucide-react";
import DropdownMenu, { type DropdownItem } from "@/app/components/ui/DropdownMenu";
import { serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";
import type { SheetDesign, SheetDoc } from "@/app/lib/sheets/types";
import SheetDocument from "./SheetDocument";
import SheetDesignPanel from "./SheetDesignPanel";
import { exportSheetDocx, exportSheetPdf, printSheet } from "./sheetExport";

/*
 * A generated Worksheet or Comprehension, as the teacher works on it: the
 * designed pages, editable in place, with undo, the Design panel, export and
 * copy. ResultPanel shows this instead of the markdown editor whenever the
 * output is a sheet.
 *
 * The sheet itself lives with the form, as the serialised string the form
 * already keeps as its result; every edit here goes back through onChange,
 * which is also what the panel autosaves.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

const btn =
  "flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer";

export default function SheetWorkspace({
  value,
  doc,
  onChange,
  isGenerating,
  isRefining = false,
  filename,
  saveState = "idle",
  maxWidth = true,
  panelRef,
}: {
  value: string;
  doc: SheetDoc;
  onChange: (serialized: string) => void;
  isGenerating: boolean;
  isRefining?: boolean;
  filename: string;
  saveState?: SaveState;
  maxWidth?: boolean;
  panelRef?: Ref<HTMLDivElement>;
}) {
  const busy = isGenerating || isRefining;

  // ── Undo ────────────────────────────────────────────────────────────────
  // Whole serialised sheets: small, and a design change undoes as cleanly as
  // a text edit. A value that did not come from here (a new generation, a run
  // picked from history) starts a fresh history.
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [emitted, setEmitted] = useState<string | null>(null);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== emitted) {
      setPast([]);
      setFuture([]);
    }
  }

  const emit = (next: string) => {
    setEmitted(next);
    onChange(next);
  };
  const commit = (next: SheetDoc) => {
    const s = serializeSheet(next);
    if (s === value) return;
    setPast((p) => [...p.slice(-49), value]);
    setFuture([]);
    emit(s);
  };
  const undo = () => {
    if (!past.length || busy) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [value, ...f]);
    emit(prev);
  };
  const redo = () => {
    if (!future.length || busy) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, value]);
    emit(next);
  };

  // Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), except while typing in a field,
  // where the browser's own undo is the one that is wanted.
  const keys = useRef({ undo, redo });
  useEffect(() => {
    keys.current = { undo, redo };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keys.current.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); keys.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────
  const [preview, setPreview] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | "print" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (kind: "pdf" | "docx" | "print", fn: () => Promise<void>, failure: string) => {
    setExporting(kind);
    setExportError(null);
    try {
      await fn();
    } catch {
      setExportError(failure);
    } finally {
      setExporting(null);
    }
  };

  const exportItems: DropdownItem[] = [
    { label: "Download PDF", icon: <FileDown className="w-3.5 h-3.5" />, onSelect: () => run("pdf", () => exportSheetPdf(doc, filename), "Couldn't build that PDF. Try Print instead, and save as PDF.") },
    { label: "Download Word (DOCX)", icon: <FileText className="w-3.5 h-3.5" />, onSelect: () => run("docx", () => exportSheetDocx(doc, filename), "Couldn't build that Word document. Please try again.") },
    { label: "Print", icon: <Printer className="w-3.5 h-3.5" />, onSelect: () => run("print", () => printSheet(doc, doc.title || filename), "Couldn't open the print view. Please try again."), separated: true },
  ];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sheetToMarkdown(doc));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onDesign = (patch: Partial<SheetDesign>) => commit({ ...doc, design: { ...doc.design, ...patch } });

  const status = isGenerating
    ? "Generating…"
    : isRefining
      ? "Refining…"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "saved"
          ? "Saved"
          : saveState === "error"
            ? "Not saved"
            : null;

  return (
    <div ref={panelRef} className={`bg-white border border-gray-200 rounded-3xl shadow-sm${maxWidth ? " max-w-7xl mx-auto" : ""}`} style={{ overflow: "clip" }} data-testid="sheet-workspace">
      <div className="sticky top-0 lg:top-8 z-30 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white rounded-t-3xl">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900 text-sm">My results</h2>
          {status && (
            <span className={`flex items-center gap-1.5 text-xs ${saveState === "error" && !busy ? "text-red-600" : "text-gray-500"}`} role="status" data-testid="sheet-save-state">
              {(busy || saveState === "saving") && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {!busy && saveState === "saved" && <Check className="w-3.5 h-3.5 text-green-600" />}
              {status}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={undo} disabled={busy || past.length === 0} aria-label="Undo" title="Undo" className={btn}>
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={redo} disabled={busy || future.length === 0} aria-label="Redo" title="Redo" className={btn}>
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setPreview((p) => !p)} disabled={busy} aria-pressed={preview} className={btn}>
            {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{preview ? "Edit" : "Preview"}</span>
          </button>
          <button type="button" onClick={() => setDesignOpen((o) => !o)} disabled={busy} aria-expanded={designOpen} className={btn}>
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Design</span>
          </button>
          {!busy && (
            <span data-then="export" className="contents">
              <DropdownMenu
                ariaLabel="Export options"
                disabled={exporting !== null}
                triggerClassName={btn}
                menuClassName="w-[min(15rem,calc(100vw-2rem))]"
                trigger={
                  <>
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{exporting === "pdf" ? "Building PDF…" : exporting ? "Building…" : "Export"}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                }
                items={exportItems}
              />
            </span>
          )}
          <button type="button" onClick={handleCopy} disabled={busy} data-then="copy" aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"} className={btn}>
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Copy to clipboard"}</span>
          </button>
        </div>
      </div>

      {exportError && <p className="px-6 py-2 text-sm text-red-600 border-b border-gray-200">{exportError}</p>}

      <div className="flex flex-col-reverse xl:flex-row gap-4 bg-stone-100 px-3 py-6 sm:px-6 sm:py-8">
        <div className="flex-1 min-w-0">
          <SheetDocument doc={doc} edit={!preview} onChange={commit} streaming={busy} />
        </div>
        {designOpen && !busy && (
          <div className="xl:w-80 shrink-0 xl:sticky xl:top-32 xl:self-start">
            <SheetDesignPanel doc={doc} onDesign={onDesign} onClose={() => setDesignOpen(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
