import { test, expect } from "@playwright/test";
import { renderSlide, type SlideSpec } from "@/app/lib/slideshow-layouts";
import { DEFAULT_ART_STYLE, getTheme, getThemeArt } from "@/app/lib/slideshowThemes";
import { newId, type DeckSlide } from "@/app/lib/deck-events";
import { rethemeDeck } from "@/app/lib/deck-theme";
import {
  applySlideOp,
  deckSnapshot,
  fillSlidePicture,
  isSlideOp,
  pendingPicture,
  slideKind,
  slideOpFocus,
} from "@/app/lib/jo/slide-ops";
import { readJoProgress } from "@/app/lib/jo/progress";
import { joSlidesResponseFormat } from "@/app/lib/jo/slide-schema";
import type { SlideOp } from "@/app/lib/jo/types";

/*
 * Jo's edits to a deck. An AI slide's words change through its layout, so it
 * is rebuilt in the deck's theme with its picture kept; everything else is a
 * no-op unless it fits the deck exactly.
 */

const PHOTO = "https://example.com/volcano.jpg";
const theme = getTheme("paper");

function aiSlide(spec: Partial<SlideSpec>, first = false): DeckSlide {
  const full = { colorScheme: "light", accentColor: theme.palette.accent, title: "", ...spec } as SlideSpec;
  const rendered = renderSlide({ ...full, imageDataUrl: spec.imageQuery ? PHOTO : undefined, imageWidth: 800, imageHeight: 600 }, theme, DEFAULT_ART_STYLE);
  const skeleton: Record<string, unknown> = { ...full };
  delete skeleton.accentColor;
  return { ...rendered, id: newId("s"), skeleton, ...(first ? { themeId: "paper", artStyleId: DEFAULT_ART_STYLE } : {}) } as DeckSlide;
}

function deck(): DeckSlide[] {
  return [
    aiSlide({ layout: "title-hero", title: "Volcanoes", subtitle: "Year 4 Geography", imageQuery: "volcano eruption lava" }, true),
    aiSlide({ layout: "paper-image-right", title: "How volcanoes erupt", subHook: "Pressure builds up", bullets: ["**Magma** rises", "**Gas** pushes"], imageQuery: "magma chamber diagram" }),
    aiSlide({ layout: "activity-ordering", title: "Put the eruption in order", activityKind: "order", activityItems: ["Ash falls", "Magma rises", "Gas builds", "Lava flows"], activityCorrectOrder: [1, 2, 3, 0] }),
    { id: "plain1", shapes: [], images: [], background: "#fff", texts: [{ id: "t1", x: 80, y: 80, width: 800, text: "Any questions?", fontSize: 40, fontWeight: "800", fontStyle: "normal", underline: false, fontFamily: "Inter", color: "#111", textAlign: "left" }] } as DeckSlide,
  ];
}

const op = <T extends SlideOp>(o: T) => o;
const texts = (s: DeckSlide) => s.texts.map((t) => t.text).join(" | ");

test.describe("deckSnapshot", () => {
  test("every slide's id, number, kind and words, and never image bytes", () => {
    const d = deck();
    const snap = deckSnapshot(d);
    expect(snap.themeId).toBe("paper");
    expect(snap.slides.map((s) => [s.number, s.kind])).toEqual([[1, "content"], [2, "content"], [3, "activity"], [4, "plain"]]);
    expect(snap.slides[1]).toMatchObject({ layout: "paper-image-right", fields: { title: "How volcanoes erupt", bullets: "**Magma** rises\n**Gas** pushes" } });
    expect(snap.slides[3]).toMatchObject({ texts: [{ id: "t1", text: "Any questions?" }] });
    expect(JSON.stringify(snap)).not.toContain(PHOTO);
    expect(snap.themes.length).toBeGreaterThan(3);
  });
});

