/*
 * The "Made with Jooma" mark on exports (Jooma 4.5, owner's red note: Free
 * and the Pro trial are marked; Standard, Pro and Max are clean).
 *
 * Decided at EXPORT time from the plan in force then, so a deck made in the
 * trial and re-exported on Free carries the mark. useAccountAccess sets it
 * when the account loads (setExportMark), and the exporters in exportUtils.ts
 * append it with withExportMark. Before the plans engine migration nothing
 * sets it, so nothing changes.
 *
 * Client-safe and pure apart from the one module-level value.
 */

let current: string | null = null;

export function setExportMark(mark: string | null): void {
  current = mark;
}

export function currentExportMark(): string | null {
  return current;
}

/** Markdown with the mark as its last, small line. Idempotent. */
export function withExportMark(markdown: string, mark: string | null): string {
  if (!mark) return markdown;
  const line = `*${mark}*`;
  const body = markdown.replace(/\s+$/, "");
  if (body.endsWith(line)) return markdown;
  return `${body}\n\n${line}\n`;
}
