"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X } from "lucide-react";
import { ChatTeardropDots } from "@phosphor-icons/react/dist/ssr";
import { extractHeadings, type Heading } from "@/app/lib/headings";
import { CLOSED, hoverReducer, tabLabel } from "@/app/lib/outlineHover";
import styles from "./OutputOutline.module.css";

// Chapter navigation for a generated document, derived from the output itself.
//
// Replaces LessonPlannerNav, EYFSNav, WorksheetNav and SensoryActivitiesNav,
// which between them covered 4 of 32 markdown tools and each hardcoded the
// section names they expected, locating them by scanning the live DOM for an
// <h2> whose text started with the right string. Two consequences teachers hit:
// a heading the model phrased differently was unreachable, and editing a
// heading in the Tiptap editor silently broke its own link.
//
// Two presentations, one brain. On desktop this is the sticky sidebar card it
// has always been. Below the shell's 900px breakpoint the card is hidden and
// the same list is reached through a floating button, because stacked above a
// long document the card was just something to scroll past. Heading
// extraction, active tracking and scrolling are shared; only the frame differs.

/** Offset so a scrolled-to heading clears the sticky results header. Matches
 *  the value the four hardcoded navs used. */
const SCROLL_OFFSET = 160;

/** The same idea inside a modal, where there is no sticky header to clear and
 *  160px of dead space above the heading would look like a mistake. */
const MODAL_SCROLL_OFFSET = 24;

interface Props {
  /** The generated markdown. The outline re-derives whenever this changes, so
   *  it tracks edits for free. */
  markdown: string | null;
  /** Heading above the list. Also the floating button's accessible name. */
  title?: string;
}

/**
 * True only once hydration has happened, false on the server and on the
 * client's first render.
 *
 * The mobile half renders through a portal, which needs a real document. A
 * bare `typeof document === "undefined"` is NOT enough: it is false during the
 * client's first render too, so the client would render the button on a pass
 * where the server rendered nothing, which React reports as a hydration
 * mismatch. Same shape as the one in SupportLauncher.
 */
const subscribeToNothing = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * Heading extraction, active tracking and scrolling. The brain both
 * presentations share.
 *
 * `scrollRoot` is the one axis of variation. Left undefined, everything below
 * works against the window and the viewport, which is what all 32 tool forms
 * want and what this component did before the hook existed. Handed an element,
 * the same logic runs against that element's scrollport instead, which is what
 * a modal needs: its content scrolls in an internal overflow container, so
 * window.scrollTo would move the page behind the scrim and the viewport-relative
 * IntersectionObserver would never fire.
 */
