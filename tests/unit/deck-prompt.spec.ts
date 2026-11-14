import { test, expect } from "@playwright/test";
import { buildPrompt, schemaFor } from "@/app/lib/deck-prompt";

/*
 * The pupil Slides deck is the most used tool. Batch 6 adds staff and
 * assembly decks to the same engine, and they must not change a pupil
 * deck's prompt or schema by a single byte. These snapshots were taken from
 * the code as it stood before batch 6 (moved verbatim out of
 * slideshow-pipeline.ts) and must never be updated for a staff change.
 */

const PUPIL_BODIES = {
  plain: { topic: "The water cycle" },
  full: {
    topic: "Volcanoes",
    year: "Year 5",
    readingLevel: "Year 4",
    slideCount: 10,
    additionalInstructions: "Include a local example",
    includeObjectives: true,
    includeVocab: true,
    vocabulary: ["magma", "lava", "crater"],
    themeId: "paper",
    resourceText: "Volcanoes form where plates meet.",
    resourceSource: "notes.pdf",
  },
  video: { topic: "Forces", slideCount: 3, youtubeVideoId: "abc123", youtubeVideoTitle: "Forces explained", youtubeNote: "at the end" },
  tiny: { topic: "Fractions", slideCount: 1 },
};

for (const [name, body] of Object.entries(PUPIL_BODIES)) {
  test(`the pupil deck prompt is unchanged: ${name}`, () => {
    expect(buildPrompt(body)).toMatchSnapshot(`pupil-prompt-${name}.txt`);
  });
  test(`the pupil deck schema is unchanged: ${name}`, () => {
    expect(JSON.stringify(schemaFor(body), null, 2)).toMatchSnapshot(`pupil-schema-${name}.json`);
  });
}
