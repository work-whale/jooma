import { test, expect } from "@playwright/test";
import {
  applyListOp,
  isListOp,
  listOpFocus,
  listSnapshot,
  normalizeQuizQuestion,
  normalizeStaffSlide,
  toListItems,
} from "@/app/lib/jo/list-ops";
import { joListResponseFormat } from "@/app/lib/jo/list-schema";
import type { ListOp } from "@/app/lib/jo/types";

/*
 * Jo's edits to a list document: a quiz's questions, a Staff Slides deck.
 * Items Jo writes are held to the same rules the generators hold the model to.
 */

const QUIZ = [
  { type: "single" as const, question: "What is 2 + 2?", options: ["3", "4", "5", "6"], answers: [1], explanation: "" },
  { type: "single" as const, question: "What is 3 x 3?", options: ["6", "8", "9", "12"], answers: [2], explanation: "" },
];

const DECK = [
  { type: "title" as const, title: "Feedback that works", presentationTitle: "Feedback that works", subtitle: "INSET day" },
  { type: "content" as const, title: "Why feedback matters", presentationTitle: "Feedback that works", body: "It closes the gap.", bullets: ["Timely", "Specific"] },
];

const op = <T extends ListOp>(o: T) => o;

test.describe("items Jo writes", () => {
  test("a question needs a stem, options and a right answer that is one of them", () => {
    expect(normalizeQuizQuestion({ type: "single", question: " Q? ", options: ["a", "b", "c", "d"], answers: [3], explanation: "" })).toEqual({ type: "single", question: "Q?", options: ["a", "b", "c", "d"], answers: [3], explanation: "" });
    expect(normalizeQuizQuestion({ type: "single", question: "Q?", options: ["a"], answers: [0], explanation: "" })).toBeNull();
    expect(normalizeQuizQuestion({ type: "single", question: "Q?", options: ["a", "b", "c", "d"], answers: [4], explanation: "" })).toBeNull();
    expect(normalizeQuizQuestion({ type: "single", question: "", options: ["a", "b", "c", "d"], answers: [0], explanation: "" })).toBeNull();
    // A question saved before question types still reads.
    expect(normalizeQuizQuestion({ question: "Q?", options: ["a", "b", "c", "d"], correctIndex: 2 })).toMatchObject({ type: "single", answers: [2] });
  });

  test("a slide keeps only filled fields, a known type, and the deck's title", () => {
    const slide = normalizeStaffSlide(
      { type: "content", title: "Try this", body: "Pair up.", bullets: ["One", ""], callout: { type: "try-this", text: "Swap books." }, quote: "", stat: "" },
      "Feedback that works",
    );
    expect(slide).toEqual({ type: "content", title: "Try this", presentationTitle: "Feedback that works", body: "Pair up.", bullets: ["One"], callout: { type: "try-this", text: "Swap books." } });
    expect(normalizeStaffSlide({ type: "poster", title: "x" }, "t")).toBeNull();
    expect(normalizeStaffSlide({ type: "content", title: "x", callout: null }, "t")).toEqual({ type: "content", title: "x", presentationTitle: "t" });
  });
});

test.describe("applyListOp", () => {
  test("replace, insert, delete and move, by the turn's ids", () => {
    const items = toListItems("quiz", QUIZ);
    expect(items.map((it) => it.id)).toEqual(["q1", "q2"]);

    const replaced = applyListOp("quiz", items, op({ op: "replaceItem", label: "x", itemId: "q1", item: { type: "single", question: "What is 1 + 1?", options: ["1", "2", "3", "4"], answers: [1], explanation: "" } }))!;
    expect(replaced.items[0]).toEqual({ id: "q1", value: { type: "single", question: "What is 1 + 1?", options: ["1", "2", "3", "4"], answers: [1], explanation: "" } });

    const inserted = applyListOp("quiz", items, op({ op: "insertItem", label: "x", afterItemId: "q1", item: { type: "single", question: "What is 5 - 1?", options: ["3", "4", "5", "6"], answers: [1], explanation: "" } }), "fixed")!;
    expect(inserted.items.map((it) => it.id)).toEqual(["q1", "fixed", "q2"]);
    expect(inserted.focus).toBe("fixed");

    expect(applyListOp("quiz", items, op({ op: "deleteItem", label: "x", itemId: "q2" }))!.items.map((it) => it.id)).toEqual(["q1"]);
    expect(applyListOp("quiz", items, op({ op: "moveItem", label: "x", itemId: "q2", afterItemId: "" }))!.items.map((it) => it.id)).toEqual(["q2", "q1"]);
  });

  test("a new slide takes the deck's title", () => {
    const items = toListItems("staffSlides", DECK);
    const added = applyListOp("staffSlides", items, op({ op: "insertItem", label: "x", afterItemId: "s2", item: { type: "quote", title: "In their words", quote: "Feedback is a gift.", quoteAuthor: "Anon" } }))!;
    expect(added.items[2].value).toMatchObject({ type: "quote", presentationTitle: "Feedback that works", quote: "Feedback is a gift." });
  });

  test("an op that does not fit does nothing", () => {
    const items = toListItems("quiz", QUIZ);
    expect(applyListOp("quiz", items, op({ op: "replaceItem", label: "x", itemId: "q9", item: QUIZ[0] }))).toBeNull();
    expect(applyListOp("quiz", items, op({ op: "replaceItem", label: "x", itemId: "q1", item: { type: "single", question: "Q", options: ["a"], answers: [0], explanation: "" } }))).toBeNull();
    expect(applyListOp("quiz", [items[0]], op({ op: "deleteItem", label: "x", itemId: "q1" }))).toBeNull();
    expect(applyListOp("quiz", items, op({ op: "moveItem", label: "x", itemId: "q1", afterItemId: "q9" }))).toBeNull();
  });

  test("focus and the snapshot", () => {
    const items = toListItems("staffSlides", DECK);
    expect(listOpFocus(items, op({ op: "deleteItem", label: "x", itemId: "s2" }))).toBe("s2");
    expect(listSnapshot("staffSlides", items).items[1]).toMatchObject({ id: "s2", number: 2, title: "Why feedback matters" });
    expect(isListOp({ op: "replaceItem", label: "x", itemId: "s1", item: {} })).toBe(true);
    expect(isListOp({ op: "replaceItem", label: "x", itemId: "s1" })).toBe(false);
  });

  test("each tool's answer is strict and carries its own item", () => {
    const quiz = JSON.stringify(joListResponseFormat("quiz"));
    const deck = JSON.stringify(joListResponseFormat("staffSlides"));
    expect(quiz).toContain('"answers"');
    expect(quiz).toContain('"truefalse"');
    expect(quiz).not.toContain('"correctIndex"');
    expect(quiz).not.toContain('"activityPrompt"');
    expect(deck).toContain('"activityPrompt"');
    expect(joListResponseFormat("quiz").json_schema.strict).toBe(true);
  });
});
