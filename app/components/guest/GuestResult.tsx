"use client";

import { Copy, Download, Loader2, Maximize2, Printer } from "lucide-react";
import MarkdownResult from "@/app/components/MarkdownResult";
import type { GuestAction } from "@/app/lib/guest-actions";
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
}: {
  result: string | null;
  isGenerating: boolean;
  onAction: (action: GuestAction) => void;
}) {
  if (result === null) return null;
  const ready = !isGenerating && result.trim().length > 0;

  return (
    <section className={styles.result} aria-label="Your comprehension" data-testid="guest-result">
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
      <div className={styles.resultBody}>
        <MarkdownResult text={result} />
      </div>
    </section>
  );
}
