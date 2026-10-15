import { test, expect } from "@playwright/test";
import {
  AGREEMENT_VERSION,
  agreementClauses,
  agreementFooter,
} from "@/app/lib/ambassador-agreement";

/*
 * The terms the agreement states, pinned so a wording change cannot quietly
 * bring back a term the CEO took out (October 2026): a minimum balance that
 * rolled forward, commission running past the agreement, a draft notice.
 */

const clauses = agreementClauses({ name: "Priya Raman", code: "PRIYA-4K2" });
const text = (heading: string) => {
  const c = clauses.find((x) => x.heading.startsWith(heading));
  expect(c, heading).toBeTruthy();
  return [...c!.paragraphs, ...(c!.bullets ?? []), ...(c!.after ?? [])].join(" ");
};

test.describe("the ambassador agreement", () => {
  test("pays every month with no minimum", () => {
    const pay = text("5.");
    expect(pay).toContain("There is no minimum");
    expect(pay).toContain("paid in full every month");
    expect(pay).not.toMatch(/£25|rolls into/);
  });

  test("stops commission when the twelve month agreement ends", () => {
    expect(text("3.")).toContain("Twelve months");
    const earn = text("4.");
    expect(earn).toContain("A payment made after it ends earns nothing");
    expect(earn).not.toMatch(/24 months/);
  });

  test("is no longer marked as a draft", () => {
    expect(agreementFooter()).toBe(`End of agreement. Version ${AGREEMENT_VERSION}, 15 October 2026.`);
    expect(agreementFooter()).not.toContain("draft");
  });
});
