import { test, expect } from "@playwright/test";
import { meterState, meterValue } from "@/app/lib/resource-meter";
import { V2_CATEGORIES, V2_TOOLS, toolSolid } from "@/app/lib/tools";
import { FOLDER_COLOURS, folderSwatch } from "@/app/lib/folders";

/*
 * The v4 look's two rules that are logic rather than CSS.
 *
 * 1. The resources meter is calm until it matters. While plenty is left it
 *    states the allowance ("1,000 a month") with no bar; below 40% it shows a
 *    bar and what is left; below 15% it is low and offers a top-up.
 * 2. Colour has meaning. Purple is only what a resource costs, orange is only
 *    picture slides, and tools are coloured by what they are for, from five
 *    category tokens.
 */

test.describe("meterState", () => {
  test("calm above 40%, watch down to 15%, low below", () => {
    expect(meterState(1000, 1000)).toBe("calm");
    expect(meterState(401, 1000)).toBe("calm");
    expect(meterState(400, 1000)).toBe("watch");
    expect(meterState(151, 1000)).toBe("watch");
    expect(meterState(150, 1000)).toBe("low");
    expect(meterState(0, 1000)).toBe("low");
  });

  test("an empty allowance is low, not a division by zero", () => {
    expect(meterState(0, 0)).toBe("low");
  });

  test("overspend is low, never negative", () => {
    expect(meterState(-20, 50)).toBe("low");
  });
});

test.describe("meterValue", () => {
  test("calm states the allowance and its period", () => {
    expect(meterValue({ left: 940, allowance: 1000, period: "month" })).toBe("1,000 a month");
    expect(meterValue({ left: 50, allowance: 50, period: "week" })).toBe("50 a week");
  });

  test("otherwise says what is left, floored at zero", () => {
    expect(meterValue({ left: 92, allowance: 1000, period: "month" })).toBe("92 left");
    expect(meterValue({ left: -4, allowance: 50, period: "week" })).toBe("0 left");
  });
});

test.describe("category colours", () => {
  const token = (id: string) => V2_CATEGORIES.find((c) => c.id === id)!.solid;

  test("five purpose colours, from tokens", () => {
    expect(token("slides")).toBe("var(--j-cat-make)");
    expect(token("planning")).toBe("var(--j-cat-make)");
    expect(token("resources")).toBe("var(--j-cat-pupil)");
    expect(token("assessment")).toBe("var(--j-cat-check)");
    expect(token("send")).toBe("var(--j-cat-support)");
    expect(token("communication")).toBe("var(--j-cat-adult)");
    expect(token("leadership")).toBe("var(--j-cat-adult)");
  });

  test("no tool is purple or orange: those mean resources and pictures", () => {
    for (const tool of V2_TOOLS) {
      const solid = toolSolid(tool);
      expect(solid, tool.href).not.toMatch(/purple|orange|res|pic|#5B2ED6|#C2551F/i);
    }
  });

  test("an unknown tool gets the neutral adult slate", () => {
    expect(toolSolid(undefined)).toBe("var(--j-cat-adult)");
  });
});

test.describe("folder colours", () => {
  // The keys are whitelisted by folder_colours() in the database; renaming one
  // would reject inserts. Only the values may move.
  test("keys stay in step with the database whitelist", () => {
    expect(FOLDER_COLOURS.map((c) => c.key)).toEqual([
      "violet", "blue", "green", "amber", "pink",
      "violet-deep", "blue-deep", "green-deep", "amber-deep", "pink-deep",
    ]);
  });

  test("every value is a token, never a literal hex", () => {
    for (const c of FOLDER_COLOURS) {
      for (const v of [c.tint, c.solid]) {
        if (v === "#fff") continue; // the white glyph on a deep folder
        expect(v, c.key).toMatch(/^var\(--j-[a-z0-9-]+\)$/);
      }
    }
  });

  test("blue, green and pink share the category tokens", () => {
    expect(folderSwatch("blue").solid).toBe("var(--j-cat-make)");
    expect(folderSwatch("green").solid).toBe("var(--j-cat-pupil)");
    expect(folderSwatch("pink").solid).toBe("var(--j-cat-support)");
    expect(folderSwatch("blue-deep").tint).toBe("var(--j-cat-make)");
  });

  test("amber is gold, not the orange that means pictures", () => {
    for (const key of ["amber", "amber-deep"]) {
      const s = folderSwatch(key);
      expect(`${s.tint} ${s.solid}`, key).not.toMatch(/orange|pic|#C2551F/i);
    }
  });

  test("an unknown key falls back to violet", () => {
    expect(folderSwatch("teal").key).toBe("violet");
  });
});
