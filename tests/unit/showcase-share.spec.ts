import { test, expect } from "@playwright/test";
import { showcaseTarget } from "@/app/lib/showcaseShare";

/*
 * Which Library rows can be offered for the homepage's "Made with Jooma" row,
 * and what id the offer is made against. A deck is offered by its
 * presentation, everything else by its run.
 */

test.describe("offering a Library row for the homepage", () => {
  test("a deck is offered by its presentation, not its run", () => {
    expect(
      showcaseTarget({
        id: "run-1",
        tool_slug: "slideshow",
        input: { presentationId: "pres-1" },
      }),
    ).toEqual({ kind: "slides", resourceId: "pres-1" });
  });

  test("a deck with no presentation has nothing to offer", () => {
    expect(
      showcaseTarget({ id: "run-1", tool_slug: "slideshow", input: {} }),
    ).toBeNull();
  });

  test("a comprehension and a worksheet are offered by their run", () => {
    expect(
      showcaseTarget({
        id: "run-2",
        tool_slug: "comprehension-generator",
        input: {},
      }),
    ).toEqual({
      kind: "comprehension",
      resourceId: "run-2",
    });
    expect(
      showcaseTarget({
        id: "run-3",
        tool_slug: "worksheet-generator",
        input: {},
      }),
    ).toEqual({
      kind: "worksheet",
      resourceId: "run-3",
    });
  });

  test("other tools cannot go on the homepage yet", () => {
    expect(
      showcaseTarget({ id: "run-4", tool_slug: "lesson-planner", input: {} }),
    ).toBeNull();
  });
});
