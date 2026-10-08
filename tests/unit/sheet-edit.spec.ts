import { test, expect } from "@playwright/test";
import {
  addSection,
  deleteBlock,
  deleteSection,
  duplicateBlock,
  insertBlock,
  moveBlock,
  moveSection,
  newBlock,
  updateBlock,
  updateSection,
} from "@/app/lib/sheets/edit";
import { normalizeBlock, normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import type { BlockType, SheetDoc } from "@/app/lib/sheets/types";

/*
 * The editor's operations, as pure functions over the sheet. Each returns a
 * new sheet and leaves the old one alone, which is what undo relies on.
 */

function sample(): SheetDoc {
  return normalizeDraft(
    {
      title: "Sample",
      sections: [
        { title: "One", blocks: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
        { title: "Two", blocks: [{ type: "text", text: "c" }] },
      ],
    },
    sheetContext("worksheet", { yearGroup: "Year 5", subject: "Maths" }),
  );
}

const texts = (doc: SheetDoc) => doc.sections.map((s) => s.blocks.map((b) => (b.type === "text" ? b.text : b.type)));

test.describe("sheet edits", () => {
  test("never change the sheet they were given", () => {
    const doc = sample();
    const before = JSON.stringify(doc);
    updateBlock(doc, 0, 0, { text: "changed" });
    moveBlock(doc, 0, 0, 1);
    deleteSection(doc, 1);
    expect(JSON.stringify(doc)).toBe(before);
  });

  test("move a block within a section, and across into the next", () => {
    const doc = sample();
    expect(texts(moveBlock(doc, 0, 0, 1))).toEqual([["b", "a"], ["c"]]);
    expect(texts(moveBlock(doc, 0, 1, 1))).toEqual([["a"], ["b", "c"]]);
    expect(texts(moveBlock(doc, 1, 0, -1))).toEqual([["a", "b", "c"], []]);
    // Off the very top or bottom of the sheet, nothing moves.
    expect(moveBlock(doc, 0, 0, -1)).toBe(doc);
    expect(moveBlock(doc, 1, 0, 1)).toBe(doc);
  });

  test("duplicate gives the copy its own id; delete and insert", () => {
    const doc = sample();
    const dup = duplicateBlock(doc, 0, 0);
    expect(texts(dup)).toEqual([["a", "a", "b"], ["c"]]);
    expect(dup.sections[0].blocks[1].id).not.toBe(dup.sections[0].blocks[0].id);
    expect(texts(deleteBlock(doc, 0, 1))).toEqual([["a"], ["c"]]);
    expect(texts(insertBlock(doc, 1, { id: "n", type: "text", text: "new" }, 0))).toEqual([["a", "b"], ["new", "c"]]);
  });

  test("sections: rename, reorder, delete, add", () => {
    const doc = sample();
    expect(updateSection(doc, 0, { title: "Warm up" }).sections[0].title).toBe("Warm up");
    expect(moveSection(doc, 0, 1).sections.map((s) => s.title)).toEqual(["Two", "One"]);
    expect(moveSection(doc, 1, 1)).toBe(doc);
    expect(deleteSection(doc, 0).sections.map((s) => s.title)).toEqual(["Two"]);
    const added = addSection(doc);
    expect(added.sections).toHaveLength(3);
    expect(added.sections[2].blocks[0].type).toBe("short");
  });

  test("every new block template is one the normaliser accepts unchanged", () => {
    const types: BlockType[] = ["text", "callout", "passage", "wordbank", "table", "mcq", "truefalse", "matching", "fillblanks", "short", "long", "calc", "order", "wordorder", "picture", "label"];
    for (const t of types) {
      const b = newBlock(t);
      expect(normalizeBlock(b, b.id), t).toEqual(b);
    }
  });
});
