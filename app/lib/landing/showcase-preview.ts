// What a "Made with Jooma" card draws for a Worksheet or Comprehension: the
// top of its first page, from the saved output.
//
// The card shows only what fits in a short crop of page one, so the sheet is
// cut down to its opening section before it is cached and sent to the page.
// The landing page is the busiest page there is; a whole comprehension, with
// its answers page and teacher notes, is a lot of markup for a thumbnail.
import { primaryOutput } from "@/app/lib/bands";
import { parseSheet } from "@/app/lib/sheets/normalize";
import type { SheetDoc } from "@/app/lib/sheets/types";

export type ShowcasePreview = { sheet: SheetDoc } | { markdown: string };

/** Blocks kept from the first section: more than a card's crop can show. */
export const PREVIEW_BLOCKS = 4;
/** Paragraphs kept of a passage: the first few fill the crop already. */
export const PREVIEW_PARAGRAPHS = 3;
/** Characters kept of an older, markdown output. */
export const PREVIEW_CHARS = 1200;

function trimSheet(doc: SheetDoc): SheetDoc {
  const first = doc.sections[0];
  return {
    ...doc,
    teacherNotes: [],
    // Never in the crop, and a whole extra page of markup.
    design: { ...doc.design, answers: false },
    sections: first
      ? [
          {
            ...first,
            blocks: first.blocks.slice(0, PREVIEW_BLOCKS).map((b) =>
              b.type === "passage" ? { ...b, paragraphs: b.paragraphs.slice(0, PREVIEW_PARAGRAPHS) } : b,
            ),
          },
        ]
      : [],
  };
}

function trimMarkdown(text: string): string {
  if (text.length <= PREVIEW_CHARS) return text;
  const cut = text.slice(0, PREVIEW_CHARS);
  const line = cut.lastIndexOf("\n");
  return line > 0 ? cut.slice(0, line) : cut;
}

/**
 * The preview for a saved output, or null when there is nothing to draw. Of a
 * set of differentiated versions, the first, as on the resource's own page.
 */
export function showcasePreview(output: string | null | undefined): ShowcasePreview | null {
  const text = primaryOutput(output);
  if (!text || !text.trim()) return null;
  const sheet = parseSheet(text);
  if (sheet) return { sheet: trimSheet(sheet) };
  // A sheet that will not parse is not markdown either: show the placeholder.
  if (text.trimStart().startsWith("{")) return null;
  return { markdown: trimMarkdown(text) };
}
