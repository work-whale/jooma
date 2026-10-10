"use client";

// Jo's hands on a worksheet or comprehension.
//
// While a turn plays, the page shows a working copy (`shown`) that the
// committed sheet does not see: each op is revealed, ringed and, for a change
// of words, typed in a few letters at a time. Only when the turn ends is the
// working copy committed, once, so the whole turn is one undo step and one
// autosave rather than one per letter.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { applySheetOp, isSheetOp, setSheetText, sheetOpFocus, sheetSnapshot, sheetTextAt } from "@/app/lib/jo/sheet-ops";
import type { JoOp } from "@/app/lib/jo/types";
import type { SheetDoc } from "@/app/lib/sheets/types";
import type { JoAdapter } from "./useJoSession";

/** Resolves after `ms`, or at once when the turn is stopped. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const t = window.setTimeout(done, ms);
    function done() {
      window.clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** How long to dwell on each beat of an op, in ms. */
const POINT_MS = 380;
const SETTLE_MS = 420;

export function useSheetJo({
  doc,
  commit,
  containerRef,
}: {
  /** The committed sheet. */
  doc: SheetDoc | null;
  /** Commit a whole new sheet, as one undoable change. */
  commit: (next: SheetDoc) => void;
  /** Wraps the pages, to find the piece being edited. */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [ghost, setGhost] = useState<SheetDoc | null>(null);
  const [focus, setFocus] = useState<{ key: string; label: string } | null>(null);

  const docRef = useRef(doc);
  const commitRef = useRef(commit);
  useEffect(() => {
    docRef.current = doc;
    commitRef.current = commit;
  });
  const workingRef = useRef<SheetDoc | null>(null);
  const flashRef = useRef<number | null>(null);

  const scrollTo = useCallback(
    (key: string) => {
      const root = containerRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(`[data-jo="${CSS.escape(key)}"]`);
      el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    },
    [containerRef],
  );

  /** After React has drawn the next state, so the element exists. */
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const adapter = useMemo<JoAdapter>(
    () => ({
      kind: "sheet",
      snapshot: () => (docRef.current ? sheetSnapshot(docRef.current) : null),
      focus: () => null,
      isOp: (v: unknown): v is JoOp => isSheetOp(v),
      begin() {
        workingRef.current = docRef.current;
        return docRef.current;
      },
      async play(op, signal) {
        const working = workingRef.current;
        if (!working || !isSheetOp(op)) return null;
        const calm = reducedMotion();
        const applied = applySheetOp(working, op);
        if (!applied) return null;

        // 1. Point at it.
        const at = sheetOpFocus(working, op);
        if (at) {
          setFocus({ key: at, label: op.label });
          await nextFrame();
          scrollTo(at);
          await wait(calm ? 0 : POINT_MS, signal);
        }

        // 2. Type it, for a change of words.
        if (op.op === "setText" && !calm && !signal.aborted) {
          const finalText = sheetTextAt(applied.doc, op.target) ?? "";
          const frames = Math.min(28, Math.max(6, Math.ceil(finalText.length / 5)));
          const total = Math.min(1200, 350 + finalText.length * 7);
          for (let k = 1; k < frames && !signal.aborted; k++) {
            const typed = setSheetText(working, op.target, finalText.slice(0, Math.round((finalText.length * k) / frames)), true);
            if (typed) setGhost(typed);
            await wait(total / frames, signal);
          }
        }

        // 3. Land it.
        workingRef.current = applied.doc;
        setGhost(applied.doc);
        if (applied.focus && applied.focus !== at) {
          setFocus({ key: applied.focus, label: op.label });
          await nextFrame();
          scrollTo(applied.focus);
        }
        await wait(calm ? 0 : SETTLE_MS, signal);
        return { focus: applied.focus ?? at };
      },
      end() {
        const working = workingRef.current;
        workingRef.current = null;
        if (working && working !== docRef.current) commitRef.current(working);
        setGhost(null);
        setFocus(null);
      },
      restore(before) {
        if (before && typeof before === "object") commitRef.current(before as SheetDoc);
      },
      reveal(key) {
        if (flashRef.current) window.clearTimeout(flashRef.current);
        setFocus({ key, label: "" });
        requestAnimationFrame(() => scrollTo(key));
        flashRef.current = window.setTimeout(() => setFocus(null), 1600);
      },
    }),
    [scrollTo],
  );

  return { adapter, shown: ghost ?? doc, focus, working: ghost !== null };
}
