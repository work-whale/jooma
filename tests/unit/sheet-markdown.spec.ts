import { test, expect } from "@playwright/test";
import { answerText, outputExcerpt, questionNumbers, sheetOutline, sheetToMarkdown } from "@/app/lib/sheets/markdown";
import { normalizeDraft, serializeSheet } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { extractHeadings } from "@/app/lib/headings";
import { buildSheetDocx } from "@/app/lib/sheets/docx";
import type { SheetDoc } from "@/app/lib/sheets/types";

/*
 * A sheet as text: Copy, the slideshow's "use a previous output", the outline
 * rail and the admin previews all read it this way.
 */

function sample(answers = true): SheetDoc {
  const doc = normalizeDraft(
    {
      title: "Fractions",
      objective: "I am learning to add fractions.",
      intro: { variant: "fact", label: "Did you know?", text: "Pizza is cut in fractions.", emoji: "🍕" },
      sections: [
        {
          title: "Warm up",
          emoji: "🔥",
          instructions: "Circle one.",
          blocks: [
            { type: "mcq", prompt: "What is 1/2 + 1/4?", options: ["3/4", "2/6"], answers: [0], marks: 1 },
            { type: "truefalse", prompt: "", statements: [{ text: "1/2 = 2/4", answer: true }, { text: "1/3 > 1/2", answer: false }], marks: 2 },
          ],
        },
        {
          title: "Problems",
          emoji: "",
          instructions: "",
          blocks: [
            { type: "matching", prompt: "Match.", left: ["half", "quarter"], right: ["1/4", "1/2"], pairs: [1, 0], marks: 2 },
            { type: "calc", prompt: "3/4 - 1/4", working: true, answer: "1/2", marks: 1 },
          ],
        },
      ],
      teacherNotes: [{ title: "Misconceptions", points: ["Adding denominators."] }],
    },
    sheetContext("worksheet", { yearGroup: "Year 5", subject: "Maths" }),
  );
  return { ...doc, design: { ...doc.design, answers } };
}

test.describe("sheet as text", () => {
  test("questions are numbered down the whole sheet, across sections", () => {
    const doc = sample();
    expect([...questionNumbers(doc).values()]).toEqual([1, 2, 3, 4]);
  });

  test("answers for each kind of question", () => {
    const [mcq, tf] = sample().sections[0].blocks;
    const [match, calc] = sample().sections[1].blocks;
    expect(answerText(mcq as never)).toBe("a) 3/4");
    expect(answerText(tf as never)).toBe("1. True  2. False");
    expect(answerText(match as never)).toBe("1b, 2a");
    expect(answerText(calc as never)).toBe("1/2");
  });

  test("Copy gives the sheet with its answers only when the answers page is on", () => {
    const md = sheetToMarkdown(sample(true));
    expect(md).toContain("# Fractions");
    expect(md).toContain("## Warm up");
    expect(md).toContain("**1.** What is 1/2 + 1/4? [1 mark]");
    expect(md).toContain("## Answers");
    expect(md).toContain("## Misconceptions");
    expect(sheetToMarkdown(sample(false))).not.toContain("## Answers");
  });

  test("the outline's ids are the ones the page gives its headings", () => {
    const outline = sheetOutline(sample());
    expect(extractHeadings(outline).map((h) => h.text)).toEqual(["Fractions", "Warm up", "Problems", "Answers"]);
    expect(extractHeadings(sheetOutline(sample(false))).map((h) => h.text)).not.toContain("Answers");
  });

  test("a preview of a cut-off stored sheet still reads as text", () => {
    const stored = serializeSheet(sample());
    const excerpt = outputExcerpt(stored.slice(0, 600));
    expect(excerpt.startsWith("Fractions · I am learning to add fractions.")).toBe(true);
    expect(excerpt).not.toContain("{");
    expect(outputExcerpt("# Plain markdown")).toBe("# Plain markdown");
  });

  test("builds a Word document", async () => {
    const blob = await buildSheetDocx(sample());
    expect(blob.size).toBeGreaterThan(2000);
  });
});
