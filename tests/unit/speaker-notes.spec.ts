import { test, expect } from "@playwright/test";
import { renderSlide, rerenderSlideWithTheme, type SlideSpec } from "@/app/lib/slideshow-layouts";
import { DEFAULT_ART_STYLE, getTheme } from "@/app/lib/slideshowThemes";
import { mergeSlideImage, newId, revealSlide, type DeckSlide } from "@/app/lib/deck-events";
import { rethemeDeck } from "@/app/lib/deck-theme";
import { applySlideOp, deckSnapshot, fillSlidePicture, isSlideOp } from "@/app/lib/jo/slide-ops";
import { joSlidesResponseFormat } from "@/app/lib/jo/slide-schema";
import { buildPrompt, schemaFor, STAFF_DECK_LAYOUTS } from "@/app/lib/deck-prompt";
import { deckBudget, deckKindOf, deckRunSlug, deckToolSlug, slideNotesText } from "@/app/lib/deck-kind";

/*
 * Batch 6, step 4: speaker notes on the main Slides engine, and staff
 * training and assembly decks made by it. Pupil decks are untouched
 * (tests/unit/deck-prompt.spec.ts pins their prompt and schema).
 */

const theme = getTheme("paper");
const DASHES = /[–—]/;

function aiSlide(spec: Partial<SlideSpec>, first = false): DeckSlide {
  const full = { colorScheme: "light", accentColor: theme.palette.accent, title: "", ...spec } as SlideSpec;
  const rendered = renderSlide(full, theme, DEFAULT_ART_STYLE);
  const skeleton: Record<string, unknown> = { ...full };
  delete skeleton.accentColor;
  return { ...rendered, id: newId("s"), skeleton, ...(first ? { themeId: "paper", artStyleId: DEFAULT_ART_STYLE } : {}) } as DeckSlide;
}

type SchemaSlide = { required: string[]; properties: Record<string, { enum?: string[] }> };
const slideSchema = (body: Parameters<typeof schemaFor>[0]) =>
  (schemaFor(body).schema as unknown as { properties: { slides: { items: SchemaSlide } } }).properties.slides.items;

// ── Deck kinds ───────────────────────────────────────────────────────────────

test.describe("deck kinds", () => {
  test("anything unknown is a pupil deck", () => {
    expect(deckKindOf(undefined)).toBe("pupil");
    expect(deckKindOf("bogus")).toBe("pupil");
    expect(deckKindOf("staff")).toBe("staff");
    expect(deckKindOf("assembly")).toBe("assembly");
  });

  test("which tool switch gates it, and where its run is saved", () => {
    expect(deckToolSlug("pupil")).toBe("slideshow");
    expect(deckToolSlug("staff")).toBe("cpd-slideshow");
    expect(deckToolSlug("assembly")).toBe("assembly-planner");
    expect(deckRunSlug("pupil")).toBe("slideshow");
    expect(deckRunSlug("staff")).toBe("cpd-slideshow");
    // The assembly's own history holds its script; its deck is a slideshow.
    expect(deckRunSlug("assembly")).toBe("slideshow");
  });

  test("budgets: staff slides plus 1 or 2 discussion tasks; an assembly gets one questions slide", () => {
    expect(deckBudget({ topic: "x", deckKind: "staff", slideCount: 4 })).toEqual({ content: 4, activities: 1, total: 5 });
    expect(deckBudget({ topic: "x", deckKind: "staff", slideCount: 8 })).toEqual({ content: 8, activities: 2, total: 10 });
    expect(deckBudget({ topic: "x", deckKind: "staff", slideCount: 99 }).content).toBe(15);
    expect(deckBudget({ topic: "x", deckKind: "staff", slideCount: 1 }).content).toBe(3);
    expect(deckBudget({ topic: "x", deckKind: "assembly", slideCount: 6 })).toEqual({ content: 6, activities: 1, total: 7 });
  });

  test("a pupil deck's budget is the one it always had", () => {
    expect(deckBudget({ topic: "x", slideCount: 8 })).toEqual({ content: 8, activities: 4, total: 12 });
    expect(deckBudget({ topic: "x", slideCount: 3 })).toEqual({ content: 3, activities: 2, total: 5 });
    expect(deckBudget({ topic: "x", slideCount: 1 })).toEqual({ content: 1, activities: 0, total: 1 });
  });
});

// ── The staff and assembly prompt and schema ────────────────────────────────

