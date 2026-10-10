"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, Copy, Check, FileText, FileDown, Download, ChevronDown, Printer, Maximize2 } from "lucide-react";
import RichTextEditor from "@/app/components/RichTextEditor";
import MarkdownResult from "@/app/components/MarkdownResult";
import FocusDocumentModal from "@/app/components/FocusDocumentModal";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import { useDocumentActions } from "@/app/lib/useDocumentActions";
import { saveToolRun, updateToolRunOutput } from "@/app/lib/toolRuns";
import { cleanMathText } from "@/app/lib/math-text";
import { isSheetOutput, parseSheet } from "@/app/lib/sheets/normalize";
import SheetWorkspace, { type SaveState } from "@/app/components/sheets/SheetWorkspace";
import ShareToHomePrompt from "@/app/components/guest/ShareToHomePrompt";

/** Tools whose results can be offered for the landing page's showcase row. */
const SHAREABLE: Record<string, "comprehension" | "worksheet"> = {
  "comprehension-generator": "comprehension",
  "worksheet-generator": "worksheet",
};

/**
 * Scroll the window so the result panel sits just below the sticky chrome.
 *
 * window.scrollTo rather than scrollIntoView({ block: "start" }): the panel's
 * own header is `sticky top-0 lg:top-8` and every form renders a matching
 * `h-0 lg:h-8` spacer, so block:"start" aligned the panel top UNDER that bar and
 * hid the first lines. Only scrollTo lets the offset be expressed. Same idiom as
 * OutputOutline's heading links.
 *
 * TopBar is a plain non-sticky header, so it needs no budget here.
 */
