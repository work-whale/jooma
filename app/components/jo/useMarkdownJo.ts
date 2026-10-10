"use client";

// Jo's hands on a text tool's document (a lesson plan, a letter, a report).
//
// While a turn plays, the editor shows Jo's working copy (`shown`): Jo rings
// the section it is changing, scrolls to it and types the new text in. When
// the turn ends the working copy is committed once, so the whole turn is one
// change for the page to keep.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { applyMdOp, isMdOp, markdownSnapshot, mdOpFocus, parseMarkdownDoc, serializeMarkdownDoc, type MdDoc } from "@/app/lib/jo/md-ops";
import type { JoOp, MdOp } from "@/app/lib/jo/types";
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

export interface MdJoFocus {
  sectionId: string;
  label: string;
}

export function useMarkdownJo({
  markdown,
  commit,
  containerRef,
  toolName,
}: {
  /** The committed document. */
  markdown: string | null;
  commit: (next: string) => void;
  /** Wraps the editor, to find a section on the page. */
  containerRef: RefObject<HTMLElement | null>;
  /** "Lesson Planner", for Jo's context. */
  toolName: string;
}) {
  const [ghost, setGhost] = useState<string | null>(null);
  const [focus, setFocus] = useState<MdJoFocus | null>(null);
  /** The sections as drawn now, so the ring can find a section by id. */
  const [shownDoc, setShownDoc] = useState<MdDoc | null>(null);

  const markdownRef = useRef(markdown);
  const commitRef = useRef(commit);
  const toolRef = useRef(toolName);
  useEffect(() => {
    markdownRef.current = markdown;
    commitRef.current = commit;
    toolRef.current = toolName;
  });
  const workingRef = useRef<MdDoc | null>(null);
  const flashRef = useRef<number | null>(null);

  const show = useCallback((doc: MdDoc) => {
    setShownDoc(doc);
    setGhost(serializeMarkdownDoc(doc));
  }, []);

  const scrollTo = useCallback(
    (doc: MdDoc, sectionId: string) => {
      const root = containerRef.current;
      if (!root) return;
      const el = sectionElement(root, doc, sectionId);
      el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    },
    [containerRef],
  );

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const adapter = useMemo<JoAdapter>(
    () => ({
      kind: "markdown",
      snapshot: () => ({ toolName: toolRef.current, ...markdownSnapshot(parseMarkdownDoc(markdownRef.current ?? "")) }),
      focus: () => null,
      isOp: (v: unknown): v is JoOp => isMdOp(v),
      begin() {
        const before = markdownRef.current ?? "";
        workingRef.current = parseMarkdownDoc(before);
        setShownDoc(workingRef.current);
        return before;
      },
      async play(op, signal) {
        const working = workingRef.current;
        if (!working || !isMdOp(op)) return null;
        const mdOp = op as MdOp;
        const applied = applyMdOp(working, mdOp);
        if (!applied) return null;
        const calm = reducedMotion();

        const at = mdOpFocus(working, mdOp);
        if (at) {
          setFocus({ sectionId: at, label: op.label });
          await nextFrame();
          scrollTo(working, at);
          await wait(calm ? 0 : POINT_MS, signal);
        }

        if (!calm && !signal.aborted && mdOp.op !== "deleteSection") {
          const length = mdOp.op === "editText" ? mdOp.replace.length : mdOp.markdown.length;
          const frames = Math.min(24, Math.max(5, Math.ceil(length / 12)));
          const total = Math.min(1500, 350 + length * 5);
          if (applied.focus && mdOp.op === "insertSection") setFocus({ sectionId: applied.focus, label: op.label });
          for (let k = 1; k < frames && !signal.aborted; k++) {
            const frame = applyMdOp(working, mdOp, k / frames, applied.focus ?? undefined);
            if (!frame) break;
            show(frame.doc);
            await wait(total / frames, signal);
          }
        }

        workingRef.current = applied.doc;
        show(applied.doc);
        if (applied.focus) {
          setFocus({ sectionId: applied.focus, label: op.label });
          await nextFrame();
          scrollTo(applied.doc, applied.focus);
        } else {
          setFocus(null);
        }
        await wait(calm ? 0 : SETTLE_MS, signal);
        return { focus: applied.focus ?? at };
      },
      end() {
        const working = workingRef.current;
        workingRef.current = null;
        if (working) {
          const next = serializeMarkdownDoc(working);
          if (next !== markdownRef.current) commitRef.current(next);
        }
        setGhost(null);
        setFocus(null);
      },
      restore(before) {
        if (typeof before === "string") commitRef.current(before);
      },
      reveal(sectionId) {
        const doc = parseMarkdownDoc(markdownRef.current ?? "");
        setShownDoc(doc);
        if (flashRef.current) window.clearTimeout(flashRef.current);
        setFocus({ sectionId, label: "" });
        requestAnimationFrame(() => scrollTo(doc, sectionId));
        flashRef.current = window.setTimeout(() => setFocus(null), 1600);
      },
    }),
    [scrollTo, show],
  );

  return { adapter, shown: ghost ?? markdown, focus, shownDoc, working: ghost !== null };
}

/** The heading element a section starts at, or the editor's top for the
 *  opening text. Headings are counted in document order, as the editor draws
 *  one element per heading line. */
export function sectionElement(root: HTMLElement, doc: MdDoc, sectionId: string): HTMLElement | null {
  const editor = root.querySelector<HTMLElement>(".ProseMirror") ?? root;
  const headings = [...editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")];
  let n = -1;
  for (const s of doc.sections) {
    if (s.headingLine !== null) n++;
    if (s.id === sectionId) return s.headingLine === null ? (editor.firstElementChild as HTMLElement | null) : (headings[n] ?? null);
  }
  return null;
}

/** Where a section sits on the page: from its heading to the next heading, or
 *  to the end of the document. */
export function sectionRect(root: HTMLElement, doc: MdDoc, sectionId: string): DOMRect | null {
  const editor = root.querySelector<HTMLElement>(".ProseMirror") ?? root;
  const start = sectionElement(root, doc, sectionId);
  if (!start) return null;
  const headings = [...editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")];
  const next = headings.find((h) => h !== start && h.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_PRECEDING);
  const top = start.getBoundingClientRect().top;
  const ed = editor.getBoundingClientRect();
  const bottom = next ? next.getBoundingClientRect().top - 6 : ed.bottom;
  return new DOMRect(ed.left, top - 6, ed.width, Math.max(24, bottom - top + 6));
}
