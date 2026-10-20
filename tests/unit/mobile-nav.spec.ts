import { test, expect } from "@playwright/test";
import { isNavActive } from "@/app/lib/navActive";
import { nextFocusIndex } from "@/app/lib/useFocusTrap";

/*
 * The two pure pieces of the phone navigation.
 *
 * isNavActive decides which item is lit in the rail and the phone drawer. It
 * moved out of SideNavV2 unchanged; these pin the behaviour it had there.
 *
 * nextFocusIndex is where Tab lands inside the drawer, the menus and the
 * modals: it has to wrap at both ends, or focus escapes to the page behind.
 */

test.describe("isNavActive", () => {
  test("Today is lit on /dashboard only, never as a prefix", () => {
    expect(isNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavActive("/dashboard", "/dashboard/anything")).toBe(false);
    expect(isNavActive("/dashboard", "/tools")).toBe(false);
  });

  test("Make stays lit on a tool page", () => {
    expect(isNavActive("/tools", "/tools")).toBe(true);
    expect(isNavActive("/tools", "/tools/worksheet-generator")).toBe(true);
  });

  test("a shared prefix is not a match", () => {
    // /folders-archive is not inside /folders.
    expect(isNavActive("/folders", "/folders-archive")).toBe(false);
    expect(isNavActive("/assistant", "/assistant/abc123")).toBe(true);
  });
});

test.describe("nextFocusIndex", () => {
  test("Tab walks forward and wraps from the last to the first", () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
  });

  test("Shift+Tab walks back and wraps from the first to the last", () => {
    expect(nextFocusIndex(2, 3, true)).toBe(1);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
  });

  test("focus outside the container comes back in at the matching end", () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
  });

  test("nothing focusable means nowhere to go", () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});
