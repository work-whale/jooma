/**
 * The height of the app shell's sticky top bar, in pixels, or 0 outside the
 * shell (a guest page, a modal, a test harness).
 *
 * CSS reads the same thing as `var(--topbar-h, 0px)` (AppShellV2.module.css).
 * Script that scrolls the window or measures a sticky offset needs a number,
 * and the variable is a calc() with a safe-area inset in it, so it is measured
 * from the bar itself rather than parsed.
 */
export function topBarHeight(): number {
  if (typeof document === "undefined") return 0;
  const bar = document.querySelector<HTMLElement>("[data-topbar]");
  return bar ? bar.getBoundingClientRect().height : 0;
}

/**
 * Where a tool's "My results" header sticks: directly under the top bar on a
 * phone, and 2rem below it from lg up, where StickyMask fills that gap.
 *
 * One string for ResultPanel and SheetWorkspace, which must agree, and a full
 * literal so Tailwind's scanner sees the classes.
 */
export const HEADER_STICKY =
  "sticky top-[var(--topbar-h,0px)] lg:top-[calc(var(--topbar-h,0px)+2rem)]";