function scrollPanelIntoView(el: HTMLElement | null) {
  if (!el) return;
  const offset = window.innerWidth >= 1024 ? 32 : 8;
  window.scrollTo({
    top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset),
    behavior: "smooth",
  });
}

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
  /** The saved run on screen, when the form restored one from history. A
   *  designed sheet autosaves its edits into it. */
  runId?: string | null;
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
  runId = null,
}: ResultPanelProps) {
  /*
   * Copy and export, shared with the focused reading view.
   *
   * Called HERE, above the `result === null` early return below, because hooks
   * cannot be called conditionally. `result ?? ""` covers the render where
   * there is nothing yet; the panel returns null on that pass anyway, so the
   * actions are never reachable with an empty document.
   */
  /*
   * The document as the teacher sees it: LaTeX the model leaked turned into
   * plain maths (see math-text.ts). Everything downstream reads this rather
   * than `result`, so the editor, copy, export, focus view and the saved run
   * all agree. Idempotent, so the editor's own round trip through onChange
   * settles on the same string instead of fighting it.
   *
   * A designed sheet (Worksheet, Comprehension) is JSON, not markdown, and is
   * shown by SheetWorkspace instead. It is never run through cleanMathText as
   * a whole: that would read JSON escapes such as \n as maths. Its strings
   * were already cleaned one by one when it was normalised.
   */
  const sheet = useMemo(() => parseSheet(result), [result]);
  const shown = useMemo(() => (result === null ? null : sheet ? result : cleanMathText(result)), [result, sheet]);

  const { copied, isExporting, exportError, handleCopy, exportItems } = useDocumentActions(
    shown ?? "",
    exportFilename,
    {
      pdf: <FileDown className="w-3.5 h-3.5" />,
      docx: <FileText className="w-3.5 h-3.5" />,
      googleDocs: <Download className="w-3.5 h-3.5" />,
      print: <Printer className="w-3.5 h-3.5" />,
    },
  );

  /** The focused reading view. Unmounting on close is the reset: no stale
   *  scroll position survives, and the outline rebuilds against the current
   *  document rather than the one it was opened with. */
  const [focusOpen, setFocusOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const isGeneratingRef = useRef(isGenerating || isRefining);
  const isBusy = isGenerating || isRefining;

  /*
   * Publish the sticky header's real height as --result-header-h.
   *
   * RichTextEditor's toolbar is sticky too, and it has to come to rest exactly
   * under this header or the two visibly detach mid-scroll. It used to do that
   * with a hardcoded `top-22.25`, which was measured on desktop only: this
   * header is `top-0 lg:top-8` with `py-3 sm:py-4`, so on a phone it is both
   * shorter AND unoffset, and the toolbar parked ~30px below it with a strip of
   * document showing through the gap.
   *
   * Measured rather than recalculated per breakpoint because no constant is
   * right: the header is `flex-wrap`, so on a narrow phone the buttons drop to
   * a second row and it doubles in height. A ResizeObserver tracks that, the
   * breakpoint change and the sm:/lg: padding steps in one.
   */
  useEffect(() => {
    const header = headerRef.current;
    const panel = panelRef.current;
    if (!header || !panel) return;

    const measure = () => {
      // The offset the header itself sticks at: 0 below lg, 32px at and above
      // it, matching `top-0 lg:top-8`. The toolbar has to clear both.
      const offset = window.innerWidth >= 1024 ? 32 : 0;
      panel.style.setProperty(
        "--result-header-h",
        `${header.getBoundingClientRect().height + offset}px`,
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(header);
    // Crossing lg changes the offset without necessarily changing the header's
    // height, which a ResizeObserver alone would not see.
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [result]);

  // Keep ref in sync so the scroll listener always sees the latest value
  useEffect(() => {
    isGeneratingRef.current = isGenerating || isRefining;
    if (isGenerating) {
      userScrolledUp.current = false;
    }
  }, [isGenerating, isRefining]);

  // Scroll the results into view once they settle.
  //
  // Keyed on the result's IDENTITY, not on a hasResult boolean and not on the
  // busy flags. Two separate failures made those wrong:
  //
  //   - Busy flags: opening a saved run from Folders/Dashboard/Analytics never
  //     toggles isGenerating. The run is fetched async and arrives straight into
  //     `result`, so a busy-flag dependency ran once at mount, found
  //     result === null, and never fired again.
  //   - A hasResult boolean: picking a second run from the history panel swaps
  //     one non-empty string for another. hasResult stays true, the dep array
  //     never changes, and only the FIRST pick ever scrolled.
  //
  // The isBusy guard is what keeps a streaming generation from re-scrolling on
  // every chunk: while busy this returns before writing lastScrolledRef, so the
  // busy -> idle edge scrolls exactly once. Pinning to the bottom mid-stream is
  // the scroll listener's job, below.
  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    if (isBusy) return;
    if (result === null || result === "") return;
    if (lastScrolledRef.current === result) return;
    lastScrolledRef.current = result;
    // Let Tiptap finish mounting before measuring.
    const t = setTimeout(() => scrollPanelIntoView(panelRef.current), 100);
    return () => clearTimeout(t);
  }, [result, isBusy]);

  // The teacher's own typing round-trips through Tiptap's onUpdate -> onChange
  // -> `result` (see RichTextEditor), which the identity check above would read
  // as a new result and scroll on every keystroke. Marking the outgoing markdown
  // as already-scrolled is what makes keying on identity safe.
  const handleEditorChange = (md: string) => {
    lastScrolledRef.current = md;
    onChange(md);
  };

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
  const [savedRun, setSavedRun] = useState<{ id: string; slug: string } | null>(null);
  const wasBusyRef = useRef(isBusy);
  const lastSavedRef = useRef<string | null>(null);
  const historyMetaRef = useRef(historyMeta);
  const onSavedRef = useRef(onSaved);
  historyMetaRef.current = historyMeta;
  onSavedRef.current = onSaved;

  /*
   * Autosave, for designed sheets only. The run edits go into is the one this
   * panel just saved, or the one the form restored (`runId`). `persistedRef`
   * is what that row holds now, so an edit that changes nothing writes
   * nothing. Markdown results keep their old behaviour: saved once, when the
   * generation finishes.
   */
  const ownRunIdRef = useRef<string | null>(null);
  const persistedRef = useRef<string | null>(null);
  const latestRef = useRef(result);
  const runIdPropRef = useRef(runId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** The run this panel saved, as state, for the things that render from it
   *  (Jo keeps its conversation against it). ownRunIdRef stays the source of
   *  truth for the saves themselves. */
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  useEffect(() => {
    latestRef.current = result;
  }, [result]);

  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = isBusy;
    // A new generation is a new run; edits must never land on the last one.
    if (!wasBusy && isBusy) {
      ownRunIdRef.current = null;
      setSavedRunId(null);
    }
    if (!wasBusy || isBusy) return; // only on the busy -> idle edge
    const meta = historyMetaRef.current;
    if (!meta || !result || result.trim() === "") return;
    if (lastSavedRef.current === result) return;
    lastSavedRef.current = result;
    const output = isSheetOutput(result) ? result : cleanMathText(result);
    saveToolRun({ toolSlug: meta.toolSlug, title: meta.title, input: meta.input, output })
      .then((run) => {
        ownRunIdRef.current = run.id;
        setSavedRunId(run.id);
        persistedRef.current = output;
        // Edited while the save was in flight: those edits go in now.
        const latest = latestRef.current;
        if (isSheetOutput(latest) && latest !== output) {
          updateToolRunOutput(run.id, latest as string).then(() => { persistedRef.current = latest; }).catch(() => {});
        }
        if (SHAREABLE[meta.toolSlug]) setSavedRun({ id: run.id, slug: meta.toolSlug });
        onSavedRef.current?.();
      })
      .catch(() => { lastSavedRef.current = null; });
  }, [isBusy, result]);

  useEffect(() => {
    if (runId !== runIdPropRef.current) {
      // A run restored from history: what is on screen is what is stored.
      runIdPropRef.current = runId;
      ownRunIdRef.current = null;
      setSavedRunId(null);
      persistedRef.current = result;
      return;
    }
    if (!sheet || isBusy || result === null) return;
    const id = ownRunIdRef.current ?? runId;
    if (!id || result === persistedRef.current) return;
    const output = result;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      updateToolRunOutput(id, output)
        .then(() => {
          persistedRef.current = output;
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [result, runId, isBusy, sheet]);

  // An edit to the sheet, from the page or from undo. Marked as already
  // scrolled for the same reason as handleEditorChange above.
  const handleSheetChange = (next: string) => {
    lastScrolledRef.current = next;
    onChange(next);
  };

  const joRunId = isBusy ? null : (savedRunId ?? runId);
  const joDocRef = useMemo(() => (joRunId ? { kind: "tool_run" as const, id: joRunId } : null), [joRunId]);

  if (result === null || shown === null) return null;

  if (sheet) {
    return (
      <>
        <SheetWorkspace
          panelRef={panelRef}
          value={result}
          doc={sheet}
          onChange={handleSheetChange}
          isGenerating={isGenerating}
          isRefining={isRefining}
          filename={exportFilename}
          saveState={saveState}
          maxWidth={maxWidth}
          joDocRef={joDocRef}
        />
        {savedRun && SHAREABLE[savedRun.slug] && (
          <ShareToHomePrompt key={savedRun.id} kind={SHAREABLE[savedRun.slug]} resourceId={savedRun.id} />
        )}
      </>
    );
  }

  return (
    <>
      <div ref={panelRef} className={`bg-white border border-gray-200 rounded-3xl shadow-sm${maxWidth ? " max-w-7xl mx-auto" : ""}`} style={{ overflow: "clip" }}>
        {/* z-30, not z-10: sticky + z-index creates a stacking context, so the
            export menu's z-20 cannot escape this header. RichTextEditor's
            toolbar below is also sticky z-10 and comes later in the DOM, so at
            equal z-index it painted over the open menu — hiding "Download PDF"
            and making it look as though the tool had no PDF export at all.
            This must stay above that toolbar's z-10. */}
        <div ref={headerRef} className="sticky top-0 lg:top-8 z-30 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white rounded-t-3xl">
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

            {/* Reading first, then the two output actions. Disabled while busy
                for the same reason Copy is: a half streamed document is not
                worth opening in a reading view, and it sidesteps the question
                of whether the modal should follow a stream. */}
            <button
              type="button"
              onClick={() => setFocusOpen(true)}
              disabled={isBusy}
              data-then="focus"
              aria-label="Open in focused view"
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Focus</span>
            </button>

            {!isBusy && (
              // data-then: see ThenAction. A guest who pressed Export on
              // /create is brought back here with this menu open.
              <span data-then="export" className="contents">
              <DropdownMenu
                ariaLabel="Export options"
                disabled={isExporting !== null}
                triggerClassName="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
                menuClassName="w-[min(15rem,calc(100vw-2rem))]"
                trigger={
                  <>
                    {isExporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {/* The label is the first thing to go when the toolbar is
                        tight; the icon still says "export". aria-label on the
                        trigger keeps this readable to a screen reader. */}
                    <span className="hidden sm:inline">
                      {isExporting === "pdf" ? "Building PDF…" : isExporting === "docx" ? "Building…" : "Export"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                }
                items={exportItems}
              />
              </span>
            )}
            <button
              type="button"
              onClick={handleCopy}
              disabled={isBusy}
              data-then="copy"
              aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied!" : "Copy to clipboard"}</span>
            </button>
          </div>
        </div>

        {exportError && (
          <p className="px-6 py-2 text-sm text-red-600 border-b border-gray-200">{exportError}</p>
        )}

        {isBusy ? (
          <div className="py-8 px-4 sm:py-12 sm:px-8 lg:py-20 lg:px-24 min-h-48">
            <MarkdownResult text={shown} />
            <span className="inline-block w-px h-[1em] bg-gray-500 animate-pulse ml-px align-text-bottom" />
            <div ref={bottomRef} />
          </div>
        ) : (
          <RichTextEditor value={shown} onChange={handleEditorChange} />
        )}
      </div>

      {/* Mounted only while open, so `result` is read at open time and the
          teacher's edits are already in it (Tiptap round-trips through
          onChange on every keystroke). */}
      {focusOpen && (
        <FocusDocumentModal
          markdown={shown}
          filename={exportFilename}
          title={historyMeta?.title?.trim() || "Your document"}
          onClose={() => setFocusOpen(false)}
        />
      )}

      {/* Offered once per saved resource, for the tools the landing page's
          "Made with Jooma" row shows. Keyed so a second generation asks again. */}
      {savedRun && SHAREABLE[savedRun.slug] && (
        <ShareToHomePrompt key={savedRun.id} kind={SHAREABLE[savedRun.slug]} resourceId={savedRun.id} />
      )}
    </>
  );
}
