import { test, expect } from "@playwright/test";
import {
  ASSISTANT_TOOLS,
  missingGatingFields,
  gatingQuestion,
} from "@/app/lib/assistant-tools";
import { validatePrefill } from "@/app/lib/toolPrefill";

/*
 * The gap between "the prefill validated" and "the form will generate".
 *
 * ── The bug this exists for ──
 * validatePrefill only enforces the schema's `required`, which is deliberately
 * narrow so a thin request still opens something (rule 1 in the registry
 * header). Each form's own canGenerate is stricter. Nothing compared the two,
 * so "Plan a Year 3 science lesson on the water cycle" satisfied
 * lesson-planner's required [subject, topic], prefilled, validated, and
 * navigated straight to a form whose Generate was disabled for want of a
 * learning objective — with no question asked, because from the model's side
 * nothing was missing.
 *
 * `gating` closes that gap, and these tests keep it closed.
 */

test.describe("every form-backed tool declares its gate", () => {
  test("all of them, so none can silently open unsubmittable", () => {
    // The audit that found this: 18 tools had gating and 17 did not, purely
    // because the first pass only covered the ones observed failing. A tool
    // without a gating list is not "fine", it is "unchecked".
    const missing = ASSISTANT_TOOLS.filter((t) => !t.gating).map((t) => t.slug);

    // slideshow is the one deliberate exception: it is a modal wizard rather
    // than a form, and its single required field is the whole gate.
    expect(missing).toEqual(["slideshow"]);
  });

  test("a gating field is always a real field on that tool", () => {
    // A typo here would be invisible: the field would read as permanently
    // missing, so Jo would ask about it forever and never open the tool.
    for (const tool of ASSISTANT_TOOLS) {
      if (!tool.gating) continue;
      const props = (tool.fields as { properties: Record<string, unknown> }).properties;
      for (const field of tool.gating) {
        expect(
          props[field],
          `${tool.slug}.gating names "${field}", which is not in its schema`,
        ).toBeDefined();
      }
    }
  });

  test("required is a subset of gating", () => {
    // Not because those fields could be missing — they cannot. validatePrefill
    // discards the whole payload when a `required` field is absent, so by the
    // time gating runs every one of them is guaranteed present and can never
    // be the gap Jo asks about.
    //
    // The subset rule exists so the lists stay readable as one statement of
    // "what this form needs". A gating list missing a required field invites
    // the next reader to conclude the form does not need it, which is how the
    // two lists drifted apart in the first place.
    for (const tool of ASSISTANT_TOOLS) {
      if (!tool.gating) continue;
      const required = (tool.fields as { required?: string[] }).required ?? [];
      for (const field of required) {
        expect(
          tool.gating,
          `${tool.slug} requires "${field}" but does not gate on it`,
        ).toContain(field);
      }
    }
  });

  test("a gating field the model cannot fill is never asked about", () => {
    // The pairing that makes the gather safe: a field with no fixed options
    // must either be already `required` (so it is guaranteed present) or be
    // one gatingQuestion declines to ask about. Otherwise Jo would stall on a
    // question whose chips would have to be invented — a pupil's name, a
    // teacher's assessment notes.
    for (const tool of ASSISTANT_TOOLS) {
      if (!tool.gating) continue;
      const required = new Set((tool.fields as { required?: string[] }).required ?? []);
      for (const field of tool.gating) {
        if (required.has(field)) continue;
        const spec = gatingQuestion(field);
        // Either it has real options, or nothing asks about it and the tool
        // simply opens. Both are fine; a third state would not be.
        expect(
          spec === null || spec.options !== null,
          `${tool.slug}.gating has "${field}" with a question but no options`,
        ).toBe(true);
      }
    }
  });
});

