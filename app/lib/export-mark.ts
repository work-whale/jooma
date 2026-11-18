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
let loader: (() => Promise<unknown>) | null = null;

export function setExportMark(mark: string | null): void {
  current = mark;
}

export function currentExportMark(): string | null {
  return current;
}

/** useAccountAccess registers its (cached) account read here. */
export function registerExportMarkLoader(load: () => Promise<unknown>): void {
  loader = load;
}

/**
 * The mark for an export made NOW, waiting for the account read the page has
 * already started. Without the wait, an export pressed before the account had
 * loaded came out clean on Free (found by Ash's Step 10 test 3). Fails open,
 * like the read itself: no account, no mark.
 */
export async function exportMarkNow(): Promise<string | null> {
  if (loader) await loader().catch(() => null);
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
