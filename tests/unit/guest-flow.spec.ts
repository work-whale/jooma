import { test, expect } from "@playwright/test";
import { HERO_IDEAS, HERO_TOOLS, heroHref, ideasAt } from "@/app/lib/landing/hero-ideas";
import {
  claimDestination,
  gateTitle,
  parsePendingAction,
  thenFor,
  PENDING_ACTION_TTL_MS,
} from "@/app/lib/guest-actions";
import { defaultDomainCodes, keyStageFor } from "@/app/lib/comprehension-domains";
import { validatePrefill } from "@/app/lib/toolPrefill";
import {
  cleanFormContext,
  countsFromMessage,
  guestPrefillFields,
  wantsFormEdit,
  withFormContext,
  yearFromTopic,
} from "@/app/lib/guest-tools";

/*
 * The journey from the hero box to the sign up prompt and back into the app:
 * where Create goes, what the modal says, and where a claim lands.
 */

test.describe("hero Create", () => {
  test("opens /create with the tool and topic", () => {
    expect(heroHref("slides", "Volcanoes, Year 3")).toBe("/create?tool=slides&topic=Volcanoes%2C+Year+3");
    expect(heroHref("comp", "  Bees  ")).toBe("/create?tool=comp&topic=Bees");
  });

  test("an empty box goes nowhere, and Worksheets is not open yet", () => {
    expect(heroHref("slides", "   ")).toBeNull();
    expect(heroHref("ws", "Fractions")).toBeNull();
    expect(HERO_TOOLS.find((t) => t.id === "ws")?.available).toBe(false);
  });

  test("ideas wrap round and only point at open tools", () => {
    expect(ideasAt(0)).toHaveLength(3);
    expect(ideasAt(HERO_IDEAS.length)).toEqual(ideasAt(0));
    for (const [id] of HERO_IDEAS) {
      expect(HERO_TOOLS.find((t) => t.id === id)?.available).toBe(true);
    }
  });

  test("hero strings obey the landing language rules", () => {
    const all = [
      ...HERO_TOOLS.flatMap((t) => [t.name, t.placeholder]),
      ...HERO_IDEAS.map(([, text]) => text),
    ].join("\n");
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\bAI\b/);
  });
});

test.describe("the sign up prompt", () => {
  test("says what they just tried to do", () => {
    expect(gateTitle("slides", "export")).toBe("Sign up for free to export your deck");
    expect(gateTitle("slides", "present")).toBe("Sign up for free to present your deck");
    expect(gateTitle("comprehension", "copy")).toBe("Sign up for free to copy your comprehension");
    expect(gateTitle("slides", "more")).toBe("Sign up for free to keep making");
  });

  test("remembers only the actions the app can replay", () => {
    expect(thenFor("slides", "present")).toBe("present");
    expect(thenFor("slides", "export")).toBe("export");
    expect(thenFor("slides", "theme")).toBeNull();
    expect(thenFor("comprehension", "print")).toBe("export");
    expect(thenFor("comprehension", "copy")).toBe("copy");
    expect(thenFor("comprehension", "present")).toBeNull();
  });

  test("ignores anything odd in storage", () => {
    expect(parsePendingAction(null)).toBeNull();
    expect(parsePendingAction("not json")).toBeNull();
    expect(parsePendingAction(JSON.stringify({ action: "export", kind: "sheep", at: 1 }))).toBeNull();
    expect(parsePendingAction(JSON.stringify({ action: "export", kind: "slides", at: 5 }))).toEqual({
      action: "export",
      kind: "slides",
      at: 5,
    });
  });
});

