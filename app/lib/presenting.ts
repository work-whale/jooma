"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * "Slides or a quiz are being shown to a class" (Jooma 4.5 prompt rule 1:
 * nothing at all while presenting, sheets included).
 *
 * The presenters mark it on <body data-presenting>, counted so two at once
 * cannot clear each other, and every prompt reads it through usePresenting().
 */

let count = 0;
const listeners = new Set<() => void>();

function set(next: number) {
  count = Math.max(0, next);
  if (typeof document !== "undefined") {
    if (count > 0) document.body.dataset.presenting = "true";
    else delete document.body.dataset.presenting;
  }
  for (const fn of listeners) fn();
}

/** Mark presenting while `active` is true (Editor present mode, QuizPresenter). */
export function useMarkPresenting(active = true): void {
  useEffect(() => {
    if (!active) return;
    set(count + 1);
    return () => set(count - 1);
  }, [active]);
}

export function isPresenting(): boolean {
  return count > 0;
}

export function usePresenting(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => count > 0,
    () => false,
  );
}
