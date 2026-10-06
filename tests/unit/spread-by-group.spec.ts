import { test, expect } from "@playwright/test";
import { spreadByGroup } from "@/app/lib/landing/spread-by-group";
import { V2_TOOLS } from "@/app/lib/tools";

/*
 * The hero marquee's order: random, every tool once, and no two tiles of one
 * colour (category) side by side, including across the loop's seam.
 */

/** A seeded generator, so a failure can be replayed. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test.describe("spreading the marquee by category", () => {
  test("keeps every tool, once", () => {
    const out = spreadByGroup(V2_TOOLS, (t) => t.category, seeded(1));
    expect(out.map((t) => t.href).sort()).toEqual(V2_TOOLS.map((t) => t.href).sort());
  });

  test("never puts two of one category side by side, seam included", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const out = spreadByGroup(V2_TOOLS, (t) => t.category, seeded(seed));
      for (let i = 0; i < out.length; i++) {
        const next = out[(i + 1) % out.length];
        expect(out[i].category, `seed ${seed}, position ${i}`).not.toBe(next.category);
      }
    }
  });

  test("is not the same order every time", () => {
    const a = spreadByGroup(V2_TOOLS, (t) => t.category, seeded(1)).map((t) => t.href);
    const b = spreadByGroup(V2_TOOLS, (t) => t.category, seeded(2)).map((t) => t.href);
    expect(a).not.toEqual(b);
  });

  test("does its best, without hanging, when one group cannot be spread", () => {
    const items = ["a", "a", "a", "b"];
    expect(spreadByGroup(items, (x) => x, seeded(3)).sort()).toEqual(["a", "a", "a", "b"]);
  });
});