test.describe("staff and assembly decks", () => {
  const STAFF = { topic: "Retrieval practice", deckKind: "staff" as const, slideCount: 6, staffFocus: "practical" as const };
  const ASSEMBLY = { topic: "Kindness", deckKind: "assembly" as const, slideCount: 6, year: "KS2", resourceText: "## Running order\nIntroduction: Ask who has been kind today." };

  test("every slide carries speaker notes; a pupil deck still does not", () => {
    expect(slideSchema(STAFF).required).toContain("speakerNotes");
    expect(slideSchema(ASSEMBLY).required).toContain("speakerNotes");
    expect(slideSchema({ topic: "x" }).required).not.toContain("speakerNotes");
  });

  test("only layouts that suit adults and a hall: no vocab grids, quizzes or ordering", () => {
    const layouts = slideSchema(STAFF).properties.layout.enum!;
    expect(layouts).toEqual([...STAFF_DECK_LAYOUTS]);
    for (const banned of ["paper-vocab-grid", "activity-ordering", "activity-multichoice", "activity-vocab-match", "paper-quote"]) expect(layouts).not.toContain(banned);
    expect(layouts).toContain("activity-question");
  });

  test("the staff prompt: training for teachers, never pupils' objectives or vocabulary", () => {
    const p = buildPrompt(STAFF);
    expect(p).toContain("Retrieval practice");
    expect(p).toMatch(/staff training/i);
    expect(p).not.toMatch(/LEARNING OBJECTIVES SLIDE|KEY VOCABULARY SLIDE|Audience: UK/);
    expect(p).toMatch(/emit exactly 7 slides/);
    expect(p).toMatch(/speakerNotes/);
  });

  test("never invented statistics, quotes or research findings", () => {
    expect(buildPrompt(STAFF)).toMatch(/never invent statistics, quotes or research findings/i);
    expect(buildPrompt(ASSEMBLY)).toMatch(/never invent statistics, quotes or research findings/i);
  });

  test("practical or research focus, and the teacher's own instructions", () => {
    expect(buildPrompt(STAFF)).toMatch(/practical/i);
    expect(buildPrompt({ ...STAFF, staffFocus: "research" })).toMatch(/research and theory/i);
    expect(buildPrompt({ ...STAFF, additionalInstructions: "Mention our marking policy" })).toContain("Mention our marking policy");
  });

  test("the assembly prompt builds on the script, for the stage, with no pupil names", () => {
    const p = buildPrompt(ASSEMBLY);
    expect(p).toContain("Ask who has been kind today.");
    expect(p).toMatch(/assembly/i);
    expect(p).toContain("KS2");
    expect(p).toMatch(/never name a pupil/i);
    expect(p).toMatch(/emit exactly 7 slides/);
  });

  test("no long dashes in what we write", () => {
    expect(buildPrompt(STAFF)).not.toMatch(DASHES);
    expect(buildPrompt(ASSEMBLY)).not.toMatch(DASHES);
  });
});

// ── Notes on the slide ──────────────────────────────────────────────────────

test.describe("speaker notes on slides", () => {
  test("a spec's notes land on the slide; a slide without has no notes at all", () => {
    const withNotes = renderSlide({ layout: "paper-image-right", colorScheme: "light", accentColor: "#000", title: "Why retrieval works", speakerNotes: "Open with a question." } as SlideSpec, theme);
    expect(withNotes.notes).toBe("Open with a question.");
    const without = renderSlide({ layout: "paper-image-right", colorScheme: "light", accentColor: "#000", title: "Plain" } as SlideSpec, theme);
    expect("notes" in without).toBe(false);
  });

  test("notes the teacher edited survive a theme change, over the generated ones", () => {
    const s = { ...aiSlide({ layout: "paper-image-right", title: "T", speakerNotes: "Generated" }, true), notes: "Edited by the teacher" };
    expect(rerenderSlideWithTheme(s, getTheme("paper"), DEFAULT_ART_STYLE).notes).toBe("Edited by the teacher");
    const [next] = rethemeDeck([s], "ocean", DEFAULT_ART_STYLE);
    expect(next.notes).toBe("Edited by the teacher");
  });

  // Regression: the editor copies streamed slides field by field, and first
  // dropped the notes (found by the batch 6 E2E).
  test("a streamed slide keeps its notes, and an image arriving later does not wipe them", () => {
    const slide = renderSlide({ layout: "paper-image-right", colorScheme: "light", accentColor: "#000", title: "T", speakerNotes: "Say this." } as SlideSpec, theme);
    const shown = revealSlide([], { index: 0, total: 1, slide, title: "T" } as Parameters<typeof revealSlide>[1]);
    expect(shown[0].notes).toBe("Say this.");
    const edited = [{ ...shown[0], notes: "Edited before the picture came" }];
    const withImage = mergeSlideImage(edited, { index: 0, slide: { ...slide, notes: "Say this." } } as Parameters<typeof mergeSlideImage>[1]);
    expect(withImage[0].notes).toBe("Edited before the picture came");
  });

  test("a pupil slide streamed in has no notes key at all", () => {
    const slide = renderSlide({ layout: "paper-image-right", colorScheme: "light", accentColor: "#000", title: "T" } as SlideSpec, theme);
    const shown = revealSlide([], { index: 0, total: 1, slide, title: "T" } as Parameters<typeof revealSlide>[1]);
    expect("notes" in shown[0]).toBe(false);
    expect("notes" in mergeSlideImage(shown, { index: 0, slide } as Parameters<typeof mergeSlideImage>[1])[0]).toBe(false);
  });

  test("the PowerPoint notes: trimmed, nothing when blank", () => {
    expect(slideNotesText({ notes: "  Say hello.  " })).toBe("Say hello.");
    expect(slideNotesText({ notes: "   " })).toBeUndefined();
    expect(slideNotesText({})).toBeUndefined();
  });
});

