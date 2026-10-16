"use client";

// Keeps Tab and Shift+Tab inside a container while it is open: the nav drawer,
// the account menu, the modals. Moving focus in on open and back to the
// trigger on close stay with each component, which already know where those
// are; this only stops focus wandering out behind an overlay.
//
// A hook rather than native <dialog>: the overlays it serves render dropdowns
// through portals outside themselves, and showModal() would make those inert.

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/**
 * Where Tab should land next, given the index of the focused element among
 * `count` focusables (-1 when focus is outside them all). Wraps at both ends.
 */
export function nextFocusIndex(current: number, count: number, back: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return back ? count - 1 : 0;
  if (back) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // Skips anything not rendered: a display:none branch, a closed <details>.
    (el) => el.getClientRects().length > 0,
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = ref.current;
      if (!container) return;
      const items = focusables(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      // Only step in at the edges, or when focus has escaped. In between the
      // browser's own order is already right.
      const atEdge = e.shiftKey ? current <= 0 : current === items.length - 1;
      if (current >= 0 && !atEdge) return;
      e.preventDefault();
      items[nextFocusIndex(current, items.length, e.shiftKey)]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}
