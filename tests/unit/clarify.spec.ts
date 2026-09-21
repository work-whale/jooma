import { test, expect } from "@playwright/test";
import { validateClarify, validatePrefill, decodeBase64Utf8 } from "@/app/lib/toolPrefill";
import { assistantToolFor } from "@/app/lib/assistant-tools";

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

/*
 * "Open it as is" — the escape beside the chips.
 *
 * A teacher who was already clear has to be able to get past the question in
 * one click, taking whatever Jo understood and finishing the form themselves.
 * ClarifyChips decides whether to OFFER that by running the partial fields
 * through validatePrefill up front, which is what these pin.
 */
/*
 * Non-ASCII text surviving the round trip.
 *
 * The assistant route hands its decision back in a base64 HTTP header, encoded
 * server-side with Buffer.from(json, "utf8"). The client decoded it with bare
 * atob, which returns ONE CHARACTER PER BYTE — so the two bytes of "£" came
 * back as "Â£" and a letter brief read "Cost: Â£10 per student".
 *
 * Teachers write pound signs constantly (trip costs, fundraising), and the same
 * corruption hits accented names, curly quotes, em dashes and Welsh text.
 */
test.describe("UTF-8 through the header channel", () => {
  /** Exactly what app/api/assistant/route.ts does. */
  function encodeHeader(value: unknown): string {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  }

  test("a pound sign survives", () => {
    const brief = "Year 4 museum trip. Cost: £10 per student.";
    const decoded = JSON.parse(decodeBase64Utf8(encodeHeader({ content: brief })));

    expect(decoded.content).toBe(brief);
    // The exact corruption this guards against.
    expect(decoded.content).not.toContain("Â");
  });

  test("accents, curly quotes and dashes survive", () => {
    const messy = "Café trip — the children's “favourite” outing. Naïve café.";
    const decoded = JSON.parse(decodeBase64Utf8(encodeHeader({ content: messy })));
    expect(decoded.content).toBe(messy);
  });

  test("Welsh survives, since a Welsh school is a first-class case", () => {
    const welsh = "Rhannu gair yn seiniau. Cyfuno seiniau i ddarllen gair.";
    const decoded = JSON.parse(decodeBase64Utf8(encodeHeader({ content: welsh })));
    expect(decoded.content).toBe(welsh);
  });

  test("a whole prefill round-trips intact", () => {
    // The real shape, through the real validator, as the client does it.
    const prefill = {
      slug: "letter-writer",
      fields: {
        recipient: "parents",
        content: "Year 4 museum trip, 14 March. Cost: £10. Consent by 1 March.",
      },
    };

    const out = validatePrefill(JSON.parse(decodeBase64Utf8(encodeHeader(prefill))));
    expect(out).not.toBeNull();
    expect(out!.fields.content).toContain("£10");
    expect(out!.fields.content).not.toContain("Â£");
  });
});

test.describe("opening a tool without answering", () => {
  /** What ClarifyChips computes to decide whether to offer the escape. */
  function asIsFor(clarify: { slug: string; fields: Record<string, unknown> }) {
    return validatePrefill({ slug: clarify.slug, fields: clarify.fields });
  }

  test("is offered when what was understood is already enough", () => {
    // lesson-planner requires only subject and topic, and both are in `fields`.
    // The question is about the year group, which is optional — so a teacher
    // who does not care can leave now with a form that works.
    const clarify = validateClarify(base())!;
    const asIs = asIsFor(clarify);

    expect(asIs).not.toBeNull();
    expect(asIs!.fields.topic).toBe("The water cycle");
    // Unanswered, so the field is absent rather than guessed. The teacher
    // finishes it in the form.
    expect(asIs!.fields.yearGroup).toBeUndefined();
  });

  test("is withheld while a required field is still missing", () => {
    // worksheet-generator requires learningObjective, which carries its subject
    // matter. A question asked before that exists has nothing to open, and
    // validatePrefill discards the whole payload — so the button must be
    // disabled rather than looking live and silently doing nothing.
    const clarify = validateClarify({
      slug: "worksheet-generator",
      question: "Which year group is this for?",
      field: "yearGroup",
      options: [
        { label: "Year 4", value: "Year 4" },
        { label: "Year 5", value: "Year 5" },
      ],
      fields: { subject: "Maths" },
    })!;

    expect(asIsFor(clarify)).toBeNull();
  });

  test("names what is still missing, so the disabled state can explain itself", () => {
    // A button that looks live and does nothing is worse than one that says
    // why. ClarifyChips derives this list the same way.
    const clarify = validateClarify({
      slug: "worksheet-generator",
      question: "What should it practise?",
      field: "learningObjective",
      options: [
        { label: "Column addition", value: "Practise column addition" },
        { label: "Times tables", value: "Practise the 7 times table" },
      ],
      fields: { subject: "Maths" },
    })!;

    const tool = assistantToolFor(clarify.slug)!;
    const required = (tool.fields as { required?: string[] }).required ?? [];
    const missing = required.filter((f) => clarify.fields[f] === undefined);

    expect(missing).toContain("learningObjective");
  });

  test("answering the missing field makes it available", () => {
    // The other half: once the gather has what it needs, the escape leads
    // somewhere and the teacher can stop being asked.
    const answered = validatePrefill({
      slug: "worksheet-generator",
      fields: { subject: "Maths", learningObjective: "Practise column addition" },
    });

    expect(answered).not.toBeNull();
    expect(answered!.fields.learningObjective).toBe("Practise column addition");
  });
});