test.describe("missingGatingFields", () => {
  test("names the field that would leave Generate dead", () => {
    // A4, exactly as reported: subject and topic present, objective absent.
    const gaps = missingGatingFields("lesson-planner", {
      curriculum: "2014 National Curriculum",
      yearGroup: "Year 3",
      subject: "Science",
      topic: "Water Cycle",
    });

    expect(gaps).toEqual(["learningObjective"]);
  });

  test("catches the missing year group on a worksheet", () => {
    // A5: subject and learningObjective satisfied `required`, so the old code
    // navigated with no year group at all.
    const gaps = missingGatingFields("worksheet-generator", {
      curriculum: "Welsh Curriculum",
      subject: "Phonics",
      learningObjective: "Identify and use phonics sounds in words",
    });

    expect(gaps).toEqual(["yearGroup"]);
  });

  test("a complete prefill has no gaps", () => {
    const gaps = missingGatingFields("quiz-generator", {
      curriculum: "2014 National Curriculum",
      yearGroup: "Year 5",
      subject: "Maths",
      topic: "Fractions",
    });

    expect(gaps).toEqual([]);
  });

  test("an empty string counts as missing, not as filled", () => {
    // The form's canGenerate uses .trim(), so whitespace is not a value.
    const gaps = missingGatingFields("quiz-generator", {
      curriculum: "2014 National Curriculum",
      yearGroup: "Year 5",
      subject: "   ",
      topic: "Fractions",
    });

    expect(gaps).toContain("subject");
  });

  test("a tool with no gating list reports nothing", () => {
    // slideshow, and any tool added before its gate is audited: behaves
    // exactly as it did before rather than blocking.
    expect(missingGatingFields("slideshow", { topic: "The Romans" })).toEqual([]);
  });

  test("an unknown tool reports nothing rather than throwing", () => {
    expect(missingGatingFields("not-a-tool", {})).toEqual([]);
  });
});

test.describe("the Welsh phonics worksheet", () => {
  /*
   * A real production failure, kept as its own case because the log that
   * reported it was misleading and cost real debugging time.
   *
   * The teacher asked for "a phonics worksheet for a Welsh school", answered
   * three follow-up questions, and got the worksheet written into the chat
   * instead of the tool opening. The diagnostic said:
   *
   *   sent:    [yearGroup, curriculum, learningObjective]
   *   kept:    []
   *   dropped: [yearGroup, curriculum, learningObjective]
   *
   * which reads as "validation rejected every field". It had not. All three
   * were valid and would have been kept. `subject` was absent, `subject` is
   * required, and validatePrefill is all-or-nothing — so the whole payload was
   * discarded and `kept: []` was simply what the old logging printed for null.
   */

  test("every field the model sent was valid on its own", () => {
    const withSubject = validatePrefill({
      slug: "worksheet-generator",
      fields: {
        yearGroup: "Year 5",
        curriculum: "Welsh Curriculum",
        learningObjective: "Rhannu gair yn seiniau",
        subject: "English",
      },
    });

    expect(withSubject).not.toBeNull();
    // Note the Welsh curriculum survived: a Welsh school does not silently get
    // the English default.
    expect(withSubject!.fields.curriculum).toBe("Welsh Curriculum");
    expect(withSubject!.fields.yearGroup).toBe("Year 5");
  });

  test("but one missing required field discards all of them", () => {
    // The behaviour itself is correct and deliberate — a form that claims to be
    // filled and is not is worse than no form. This pins it so the reason is
    // never mistaken for over-strict field validation again.
    const asSent = validatePrefill({
      slug: "worksheet-generator",
      fields: {
        yearGroup: "Year 5",
        curriculum: "Welsh Curriculum",
        learningObjective: "Rhannu gair yn seiniau",
      },
    });

    expect(asSent).toBeNull();
  });

  test("subject is required by many tools, so it is worth inferring", () => {
    // The fix is upstream: the model is now told to infer the subject from the
    // topic rather than omit it. This counts the blast radius of not doing so.
    const needSubject = ASSISTANT_TOOLS.filter((t) =>
      ((t.fields as { required?: string[] }).required ?? []).includes("subject"),
    );

    expect(needSubject.length).toBeGreaterThanOrEqual(10);
  });
});

test.describe("gatingQuestion", () => {
  test("offers real year groups, which is what the form will accept", () => {
    const spec = gatingQuestion("yearGroup");
    expect(spec).not.toBeNull();
    expect(spec!.options).not.toBeNull();
    // Chips write straight into the field, so every option has to be a value
    // the <select> actually has. validateClarify enforces this too.
    for (const o of spec!.options!) {
      expect(o.value).toMatch(/^(Reception|Year \d+)$/);
    }
  });

  test("declines to invent an answer for free text", () => {
    // A learning objective or a letter's contents belong to the teacher. No
    // fixed options means the caller opens the tool instead of stalling on a
    // question whose chips would be guesses.
    expect(gatingQuestion("learningObjective")).toBeNull();
    expect(gatingQuestion("content")).toBeNull();
    expect(gatingQuestion("topic")).toBeNull();
  });
});
