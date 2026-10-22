import { test, expect } from "@playwright/test";
import { stepLabel, typeLabel } from "@/app/lib/toolRunDisplay";

/*
 * The names admin usage (and a teacher's billing usage) show for Jo's spend,
 * which is stored under internal names: "jo" and "assistant", split into
 * steps "Main", "speak" and "live".
 */

test("Jo's spend is named for people, not by its internal slug", () => {
  expect(typeLabel("jo")).toBe("Ask Jo: editing");
  expect(typeLabel("assistant")).toBe("Ask Jo: chat");
});

test("Jo's steps are named by what they were", () => {
  expect(stepLabel("jo", "Main")).toBe("Edits");
  expect(stepLabel("jo", "speak")).toBe("Read aloud");
  expect(stepLabel("jo", "live")).toBe("Live calls");
  expect(stepLabel("assistant", "Main")).toBe("Answers");
  expect(stepLabel("assistant", "live")).toBe("Live calls");
});

test("other tools' steps keep their own names", () => {
  expect(stepLabel("generate-slideshow", "Audio script")).toBe("Audio script");
  expect(stepLabel("lesson-planner", "Main")).toBe("Main");
});
