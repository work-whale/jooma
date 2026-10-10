"use client";

import { useMemo, useState } from "react";
import StickyMask from "@/app/components/ui/StickyMask";
import { OutlineHover } from "@/app/components/OutputOutline";
import ResultPanel from "@/app/components/ResultPanel";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { sheetOutline } from "@/app/lib/sheets/markdown";
import { bandOutput } from "@/app/lib/bands";
import type { DifferentiationBand } from "@/app/lib/differentiation";

/*
 * The results half of a tool page: the sticky mask, the outline column and the
 * result panel, in the one arrangement all 32 markdown tools share.
 *
 * This block was copy-pasted into every one of those forms, which is the same
 * "duplicate rules drift" trap StickyMask itself was extracted to close: one of
 * the 32 was always going to be missed on the next edit. There are two such
 * edits queued behind this one (a focused reading view and an outline that
 * collapses to a hover tab), so without this component each of them would be a
 * 32 file change of its own.
 *
 * The structured tools are deliberately NOT consumers. cpd-slideshow and
 * quiz-generator put JSON in their output rather than markdown, which is why
 * they are also the exact forms that never had this block. See
 * isStructuredOutput in app/lib/toolRunDisplay.ts.
 */

interface ToolResultsProps {
  /** The generated markdown. Null before the first generation, which is what
   *  keeps the whole results area out of the document until there is one. */
  result: string | null;
  isGenerating: boolean;
  /** Omitted by the 7 forms with no refine step, so optional rather than
   *  required: making it mandatory would break them for no gain. */
  isRefining?: boolean;
  onChange: (md: string) => void;
  exportFilename: string;
  historyMeta: {
    toolSlug: string;
    title?: string | null;
    input: Record<string, unknown>;
  };
  onSaved: () => void;
  /** The run restored from history, if any. Worksheet and Comprehension
   *  autosave edits to their designed sheets into it. */
  runId?: string | null;
  /** The differentiated version on screen, for a form that needs to know it
   *  (Refine works on that version only). Kept here when omitted. */
  activeBand?: string | null;
  onActiveBandChange?: (band: DifferentiationBand) => void;
}

export default function ToolResults({
  result,
  isGenerating,
  isRefining,
  onChange,
  exportFilename,
  historyMeta,
  onSaved,
  runId,
  activeBand,
  onActiveBandChange,
}: ToolResultsProps) {
  // Here rather than in ResultPanel, so the outline follows the tab too.
  const [ownBand, setOwnBand] = useState<string | null>(null);
  const band = activeBand !== undefined ? activeBand : ownBand;

  // A designed sheet is JSON; its outline is its section headings. With
  // differentiated versions, the outline is the version on screen.
  const outline = useMemo(() => {
    const view = result === null ? null : bandOutput(result, band);
    const sheet = parseSheet(view);
    return sheet ? sheetOutline(sheet) : view;
  }, [result, band]);

  return (
    <>
      {result !== null && <StickyMask />}

      <div className={result !== null ? "flex flex-col lg:flex-row gap-4 lg:gap-8" : ""}>
        {result !== null && (
          /*
           * The outline column: 44px now, where the sidebar card was 448px.
           *
           * The expanded panel is absolutely positioned INSIDE this wrapper and
           * overlays the document rather than widening the column, which is
           * where the document's extra width comes from.
           *
           * THREE LOAD-BEARING CLASSES, each one word from being broken:
           *
           *   relative  the absolute panel anchors here; without it the panel
           *             escapes to some other positioned ancestor.
           *   z-40      the results panel is a LATER SIBLING in this flex row,
           *             and its header is `sticky z-30` over a `sticky z-10`
           *             editor toolbar. At equal rank the later sibling paints
           *             on top, which is what put the panel behind the document
           *             and its toolbar. Raising only the shell inside could not
           *             fix it, because this column was still competing at auto.
           *   no overflow  any overflow here clips the panel, exactly as the old
           *             card's own overflow-y did. The scrolling belongs inside
           *             the panel, which is why it is not on this element.
           */
          <div className="hidden lg:block shrink-0 relative w-11 z-40">
            <div className="lg:sticky lg:top-8">
              {/* Optional sections need no declaring here: the outline is
                  derived from the output, so a section appears in it exactly
                  when it appears in the document. (Carried over from
                  EYFSPlannerForm, where it was recorded against that tool's
                  three include* toggles but is true of every tool.) */}
              <OutlineHover markdown={outline} />
            </div>
          </div>
        )}

        {/* min-w-0 is load-bearing. A flex child's default minimum is its
            content width, so without it a wide generated table stops shrinking
            and pushes the whole page sideways instead of scrolling in its own
            box. Same reasoning as the note on <main> in AppShellV2. */}
        <div className="flex-1 min-w-0">
          <ResultPanel
            result={result}
            isGenerating={isGenerating}
            isRefining={isRefining}
            onChange={onChange}
            exportFilename={exportFilename}
            // Every consumer passed false: the panel is already inside a
            // width-constrained column, so its own max-width would only fight
            // the layout. Fixed here rather than threaded as a prop nobody varies.
            maxWidth={false}
            historyMeta={historyMeta}
            onSaved={onSaved}
            runId={runId}
            activeBand={band}
            onActiveBandChange={onActiveBandChange ?? setOwnBand}
          />
        </div>
      </div>
    </>
  );
}
