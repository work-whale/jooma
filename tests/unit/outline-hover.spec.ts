import { test, expect } from "@playwright/test";
import { CLOSED, hoverReducer, tabLabel } from "@/app/lib/outlineHover";

/*
 * The two pure decisions behind the hover outline.
 *
 * Neither needs a browser: one is a reducer, the other a lookup and a truncate.
 * The Playwright specs cover the screen; these cover the rules it rests on,
 * where a failure is unambiguous. A browser test for a 220ms grace period would
 * be flaky in a way these are not.
 */

test.describe("Hover intent", () => {
  test("a pointer entering opens, and leaving closes again", () => {
    const open = hoverReducer(CLOSED, { type: "enter" });
    expect(open.open).toBe(true);
    expect(open.pinned).toBe(false);

    expect(hoverReducer(open, { type: "leave" }).open).toBe(false);
  });

  test("a pinned panel ignores the pointer leaving", () => {
    // THE touch and keyboard rule. Hover does not exist on a tablet, so a tap
    // has to latch; without this, moving a finger away closes what was just
    // deliberately opened.
    const pinned = hoverReducer(CLOSED, { type: "toggle" });
    expect(pinned).toEqual({ open: true, pinned: true });

    expect(hoverReducer(pinned, { type: "leave" })).toEqual(pinned);
  });

  test("activating a second time puts a pinned panel away", () => {
    // Otherwise a keyboard or touch user can open it and has no way back.
    const pinned = hoverReducer(CLOSED, { type: "toggle" });
    expect(hoverReducer(pinned, { type: "toggle" })).toEqual(CLOSED);
  });

  test("dismissing clears the pin as well as the panel", () => {
    // Escape and picking a heading both mean "done", not "still pinned but
    // hidden", which would make the next hover behave strangely.
    const pinned = hoverReducer(CLOSED, { type: "toggle" });
    expect(hoverReducer(pinned, { type: "dismiss" })).toEqual(CLOSED);
  });

  test("entering a pinned panel leaves it pinned", () => {
    const pinned = hoverReducer(CLOSED, { type: "toggle" });
    expect(hoverReducer(pinned, { type: "enter" })).toEqual(pinned);
  });
});

test.describe("What the collapsed tab says", () => {
  const headings = [
    { id: "rivers", text: "Rivers" },
    { id: "erosion", text: "Erosion" },
    { id: "deposition", text: "Deposition" },
  ];

  test("names the active section and its position", () => {
    expect(tabLabel(headings, "erosion")).toEqual({
      label: "Erosion",
      position: 2,
      total: 3,
    });
  });

  test("falls back to the first heading before anything is active", () => {
    // activeId is null until the observer first fires. "0 of 3" would read as
    // broken, and the teacher is in fact at the top of the document.
    expect(tabLabel(headings, null)).toEqual({
      label: "Rivers",
      position: 1,
      total: 3,
    });
  });

  test("falls back when the active id no longer exists", () => {
    // What an edit produces: the outline re-derives from the new markdown, and
    // the id the observer last saw is gone.
    expect(tabLabel(headings, "a-heading-that-was-renamed")).toEqual({
      label: "Rivers",
      position: 1,
      total: 3,
    });
  });

  test("truncates a heading too long for the tab", () => {
    const long = [
      { id: "a", text: "Assessment opportunities across the whole unit" },
      { id: "b", text: "Second" },
    ];
    const { label } = tabLabel(long, "a");

    expect(label.endsWith("…")).toBe(true);
    expect(label.length).toBeLessThanOrEqual(24);
    // Still recognisable, rather than cut to nothing.
    expect(label.startsWith("Assessment")).toBe(true);
  });

  test("an empty document has nothing to say", () => {
    expect(tabLabel([], null)).toEqual({ label: "", position: 0, total: 0 });
  });
});
