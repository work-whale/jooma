export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Escapes HTML special chars so a string can be safely interpolated into
 *  innerHTML. Mirrors the equivalent helper in editor/TextElement.tsx — kept
 *  here so MiniSlide can reuse it without depending on the editor module. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface InlineBoldRun {
  text: string;
  bold: boolean;
}

/** Parses a string for paired `**bold**` markdown markers and returns a list
 *  of runs. Unmatched `**` stays literal in the output. Used by the slide
 *  renderers so the AI can emit body text like
 *  `Imagine the Earth as a ball on a string... **gravity** is that invisible string.`
 *  and the renderer breaks it into <strong>gravity</strong> + plain runs.
 *
 *  Rules:
 *  - `**word**` becomes a single bold run with text "word".
 *  - `**` inside the text stays literal unless paired (e.g. `a ** b` → "a ** b").
 *  - Empty `****` collapses to nothing.
 *  - Nested `**` aren't supported — first match wins, rest is plain.
 */
export function parseInlineBold(s: string): InlineBoldRun[] {
  if (!s) return [{ text: "", bold: false }];
  const runs: InlineBoldRun[] = [];
  // Greedy non-nested match — `**` ... `**` where the closing `**` is the next
  // occurrence. Anything between is the bold run; anything outside is plain.
  const re = /\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIndex) {
      runs.push({ text: s.slice(lastIndex, m.index), bold: false });
    }
    runs.push({ text: m[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < s.length) {
    runs.push({ text: s.slice(lastIndex), bold: false });
  }
  // Empty string → return a single empty plain run so callers can map without
  // special-casing.
  return runs.length > 0 ? runs : [{ text: s, bold: false }];
}

/** Renders the runs from `parseInlineBold` to an HTML string with <strong>
 *  tags wrapping the bold runs. Each run's text is escaped first. */
export function inlineBoldToHtml(s: string): string {
  return parseInlineBold(s)
    .map((r) => (r.bold ? `<strong>${escapeHtml(r.text)}</strong>` : escapeHtml(r.text)))
    .join("");
}

/** Like `inlineBoldToHtml` but keeps the surrounding `**` markers in the
 *  output so they remain visible inside contentEditable. Used by edit-mode
 *  text rendering: the user sees `**Sun**` with "Sun" rendered bold AND the
 *  asterisks still there so they can keep typing around them. */
export function inlineBoldToHtmlKeepMarkers(s: string): string {
  return parseInlineBold(s)
    .map((r) =>
      r.bold
        ? `**<strong>${escapeHtml(r.text)}</strong>**`
        : escapeHtml(r.text),
    )
    .join("");
}
