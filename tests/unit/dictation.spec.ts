import { test, expect } from "@playwright/test";
import { mergeTranscripts, withDictation } from "@/app/lib/dictation";

/*
 * The microphone's result list, turned into one line of text.
 *
 * The regression: Chrome on Android reports growing copies of the same phrase,
 * and the composer wrote every copy into the box ("Hello Hello my Hello my
 * name is").
 */

test("growing copies from Chrome on Android become one phrase", () => {
  expect(mergeTranscripts(["Hello", "Hello my", "Hello my name", "Hello my name is"])).toBe("Hello my name is");
});

test("a later copy that differs only in case still replaces the earlier one", () => {
  expect(mergeTranscripts(["hello", "Hello my name is"])).toBe("Hello my name is");
});

test("a shorter repeat after the full phrase is dropped", () => {
  expect(mergeTranscripts(["Hello my name is", "Hello my"])).toBe("Hello my name is");
});

test("separate pieces from desktop Chrome are joined", () => {
  expect(mergeTranscripts(["Make the questions", " harder for year 5"])).toBe("Make the questions harder for year 5");
});

test("nothing heard is an empty string", () => {
  expect(mergeTranscripts([])).toBe("");
  expect(mergeTranscripts(["", "  "])).toBe("");
});

test("dictation goes after what was typed, with one space", () => {
  expect(withDictation("Please ", "add a starter")).toBe("Please add a starter");
  expect(withDictation("", "add a starter")).toBe("add a starter");
  expect(withDictation("Typed", "")).toBe("Typed");
});
