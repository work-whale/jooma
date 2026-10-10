import { test, expect } from "@playwright/test";
import {
  applyMdOp,
  headingIndex,
  isMdOp,
  markdownSnapshot,
  mdOpFocus,
  parseMarkdownDoc,
  serializeMarkdownDoc,
} from "@/app/lib/jo/md-ops";
import { readJoProgress } from "@/app/lib/jo/progress";
import { joMarkdownResponseFormat } from "@/app/lib/jo/md-schema";
import type { MdOp } from "@/app/lib/jo/types";

/*
 * Jo's edits to a text tool's document. The document is read as heading
 * sections; an op changes only the section it names, and a document Jo does
 * not touch comes back byte for byte.
 */

const PLAN = `Year 4 Science: Habitats

## Learning objective
Identify how animals are suited to where they live.

## Starter (10 minutes)
Show pictures of a desert, an ocean and a forest. Ask pupils to sort the animals.

## Main activity
- Pupils research one habitat
- They make a poster

| Habitat | Animal |
| --- | --- |
| Desert | Camel |

\`\`\`
## not a heading, inside a fence
\`\`\`

## Plenary
Exit ticket: name one adaptation.`;

const op = <T extends MdOp>(o: T) => o;

test.describe("reading a document as sections", () => {
  test("splitting and joining is exact, whatever the document holds", () => {
    for (const md of [PLAN, "", "Just a paragraph.", "# Only a heading", "## A\n\n\n## B\ntrailing\n", "Intro\n\n### Deep\ntext"]) {
      expect(serializeMarkdownDoc(parseMarkdownDoc(md))).toBe(md);
    }
  });

  test("a heading inside a code fence is not a section", () => {
    const doc = parseMarkdownDoc(PLAN);
    expect(markdownSnapshot(doc).sections.map((s) => s.heading)).toEqual(["", "Learning objective", "Starter (10 minutes)", "Main activity", "Plenary"]);
  });

  test("the snapshot gives each section its id, level and text", () => {
    const snap = markdownSnapshot(parseMarkdownDoc(PLAN));
    expect(snap.sections[2]).toEqual({ id: "s2", level: 2, heading: "Starter (10 minutes)", markdown: "Show pictures of a desert, an ocean and a forest. Ask pupils to sort the animals." });
    expect(snap.sections[0]).toMatchObject({ id: "s0", level: 0, heading: "", markdown: "Year 4 Science: Habitats" });
  });
});