test.describe("claimDestination (after sign up)", () => {
  const now = 10_000_000;

  test("nothing claimed, nowhere to go", () => {
    expect(claimDestination([], null, now)).toBeNull();
  });

  test("one deck opens in the editor with the action they pressed", () => {
    const to = claimDestination(
      [{ kind: "slides", id: "deck-1" }],
      { action: "export", kind: "slides", at: now - 1000 },
      now,
    );
    expect(to).toBe("/editor/deck-1?then=export&fresh=1");
  });

  test("one comprehension restores into its tool", () => {
    const to = claimDestination(
      [{ kind: "comprehension", id: "run-1" }],
      { action: "copy", kind: "comprehension", at: now },
      now,
    );
    expect(to).toBe("/tools/comprehension-generator?run=run-1&then=copy&fresh=1");
  });

  test("a stale or mismatched action is dropped, the item still opens", () => {
    expect(
      claimDestination([{ kind: "slides", id: "d" }], { action: "export", kind: "slides", at: now - PENDING_ACTION_TTL_MS - 1 }, now),
    ).toBe("/editor/d?fresh=1");
    expect(
      claimDestination([{ kind: "slides", id: "d" }], { action: "export", kind: "comprehension", at: now }, now),
    ).toBe("/editor/d?fresh=1");
  });

  test("tries from several days all go to the library", () => {
    expect(
      claimDestination(
        [
          { kind: "slides", id: "monday" },
          { kind: "comprehension", id: "tuesday" },
        ],
        null,
        now,
      ),
    ).toBe("/folders?claimed=2");
  });
});

