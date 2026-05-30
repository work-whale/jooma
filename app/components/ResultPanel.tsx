"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Copy, Check, FileText, FileDown } from "lucide-react";
import RichTextEditor from "@/app/components/RichTextEditor";
import MarkdownResult from "@/app/components/MarkdownResult";
import { exportToDocx, buildPdfHtml } from "@/app/lib/exportUtils";
import { saveToolRun } from "@/app/lib/toolRuns";

interface ResultPanelProps {
  result: string | null;
  isGenerating: boolean;
  isRefining?: boolean;
  onChange: (md: string) => void;
  exportFilename?: string;
  maxWidth?: boolean;
  /** When set, each completed generation/refine is saved to tool history. */
  historyMeta?: { toolSlug: string; title?: string | null; input: Record<string, unknown> };
  /** Called after a run is successfully saved (to refresh the history list). */
  onSaved?: () => void;
}

export default function ResultPanel({
  result,
  isGenerating,
  isRefining = false,
  onChange,
  exportFilename = "export",
  maxWidth = true,
  historyMeta,
  onSaved,
}: ResultPanelProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState<"docx" | "pdf" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const isGeneratingRef = useRef(isGenerating || isRefining);
  const isBusy = isGenerating || isRefining;

  // Keep ref in sync so the scroll listener always sees the latest value
  useEffect(() => {
    isGeneratingRef.current = isGenerating || isRefining;
    if (isGenerating) {
      userScrolledUp.current = false;
    } else if (result !== null && !isRefining) {
      // Smooth scroll to top of result panel once Tiptap has initialised
      setTimeout(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isGenerating, isRefining]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for scroll — disable auto-scroll if user scrolls up, re-enable if they reach the bottom
  useEffect(() => {
    const onScroll = () => {
      if (!isGeneratingRef.current) return;
      const distFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pin to bottom on every new chunk — instant (no smooth) to avoid jitter from growing table cells
  useEffect(() => {
    if (isBusy && !userScrolledUp.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [result, isBusy]);

  // Save to tool history once a generation/refine completes (busy -> idle with a
  // non-empty result). Refs keep the latest meta without re-firing the effect,
  // and lastSavedRef dedupes against re-renders. A restore sets `result`
  // without toggling busy, so it never triggers a save.
  const wasBusyRef = useRef(isBusy);
  const lastSavedRef = useRef<string | null>(null);
  const historyMetaRef = useRef(historyMeta);
  const onSavedRef = useRef(onSaved);
  historyMetaRef.current = historyMeta;
  onSavedRef.current = onSaved;
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = isBusy;
    if (!wasBusy || isBusy) return; // only on the busy -> idle edge
    const meta = historyMetaRef.current;
    if (!meta || !result || result.trim() === "") return;
    if (lastSavedRef.current === result) return;
    lastSavedRef.current = result;
    saveToolRun({ toolSlug: meta.toolSlug, title: meta.title, input: meta.input, output: result })
      .then(() => onSavedRef.current?.())
      .catch(() => { lastSavedRef.current = null; });
  }, [isBusy, result]);

  if (result === null) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    setIsExporting("docx");
    try {
      await exportToDocx(result, exportFilename);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = () => {
    const html = buildPdfHtml(result ?? "", exportFilename);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;visibility:hidden;top:0;left:0;width:0;height:0;border:none;";
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  };

  return (
    <>
      <div ref={panelRef} className={`bg-white border border-gray-200 rounded-3xl shadow-sm${maxWidth ? " max-w-7xl mx-auto" : ""}`} style={{ overflow: "clip" }}>
        <div className="sticky top-8 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900 text-sm">My results</h2>
            {isGenerating && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating…
              </div>
            )}
            {isRefining && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Refining…
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">

            {!isBusy && (
              <>
                <button
                  type="button"
                  onClick={handleExportDocx}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isExporting === "docx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  DOCX
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={isExporting !== null}
                  className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Print
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleCopy}
              disabled={isBusy}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
          </div>
        </div>

        {isBusy ? (
          <div className="py-20 px-24 min-h-48">
            <MarkdownResult text={result} />
            <span className="inline-block w-px h-[1em] bg-gray-500 animate-pulse ml-px align-text-bottom" />
            <div ref={bottomRef} />
          </div>
        ) : (
          <RichTextEditor value={result} onChange={onChange} />
        )}
      </div>

    </>
  );
}