test.describe("rewriteSlide", () => {
  test("rebuilds the slide in its layout with the new words, keeping its id, picture and theme", () => {
    const d = deck();
    const applied = applySlideOp(d, op({ op: "rewriteSlide", label: "Simplifying slide 2", slideId: d[1].id, fields: [{ key: "title", value: "Why volcanoes blow" }, { key: "bullets", value: "Hot rock rises\nGas pushes it up" }] }), DEFAULT_ART_STYLE)!;
    const slide = applied.slides[1];
    expect(slide.id).toBe(d[1].id);
    expect(texts(slide)).toContain("Why volcanoes blow");
    expect(texts(slide)).not.toContain("How volcanoes erupt");
    expect((slide.skeleton as SlideSpec).bullets).toEqual(["Hot rock rises", "Gas pushes it up"]);
    expect((slide.skeleton as SlideSpec).subHook).toBe("Pressure builds up");
    expect(JSON.stringify(slide)).toContain(PHOTO);
    expect(applied.focus).toEqual({ slideId: d[1].id });
    // Slide 0 still carries the deck's theme.
    expect(applied.slides[0].themeId).toBe("paper");
  });

  test("survives a theme switch, unlike an edit to a text box", () => {
    const d = deck();
    const edited = applySlideOp(d, op({ op: "rewriteSlide", label: "x", slideId: d[1].id, fields: [{ key: "title", value: "Why volcanoes blow" }] }), DEFAULT_ART_STYLE)!.slides;
    expect(texts(rethemeDeck(edited, "dark", DEFAULT_ART_STYLE)[1])).toContain("Why volcanoes blow");
  });

  test("an activity, an unknown slide, an unknown field or an empty title does nothing", () => {
    const d = deck();
    expect(applySlideOp(d, op({ op: "rewriteSlide", label: "x", slideId: d[2].id, fields: [{ key: "title", value: "New" }] }), DEFAULT_ART_STYLE)).toBeNull();
    expect(applySlideOp(d, op({ op: "rewriteSlide", label: "x", slideId: "nope", fields: [{ key: "title", value: "New" }] }), DEFAULT_ART_STYLE)).toBeNull();
    expect(applySlideOp(d, op({ op: "rewriteSlide", label: "x", slideId: d[1].id, fields: [{ key: "imageDataUrl" as "title", value: "data:x" }] }), DEFAULT_ART_STYLE)).toBeNull();
    expect(applySlideOp(d, op({ op: "rewriteSlide", label: "x", slideId: d[1].id, fields: [{ key: "title", value: "  " }] }), DEFAULT_ART_STYLE)).toBeNull();
  });
});

test.describe("other slide ops", () => {
  test("setSlideText changes one box on a hand made slide", () => {
    const d = deck();
    const applied = applySlideOp(d, op({ op: "setSlideText", label: "x", slideId: "plain1", textId: "t1", text: "What did you learn?" }), DEFAULT_ART_STYLE)!;
    expect(applied.slides[3].texts[0].text).toBe("What did you learn?");
    expect(applied.focus).toEqual({ slideId: "plain1", textId: "t1" });
    expect(applySlideOp(d, op({ op: "setSlideText", label: "x", slideId: "plain1", textId: "t9", text: "x" }), DEFAULT_ART_STYLE)).toBeNull();
  });

  test("addSlide renders a themed slide after the named one, waiting for its picture", () => {
    const d = deck();
    const applied = applySlideOp(
      d,
      op({ op: "addSlide", label: "Adding a recap", afterSlideId: d[1].id, layout: "paper-image-left", fields: [{ key: "title", value: "What we learned" }, { key: "bullets", value: "**Magma** rises\n**Pressure** builds" }], imageQuery: "volcano cross section" }),
      DEFAULT_ART_STYLE,
    )!;
    expect(applied.slides).toHaveLength(5);
    const added = applied.slides[2];
    expect(applied.focus).toEqual({ slideId: added.id });
    expect(texts(added)).toContain("What we learned");
    expect(added.themeId).toBeUndefined();
    expect(slideKind(added)).toBe("content");
    expect(added.skeleton).not.toHaveProperty("imageDataUrl");
    expect(pendingPicture(added)).toBe("volcano cross section");

    const filled = fillSlidePicture(applied.slides, added.id, { src: "https://example.com/new.jpg", width: 640, height: 480 }, DEFAULT_ART_STYLE);
    expect(JSON.stringify(filled[2])).toContain("https://example.com/new.jpg");
    expect(pendingPicture(filled[2])).toBeNull();
    expect(filled[2].id).toBe(added.id);
  });

  test("addSlide refuses a layout Jo may not add, or a slide with no title", () => {
    const d = deck();
    expect(applySlideOp(d, op({ op: "addSlide", label: "x", afterSlideId: "", layout: "activity-ordering" as "paper-quote", fields: [{ key: "title", value: "x" }], imageQuery: "" }), DEFAULT_ART_STYLE)).toBeNull();
    expect(applySlideOp(d, op({ op: "addSlide", label: "x", afterSlideId: "", layout: "paper-quote", fields: [], imageQuery: "" }), DEFAULT_ART_STYLE)).toBeNull();
  });

  test("delete and move keep the deck's theme on whichever slide is first", () => {
    const d = deck();
    const deleted = applySlideOp(d, op({ op: "deleteSlide", label: "x", slideId: d[0].id }), DEFAULT_ART_STYLE)!.slides;
    expect(deleted).toHaveLength(3);
    expect(deleted[0]).toMatchObject({ id: d[1].id, themeId: "paper", artStyleId: DEFAULT_ART_STYLE });

    const moved = applySlideOp(d, op({ op: "moveSlide", label: "x", slideId: d[0].id, afterSlideId: "plain1" }), DEFAULT_ART_STYLE)!.slides;
    expect(moved.map((s) => s.id)).toEqual([d[1].id, d[2].id, "plain1", d[0].id]);
    expect(moved[0].themeId).toBe("paper");
    expect(moved[3].themeId).toBeUndefined();

    expect(applySlideOp([d[0]], op({ op: "deleteSlide", label: "x", slideId: d[0].id }), DEFAULT_ART_STYLE)).toBeNull();
  });

  test("setTheme goes through the same path as the theme picker", () => {
    const d = deck();
    const applied = applySlideOp(d, op({ op: "setTheme", label: "x", themeId: "dark" }), DEFAULT_ART_STYLE)!;
    // Element ids are fresh on every render, so compare what the teacher sees.
    const look = (slides: DeckSlide[]) => slides.map((s) => ({ id: s.id, background: s.background, themeId: s.themeId, texts: s.texts.map((t) => [t.text, t.color, t.fontFamily]) }));
    expect(look(applied.slides)).toEqual(look(rethemeDeck(d, "dark", DEFAULT_ART_STYLE)));
    expect(applySlideOp(d, op({ op: "setTheme", label: "x", themeId: "paper" }), DEFAULT_ART_STYLE)).toBeNull();
    expect(applySlideOp(d, op({ op: "setTheme", label: "x", themeId: "neon" }), DEFAULT_ART_STYLE)).toBeNull();
    // A theme taken out of the picker is out of Jo's reach too.
    expect(applySlideOp(d, op({ op: "setTheme", label: "x", themeId: "math-pop" }), DEFAULT_ART_STYLE)).toBeNull();
    // A new theme always takes the watercolor art, whatever the deck had.
    expect(applySlideOp(d, op({ op: "setTheme", label: "x", themeId: "lagoon" }), "illustration")!.slides[0].artStyleId).toBe(DEFAULT_ART_STYLE);
  });

  test("focus points at the slide, and the box, an op is about to change", () => {
    const d = deck();
    expect(slideOpFocus(d, op({ op: "setSlideText", label: "x", slideId: "plain1", textId: "t1", text: "x" }))).toEqual({ slideId: "plain1", textId: "t1" });
    expect(slideOpFocus(d, op({ op: "deleteSlide", label: "x", slideId: d[2].id }))).toEqual({ slideId: d[2].id });
    expect(slideOpFocus(d, op({ op: "deleteSlide", label: "x", slideId: "nope" }))).toBeNull();
  });
});

