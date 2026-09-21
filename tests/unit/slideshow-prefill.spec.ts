import { test, expect } from "@playwright/test";
import { validatePrefill } from "@/app/lib/toolPrefill";
import { assistantToolFor, SLIDESHOW_YEARS } from "@/app/lib/assistant-tools";

/*
 * Jo routing a slides request to the REAL slideshow tool.
 *
 * Pure functions, so this needs no browser and no database. It runs under
 * Playwright only because that is the TypeScript runner this repo already has.
 *
 * ── The bug this exists for ──
 * `slideshow` used to be absent from the registry, because it is a deck LIST
 * rather than a form and the animated per-field fill had nothing to drive. In
 * its place sat `lesson-slideshow`: an older tool, hidden in tool_settings,
 * missing from the tools grid, and still live by URL. Every "make me slides"
 * request went there. Production has a teacher asking for "a slideshow from the
 * slideshow tool" and still being sent to the deprecated one, which is as clear
 * a statement of the problem as a test could write.
 *
 * So the first assertion below is the whole fix: the slug Jo can reach.
 */

test.describe("the slideshow tool Jo opens", () => {
  test("is the real one, and the deprecated one is gone", () => {
    // The keeper: /tools/slideshow, the deck list that leads to /editor/[id].
    expect(assistantToolFor("slideshow")).toBeDefined();

    // THE REGRESSION GUARD. If this ever resolves again, Jo can route teachers
    // back to a tool with no page, no API route and no grid entry.
    expect(assistantToolFor("lesson-slideshow")).toBeUndefined();
  });

  test("a topic alone is enough to open it", () => {
    // Everything else has a working default in the wizard. Requiring more would
    // throw away prefills a teacher would have been glad of, because
    // validatePrefill discards the whole payload when a required field is
    // missing and Jo then answers in chat instead of opening anything.
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: { topic: "The water cycle" },
    });

    expect(prefill).not.toBeNull();
    expect(prefill!.slug).toBe("slideshow");
    expect(prefill!.fields.topic).toBe("The water cycle");
  });

  test("without a topic there is nothing to build, so nothing opens", () => {
    expect(validatePrefill({ slug: "slideshow", fields: { year: "Year 5" } })).toBeNull();
  });

  test("carries the year, slide count and instructions through", () => {
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: {
        topic: "Ancient Egypt",
        year: "Year 5",
        slideCount: 10,
        additionalInstructions: "Focus on daily life rather than pharaohs.",
      },
    });

    expect(prefill!.fields.year).toBe("Year 5");
    expect(prefill!.fields.slideCount).toBe(10);
    expect(prefill!.fields.additionalInstructions).toContain("daily life");
  });

  test("uses the wizard's own year list, which is not YEAR_GROUPS", () => {
    // The two lists differ: this one offers "Adult learners" and has no
    // mixed-age handling. Prefilling from the wrong list would put a value in
    // that the <select> has no option for, and cleanFields drops it silently —
    // which reads to a teacher as the year group being ignored.
    expect(SLIDESHOW_YEARS).toContain("Adult learners");

    const prefill = validatePrefill({
      slug: "slideshow",
      fields: { topic: "Study skills", year: "Adult learners" },
    });
    expect(prefill!.fields.year).toBe("Adult learners");
  });

  test("a year the wizard cannot render is dropped, not passed through", () => {
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: { topic: "Fractions", year: "Year 14" },
    });

    // The topic still opens the tool; only the impossible year is discarded.
    expect(prefill).not.toBeNull();
    expect(prefill!.fields.year).toBeUndefined();
  });

  test("a near-miss year is matched leniently and stored canonically", () => {
    // "year 5" is the common model near-miss. cleanFields matches case- and
    // space-insensitively but only ever writes the canonical member, so the
    // <select> gets a value it actually has an option for.
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: { topic: "Volcanoes", year: "year 5" },
    });

    expect(prefill!.fields.year).toBe("Year 5");
  });

  test("a slide count outside the schema's range is dropped", () => {
    // The wizard defaults to 8 when nothing arrives, which is a better outcome
    // than seeding a control with a number it cannot display.
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: { topic: "Photosynthesis", slideCount: 200 },
    });

    expect(prefill).not.toBeNull();
    expect(prefill!.fields.slideCount).toBeUndefined();
  });

  test("does not carry curriculum or subject, which the wizard has no controls for", () => {
    // Deliberately not curriculumFields: applyDefaults only fills a curriculum
    // for tools that declare one, and a field the target cannot render would be
    // dropped anyway. This pins that the entry was not "fixed" by copying the
    // shared block in.
    const prefill = validatePrefill({
      slug: "slideshow",
      fields: {
        topic: "The Romans",
        curriculum: "2014 National Curriculum",
        subject: "History",
      },
    });

    expect(prefill!.fields.curriculum).toBeUndefined();
    expect(prefill!.fields.subject).toBeUndefined();
  });
});

test.describe("a tool the teacher picked", () => {
  test("is validated against ITS schema, not the one the model chose", () => {
    // What the route does when the pill is set: overwrite the slug, then
    // validate. tool_choice forces the CALL but not its arguments, so a model
    // told to open the slideshow can still name a different tool in the
    // payload. Overwriting is what makes the pill a guarantee rather than
    // another suggestion — and asking in prose has already been shown to fail.
    const modelSaid = {
      slug: "lesson-planner",
      fields: { topic: "The water cycle", subject: "Science" },
    };

    const forced = { ...modelSaid, slug: "slideshow" };
    const prefill = validatePrefill(forced);

    expect(prefill!.slug).toBe("slideshow");
    // `subject` is a lesson-planner field. The slideshow schema has no such
    // property, so the allow-list drops it rather than smuggling it into a
    // form that cannot show it.
    expect(prefill!.fields.subject).toBeUndefined();
    expect(prefill!.fields.topic).toBe("The water cycle");
  });

  test("still yields nothing when its required field cannot be met", () => {
    // Forcing a tool does not lower the bar. A prefill that would open an empty
    // form is worse than a chat reply, because it claims to have understood.
    expect(validatePrefill({ slug: "slideshow", fields: { year: "Year 3" } })).toBeNull();
  });
});
