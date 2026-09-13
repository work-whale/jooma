/*
 * The hover outline's two pure decisions, kept out of the component so they can
 * be tested without a browser.
 *
 * Hover intent is where grace-period bugs hide, and a browser test for a 220ms
 * timer is inherently flaky. A reducer over the events instead: the timers stay
 * in the component, the RULES live here.
 */

/** What the tab can be doing. `pinned` survives a pointer leaving, which is the
 *  whole touch and keyboard story: hover does not exist on a tablet, so a tap
 *  has to latch. */
export interface HoverState {
  open: boolean;
  pinned: boolean;
}

export type HoverEvent =
  /** Pointer entered the shell, or focus moved into it. */
  | { type: "enter" }
  /** Pointer left the shell, or focus left it entirely. */
  | { type: "leave" }
  /** The tab was clicked or activated from the keyboard. */
  | { type: "toggle" }
  /** Escape, or a heading was picked. */
  | { type: "dismiss" };

export const CLOSED: HoverState = { open: false, pinned: false };

/**
 * Next state for an event.
 *
 * The rule worth stating: a PINNED panel ignores `leave`. Without that, a
 * teacher who taps the tab on a tablet and then moves their finger loses the
 * panel immediately, which makes it unusable by touch.
 */
export function hoverReducer(state: HoverState, event: HoverEvent): HoverState {
  switch (event.type) {
    case "enter":
      return { ...state, open: true };
    case "leave":
      return state.pinned ? state : { ...state, open: false };
    case "toggle":
      // Pinning and unpinning in one control: a second activation puts it away
      // rather than leaving the teacher with a panel they cannot dismiss
      // without a pointer.
      return state.pinned ? CLOSED : { open: true, pinned: true };
    case "dismiss":
      return CLOSED;
  }
}

export interface TabLabel {
  /** The current section, truncated. Empty before anything is active. */
  label: string;
  /** 1-based position of the active heading, or 0 when there is none. */
  position: number;
  total: number;
}

/** Longer than this and the vertical tab runs past a short viewport. */
const MAX_LABEL = 24;

/**
 * What the collapsed tab says.
 *
 * A tab that showed nothing would be worse for orientation than the card it
 * replaces, so it answers "where am I?" while shut. activeId comes from the
 * IntersectionObserver that useOutline already runs, open or not.
 *
 * A null activeId is the state BEFORE the first scroll, and an id that is no
 * longer present is what an edit produces. Both fall back to the first heading
 * rather than to nothing, because a position of 0 of 11 reads as broken.
 */
export function tabLabel(
  headings: { id: string; text: string }[],
  activeId: string | null,
): TabLabel {
  const total = headings.length;
  if (total === 0) return { label: "", position: 0, total: 0 };

  const index = headings.findIndex((h) => h.id === activeId);
  const resolved = index === -1 ? 0 : index;
  const text = headings[resolved].text;

  return {
    label: text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1).trimEnd()}…` : text,
    position: resolved + 1,
    total,
  };
}
