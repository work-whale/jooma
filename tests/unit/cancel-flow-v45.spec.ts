import { test, expect } from "@playwright/test";
import { cancelTimeline, lossInventory, p11Options, type AccountSummary } from "@/app/lib/cancel-flow";
import { planLosses } from "@/app/lib/plan-copy";

/*
 * The cancel flow on Jooma 4.5 (spec P11, Phase 1).
 *
 * Nobody is locked out on 4.5: cancelling moves a teacher to Free (50 resources
 * every Sunday, the Jooma mark on exports, library photos, 10 refines a week).
 * So the flow must stop saying "you can't make or edit anything", and the first
 * screen offers the two ways down before the save flow: Switch to Free, and,
 * from Pro and Max, Move to Standard at its real price for their interval.
 *
 * The legacy wording (pre-migration database) is pinned in cancel-flow.spec.
 */

const busy: AccountSummary = {
  plan: "pro",
  periodEnd: "2 November 2026",
  trialing: false,
  resources: 143,
  minutesSaved: 42 * 60,
  badges: 7,
  streak: 12,
  v45: true,
};

test.describe("P11: the two ways down, above the reasons", () => {
  test("Pro monthly: Switch to Free, then Move to Standard at £4.99 a month", () => {
    expect(p11Options("pro", "month", true)).toEqual([
      { id: "free", title: "Switch to Free", body: "Keep your library and get 50 resources every Sunday." },
      { id: "standard", title: "Move to Standard", body: "£4.99 a month" },
    ]);
  });

  test("a yearly Max payer is quoted Standard's yearly price, since the move keeps the interval", () => {
    expect(p11Options("max", "year", true)[1]).toEqual({
      id: "standard",
      title: "Move to Standard",
      body: "£47.99 a year",
    });
  });

  test("Standard is offered Free only: there is no paid plan below it", () => {
    expect(p11Options("standard", "month", true).map((o) => o.id)).toEqual(["free"]);
  });

  test("with a plan change already booked, Move to Standard is not offered", () => {
    expect(p11Options("pro", "month", false).map((o) => o.id)).toEqual(["free"]);
  });
});

test.describe("what they lose, on 4.5", () => {
  const byId = Object.fromEntries(lossInventory(busy).map((t) => [t.id, t]));

  test("their work stays editable on Free, with the mark", () => {
    expect(byId.resources.fate).toBe("Kept. You can open, edit and export them on Free, with the Jooma mark.");
    expect(byId.resources.tone).toBe("kept");
  });

  test("the streak carries on, since Free can still make things", () => {
    expect(byId.streak.tone).toBe("kept");
    expect(byId.streak.fate).toBe("Carries on while you keep making things.");
  });

  test("the allowance drops to Free's 50 a week, dated", () => {
    expect(byId.credits.figure).toBe("1,000");
    expect(byId.credits.label).toBe("resources a month");
    expect(byId.credits.fate).toBe("Back to 50 a week after 2 November 2026. Unused resources don't roll over.");
    expect(byId.credits.tone).toBe("lost");
  });

  test("clean exports go back to carrying the Jooma mark", () => {
    expect(byId.exports.fate).toBe("Back to the Jooma mark.");
  });

  test("Standard's exports are clean too, so leaving Standard also loses them", () => {
    const tiles = lossInventory({ ...busy, plan: "standard" });
    expect(tiles.find((t) => t.id === "exports")?.fate).toBe("Back to the Jooma mark.");
  });

  test("no tile anywhere says they can't make or edit", () => {
    const text = lossInventory(busy).map((t) => `${t.label} ${t.fate}`).join(" ");
    expect(text).not.toMatch(/can't make|can't edit|but not edit|credits/i);
  });
});

test.describe("the timeline, on 4.5", () => {
  const steps = cancelTimeline(busy);

  test("the plan runs to the end of the paid period, then Free starts", () => {
    expect(steps[0].what).toBe("Nothing changes. You keep Pro Teacher until 2 November 2026, the end of the period you have paid for.");
    expect(steps[1].what).toBe(
      "You move to Free: 50 resources every Sunday, your whole library, and exports with the Jooma mark.",
    );
  });

  test("never says they can't make anything", () => {
    expect(steps.map((s) => s.what).join(" ")).not.toMatch(/can't make|can't edit|subscribe again/i);
  });
});

test.describe("planLosses to Free, on 4.5", () => {
  test("from Pro: the allowance, the pictures and the mark, in that order", () => {
    expect(planLosses("pro", "free", { v45: true })).toEqual([
      "50 resources a week instead of 1,000 a month",
      "Library photos instead of generated pictures",
      "The Jooma mark on your exports",
      "10 refines a week",
    ]);
  });

  test("from Standard: no pictures to lose, since Standard has library photos too", () => {
    expect(planLosses("standard", "free", { v45: true })).toEqual([
      "50 resources a week instead of 500 a month",
      "The Jooma mark on your exports",
      "10 refines a week",
    ]);
  });

  test("the pre-4.5 database keeps its own line", () => {
    expect(planLosses("pro", "free")).toEqual(["You won't be able to create new resources"]);
  });
});
