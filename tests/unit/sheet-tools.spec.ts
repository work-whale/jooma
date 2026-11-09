import { test, expect } from "@playwright/test";
import { SHEET_TOOLS, SHEET_TOOL_PROFILES, isSheetTool, sheetToolForSlug, sheetToolProfile } from "@/app/lib/sheets/tools";
import { sheetContext } from "@/app/lib/sheets/context";

/*
 * The sheet tool registry (app/lib/sheets/tools.ts): the one place that says
 * what differs between the tools that make sheets. The API routes, Jo and the
 * picture route all trust it, so its own consistency is checked here.
 */

test.describe("which tools make sheets", () => {
  test("only registered tool names count, and nothing inherited from Object does", () => {
    for (const t of SHEET_TOOLS) expect(isSheetTool(t)).toBe(true);
    for (const v of ["", "lesson-planner", "Worksheet", "toString", "__proto__", undefined, null, 3, {}]) {
      expect(isSheetTool(v), String(v)).toBe(false);
    }
  });

  test("each tool has its own slug, and the slug leads back to the tool", () => {
    const slugs = SHEET_TOOLS.map((t) => SHEET_TOOL_PROFILES[t].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of SHEET_TOOLS) expect(sheetToolForSlug(sheetToolProfile(t).slug)).toBe(t);
    expect(sheetToolForSlug("quiz-generator")).toBeNull();
    expect(sheetToolForSlug("")).toBeNull();
  });

  test("a tool's default question mix is always something it is allowed to make", () => {
    for (const t of SHEET_TOOLS) {
      const p = sheetToolProfile(t);
      for (const k of p.defaultKinds) expect(p.allowedKinds, `${t}: ${k}`).toContain(k);
    }
  });

  test("every tool gives Jo a name, a label and some starters to offer", () => {
    for (const t of SHEET_TOOLS) {
      const p = sheetToolProfile(t);
      expect(p.joName.trim(), t).not.toBe("");
      expect(p.docLabel.trim(), t).not.toBe("");
      expect(p.joStarters.length, t).toBeGreaterThan(0);
      // The brand rules ban long dashes in anything a teacher reads.
      for (const s of p.joStarters) expect(s, t).not.toMatch(/[–—]/);
    }
  });
});

test.describe("what each tool starts a sheet with", () => {
  test("a comprehension says so in its subtitle and numbers its lines; a worksheet uses the subject", () => {
    const comp = sheetContext("comprehension", { yearGroup: "Year 4", subject: "English" });
    expect(comp.subtitle).toBe("Year 4 · Reading comprehension");
    expect(comp.design.lineNumbers).toBe(true);

    const ws = sheetContext("worksheet", { yearGroup: "Year 4", subject: "Maths" });
    expect(ws.subtitle).toBe("Year 4 · Maths");
    expect(ws.design.lineNumbers).toBe(false);
  });

  test("the comprehension's own passage leads only when the teacher gave one, and never on a worksheet", () => {
    expect(sheetContext("comprehension", { textSource: "own", ownText: "The fox ran." }).leadingSections).toHaveLength(1);
    expect(sheetContext("comprehension", { textSource: "own", ownText: "   " }).leadingSections).toBeUndefined();
    expect(sheetContext("comprehension", { textSource: "generate", ownText: "The fox ran." }).leadingSections).toBeUndefined();
    expect(sheetContext("worksheet", { textSource: "own", ownText: "The fox ran." }).leadingSections).toBeUndefined();
  });

  test("turning off the answer key only affects a comprehension", () => {
    expect(sheetContext("comprehension", { includeAnswerKey: false }).design.answers).toBe(false);
    expect(sheetContext("comprehension", {}).design.answers).toBe(true);
    expect(sheetContext("worksheet", { includeAnswerKey: false }).design.answers).toBe(true);
  });

  test("a worksheet type's design still applies over the year's default", () => {
    // The exam paper type drops the objective line.
    expect(sheetContext("worksheet", { template: "exam-paper" }).design.objective).toBe(false);
    expect(sheetContext("worksheet", { template: "classic" }).design.objective).toBe(true);
  });
});
