import { test, expect } from "@playwright/test";
import {
  applyDeckEvent,
  finishDeck,
  readSseFrames,
  seedDeck,
  type DeckSlide,
} from "@/app/lib/deck-events";
import type { SlideJSON } from "@/app/lib/presentations";

/*
 * How a generated deck is assembled from the slideshow stream. This used to be
 * inline in Editor.tsx; it moved to lib/deck-events so the guest preview on
 * /create builds exactly the deck the editor would, since that deck is later
 * claimed and opened in the editor. These pin the behaviour it had there.
 */

const content = (title: string, extra: Partial<SlideJSON> = {}): SlideJSON =>
  ({
    shapes: [],
    texts: [{ id: `t-${title}`, text: title }],
    images: [{ id: `i-${title}`, src: "", isPending: true }],
    background: "#fff",
    themeId: "classic",
    ...extra,
  }) as unknown as SlideJSON;

test.describe("applyDeckEvent", () => {
  test("slides land at their own index, padding the gaps", () => {
    let deck: DeckSlide[] = seedDeck();
    deck = applyDeckEvent(deck, "slide", { index: 2, total: 4, slide: content("third") });
    expect(deck).toHaveLength(3);
    expect(deck[2].texts[0].text).toBe("third");
    // Every slot has an id for React and the tray, padded ones included.
    for (const s of deck) expect(typeof s.id).toBe("string");
  });

  test("a reveal keeps the placeholder's id", () => {
    const seeded = seedDeck();
    const deck = applyDeckEvent(seeded, "slide", { index: 0, total: 1, slide: content("first") });
    expect(deck[0].id).toBe(seeded[0].id);
  });

  test("an image that arrives first is not wiped by the late reveal", () => {
    const arrived = new Map<number, SlideJSON>();
    let deck: DeckSlide[] = seedDeck();
    const withImage = content("first", {
      images: [{ id: "i-first", src: "https://img/x.png", isPending: false }] as unknown as SlideJSON["images"],
    });
    // The image event beats the text out of the queue: nothing to merge into
    // yet, but it is remembered.
    deck = applyDeckEvent(deck, "slide-image", { index: 1, slide: withImage }, arrived);
    expect(arrived.get(1)).toBe(withImage);
    deck = applyDeckEvent(deck, "slide", { index: 1, total: 2, slide: content("first") }, arrived);
    expect(deck[1].images[0].src).toBe("https://img/x.png");
  });

  test("an image merges into a revealed slide and keeps its theme", () => {
    let deck: DeckSlide[] = applyDeckEvent(seedDeck(), "slide", { index: 0, total: 1, slide: content("a") });
    const id = deck[0].id;
    deck = applyDeckEvent(deck, "slide-image", {
      index: 0,
      slide: content("a", { themeId: "other", images: [{ id: "i", src: "u" }] as unknown as SlideJSON["images"] }),
    });
    expect(deck[0].id).toBe(id);
    expect(deck[0].images[0].src).toBe("u");
    expect(deck[0].themeId).toBe("classic");
  });

  test("audio placeholder then audio, in the same slot", () => {
    let deck: DeckSlide[] = seedDeck();
    deck = applyDeckEvent(deck, "audio-placeholder", { index: 1 });
    expect(deck[1].audios?.[0].isPending).toBe(true);
    const slotId = deck[1].id;
    deck = applyDeckEvent(deck, "audio", {
      index: 1,
      audio: { src: "https://a/b.mp3", title: "Listen", description: "d", questions: ["Q1", "Q2"] },
    });
    expect(deck[1].id).toBe(slotId);
    expect(deck[1].audios?.[0].src).toBe("https://a/b.mp3");
    expect(deck[1].texts.map((t) => t.text)).toEqual(["Listen", "d", "Q1\nQ2"]);
  });

  test("events that are not slides leave the deck alone", () => {
    const deck = seedDeck();
    for (const e of ["meta", "status", "count-correction", "error", "unknown"]) {
      expect(applyDeckEvent(deck, e, {})).toBe(deck);
    }
  });

  test("finishing clears pending media so nothing shimmers forever", () => {
    let deck: DeckSlide[] = applyDeckEvent(seedDeck(), "slide", { index: 0, total: 1, slide: content("a") });
    deck = applyDeckEvent(deck, "audio-placeholder", { index: 1 });
    const done = finishDeck(deck);
    expect(done[0].images[0].isPending).toBe(false);
    expect(done[1].audios?.[0].isPending).toBe(false);
  });

  test("never mutates its input", () => {
    const deck = seedDeck();
    const copy = JSON.stringify(deck);
    applyDeckEvent(deck, "slide", { index: 3, total: 4, slide: content("x") });
    expect(JSON.stringify(deck)).toBe(copy);
  });
});

test.describe("readSseFrames", () => {
  test("splits complete frames and keeps the tail", () => {
    const { frames, rest } = readSseFrames(
      `:${" ".repeat(10)}\n\nevent: meta\ndata: {"total":3}\n\nevent: slide\ndata: {"index":0`,
    );
    expect(frames).toEqual([{ event: "meta", payload: { total: 3 } }]);
    expect(rest).toBe(`event: slide\ndata: {"index":0`);
  });
});
