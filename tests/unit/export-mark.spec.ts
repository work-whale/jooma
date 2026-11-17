import { test, expect } from "@playwright/test";
import { withExportMark, setExportMark, currentExportMark } from "@/app/lib/export-mark";

/*
 * The Jooma mark at export time (plan 2f). The plan in force sets the mark
 * when the account loads; every exporter appends it through withExportMark.
 *
 * Edge cases: no mark leaves the text byte for byte; a mark is added once,
 * never twice on a re-export of already-marked text; it goes after a trailing
 * page break, not before it; clearing the mark (an upgrade) stops it.
 */

test("no mark leaves the text unchanged", () => {
  expect(withExportMark("# Title\n\nBody", null)).toBe("# Title\n\nBody");
});

test("the mark is a last small line, added once", () => {
  const once = withExportMark("# Title\n\nBody\n", "Made with Jooma");
  expect(once).toBe("# Title\n\nBody\n\n*Made with Jooma*\n");
  expect(withExportMark(once, "Made with Jooma")).toBe(once);
});

test("the current mark follows the plan and can be cleared", () => {
  setExportMark("Made with Jooma");
  expect(currentExportMark()).toBe("Made with Jooma");
  setExportMark(null);
  expect(currentExportMark()).toBeNull();
});