export function useOutline({
  markdown,
  scrollRoot,
}: {
  markdown: string | null;
  /** The element that actually scrolls, or null/undefined for the window.
   *
   *  MUST arrive via useState and a callback ref, not useRef: a ref does not
   *  re-render, so the observer effect below would run once with null and never
   *  again, leaving the outline dead. */
  scrollRoot?: HTMLElement | null;
}) {
  const headings = useMemo(
    // Empty headings still occupy an index (see headings.ts) but have nothing
    // to label, so they are dropped here rather than from the id sequence.
    () => extractHeadings(markdown ?? "").filter((h) => h.text !== ""),
    [markdown],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  // Suppresses the observer while a click-driven smooth scroll is in flight —
  // otherwise passing over intermediate headings would flicker the highlight
  // through them before settling.
  const scrollingTo = useRef<string | null>(null);

  const contained = scrollRoot != null;
  const offset = contained ? MODAL_SCROLL_OFFSET : SCROLL_OFFSET;

  /*
   * Which renderer is on screen, as state rather than a one-off read.
   *
   * ResultPanel shows MarkdownResult (which emits heading ids) while a
   * generation streams, then swaps in the Tiptap editor (which emits none).
   * That swap changes NOTHING this hook already depends on: the markdown is
   * the same, so `headings` is the same array, and the observer effect below
   * would run exactly once, against whichever DOM happened to exist at mount,
   * and never again.
   *
   * That is what left the outline stuck on an early section while the teacher
   * read a later one. The effect ran before `.prose-editor` existed, found
   * nothing to observe, and had no reason to re-run once it appeared.
   *
   * A MutationObserver on the subtree rather than a timer: the swap is a DOM
   * change, so watching for it is exact, and it also covers the reverse
   * direction when a refine puts MarkdownResult back.
   */
  const [editorEpoch, setEditorEpoch] = useState(0);
  useEffect(() => {
    if (contained) return; // a modal always renders MarkdownResult, and never swaps
    let last = document.querySelector(".prose-editor") !== null;
    const observer = new MutationObserver(() => {
      const now = document.querySelector(".prose-editor") !== null;
      if (now !== last) {
        last = now;
        setEditorEpoch((n) => n + 1);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [contained]);

  /** The rendered heading, looked up inside the scroll container first.
   *
   *  Ids are document-global, so a modal showing the same markdown as the page
   *  behind it would have two elements answering to one id and getElementById
   *  would return whichever came first. Scoping the query keeps the modal
   *  correct in that case. CSS.escape because a slug can start with a digit,
   *  which is a valid id but not a valid bare selector. */
  const find = useCallback(
    (id: string): HTMLElement | null => {
      if (scrollRoot) {
        const scoped = scrollRoot.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        if (scoped) return scoped;
      }
      return document.getElementById(id);
    },
    [scrollRoot],
  );

  useEffect(() => {
    if (headings.length === 0) return;

    /*
     * The element to watch for each heading, and the id to report when it is
     * the one being read.
     *
     * Two strategies, the SAME pair `go` uses for the other direction:
     *
     *   1. The element carrying the id, while MarkdownResult is rendering.
     *   2. The nth heading in document order, once ResultPanel has swapped in
     *      the Tiptap editor, whose ProseMirror DOM carries no ids at all.
     *
     * Strategy 2 is what this effect was missing. Observing only elements that
     * `find` resolved meant that after generation finished there was nothing
     * to observe, so activeId froze at whatever it last saw: the outline kept
     * pointing at an early section while the teacher read a later one. Clicking
     * still worked, because `go` already had the positional fallback, which is
     * why only the tracking looked broken.
     *
     * Strategy 2 is WINDOW ONLY, for the same reason it is in `go`:
     * `.prose-editor` matches the editor on the page behind a modal's scrim, so
     * a contained outline must never use it. A contained outline always renders
     * through MarkdownResult, which always emits ids, so it never needs to.
     */
    const editorHeadings = contained
      ? []
      : [
          ...document.querySelectorAll<HTMLElement>(
            ".prose-editor h1, .prose-editor h2, .prose-editor h3",
          ),
        ];

    // Element to heading id, so the callback can report an id for a node that
    // does not carry one.
    const idFor = new Map<Element, string>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingTo.current) return;
        // Whichever tracked heading is nearest the top wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target;
        if (!top) return;
        // The map first: an editor heading has no id of its own.
        const id = idFor.get(top) ?? top.id;
        if (id) setActiveId(id);
      },
      {
        // null is the viewport, which is the behaviour every existing consumer
        // has always had.
        root: scrollRoot ?? null,
        // Top band: a heading counts as "current" once it reaches the reading
        // position, not when it first peeks into view.
        rootMargin: `-${offset}px 0px -65% 0px`,
        threshold: 0,
      },
    );

    for (const h of headings) {
      const el = find(h.id) ?? editorHeadings[h.index];
      if (!el) continue;
      idFor.set(el, h.id);
      observer.observe(el);
    }

    return () => observer.disconnect();
    // editorEpoch is what re-attaches the observer when ResultPanel swaps
    // MarkdownResult for the Tiptap editor. Without it this runs once against
    // whichever DOM existed at mount. See the note beside its declaration.
  }, [headings, scrollRoot, offset, find, contained, editorEpoch]);

  /**
   * Scroll to a heading.
   *
   * Two strategies, in order:
   *   1. The element carrying the id — works while MarkdownResult is rendering.
   *   2. The nth heading in document order — the fallback once ResultPanel has
   *      swapped in the Tiptap editor, whose ProseMirror DOM carries no ids.
   *      Positional, so it keeps working after the teacher edits the heading
   *      text, which is exactly what broke the navs this replaces.
   *
   * Strategy 2 is WINDOW ONLY. A contained outline always renders through
   * MarkdownResult, which always emits ids, so the fallback has no job there
   * and could only mis-target: `.prose-editor` matches the editor on a tool
   * page, which in a modal is the document behind the scrim.
   */
  const go = useCallback(
    (h: Heading) => {
      const target = contained
        ? find(h.id)
        : (document.getElementById(h.id) ??
          // `.prose-editor` is the class RichTextEditor gives Tiptap's editable
          // node (see its editorProps); scoping to it avoids counting headings
          // from the page chrome — "My results", the sidebar panels — which a
          // bare h1/h2/h3 query would include, throwing the index off.
          document.querySelectorAll<HTMLElement>(
            ".prose-editor h1, .prose-editor h2, .prose-editor h3",
          )[h.index]);

      if (!target) return;

      setActiveId(h.id);
      scrollingTo.current = h.id;

      if (scrollRoot) {
        // The delta form, rather than offsetTop: offsetTop is measured from the
        // nearest positioned ancestor, which need not be the scrollport, so it
        // is wrong the moment anything between them is relative.
        const delta =
          target.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top;
        scrollRoot.scrollTo({
          top: scrollRoot.scrollTop + delta - offset,
          behavior: "smooth",
        });
      } else {
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.scrollY - offset,
          behavior: "smooth",
        });
      }

      // Long enough for a smooth scroll to settle before the observer resumes.
      window.setTimeout(() => {
        scrollingTo.current = null;
      }, 700);
    },
    [contained, find, scrollRoot, offset],
  );

  // Nest ### under ## only when the document actually mixes levels; a flat list
  // of ### headings should not all sit indented.
  const minLevel = headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1;

  return { headings, minLevel, activeId, go };
}

