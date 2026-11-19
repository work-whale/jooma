import { test, expect } from "@playwright/test";
import { askJoAccess, livePlanFor } from "@/app/lib/account-plan";
import { PLANS, type PlanId } from "@/app/lib/plans";

/*
 * Who may use Ask Jo, on screen and on the Live route.
 *
 * The bug: the assistant page and the Live route read the plan through
 * asPlanId, which only knows the four sold plans, so "pro_trial" read as Free.
 * A teacher on the Pro trial got the locked Ask Jo page and was refused Live,
 * and on 4.5 a Free teacher got the locked page too, although the server
 * (checkAssistantAccess) lets both of them chat.
 *
 * Edge cases:
 *   - every account plan, before and after the 4.5 migration.
 *   - comped Pro (an ambassador) is just "pro" here: it must match paying Pro.
 *   - the trial gets Pro's features, Live included.
 *   - Free on 4.5: chat yes, Live no (Live is part of the paid plans).
 *   - before 4.5 nothing changes: Free stays locked out of chat.
 *   - an unknown or missing plan never reads as paid.
 */

test.describe("askJoAccess", () => {
  for (const plan of ["standard", "pro", "max"] as const) {
    test(`${plan} chats and has Live, before and after 4.5`, () => {
      expect(askJoAccess(plan, true)).toEqual({ chat: true, live: true });
      expect(askJoAccess(plan, false)).toEqual({ chat: true, live: true });
    });
  }

  test("the Pro trial has Pro's Ask Jo, Live included", () => {
    expect(askJoAccess("pro_trial", true)).toEqual({ chat: true, live: true });
  });

  test("Free on 4.5 chats but has no Live", () => {
    expect(askJoAccess("free", true)).toEqual({ chat: true, live: false });
  });

  test("Free before 4.5 stays locked out, as it was", () => {
    expect(askJoAccess("free", false)).toEqual({ chat: false, live: false });
  });

  test("Live follows limits.assistant in plans.ts for every plan", () => {
    for (const id of Object.keys(PLANS) as PlanId[]) {
      expect(askJoAccess(id, true).live, id).toBe(PLANS[id].limits.assistant);
    }
  });
});

test.describe("livePlanFor (the plan the Live route checks)", () => {
  test("the trial counts as Pro", () => {
    expect(livePlanFor("pro_trial")).toBe("pro");
  });

  test("the sold plans pass through", () => {
    expect(livePlanFor("standard")).toBe("standard");
    expect(livePlanFor("pro")).toBe("pro");
    expect(livePlanFor("max")).toBe("max");
  });

  test("free, null and anything unknown are Free, never paid", () => {
    expect(livePlanFor("free")).toBe("free");
    expect(livePlanFor(null)).toBe("free");
    expect(livePlanFor("platinum")).toBe("free");
  });
});
