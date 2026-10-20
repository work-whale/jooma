"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Eye, Loader2, Maximize2, Palette, Pencil, Printer, Redo2, Undo2 } from "lucide-react";
import MarkdownResult from "@/app/components/MarkdownResult";
import SheetDocument from "@/app/components/sheets/SheetDocument";
import SheetDesignPanel from "@/app/components/sheets/SheetDesignPanel";
import { parseSheet } from "@/app/lib/sheets/normalize";
import type { SheetDesign, SheetDoc } from "@/app/lib/sheets/types";
import type { GuestAction } from "@/app/lib/guest-actions";
import { useSheetJoPanel } from "@/app/components/jo/useSheetJoPanel";
import styles from "./guest.module.css";

const COPY = {
  comprehension: { title: "Your comprehension", writing: "Writing the passage and questions" },
  worksheet: { title: "Your worksheet", writing: "Writing the questions" },
} as const;

/**
 * A guest's comprehension or worksheet, to read and edit for this visit: undo,
 * redo, preview and the Design panel work here as they do in the signed in
 * workspace (SheetWorkspace). Focus, export, print and copy each open the sign
 * up prompt: they are all there the moment the sheet is in their library.
 *
 * Design opens as a sidebar over the page rather than a block in it: inline,
 * it added a long stretch of scrolling above the sheet on a phone.
 */
