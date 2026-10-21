import { test, expect } from "@playwright/test";
import { nextSentences } from "@/app/lib/jo/speech-chunks";

/*
 * Jo's reply, cut into sentences while it streams, so Jo can start speaking
 * before the reply is finished.
 */

test("a sentence still being written is held back", () => {
  expect(nextSentences("Sure, I'll make them harder. Then I'll add", 0)).toEqual({
    sentences: ["Sure, I'll make them harder."],
    upTo: 28,
  });
});

test("carries on from where the last call stopped", () => {
  const text = "Sure, I'll make them harder. Then I'll add a starter! Done";
  const first = nextSentences(text.slice(0, 40), 0);
  const second = nextSentences(text, first.upTo);
  expect(first.sentences).toEqual(["Sure, I'll make them harder."]);
  expect(second.sentences).toEqual(["Then I'll add a starter!"]);
});

test("a full stop at the very end waits for the next word", () => {
  // It could be "3." of "3.5", or "e.g." still arriving.
  expect(nextSentences("Question 3.", 0).sentences).toEqual([]);
});

test("abbreviations and decimals do not end a sentence", () => {
  const text = "Use simple tools, e.g. a ruler. Measure 3.5 cm with Mr. Smith. ";
  expect(nextSentences(text, 0).sentences).toEqual(["Use simple tools, e.g. a ruler.", "Measure 3.5 cm with Mr. Smith."]);
});

test("a finished reply flushes whatever is left", () => {
  const text = "I changed two questions. They now ask why";
  const partway = nextSentences(text, 0);
  expect(nextSentences(text, partway.upTo, true)).toEqual({ sentences: ["They now ask why"], upTo: text.length });
});

test("nothing new is nothing to say", () => {
  expect(nextSentences("Done.", 5, true)).toEqual({ sentences: [], upTo: 5 });
});