test.describe("comprehension default domains (regression)", () => {
  // Jo fills the year and topic but never the domains, and the form cleared
  // them on every key stage change, so a prefilled form opened with Generate
  // disabled and no reason given.
  test("every domain for the key stage", () => {
    expect(keyStageFor("Year 2", false)).toBe("ks1");
    expect(keyStageFor("Year 2", true)).toBe("ks2");
    expect(defaultDomainCodes("Year 1", false)).toEqual(["1a", "1b", "1c", "1d", "1e"]);
    expect(defaultDomainCodes("Year 5", false)).toEqual(["2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]);
    expect(defaultDomainCodes("", true)).toHaveLength(8);
  });
});

test.describe("slideshow prefill year (regression)", () => {
  // Jo is told to always send `yearGroup`; the slideshow calls it `year`. The
  // year was dropped as an unknown field, so "Volcanoes, Year 3" opened the
  // wizard on "Any year", on /create and in the app alike.
  test("yearGroup is read as the slideshow's year", () => {
    const p = validatePrefill({ slug: "slideshow", fields: { topic: "Volcanoes", yearGroup: "Year 3" } });
    expect(p?.fields.year).toBe("Year 3");
    expect(p?.fields.yearGroup).toBeUndefined();
  });

  test("an explicit year still wins, and other tools keep yearGroup", () => {
    const p = validatePrefill({
      slug: "slideshow",
      fields: { topic: "Volcanoes", year: "Year 4", yearGroup: "Year 3" },
    });
    expect(p?.fields.year).toBe("Year 4");
    const c = validatePrefill({
      slug: "comprehension-generator",
      fields: { topic: "Bees", yearGroup: "Year 2", curriculum: "2014 National Curriculum" },
    });
    expect(c?.fields.yearGroup).toBe("Year 2");
  });
});

test.describe("the form never opens empty (regression)", () => {
  // Jo answered in 9.0s, past the cut off, and the comprehension opened with
  // nothing in it, not even the topic. And when it does answer, it can leave
  // out a year the visitor typed ("Why do bees matter? Year 4").
  test("reads a year out of the topic", () => {
    expect(yearFromTopic("Volcanoes, Year 3")).toBe("Year 3");
    expect(yearFromTopic("bees y4")).toBe("Year 4");
    expect(yearFromTopic("Fractions Yr 10")).toBe("Year 10");
    expect(yearFromTopic("Reception colours")).toBe("Reception");
    expect(yearFromTopic("World War 2")).toBeNull();
    expect(yearFromTopic("Volcanoes")).toBeNull();
  });

  test("without Jo, the topic and year still make a valid prefill", () => {
    const c = validatePrefill({
      slug: "comprehension-generator",
      fields: guestPrefillFields("comprehension-generator", "Why do bees matter? Year 4", null),
    });
    expect(c?.fields).toMatchObject({ topic: "Why do bees matter? Year 4", yearGroup: "Year 4" });
    const s = validatePrefill({ slug: "slideshow", fields: guestPrefillFields("slideshow", "Volcanoes, Year 3", null) });
    expect(s?.fields).toMatchObject({ topic: "Volcanoes, Year 3", year: "Year 3" });
  });

  test("Jo's own answers win; the topic only fills gaps", () => {
    const f = guestPrefillFields("comprehension-generator", "Bees Year 4", { topic: "Why bees matter", yearGroup: "Year 5" });
    expect(f).toMatchObject({ topic: "Why bees matter", yearGroup: "Year 5" });
    const g = guestPrefillFields("comprehension-generator", "Bees Year 4", { topic: "Why bees matter" });
    expect(g).toMatchObject({ topic: "Why bees matter", yearGroup: "Year 4" });
  });
});

test.describe("Ask Jo knows what the form says (regression)", () => {
  // Jo only saw the chat. With "Recycling and sustainability" in the form,
  // "change it to Year 6" came back asking for a topic, with chips for the
  // water cycle and the solar system, and the form was left as it was.
  test("the form's values ride on the latest message", () => {
    const ctx = cleanFormContext("comprehension-generator", {
      topic: "Recycling and sustainability",
      yearGroup: "Year 5",
      passageWordCount: "300",
      secret: "dropped",
      ownText: "x".repeat(5000),
    });
    expect(ctx).toEqual({ topic: "Recycling and sustainability", yearGroup: "Year 5", passageWordCount: "300" });
    const msgs = withFormContext(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "can you change to year 6" },
      ],
      "comprehension-generator",
      ctx,
    );
    expect(msgs[0].content).toBe("hello");
    expect(msgs[2].content).toContain("can you change to year 6");
    expect(msgs[2].content).toContain("Topic: Recycling and sustainability");
    expect(msgs[2].content).toContain("Keep every value I have not asked to change");
  });

  test("nothing attached when the form is empty", () => {
    const m = [{ role: "user" as const, content: "hi" }];
    expect(withFormContext(m, "slideshow", {})).toEqual(m);
  });

  test("an edit fills the form; a question gets an answer", () => {
    for (const edit of [
      "can you change to year 6 and make the passage length 400 words",
      "make it 10 slides",
      "Year 4 please",
      "use a harder reading level",
      "set the topic to rainforests",
    ]) {
      expect(wantsFormEdit(edit), edit).toBe(true);
    }
    for (const q of ["what reading level should I pick?", "how many slides is best for year 3?", "thanks!"]) {
      expect(wantsFormEdit(q), q).toBe(false);
    }
  });

  test("Jo can set the comprehension's passage length and complexity", () => {
    const p = validatePrefill({
      slug: "comprehension-generator",
      fields: { topic: "Recycling", yearGroup: "Year 6", passageWordCount: 400, complexity: "Challenging" },
    });
    expect(p?.fields).toMatchObject({ passageWordCount: 400, complexity: "Challenging", yearGroup: "Year 6" });
  });
});

test.describe("counts the visitor stated (regression)", () => {
  // Real Jo, asked "change to year 6 and 10 slides", sent only the year and
  // then said it had changed both.
  test("read from the message", () => {
    expect(countsFromMessage("slideshow", "change to year 6 and 10 slides")).toEqual({ slideCount: 10 });
    expect(countsFromMessage("comprehension-generator", "make the passage 400 words with 3 questions")).toEqual({
      passageWordCount: 400,
      numQuestions: 3,
    });
    expect(countsFromMessage("slideshow", "year 6 please")).toEqual({});
  });

  test("Jo's own value wins, the stated count fills the gap", () => {
    // Same order as AskJoPanel: the form, then the stated counts, then Jo.
    const form: Record<string, unknown> = { topic: "Recycling and sustainability", year: "Year 5", slideCount: 8 };
    const jo: Record<string, unknown> = { topic: "Recycling and sustainability", year: "Year 6" };
    const merged = validatePrefill({
      slug: "slideshow",
      fields: { ...form, ...countsFromMessage("slideshow", "change to year 6 and 10 slides"), ...jo },
    });
    expect(merged?.fields).toMatchObject({ topic: "Recycling and sustainability", year: "Year 6", slideCount: 10 });
  });
});
