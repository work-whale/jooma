"use client";

// Jo's hands on a list document: a quiz's questions or a Staff Slides deck.
// The page draws Jo's working copy (`shown`) while a turn plays: Jo rings the
// card it is changing, scrolls to it and types its question or title in; the
// turn is committed once at the end.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { applyListOp, isListOp, listOpFocus, listSnapshot, toListItems, typedField, type ListItem, type ListTool } from "@/app/lib/jo/list-ops";
import type { JoOp, ListOp } from "@/app/lib/jo/types";
import type { JoAdapter } from "./useJoSession";

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

const POINT_MS = 380;
const SETTLE_MS = 420;

export interface ListJoFocus {
  /** The card's position on the page now. */
  index: number;
  label: string;
}

export function useListJo<T>({
  tool,
  values,
  commit,
  containerRef,
}: {
  tool: ListTool;
  /** The committed list. */
  values: T[];
  commit: (next: T[]) => void;
  /** Wraps the cards, each marked data-jo-item with its position. */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [ghost, setGhost] = useState<T[] | null>(null);
  const [focus, setFocus] = useState<ListJoFocus | null>(null);

  const valuesRef = useRef(values);
  const commitRef = useRef(commit);
  useEffect(() => {
    valuesRef.current = values;
    commitRef.current = commit;
  });
  const workingRef = useRef<ListItem<T>[] | null>(null);
  /** The turn's items once it ended, so "show me" can still find them. */
  const lastRef = useRef<ListItem<T>[] | null>(null);
  const flashRef = useRef<number | null>(null);

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const point = useCallback(
    async (items: ListItem<T>[], id: string, label: string) => {
      const index = items.findIndex((it) => it.id === id);
      if (index === -1) return;
      setFocus({ index, label });
      await nextFrame();
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-jo-item="${index}"]`)
        ?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    },
    [containerRef],
  );

  const adapter = useMemo<JoAdapter>(
    () => ({
      kind: tool,
      snapshot: () => listSnapshot(tool, toListItems(tool, valuesRef.current) as ListItem<unknown>[]),
      focus: () => null,
      isOp: (v: unknown): v is JoOp => isListOp(v),
      begin() {
        workingRef.current = toListItems(tool, valuesRef.current);
        return valuesRef.current;
      },
      async play(op, signal) {
        const working = workingRef.current;
        if (!working || !isListOp(op)) return null;
        const listOp = op as ListOp;
        const applied = applyListOp(tool, working, listOp);
        if (!applied) return null;
        const calm = reducedMotion();
        const show = (items: ListItem<T>[]) => setGhost(items.map((it) => it.value));

        const at = listOpFocus(working as ListItem<unknown>[], listOp);
        if (at) {
          await point(working, at, op.label);
          await wait(calm ? 0 : POINT_MS, signal);
        }

        if (!calm && !signal.aborted && (listOp.op === "replaceItem" || listOp.op === "insertItem") && applied.focus) {
          const field = typedField(tool);
          const final = applied.items.find((it) => it.id === applied.focus)!.value as Record<string, unknown>;
          const text = String(final[field] ?? "");
          if (listOp.op === "insertItem") await point(applied.items, applied.focus, op.label);
          const frames = Math.min(20, Math.max(5, Math.ceil(text.length / 4)));
          const total = Math.min(1100, 300 + text.length * 10);
          for (let k = 1; k < frames && !signal.aborted; k++) {
            const typed = { ...final, [field]: text.slice(0, Math.round((text.length * k) / frames)) } as T;
            show(applied.items.map((it) => (it.id === applied.focus ? { ...it, value: typed } : it)));
            await wait(total / frames, signal);
          }
        }

        workingRef.current = applied.items;
        show(applied.items);
        if (applied.focus) await point(applied.items, applied.focus, op.label);
        else setFocus(null);
        await wait(calm ? 0 : SETTLE_MS, signal);
        return { focus: applied.focus ?? at };
      },
      end() {
        const working = workingRef.current;
        workingRef.current = null;
        lastRef.current = working;
        if (working) commitRef.current(working.map((it) => it.value));
        setGhost(null);
        setFocus(null);
      },
      restore(before) {
        if (Array.isArray(before)) commitRef.current(before as T[]);
      },
      reveal(id) {
        const items = lastRef.current ?? toListItems(tool, valuesRef.current);
        if (flashRef.current) window.clearTimeout(flashRef.current);
        void point(items, id, "");
        flashRef.current = window.setTimeout(() => setFocus(null), 1600);
      },
    }),
    [tool, point],
  );

  return { adapter, shown: ghost ?? values, focus, working: ghost !== null };
}
