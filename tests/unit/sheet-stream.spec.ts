import { test, expect } from "@playwright/test";
import { parsePartialJson } from "@/app/lib/sheets/stream";

/*
 * A sheet streams as one JSON object and the page fills in as it arrives, so
 * every prefix of a valid document has to read as the most it can.
 */

const full = JSON.stringify({
  title: "Volcanoes",
  sections: [{ title: "Facts", blocks: [{ type: "short", prompt: "Why do they erupt?", lines: 2, marks: 1 }] }],
  teacherNotes: [],
});

test.describe("parsePartialJson", () => {
  test("a complete document parses as itself", () => {
    expect(parsePartialJson(full)).toEqual(JSON.parse(full));
  });

  test("nothing usable yet is null", () => {
    expect(parsePartialJson("")).toBeNull();
    expect(parsePartialJson("   ")).toBeNull();
  });

  test("a value cut mid-string shows as far as it has got", () => {
    expect(parsePartialJson('{"title":"Volca')).toEqual({ title: "Volca" });
  });

  test("a key with no value yet is left out", () => {
    expect(parsePartialJson('{"title":"Volcanoes","sections"')).toEqual({ title: "Volcanoes" });
    expect(parsePartialJson('{"title":"Volcanoes","sections":')).toEqual({ title: "Volcanoes" });
    expect(parsePartialJson('{"ti')).toEqual({});
  });

  test("a number or true/false that may still be growing is left out", () => {
    expect(parsePartialJson('{"title":"V","marks":1')).toEqual({ title: "V" });
    expect(parsePartialJson('{"title":"V","working":tr')).toEqual({ title: "V" });
    expect(parsePartialJson('{"title":"V","marks":12,')).toEqual({ title: "V", marks: 12 });
  });

  test("never ends on half an escape", () => {
    expect(parsePartialJson('{"title":"Line\\')).toEqual({ title: "Line" });
    expect(parsePartialJson('{"title":"Caf\\u00')).toEqual({ title: "Caf" });
    expect(parsePartialJson('{"title":"a \\"quoted\\" w')).toEqual({ title: 'a "quoted" w' });
  });

  test("every prefix of a real document parses, and the blocks only ever grow", () => {
    let lastBlocks = 0;
    for (let i = 1; i <= full.length; i++) {
      const v = parsePartialJson(full.slice(0, i)) as { sections?: { blocks?: unknown[] }[] } | null;
      if (i > 1) expect(v).not.toBeNull();
      const blocks = v?.sections?.reduce((n, s) => n + (s.blocks?.length ?? 0), 0) ?? 0;
      expect(blocks).toBeGreaterThanOrEqual(lastBlocks);
      lastBlocks = blocks;
    }
  });
});
