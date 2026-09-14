import { test, expect } from "@playwright/test";
import { prefillFunctionDef } from "@/app/lib/assistant-tools";

/*
 * What the tool-selecting model is actually TOLD.
 *
 * The per-tool property schemas never travel: prefillFunctionDef declares
 * `fields` as an open object, so every `description` in ASSISTANT_TOOLS is
 * invisible to the model. Only the function description reaches it, which means
 * that one string is the entire channel for anything the model must know.
 *
 * That is a silent failure mode, and it has already bitten once: the curriculum
 * field's schema said "Default to '2014 National Curriculum'" and the model
 * never saw it, so prefills arrived with no curriculum and Generate stayed
 * disabled on every curriculum-based tool. These tests pin the instructions to
 * the place that reaches the model, so moving one back into a schema
 * description fails here rather than in a teacher's browser.
 */

/** Everything the model receives about how to fill fields. */
function guideText(): string {
  return prefillFunctionDef().function.description;
}

test.describe("what the model is told", () => {
  test("says to default the curriculum, and names the exact value", () => {
    const guide = guideText();
    expect(guide).toContain("Always set curriculum");
    // Character-for-character: cleanFields matches enums leniently but stores
    // canonically, and a value outside the enum is dropped entirely.
    expect(guide).toContain("2014 National Curriculum");
    // The exception matters as much as the default: a Welsh school must not
    // silently get the English curriculum.
    expect(guide).toMatch(/Scottish, Welsh, Northern Irish or Early Years/);
  });

  test("says to set the year group whenever the teacher names one", () => {
    const guide = guideText();
    expect(guide).toContain("Always set yearGroup");
    expect(guide).toContain("Year 6");
  });

  test("lists the enum values the model must copy exactly", () => {
    const guide = guideText();
    // A value not in these lists is discarded by validatePrefill and the
    // control renders empty, so the model has to see them verbatim.
    for (const year of ["Year 1", "Year 5", "Reception"]) {
      expect(guide).toContain(year);
    }
    for (const curriculum of ["2014 National Curriculum", "Welsh Curriculum"]) {
      expect(guide).toContain(curriculum);
    }
  });

  test("names every tool the assistant may open", () => {
    const guide = guideText();
    for (const slug of ["lesson-planner", "worksheet-generator", "quiz-generator"]) {
      expect(guide).toContain(slug);
    }
  });

  test("declares the shared fields in the schema, not only in prose", () => {
    // THE REGRESSION THIS GUARDS. Arguments are completed against the
    // parameters schema. While `fields` was an open object with no properties,
    // the model had no yearGroup slot to fill and never sent one, however many
    // times the instruction was restated in the description or system prompt.
    const fields = prefillFunctionDef().function.parameters.properties.fields as {
      properties?: Record<string, { enum?: readonly unknown[] }>;
      additionalProperties?: boolean;
    };

    expect(fields.properties?.yearGroup).toBeDefined();
    expect(fields.properties?.curriculum).toBeDefined();

    // With their legal values inline, so a near miss like "Y5" is never the
    // model's best guess: cleanFields discards anything outside the enum.
    expect(fields.properties?.yearGroup?.enum).toContain("Year 6");
    expect(fields.properties?.curriculum?.enum).toContain("2014 National Curriculum");

    // Still open: every tool has its own fields beyond these, and they must
    // keep flowing through.
    expect(fields.additionalProperties).toBe(true);
  });

  test("tells the model to WRITE a learning objective, not just extract one", () => {
    // The other declared fields are extracted from the sentence. This one has
    // to be composed: a teacher gives a topic, not an objective, and the model
    // was leaving it blank — which disables Generate on lesson-planner and
    // voids the prefill entirely on the two tools that require it.
    const fields = prefillFunctionDef().function.parameters.properties.fields as {
      properties?: Record<string, { description?: string }>;
    };

    const objective = fields.properties?.learningObjective;
    expect(objective).toBeDefined();
    expect(objective?.description).toMatch(/write one yourself|ALWAYS provide/i);
  });

  test("warns that near-miss year groups are rejected outright", () => {
    // The failure this guards: "Y5" and "5" are dropped by validatePrefill with
    // no error anywhere, so the teacher's stated year group silently vanishes
    // and Generate stays disabled. The model has to know the forms are exact.
    const guide = guideText();
    expect(guide).toContain("Year 5");
    expect(guide).toMatch(/character-for-character|exact/i);
  });
});