export default function GuestResult({
  kind = "comprehension",
  result,
  isGenerating,
  onAction,
  jo,
}: {
  kind?: "comprehension" | "worksheet";
  result: string | null;
  isGenerating: boolean;
  onAction: (action: GuestAction) => void;
  /** Ask Jo on this free try: the trial row it edits, the page's honeypot,
   *  and the sign up prompt for when the free messages run out. */
  jo: { trialId: string | null; honeypot: () => string; onSignUp: () => void };
}) {
  // Scrolling, the same as the signed in result panel (ResultPanel.tsx): follow
  // the passage down the page while it streams, unless the visitor has
  // scrolled up to read, then bring the finished panel into view once.
  const panelRef = useRef<HTMLElement>(null);
  const userScrolledUp = useRef(false);
  const generatingRef = useRef(isGenerating);
  const lastScrolled = useRef<string | null>(null);

  useEffect(() => {
    generatingRef.current = isGenerating;
    if (isGenerating) userScrolledUp.current = false;
  }, [isGenerating]);

  useEffect(() => {
    const onScroll = () => {
      if (!generatingRef.current) return;
      const distFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pin to the bottom on every new chunk. Instant, not smooth, to avoid jitter.
  useEffect(() => {
    if (isGenerating && !userScrolledUp.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [result, isGenerating]);

  // Once it settles, bring the panel's top just below the page bar.
  useEffect(() => {
    if (isGenerating || !result) return;
    if (lastScrolled.current === result) return;
    lastScrolled.current = result;
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      // Clears the sticky bar on /create, which is two rows on a phone.
      const bar = document.querySelector<HTMLElement>("[data-landing-nav]");
      const offset = (bar?.offsetHeight ?? 74) + 8;
      window.scrollTo({
        top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset),
        behavior: "smooth",
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [result, isGenerating]);

  // The designed sheet, editable for this visit. Edits are not kept: the
  // stored copy is the one claimed into the library on sign up. A new result
  // drops them, which is the "adjust state while rendering" pattern.
  const sheet = useMemo(() => parseSheet(result), [result]);
  const [edited, setEdited] = useState<{ base: string | null; doc: SheetDoc } | null>(null);
  const shownSheet = edited && edited.base === result ? edited.doc : sheet;

  // ── Ask Jo ──
  // Jo's edits land in the same visit-only state as the visitor's own, and
  // the panel opens itself once the sheet has finished.
  const pagesRef = useRef<HTMLDivElement>(null);

  // ── Undo ──
  // Whole sheets, as in SheetWorkspace. A new result starts a fresh history.
  const [past, setPast] = useState<SheetDoc[]>([]);
  const [future, setFuture] = useState<SheetDoc[]>([]);
  const [historyFor, setHistoryFor] = useState(result);
  if (historyFor !== result) {
    setHistoryFor(result);
    setPast([]);
    setFuture([]);
  }
  const shownRef = useRef(shownSheet);
  useEffect(() => {
    shownRef.current = shownSheet;
  });
  const commit = useCallback(
    (doc: SheetDoc) => {
      const before = shownRef.current;
      if (before) setPast((p) => [...p.slice(-49), before]);
      setFuture([]);
      setEdited({ base: result, doc });
    },
    [result],
  );
  const [openSignal, setOpenSignal] = useState(0);
  const [wasGenerating, setWasGenerating] = useState(isGenerating);
  if (isGenerating !== wasGenerating) {
    setWasGenerating(isGenerating);
    if (!isGenerating) setOpenSignal((n) => n + 1);
  }
  const ask = useSheetJoPanel({
    doc: shownSheet,
    commit,
    containerRef: pagesRef,
    guest: jo,
    disabled: isGenerating ? "Jo can help as soon as this is finished" : null,
    openSignal,
  });

  const [preview, setPreview] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  useEffect(() => {
    if (!designOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDesignOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [designOpen]);

  if (result === null) return null;
  const ready = !isGenerating && result.trim().length > 0;
  const copy = COPY[kind];
  const busy = !ready || ask.joBusy;

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev || !shownSheet || busy) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [shownSheet, ...f]);
    setEdited({ base: result, doc: prev });
  };
  const redo = () => {
    const next = future[0];
    if (!next || !shownSheet || busy) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, shownSheet]);
    setEdited({ base: result, doc: next });
  };
  const onDesign = (patch: Partial<SheetDesign>) => {
    if (shownSheet) commit({ ...shownSheet, design: { ...shownSheet.design, ...patch } });
  };


  return (
    <section
      ref={panelRef}
      className={styles.result}
      aria-label={copy.title}
      data-testid="guest-result"
    >
      <header className={styles.resultBar}>
        <div className={styles.deckTitle}>
          <h2>{copy.title}</h2>
          {isGenerating ? (
            <span className={styles.deckStatus} role="status">
              <Loader2 className={styles.spin} aria-hidden="true" />
              {copy.writing}
            </span>
          ) : (
            <span className={styles.deckStatus}>Ready</span>
          )}
        </div>
        <div className={styles.deckActions}>
          {shownSheet && (
            <>
              <button type="button" className={styles.ghostBtn} onClick={undo} disabled={busy || past.length === 0} aria-label="Undo" title="Undo">
                <Undo2 aria-hidden="true" />
              </button>
              <button type="button" className={styles.ghostBtn} onClick={redo} disabled={busy || future.length === 0} aria-label="Redo" title="Redo">
                <Redo2 aria-hidden="true" />
              </button>
              <button
                type="button"
                className={preview ? styles.purpleBtn : styles.ghostBtn}
                onClick={() => setPreview((p) => !p)}
                disabled={busy}
                aria-pressed={preview}
                aria-label={preview ? "Edit" : "Preview"}
                data-testid="sheet-preview-toggle"
              >
                {preview ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
                <span>{preview ? "Edit" : "Preview"}</span>
              </button>
              <button
                type="button"
                className={designOpen ? styles.purpleBtn : styles.ghostBtn}
                onClick={() => setDesignOpen((o) => !o)}
                disabled={busy}
                aria-expanded={designOpen}
                aria-label="Design"
                data-testid="sheet-design-toggle"
              >
                <Palette aria-hidden="true" /> <span>Design</span>
              </button>
            </>
          )}
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("focus")} disabled={!ready}>
            <Maximize2 aria-hidden="true" /> <span>Focus</span>
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("print")} disabled={!ready}>
            <Printer aria-hidden="true" /> <span>Print</span>
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("copy")} disabled={!ready}>
            <Copy aria-hidden="true" /> <span>Copy</span>
          </button>
          <button type="button" className={styles.purpleBtn} onClick={() => onAction("export")} disabled={!ready}>
            <Download aria-hidden="true" /> <span>Export</span>
          </button>
        </div>
      </header>
      {shownSheet ? (
        <div className="flex gap-4 bg-stone-100 px-3 py-6 sm:px-6 sm:py-8">
          <div className="flex-1 min-w-0" ref={pagesRef}>
            <SheetDocument
              doc={ask.shown ?? shownSheet}
              edit={ready && !ask.joBusy && !preview}
              streaming={isGenerating}
              onChange={commit}
              joFocus={ask.joFocus}
            />
          </div>
          {ask.panel}
          {designOpen &&
            !busy &&
            // A sidebar on the right, over the page and its header, so the
            // sheet keeps its place and every change shows on it at once.
            // Portalled to the body: nothing around the result can clip it.
            createPortal(
              <div className={styles.designDrawer} data-testid="sheet-design-drawer">
                <SheetDesignPanel doc={shownSheet} onDesign={onDesign} onClose={() => setDesignOpen(false)} />
              </div>,
              document.body,
            )}
        </div>
      ) : (
        <div className={styles.resultBody}>
          <MarkdownResult text={result} />
        </div>
      )}
    </section>
  );
}