test.describe("applyMdOp", () => {
  test("replaceSection changes only that section, and can rename it", () => {
    const doc = parseMarkdownDoc(PLAN);
    const out = serializeMarkdownDoc(applyMdOp(doc, op({ op: "replaceSection", label: "x", sectionId: "s2", heading: "Starter (5 minutes)", markdown: "Show one picture. Ask: who lives here?" }))!.doc);
    expect(out).toContain("## Starter (5 minutes)\n\nShow one picture. Ask: who lives here?\n\n## Main activity");
    expect(out.replace(/## Starter[\s\S]*?## Main activity/, "")).toBe(PLAN.replace(/## Starter[\s\S]*?## Main activity/, ""));
  });

  test("insertSection lands after the named section with a heading of its level", () => {
    const doc = parseMarkdownDoc(PLAN);
    const applied = applyMdOp(doc, op({ op: "insertSection", label: "x", afterSectionId: "s3", level: 2, heading: "Differentiation", markdown: "- Word bank for lower ability" }))!;
    const out = serializeMarkdownDoc(applied.doc);
    expect(out).toMatch(/```\n\n## Differentiation\n\n- Word bank for lower ability\n\n## Plenary/);
    expect(applied.focus).toBeTruthy();
    expect(headingIndex(applied.doc, applied.focus!)).toBe(3);
  });

  test("insertSection at the end, and a new id that stays the same across frames", () => {
    const doc = parseMarkdownDoc(PLAN);
    const a = applyMdOp(doc, op({ op: "insertSection", label: "x", afterSectionId: "s4", level: 2, heading: "Homework", markdown: "Find one animal at home." }), 0.5, "fixed")!;
    expect(a.focus).toBe("fixed");
    expect(serializeMarkdownDoc(a.doc).endsWith("## Homework\n\nFind one ani")).toBe(true);
  });

  test("editText changes one phrase, in the body or the heading", () => {
    const doc = parseMarkdownDoc(PLAN);
    const body = serializeMarkdownDoc(applyMdOp(doc, op({ op: "editText", label: "x", sectionId: "s4", find: "name one adaptation", replace: "draw one adaptation" }))!.doc);
    expect(body).toBe(PLAN.replace("name one adaptation", "draw one adaptation"));
    const heading = serializeMarkdownDoc(applyMdOp(doc, op({ op: "editText", label: "x", sectionId: "s2", find: "10 minutes", replace: "8 minutes" }))!.doc);
    expect(heading).toBe(PLAN.replace("10 minutes", "8 minutes"));
  });

  test("deleteSection removes it; the opening text empties instead", () => {
    const doc = parseMarkdownDoc(PLAN);
    expect(serializeMarkdownDoc(applyMdOp(doc, op({ op: "deleteSection", label: "x", sectionId: "s4" }))!.doc)).not.toContain("Plenary");
    expect(serializeMarkdownDoc(applyMdOp(doc, op({ op: "deleteSection", label: "x", sectionId: "s0" }))!.doc).startsWith("## Learning objective")).toBe(true);
  });

  test("ids hold through a turn: an op after an insert still finds its section", () => {
    let doc = parseMarkdownDoc(PLAN);
    doc = applyMdOp(doc, op({ op: "insertSection", label: "x", afterSectionId: "s1", level: 2, heading: "Vocabulary", markdown: "habitat, adaptation" }))!.doc;
    doc = applyMdOp(doc, op({ op: "editText", label: "x", sectionId: "s4", find: "Exit ticket", replace: "Quick quiz" }))!.doc;
    const out = serializeMarkdownDoc(doc);
    expect(out).toContain("## Plenary\nQuick quiz: name one adaptation.");
    expect(out).toContain("## Vocabulary");
  });

  test("an op that does not fit does nothing", () => {
    const doc = parseMarkdownDoc(PLAN);
    expect(applyMdOp(doc, op({ op: "editText", label: "x", sectionId: "s4", find: "not in the text", replace: "y" }))).toBeNull();
    expect(applyMdOp(doc, op({ op: "replaceSection", label: "x", sectionId: "s9", heading: "", markdown: "x" }))).toBeNull();
    expect(applyMdOp(doc, op({ op: "replaceSection", label: "x", sectionId: "s2", heading: "", markdown: "  " }))).toBeNull();
    expect(applyMdOp(doc, op({ op: "insertSection", label: "x", afterSectionId: "s9", level: 2, heading: "x", markdown: "y" }))).toBeNull();
  });

  test("focus points at the section an op names, and the page finds it by heading", () => {
    const doc = parseMarkdownDoc(PLAN);
    expect(mdOpFocus(doc, op({ op: "deleteSection", label: "x", sectionId: "s3" }))).toBe("s3");
    expect(headingIndex(doc, "s0")).toBe(-1);
    expect(headingIndex(doc, "s3")).toBe(2);
  });
});

test.describe("the text tool answer", () => {
  test("is strict, ordered reply first, and only whole known ops play", () => {
    const rf = joMarkdownResponseFormat();
    expect(rf.json_schema.strict).toBe(true);
    expect(Object.keys((rf.json_schema.schema as { properties: object }).properties)).toEqual(["reply", "clarify", "ops", "summary"]);
    expect(isMdOp({ op: "editText", label: "x", sectionId: "s1", find: "a", replace: "b" })).toBe(true);
    expect(isMdOp({ op: "insertSection", label: "x", afterSectionId: "", heading: "h", markdown: "m" })).toBe(false);
    const answer = JSON.stringify({ reply: "Sure.", clarify: null, ops: [{ op: "deleteSection", label: "Removing the plenary", sectionId: "s4" }], summary: "Gone." });
    expect(readJoProgress(answer, isMdOp, true).ops).toHaveLength(1);
  });
});
