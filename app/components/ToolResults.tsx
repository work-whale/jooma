"use client";

import StickyMask from "@/app/components/ui/StickyMask";
import OutputOutline from "@/app/components/OutputOutline";
import ResultPanel from "@/app/components/ResultPanel";

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
 * The three structured tools are deliberately NOT consumers. lesson-slideshow,
 * cpd-slideshow and quiz-generator put JSON in their output rather than
 * markdown, which is why they are also the exact three forms that never had
 * this block. See isStructuredOutput in app/lib/toolRunDisplay.ts.
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
}

export default function ToolResults({
  result,
  isGenerating,
  isRefining,
  onChange,
  exportFilename,
  historyMeta,
  onSaved,
}: ToolResultsProps) {
  return (
    <>
      {result !== null && <StickyMask />}

      <div className={result !== null ? "flex flex-col lg:flex-row gap-4 lg:gap-8" : ""}>
        {result !== null && (
          <div className="hidden lg:block lg:w-md shrink-0">
            <div className="lg:sticky lg:top-8">
              {/* Optional sections need no declaring here: the outline is
                  derived from the output, so a section appears in it exactly
                  when it appears in the document. (Carried over from
                  EYFSPlannerForm, where it was recorded against that tool's
                  three include* toggles but is true of every tool.) */}
              <OutputOutline markdown={result} />
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
          />
        </div>
      </div>
    </>
  );
}
