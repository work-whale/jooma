"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Loader2, Maximize2, Printer } from "lucide-react";
import MarkdownResult from "@/app/components/MarkdownResult";
import SheetDocument from "@/app/components/sheets/SheetDocument";
import { parseSheet } from "@/app/lib/sheets/normalize";
import type { SheetDoc } from "@/app/lib/sheets/types";
import type { GuestAction } from "@/app/lib/guest-actions";
import { useSheetJoPanel } from "@/app/components/jo/useSheetJoPanel";
import styles from "./guest.module.css";

/**
 * A guest's comprehension, to read. The result panel's own buttons, each of
 * which opens the sign up prompt: focus, export, print and copy are all there
 * the moment the passage is in their library.
 */
export default function GuestResult({
  result,
  isGenerating,
  onAction,
  jo,
}: {
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
      const offset = 80; // clears the sticky bar on /create
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
  // the panel opens itself once the comprehension has finished.
  const pagesRef = useRef<HTMLDivElement>(null);
  const commit = useCallback((doc: SheetDoc) => setEdited({ base: result, doc }), [result]);
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

  if (result === null) return null;
  const ready = !isGenerating && result.trim().length > 0;

  return (
    <section
      ref={panelRef}
      className={styles.result}
      aria-label="Your comprehension"
      data-testid="guest-result"
    >
      <header className={styles.resultBar}>
        <div className={styles.deckTitle}>
          <h2>Your comprehension</h2>
          {isGenerating ? (
            <span className={styles.deckStatus} role="status">
              <Loader2 className={styles.spin} aria-hidden="true" />
              Writing the passage and questions
            </span>
          ) : (
            <span className={styles.deckStatus}>Ready</span>
          )}
        </div>
        <div className={styles.deckActions}>
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
              edit={ready && !ask.joBusy}
              streaming={isGenerating}
              onChange={commit}
              joFocus={ask.joFocus}
            />
          </div>
          {ask.panel}
        </div>
      ) : (
        <div className={styles.resultBody}>
          <MarkdownResult text={result} />
        </div>
      )}
    </section>
  );
}
