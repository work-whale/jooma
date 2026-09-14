import { test, expect } from "@playwright/test";
import {
  buildFillPlan,
  instantPlan,
  TOTAL_CAP_MS,
  CHARS_PER_TICK,
} from "@/app/lib/toolFillPlan";
import { validatePrefill } from "@/app/lib/toolPrefill";

/*
 * The fill sequence Jo types into a form.
 *
 * Pure functions, so this needs no browser and no database. It runs under
 * Playwright only because that is the TypeScript runner this repo already has,
 * the same as clarify.spec.ts.
 *
 * Two rules carry the weight here. Order comes from the tool's schema, because
 * that is what makes the fill look like someone working down the form. And only
 * unconstrained strings type, because every other control renders a partial
 * value as nothing at all.
 */

/** Every field name a form could register a setter for. */
function allFields(...names: string[]): Set<string> {
  return new Set(names);
}

test.describe("buildFillPlan", () => {
  test("orders steps by the tool's schema, not by the fields object", () => {
    // Deliberately supplied in an order that does not match the schema.
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: {
        topic: "The water cycle",
        yearGroup: "Year 4",
        subject: "Science",
        curriculum: "2014 National Curriculum",
      },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("curriculum", "yearGroup", "subject", "topic"),
    )!;

    // curriculumFields is spread first in the registry, which is also what the
    // form renders first.
    expect(plan.steps.map((s) => s.field)).toEqual([
      "curriculum",
      "yearGroup",
      "subject",
      "topic",
    ]);
  });

  test("only free text types; enums and numbers land", () => {
    const prefill = validatePrefill({
      slug: "quiz-generator",
      fields: {
        curriculum: "2014 National Curriculum",
        yearGroup: "Year 6",
        subject: "Maths",
        topic: "Multiplication",
        numQuestions: 12,
      },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("curriculum", "yearGroup", "subject", "topic", "numQuestions"),
    )!;
    const mode = (field: string) => plan.steps.find((s) => s.field === field)!.mode;

    // A <select> shows nothing for "Yea", so typing into one looks broken.
    expect(mode("curriculum")).toBe("land");
    expect(mode("yearGroup")).toBe("land");
    // A stepper has no partial number worth showing.
    expect(mode("numQuestions")).toBe("land");
    // These are the ones a teacher would actually watch being typed.
    expect(mode("subject")).toBe("type");
    expect(mode("topic")).toBe("type");
  });

  test("an array field lands as one step", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: {
        subject: "Science",
        topic: "The water cycle",
        differentiate: "yes",
        differentiationLevels: ["WTS", "GDS"],
      },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("subject", "topic", "differentiate", "differentiationLevels"),
    )!;
    const levels = plan.steps.find((s) => s.field === "differentiationLevels")!;

    expect(levels.mode).toBe("land");
    expect(levels.value).toEqual(["WTS", "GDS"]);
  });

  test("skips fields the form registered no setter for", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "The water cycle", outputDetail: "detailed" },
    })!;

    // A form that never wired up outputDetail.
    const plan = buildFillPlan(prefill, allFields("subject", "topic"))!;

    expect(plan.steps.map((s) => s.field)).toEqual(["subject", "topic"]);
  });

  test("skips fields the assistant did not fill", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "The water cycle" },
    })!;

    // The form can set yearGroup, but Jo had nothing to put there. Clearing it
    // is useToolLaunch's job and happens instantly, so it gets no step.
    const plan = buildFillPlan(
      prefill,
      allFields("curriculum", "yearGroup", "subject", "topic"),
    )!;

    expect(plan.steps.map((s) => s.field)).toEqual(["subject", "topic"]);
  });

  test("stays within the total cap by speeding up", () => {
    // At the base rate this one field alone would run well past the ceiling.
    const long = "Identify and describe the stages of the water cycle. ".repeat(11);
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "Water", learningObjective: long },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("subject", "topic", "learningObjective"),
    )!;

    expect(plan.durationMs).toBeLessThanOrEqual(TOTAL_CAP_MS);
    // Sped up rather than truncated: the teacher still sees the whole value.
    expect(plan.steps.every((s) => s.charsPerTick >= CHARS_PER_TICK)).toBe(true);
    const objective = plan.steps.find((s) => s.field === "learningObjective")!;
    expect(String(objective.value).length).toBeGreaterThan(400);
  });

  test("a short prefill keeps the base typing rate", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "Rocks" },
    })!;

    const plan = buildFillPlan(prefill, allFields("subject", "topic"))!;

    expect(plan.steps.every((s) => s.charsPerTick === CHARS_PER_TICK)).toBe(true);
    expect(plan.durationMs).toBeLessThanOrEqual(TOTAL_CAP_MS);
  });

  test("labels name the field, never the schema description", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: {
        subject: "Science",
        topic: "The nitrogen cycle",
        yearGroup: "Year 5",
      },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("subject", "topic", "yearGroup"),
    )!;
    const label = (field: string) => plan.steps.find((s) => s.field === field)!.label;

    expect(label("subject")).toBe("Subject");
    expect(label("topic")).toBe("Topic");
    expect(label("yearGroup")).toBe("Year group");

    // The regression: descriptions are written for a model and contain
    // abbreviations, so truncating one at "the first sentence" cut
    // "Curriculum subject, e.g. 'Science'" down to "Curriculum subject, e.g"
    // and printed that on screen.
    for (const step of plan.steps) {
      expect(step.label).not.toContain("e.g");
      expect(step.label).not.toContain("\n");
      expect(step.label.length).toBeLessThanOrEqual(42);
    }
  });

  test("returns null for an unknown tool", () => {
    // validatePrefill would never produce this, but the plan builder must not
    // throw if one ever reaches it.
    const plan = buildFillPlan(
      { slug: "not-a-tool", fields: { topic: "x" } },
      allFields("topic"),
    );
    expect(plan).toBeNull();
  });

  test("returns null when nothing can be filled", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "The water cycle" },
    })!;

    // A form with no setters in common with the prefill.
    expect(buildFillPlan(prefill, allFields("somethingElse"))).toBeNull();
  });
});

test.describe("instantPlan", () => {
  test("lands every field and creates no duration", () => {
    const prefill = validatePrefill({
      slug: "lesson-planner",
      fields: { subject: "Science", topic: "The water cycle", yearGroup: "Year 4" },
    })!;

    const plan = buildFillPlan(
      prefill,
      allFields("subject", "topic", "yearGroup"),
    )!;
    const instant = instantPlan(plan);

    // Reduced motion still fills and still reports, but nothing animates.
    expect(instant.steps).toHaveLength(plan.steps.length);
    expect(instant.steps.every((s) => s.mode === "land")).toBe(true);
    expect(instant.durationMs).toBe(0);
    // The values are untouched: this changes the delivery, not the result.
    expect(instant.steps.map((s) => s.value)).toEqual(plan.steps.map((s) => s.value));
  });
});
