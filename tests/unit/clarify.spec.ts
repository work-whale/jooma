import { test, expect } from "@playwright/test";
import { validateClarify, validatePrefill } from "@/app/lib/toolPrefill";

/*
 * The clarifying question's validator.
 *
 * Pure functions, so this needs no browser and no database. It runs under
 * Playwright only because that is the TypeScript runner this repo already has.
 *
 * The point of these is the hostile-input posture: a clarify arrives from a
 * model, its chips write into a form, and a bad one is worse than none because
 * it stalls a teacher who was already clear.
 */

/** A valid clarify for a real tool, used as the base for each mutation below. */
function base() {
  return {
    slug: "lesson-planner",
    question: "Which year group is this for?",
    field: "yearGroup",
    options: [
      { label: "Year 4", value: "Year 4" },
      { label: "Year 5", value: "Year 5" },
    ],
    // Both of lesson-planner's required fields, so an answered question can
    // resolve to a complete prefill. A clarify may legitimately be missing one,
    // but then no answer completes it either.
    fields: { topic: "The water cycle", subject: "Science" },
  };
}

test.describe("validateClarify", () => {
  test("accepts a well formed question and keeps the parsed fields", () => {
    const result = validateClarify(base());
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("lesson-planner");
    expect(result!.field).toBe("yearGroup");
    expect(result!.options).toHaveLength(2);
    // What was already understood must survive, or answering would restart the
    // form rather than complete it.
    expect(result!.fields.topic).toBe("The water cycle");
  });

  test("rejects an unknown tool", () => {
    expect(validateClarify({ ...base(), slug: "not-a-tool" })).toBeNull();
  });

  test("rejects a field the tool does not have", () => {
    // Answering this would fill in nothing.
    expect(validateClarify({ ...base(), field: "notAField" })).toBeNull();
  });

  test("rejects a single option, because one choice is not a choice", () => {
    const one = { ...base(), options: [{ label: "Year 4", value: "Year 4" }] };
    expect(validateClarify(one)).toBeNull();
  });

  test("caps at three options", () => {
    const many = {
      ...base(),
      options: ["Year 3", "Year 4", "Year 5", "Year 6"].map((y) => ({ label: y, value: y })),
    };
    expect(validateClarify(many)!.options).toHaveLength(3);
  });

  test("drops duplicate options", () => {
    const dupes = {
      ...base(),
      options: [
        { label: "Year 4", value: "Year 4" },
        { label: "Year four", value: "Year 4" },
        { label: "Year 5", value: "Year 5" },
      ],
    };
    expect(validateClarify(dupes)!.options).toHaveLength(2);
  });

  test("rejects malformed input rather than throwing", () => {
    for (const bad of [null, undefined, "a string", 42, {}, { slug: "lesson-planner" }]) {
      expect(validateClarify(bad)).toBeNull();
    }
  });

  test("the curriculum is defaulted rather than left blank", () => {
    // Nobody says "using the 2014 National Curriculum" when they ask for a
    // Year 6 lesson, so the model omits it — correctly. But the curriculum
    // tools gate Generate on the field, so leaving it empty hands the teacher
    // a filled-in form they cannot submit. Three attempts to fix this in the
    // prompt all failed; the default belongs here.
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "The Earth's atmosphere" },
    });

    expect(prefill).not.toBeNull();
    expect(prefill!.fields.curriculum).toBe("2014 National Curriculum");
  });

  test("a curriculum the teacher named is never overwritten", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: {
        subject: "Science",
        topic: "Volcanoes",
        curriculum: "Welsh Curriculum",
      },
    });

    // A Welsh school must not silently get the English curriculum.
    expect(prefill!.fields.curriculum).toBe("Welsh Curriculum");
  });

  test("a tool without a curriculum field does not gain one", () => {
    const prefill = validatePrefill({
      slug: "letter-writer",
      fields: { recipient: "parents", content: "The trip to the museum" },
    });

    expect(prefill).not.toBeNull();
    expect(prefill!.fields.curriculum).toBeUndefined();
  });

  test("the default cannot rescue an otherwise empty prefill", () => {
    // Applied after validation, so a prefill with nothing usable in it still
    // returns null rather than opening a form containing only a curriculum.
    expect(validatePrefill({ slug: "lesson-planner", fields: {} })).toBeNull();
    expect(
      validatePrefill({ slug: "lesson-planner", fields: { notAField: "x" } }),
    ).toBeNull();
  });

  test("an answered question resolves to a valid prefill", () => {
    const clarify = validateClarify(base())!;
    const answer = clarify.options[0];

    // This is exactly what a chip does: merge the answer in, then validate.
    const prefill = validatePrefill({
      slug: clarify.slug,
      fields: { ...clarify.fields, [clarify.field]: answer.value },
    });

    expect(prefill).not.toBeNull();
    expect(prefill!.slug).toBe("lesson-planner");
    expect(prefill!.fields[clarify.field]).toBe(answer.value);
  });
});