// ── Jo and notes ────────────────────────────────────────────────────────────

test.describe("Jo and speaker notes", () => {
  const deck = () => [
    { ...aiSlide({ layout: "title-hero", title: "CPD", subtitle: "Retrieval" }, true), notes: "Welcome everyone." },
    aiSlide({ layout: "paper-image-right", title: "Why it works", bullets: ["**Memory** strengthens"] }),
  ];

  test("Jo sees each slide's notes", () => {
    const snap = deckSnapshot(deck());
    expect(snap.slides[0]).toMatchObject({ notes: "Welcome everyone." });
    expect(snap.slides[1]).not.toHaveProperty("notes");
  });

  test("setSlideNotes writes a slide's notes; empty clears them; an unknown slide is refused", () => {
    const d = deck();
    const set = applySlideOp(d, { op: "setSlideNotes", label: "Notes for slide 2", slideId: d[1].id, notes: "Ask staff to recall last week." }, DEFAULT_ART_STYLE)!;
    expect(set.slides[1].notes).toBe("Ask staff to recall last week.");
    // Cleared to "", not deleted: a later theme change must not bring the
    // generated notes back from the skeleton.
    const cleared = applySlideOp(d, { op: "setSlideNotes", label: "x", slideId: d[0].id, notes: "  " }, DEFAULT_ART_STYLE)!;
    expect(cleared.slides[0].notes).toBe("");
    expect(rethemeDeck(cleared.slides, "ocean", DEFAULT_ART_STYLE)[0].notes).toBe("");
    expect(slideNotesText(cleared.slides[0])).toBeUndefined();
    expect(applySlideOp(d, { op: "setSlideNotes", label: "x", slideId: "nope", notes: "Hi" }, DEFAULT_ART_STYLE)).toBeNull();
  });

  test("swapping a slide's picture keeps its edited notes, while waiting and once it lands", () => {
    const d = [
      { ...aiSlide({ layout: "title-hero", title: "CPD" }, true) },
      { ...aiSlide({ layout: "paper-image-right", title: "Why", imageQuery: "teacher whiteboard", speakerNotes: "Generated" }), notes: "Edited" },
    ];
    const swapped = applySlideOp(d, { op: "setSlideImage", label: "x", slideId: d[1].id, imageQuery: "mini whiteboards classroom" }, DEFAULT_ART_STYLE)!;
    expect(swapped.slides[1].notes).toBe("Edited");
    const filled = fillSlidePicture(swapped.slides, d[1].id, { src: "https://example.com/p.jpg", width: 800, height: 600 }, DEFAULT_ART_STYLE);
    expect(filled[1].notes).toBe("Edited");
  });

  test("rewriting a slide's words keeps its notes", () => {
    const d = deck();
    const r = applySlideOp(d, { op: "rewriteSlide", label: "x", slideId: d[0].id, fields: [{ key: "title", value: "Retrieval CPD" }] }, DEFAULT_ART_STYLE)!;
    expect(r.slides[0].notes).toBe("Welcome everyone.");
  });

  test("the op is known and in the schema", () => {
    expect(isSlideOp({ op: "setSlideNotes", label: "x", slideId: "s1", notes: "Hi" })).toBe(true);
    expect(isSlideOp({ op: "setSlideNotes", label: "x", slideId: "s1" })).toBe(false);
    expect(JSON.stringify(joSlidesResponseFormat())).toContain("setSlideNotes");
  });
});
