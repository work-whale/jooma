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
    const pay = text("7.");
    expect(pay).toContain("There is no minimum");
    expect(pay).toContain("paid in full every month");
    expect(pay).not.toMatch(/£25|rolls into/);
  });

  test("stops commission when the twelve month agreement ends", () => {
    expect(text("3.")).toContain("Twelve months");
    const earn = text("4.");
    expect(earn).toContain("A payment made after it ends earns nothing");
    expect(earn).not.toMatch(/24 months/);
    expect(earn).toContain("except as clause 6 says");
  });

  test("keeps your place on first cleared payments, with August off and big codes exempt", () => {
    const keep = text("5. Keeping your place");
    expect(keep).toContain("first cleared payment, not on a sign-up");
    expect(keep).toContain("one full calendar month");
    expect(keep).toContain("two full calendar months, your account moves to Under review");
    expect(keep).toContain("14 days to bring in one new subscriber");
    expect(keep).toContain("August does not count");
    expect(keep).toContain("more than 50 active subscribers");
  });

  test("ending for inactivity keeps commission for the rest of the term", () => {
    const end = text("6. If we end it for inactivity");
    expect(end).toContain("The crown and verified badge come off your profile");
    expect(end).toContain("free Pro ends at the end of the month");
    // No card is held for free Pro, so nobody is moved onto a paid plan.
    expect(end).toContain("your account moves to no plan");
    expect(end).toContain("We never charge you unless you choose one yourself");
    expect(end).not.toMatch(/stays open on a paid plan/);
    expect(end).toContain("keeps paying you, at the same rates, for the rest of your twelve months");
    expect(end).toContain("paid in full at the next payout");
  });

  test("free Pro ends with the agreement and moves to no plan, never to a paid one", () => {
    const pro = text("11. Your free Pro account");
    expect(pro).toContain("When this agreement ends, your account moves to no plan");
    expect(pro).toContain("We never charge you unless you choose one yourself");
    expect(pro).not.toMatch(/reverts to a normal paid plan/);
  });

  test("points clause 3 at the clause it means", () => {
    expect(text("3.")).toContain("if clause 9 is broken");
    expect(clauses.find((c) => c.heading.startsWith("9."))?.heading).toBe("9. What you must not do");
    expect(clauses.map((c) => c.heading.split(".")[0])).toEqual(
      Array.from({ length: 14 }, (_, i) => String(i + 1)),
    );
  });

  test("is no longer marked as a draft", () => {
    expect(agreementFooter()).toBe(`End of agreement. Version ${AGREEMENT_VERSION}, 21 October 2026.`);
    expect(agreementFooter()).not.toContain("draft");
  });
});