/**
 * The outline as a thin tab that expands on hover, plus the floating button
 * below 900px.
 *
 * A fourth presentation of the same brain, and the one the 32 tool pages now
 * use. The card spent 448px of a roughly 1284px row on navigation that is
 * wanted intermittently; this spends 44px and overlays the rest, which is
 * where the document's extra width comes from.
 *
 * The collapsed tab is not merely a handle: it carries the current section and
 * the position in the document, so it answers "where am I?" while shut. That
 * comes from the IntersectionObserver useOutline already runs whether the
 * panel is open or not, so it costs nothing extra.
 *
 * The positioning contract that makes the panel work lives in the CSS module,
 * under "The hover tab". Read it before changing either element's overflow or
 * position.
 */
export function OutlineHover({ markdown, title = "Jump to section" }: Props) {
  const { headings, minLevel, activeId, go } = useOutline({ markdown });

  const mounted = useMounted();
  const [hover, dispatch] = useReducer(hoverReducer, CLOSED);
  const [sheetOpen, setSheetOpen] = useState(false);
  const tabRef = useRef<HTMLButtonElement | null>(null);

  /*
   * Hover intent. The delays are the whole reason this is not a bare
   * onMouseEnter: without the open delay the panel flashes as the pointer
   * crosses the tab on its way elsewhere, and without the close grace a
   * diagonal path from tab to panel loses it.
   *
   * Timers live here; the RULES are in outlineHover.ts, where they are tested
   * without a browser.
   */
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    enterTimer.current = null;
    leaveTimer.current = null;
  }, []);

  // A timer that fires after unmount would setState on a dead component.
  useEffect(() => clearTimers, [clearTimers]);

  const onEnter = () => {
    clearTimers();
    enterTimer.current = window.setTimeout(() => dispatch({ type: "enter" }), 120);
  };

  /*
   * `relatedTarget` is where the pointer WENT. When that is still inside the
   * shell the pointer has not left at all, it has only crossed between the
   * tab's own children, and closing on that is wrong.
   *
   * This is not hypothetical. mouseleave fires on the shell as the pointer
   * moves from the button onto one of the tick spans inside it, so every such
   * crossing scheduled a close. With the panel pinned open the reducer ignored
   * the resulting `leave`, but the timer was still churning, and an unpinned
   * panel would flicker shut as the pointer travelled across its own marks.
   *
   * Same `contains` guard onBlur uses below, for the same reason: both events
   * fire on internal transitions that are not departures.
   */
  const onLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    clearTimers();
    leaveTimer.current = window.setTimeout(() => dispatch({ type: "leave" }), 220);
  };

  // Escape closes a pinned panel and hands focus back, so a keyboard user is
  // never stranded inside it.
  useEffect(() => {
    if (!hover.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dispatch({ type: "dismiss" });
      tabRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hover.open]);

  // The sheet's own Escape and scroll lock, below 900px. Unchanged from the
  // card's behaviour, and scoped to `sheetOpen` so nothing is installed while
  // it is shut.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  // One heading is a title, not an outline — nothing to navigate between.
  if (headings.length < 2) return null;

  const tab = tabLabel(headings, activeId);

  return (
    <>
      {/*
        onFocus and onBlur on the SHELL rather than the tab: focus events
        bubble, so tabbing into a heading link inside the panel keeps it open,
        and the relatedTarget guard means it closes only when focus leaves the
        whole component rather than on every hop between links.
      */}
      <div
        className={`${styles.shell} ${styles.shellWrap}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={() => {
          clearTimers();
          dispatch({ type: "enter" });
        }}
        onBlur={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          dispatch({ type: "leave" });
        }}
      >
        <button
          ref={tabRef}
          type="button"
          className={styles.tab}
          aria-expanded={hover.open}
          aria-controls="outline-hover-panel"
          aria-label={title}
          onClick={() => {
            clearTimers();
            dispatch({ type: "toggle" });
          }}
        >
          {/* One line per section, the active one longer and darker. The
              accessible name carries the section and position, so a screen
              reader gets what the ticks show visually. */}
          {headings.map((h, i) => (
            <span
              key={h.id}
              className={`${styles.tick} ${i === tab.position - 1 ? styles.tickActive : ""}`}
            />
          ))}
          <span className="sr-only">
            {title}: {tab.label}, {tab.position} of {tab.total}
          </span>
        </button>

        {hover.open && (
          <div id="outline-hover-panel" className={styles.panel}>
            <p className={styles.panelTitle}>{title}</p>
            <div className={styles.panelList}>
              <OutlineList
                headings={headings}
                minLevel={minLevel}
                activeId={activeId}
                onPick={(h) => {
                  // Close before scrolling, so the panel is not animating away
                  // over the movement.
                  dispatch({ type: "dismiss" });
                  go(h);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/*
        The same floating button the card had, folded in so one component owns
        the whole responsive story. Portalled to <body> because a fixed child
        of the consumer's sticky wrapper would anchor to that wrapper rather
        than the viewport.
      */}
      {mounted &&
        createPortal(
          <div className={styles.floating}>
            {sheetOpen && (
              <>
                <div className={styles.scrim} onClick={() => setSheetOpen(false)} />
                <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
                  <div className={styles.sheetHead}>
                    <span className={styles.face} aria-hidden="true">
                      <ChatTeardropDots weight="fill" width={18} height={18} />
                    </span>
                    <span className={styles.headText}>
                      <b>Where to?</b>
                      <span>Pick a section and I&apos;ll take you there.</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      aria-label="Close"
                      className={styles.close}
                    >
                      <X width={16} height={16} />
                    </button>
                  </div>
                  <nav className={styles.sheetList}>
                    <OutlineList
                      headings={headings}
                      minLevel={minLevel}
                      activeId={activeId}
                      onPick={(h) => {
                        setSheetOpen(false);
                        go(h);
                      }}
                    />
                  </nav>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-label={sheetOpen ? "Close sections" : title}
              aria-expanded={sheetOpen}
              className={styles.fab}
            >
              <ArrowUp width={22} height={22} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * The outline as a plain column, for a scroll container that is not the page.
 *
 * A third presentation rather than a fourth component. The modal cannot use
 * either of the other two: the card assumes the page scrolls beneath it, and
 * the floating button portals to document.body, which would put it ON TOP of
 * the scrim it is supposed to be inside.
 *
 * What it deliberately does NOT do, all of which the modal owns instead:
 * no body scroll lock, no Escape handler, no portal.
 */
export function OutlineRail({
  markdown,
  scrollRoot,
  title = "Jump to section",
}: {
  markdown: string | null;
  /** The scrolling element. Null until the modal has mounted its body, which
   *  is why this must come from state rather than a ref. */
  scrollRoot: HTMLElement | null;
  title?: string;
}) {
  const { headings, minLevel, activeId, go } = useOutline({ markdown, scrollRoot });

  // Same rule as the card: one heading is a title, not an outline.
  if (headings.length < 2) return null;

  return (
    <nav className={styles.rail} aria-label={title}>
      <p className={styles.railTitle}>{title}</p>
      <div className={styles.railList}>
        <OutlineList
          headings={headings}
          minLevel={minLevel}
          activeId={activeId}
          onPick={go}
        />
      </div>
    </nav>
  );
}

/**
 * The links themselves, shared by the card, the sheet and the rail so there is
 * one indentation rule and one active style rather than three that drift.
 */
function OutlineList({
  headings,
  minLevel,
  activeId,
  onPick,
}: {
  headings: Heading[];
  minLevel: number;
  activeId: string | null;
  onPick: (h: Heading) => void;
}) {
  return (
    <>
      {headings.map((h) => {
        const active = h.id === activeId;
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onPick(h)}
            aria-current={active ? "location" : undefined}
            title={h.text}
            className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer truncate ${
              active
                ? "bg-(--j-purple) text-white font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            style={{ paddingLeft: `${12 + (h.level - minLevel) * 14}px` }}
          >
            {h.text}
          </button>
        );
      })}
    </>
  );
}
