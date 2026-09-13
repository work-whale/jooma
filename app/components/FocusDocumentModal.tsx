"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, FileDown, FileText, Loader2, Printer, X, ChevronDown } from "lucide-react";
import MarkdownResult from "@/app/components/MarkdownResult";
import { OutlineRail } from "@/app/components/OutputOutline";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import { useDocumentActions } from "@/app/lib/useDocumentActions";
import styles from "./FocusDocumentModal.module.css";

/*
 * Read a generation with the whole screen.
 *
 * The output renders BELOW the form on a tool page, so reading what you just
 * made means scrolling past every field that made it. This is the same
 * document given the screen, with its outline beside it.
 *
 * READ ONLY, deliberately. Editing stays on the page, for two reasons. The
 * teacher's edits round-trip through `result` (see the data flow note below),
 * so a second RichTextEditor here would be two Tiptap instances sharing one
 * piece of state. And the outline depends on it: MarkdownResult emits heading
 * ids, the Tiptap editor emits none, and useOutline's positional fallback for
 * that case is WINDOW ONLY. Inside a modal `.prose-editor` matches the editor
 * on the page behind the scrim, so the fallback would scroll the wrong
 * document. Passing a scrollRoot disables the fallback, which is safe only
 * while what renders here carries ids.
 *
 * WHAT IT SHOWS. `result` is the single source of truth: Tiptap's onUpdate
 * round-trips through ResultPanel's onChange into the form's state on every
 * keystroke, so opening this after editing shows the edited document with no
 * extra wiring. One consequence of that round trip is that Tiptap-only
 * formatting with no markdown representation (colour, highlight, alignment,
 * sub and superscript) is not carried here. That is inherent to the existing
 * architecture and already true of export and of save.
 */

interface Props {
  /** The document to read. Never null: the caller mounts this only when open,
   *  so closing unmounts and resets the scroll position for free. */
  markdown: string;
  /** Names the downloads, and titles the dialog. */
  filename: string;
  /** Shown above the document. The tool's own name for this run. */
  title: string;
  onClose: () => void;
}

export default function FocusDocumentModal({ markdown, filename, title, onClose }: Props) {
  if (typeof document === "undefined") return null;
  return <FocusDialog markdown={markdown} filename={filename} title={title} onClose={onClose} />;
}

function FocusDialog({ markdown, filename, title, onClose }: Props) {
  /*
   * The scrolling element, held in STATE and set by a callback ref.
   *
   * A useRef would not do: OutlineRail attaches an IntersectionObserver to this
   * node in an effect, and a ref assignment does not re-render, so the effect
   * would run once with null and never again. The outline would render and
   * highlight nothing, and every link would silently do nothing.
   */
  const [body, setBody] = useState<HTMLElement | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const { copied, isExporting, exportError, handleCopy, exportItems } = useDocumentActions(
    markdown,
    filename,
    {
      pdf: <FileDown className="w-3.5 h-3.5" />,
      docx: <FileText className="w-3.5 h-3.5" />,
      googleDocs: <Download className="w-3.5 h-3.5" />,
      print: <Printer className="w-3.5 h-3.5" />,
    },
  );

  // Escape closes, focus moves in on open and returns to whatever opened it.
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  // Scroll lock, matching the app's other portal modals.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="focus-title" className={styles.modal}>
        <header className={styles.head}>
          <span className={styles.headText}>
            <h2 id="focus-title" className={styles.title} tabIndex={-1} ref={headingRef}>
              {title}
            </h2>
            <p className={styles.sub}>Reading view</p>
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X width={16} height={16} />
          </button>
        </header>

        <div className={styles.body}>
          {/* Renders nothing when the document has fewer than two headings, so
              a short one gets the full width without a special case. */}
          <OutlineRail markdown={markdown} scrollRoot={body} />

          <div className={styles.content} ref={setBody}>
            <MarkdownResult text={markdown} />
          </div>
        </div>

        <div className={styles.foot}>
          {exportError ? (
            <p className={styles.error} role="status">
              {exportError}
            </p>
          ) : (
            <span className={styles.spacer} />
          )}

          <DropdownMenu
            ariaLabel="Export options"
            disabled={isExporting !== null}
            triggerClassName="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-40 cursor-pointer"
            menuClassName="w-[min(15rem,calc(100vw-2rem))]"
            align="right"
            trigger={
              <>
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isExporting === "pdf" ? "Building PDF…" : isExporting === "docx" ? "Building…" : "Export"}
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            }
            items={exportItems}
          />

          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Copy to clipboard"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