test.describe("rethemeDeck (lifted out of the editor's theme picker)", () => {
  test("rebuilds AI slides, recolours the rest, and stamps the deck's theme and art", () => {
    const d = deck();
    const dark = getTheme("dark");
    const next = rethemeDeck(d, "dark", DEFAULT_ART_STYLE);
    expect(next.map((s) => s.id)).toEqual(d.map((s) => s.id));
    expect(next[0]).toMatchObject({ themeId: "dark", artStyleId: DEFAULT_ART_STYLE });
    expect(next[3].background).toBe(dark.palette.background);
    expect(next[3].texts[0]).toMatchObject({ text: "Any questions?", fontFamily: dark.fonts.heading });
    const art = getThemeArt(dark, DEFAULT_ART_STYLE);
    expect(next.every((s) => s.backgroundArt === art?.src)).toBe(true);
    expect(texts(next[1])).toContain("How volcanoes erupt");
    expect(JSON.stringify(next[1])).toContain(PHOTO);
  });
});

test.describe("the slides answer", () => {
  test("is strict, ordered reply first, and offers only the deck's themes and layouts", () => {
    const rf = joSlidesResponseFormat();
    const schema = rf.json_schema.schema as { properties: Record<string, unknown> };
    expect(rf.json_schema.strict).toBe(true);
    expect(Object.keys(schema.properties)).toEqual(["reply", "clarify", "ops", "summary"]);
    const text = JSON.stringify(rf);
    expect(text).toContain('"paper-quote"');
    expect(text).not.toContain('"activity-ordering"');
    expect(text).toContain('"dark"');
  });

  test("only whole, known slide ops play", () => {
    expect(isSlideOp({ op: "rewriteSlide", label: "x", slideId: "s1", fields: [] })).toBe(true);
    expect(isSlideOp({ op: "rewriteSlide", label: "x", slideId: "s1" })).toBe(false);
    const answer = JSON.stringify({ reply: "On it.", clarify: null, ops: [{ op: "deleteSlide", label: "Removing slide 4", slideId: "plain1" }, { op: "setTheme", label: "Brighter theme", themeId: "light" }], summary: "Done." });
    const cut = answer.indexOf('{"op":"setTheme"') + 3;
    expect(readJoProgress(answer.slice(0, cut), isSlideOp).ops.map((o) => o.op)).toEqual(["deleteSlide"]);
    expect(readJoProgress(answer, isSlideOp, true).ops).toHaveLength(2);
  });
});
