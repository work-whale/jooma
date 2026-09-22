"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "@phosphor-icons/react/dist/ssr";
import MarkdownResult from "@/app/components/MarkdownResult";
import { OutlineRail } from "@/app/components/OutputOutline";
import { ToolTile } from "@/app/components/v2/Squircle";
import { saveSharedToLibrary, type Share } from "@/app/lib/colleagues";
import { displayName } from "@/app/lib/colleagueDisplay";
import { getToolRun, type ToolRun } from "@/app/lib/toolRuns";
import { isStructuredOutput, typeLabel } from "@/app/lib/toolRunDisplay";
import { v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import styles from "./SharedResourceModal.module.css";

/*
 * Read a resource without opening the tool that made it.
 *
 * Before this existed the feed offered Save and Dismiss and nothing else, so
 * the only things a teacher could judge an offer on were its title and who sent
 * it. That is a decision made blind, and the content to make it properly was
 * already in the browser.
 *
 * TWO KINDS OF THING TO READ, one dialog. A SHARE is a colleague's offer, which
 * carries a full snapshot (tool_slug, title, input, output) and so opens with no
 * network call at all: that is the payoff of the schema decision argued for in
 * the migration header, the recipient reading the offer without a definer
 * function reaching into the sender's rows. A RUN is one of the teacher's own
 * resources, reached from the timetable, where the lesson row carries only
 * (id, title, tool_slug) and the body has to be fetched. Hence the union: the
 * header is identical either way, and only the body and the footer action
 * differ.
 *
 * Read-only on purpose. ResultPanel is the other thing that renders a
 * generation, and it is wrong here twice over: idle it swaps in the Tiptap
 * editor, and with historyMeta set it saves a tool_runs row of its own. Neither
 * belongs on a resource being judged rather than worked on.
 */

/**
 * What the dialog is reading.
 *
 * The run arm carries `title` and `toolSlug` eagerly rather than fetching them,
 * because every caller already has both: the timetable has them on
 * `lesson.resource` and on the strip's ToolRun. That is what lets the header
 * render correctly on the first frame while only the body waits.
 */
export type ResourceView =
  | { kind: "share"; share: Share }
  | { kind: "run"; runId: string; title: string | null; toolSlug: string };

interface SharedResourceModalProps {
  /** What to read. Null closes the modal. */
  view: ResourceView | null;
  onClose: () => void;
  /** Fired after Add to library succeeds. Share only, and omitted by the
   *  Library, which is already looking at the copy this would make. */
  onAdded?: (run: ToolRun, share: Share) => void;
  /** Run only: open this resource in the tool that made it. Without it the
   *  footer offers Close alone. */
  onOpenInLibrary?: (view: Extract<ResourceView, { kind: "run" }>) => void;
}

/*
 * A gate, so the dialog below only exists while something is being read.
 *
 * The unmount is the reset, as in ShareModal: no stale `busy` or `error`
 * survives a close. `key` covers the other direction, opening one resource
 * directly from another, which is a prop change rather than a remount and
 * would otherwise carry the previous scroll position and confirmation across.
 * With the fetching arm it also prevents a worse version of the same thing: a
 * body arriving for the resource that was open a moment ago, under the title
 * of the one that is open now.
 */
export default function SharedResourceModal({ view, ...props }: SharedResourceModalProps) {
  if (!view || typeof document === "undefined") return null;
  const key = view.kind === "share" ? view.share.id : view.runId;
  return <SharedResourceDialog key={key} view={view} {...props} />;
}

function SharedResourceDialog({
  view,
  onClose,
  onAdded,
  onOpenInLibrary,
}: SharedResourceModalProps & { view: ResourceView }) {
  /*
   * Whether this is already in the library. Share only.
   *
   * Seeded from the share itself rather than passed in, which is what lets one
   * component serve both callers with no mode prop: the Colleagues feed only
   * ever holds unsaved shares, so it opens on the Add button, and the Library's
   * "Shared with me" only ever holds saved ones, so it opens on the
   * confirmation.
   */
  const [added, setAdded] = useState(view.kind === "share" && view.share.saved_at !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The document itself.
   *
   * A share arrives with its body already in hand, so this starts populated and
   * the effect below never runs. A run starts null and fills in from
   * getToolRun: the timetable's LESSON_SELECT loads only (id, title, tool_slug),
   * deliberately, so that opening a week does not drag fifty full documents
   * across the wire for the sake of the one a teacher might read.
   */
  const [output, setOutput] = useState<string | null>(
    view.kind === "share" ? view.share.output : null,
  );
  const [loadError, setLoadError] = useState(false);

  /*
   * Fetch the body of a run.
   *
   * Depends on the extracted id, NOT on `view`. Callers build the view object
   * inline, so it is a fresh identity on every parent render, and depending on
   * it would re-issue this fetch each time the timetable re-rendered underneath
   * the open modal.
   */
  const runId = view.kind === "run" ? view.runId : null;
  useEffect(() => {
    if (runId === null) return;
    let cancelled = false;
    (async () => {
      try {
        const run = await getToolRun(runId);
        if (cancelled) return;
        // getToolRun returns null for a row that is missing and for one RLS
        // hides, which are indistinguishable and mean the same thing here:
        // there is nothing to read.
        if (!run) setLoadError(true);
        else setOutput(run.output);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  /*
   * The scrolling element, held in STATE and set by a callback ref.
   *
   * A useRef would not do: OutlineRail attaches an IntersectionObserver to this
   * node in an effect, and a ref assignment does not re-render, so the effect
   * would run once with null and never again, leaving every outline link dead.
   */
  const [body, setBody] = useState<HTMLElement | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

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

  // Scroll lock, matching ShareModal and TopUpModal.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const slug = view.kind === "share" ? view.share.tool_slug : view.toolSlug;
  const rawTitle = view.kind === "share" ? view.share.title : view.title;
  const tool = v2ToolForSlug(slug);
  const title = rawTitle?.trim() || typeLabel(slug);
  const from =
    view.kind === "share"
      ? view.share.sender
        ? displayName(view.share.sender)
        : "a colleague"
      : null;

  /*
   * Passing `output ?? undefined` keeps the slug list working while a run is
   * still loading, so a slideshow shows its notice straight away rather than a
   * spinner that resolves into one.
   */
  const structured = isStructuredOutput(slug, output ?? undefined);

  const add = async () => {
    if (view.kind !== "share") return;
    setBusy(true);
    setError(null);
    try {
      const run = await saveSharedToLibrary(view.share);
      setAdded(true);
      onAdded?.(run, view.share);
    } catch {
      setError("That could not be added. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-title"
        className={styles.modal}
      >
        <header className={styles.head}>
          <ToolTile icon={tool?.icon ?? "file-text"} solid={toolSolid(tool)} size="sm" />
          <span className={styles.headText}>
            <h2 id="shared-title" className={styles.title} tabIndex={-1} ref={headingRef}>
              {title}
            </h2>
            {/* Kept for a run too, carrying the type alone. Dropping the
                element would shift the header's vertical rhythm between the
                two callers for no gain. */}
            <p className={styles.sub}>
              {from ? `Shared by ${from} · ${typeLabel(slug)}` : typeLabel(slug)}
            </p>
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X width={16} height={16} />
          </button>
        </header>

        <div className={styles.body}>
          {/* Renders nothing when the document has fewer than two headings, so
              a short resource gets the full width without a special case. A
              null markdown counts as none of them, so a loading run gets the
              full width too and the rail appears when the body lands. */}
          {!structured && <OutlineRail markdown={output} scrollRoot={body} />}

          {/* Every state below goes INSIDE .content, never beside it: the
              one-column rule keys off `.content:only-child`, so a sibling here
              would leave a 220px gutter of nothing next to a loading message. */}
          <div className={styles.content} ref={setBody}>
            {loadError ? (
              <p className={styles.loadError} role="status">
                That resource could not be opened. It may have been deleted from your library.
              </p>
            ) : structured ? (
              <StructuredNotice slug={slug} />
            ) : output === null ? (
              <p className={styles.loading} role="status">
                Opening
              </p>
            ) : (
              <MarkdownResult text={output} />
            )}
          </div>
        </div>

        <div className={styles.foot}>
          {error ? (
            <p className={styles.error} role="status">
              {error}
            </p>
          ) : null}

          <button type="button" className={styles.cancel} onClick={onClose}>
            Close
          </button>

          {/* Stays open after adding. The teacher opened this to read the
              thing, so closing it the moment they save would take away what
              they came for as a reward for saving. */}
          {view.kind === "share" ? (
            added ? (
              <span className={styles.done}>
                <Check weight="bold" width={15} height={15} />
                In your library
              </span>
            ) : (
              <button type="button" className={styles.save} onClick={add} disabled={busy}>
                {busy ? "Adding" : "Add to library"}
              </button>
            )
          ) : onOpenInLibrary ? (
            /* Never disabled, not even while the body is loading or after it
               failed: this resource is already the teacher's own, and opening
               it properly is exactly what is worth offering when reading it
               here did not work. */
            <button
              type="button"
              className={styles.save}
              onClick={() => onOpenInLibrary(view)}
            >
              Open in library
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * What to show when `output` is JSON rather than markdown.
 *
 * Three tools store a structure, not a document (see isStructuredOutput).
 * Handing one to MarkdownResult gives a screenful of literal braces, which
 * reads as a corrupted resource rather than as the wrong renderer. Say what it
 * is instead, and leave Add enabled: adding is exactly what unblocks opening it
 * properly in the tool that made it.
 *
 * Rendering slides or questions here would need MiniSlide, a theme and a
 * presentation shape. Separate piece of work.
 */
function StructuredNotice({ slug }: { slug: string }) {
  const quiz = slug === "quiz-generator";
  return (
    <div className={styles.notice}>
      <p className={styles.noticeTitle}>
        {quiz ? "This one is a quiz." : "This one is a set of slides."}
      </p>
      <p className={styles.noticeBody}>
        Add it to your library and open it in {typeLabel(slug)} to see
        {quiz ? " and edit the questions." : " and edit the slides."}
      </p>
    </div>
  );
}
