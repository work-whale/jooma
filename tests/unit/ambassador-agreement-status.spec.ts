import { test, expect } from "@playwright/test";
import { AGREEMENT_VERSION } from "@/app/lib/ambassador-agreement";
import { activityStage, type ActivityFacts } from "@/app/lib/ambassador-activity";
import {
  AGREEMENT_CHANGES,
  agreementInForce,
  clauseFiveFrom,
  needsNewAgreement,
  offerNewAgreement,
  validateAcceptance,
  type Acceptance,
} from "@/app/lib/ambassador-agreement-status";

/*
 * Accepting a newer agreement (version 0.5, 20 November 2026). Someone who
 * signed an older version stays on it until they choose to accept the new one;
 * nothing moves them across on its own. Accepting keeps the original signature
 * and adds a second, dated one.
 */

const acc = (version: string, accepted_at = "2026-11-21T10:00:00Z"): Acceptance => ({
  version,
  signature_name: "Priya Raman",
  accepted_at,
});

test.describe("the version in force", () => {
  test("is the signed version when nothing newer was accepted", () => {
    expect(agreementInForce("0.4", [])).toEqual({ version: "0.4", acceptedAt: null, signatureName: null });
  });

  test("is the newest accepted version, with who accepted it and when", () => {
    expect(agreementInForce("0.3", [acc("0.5")])).toEqual({
      version: "0.5",
      acceptedAt: "2026-11-21T10:00:00Z",
      signatureName: "Priya Raman",
    });
  });

  test("compares versions as numbers, not text, and ignores anything older than what was signed", () => {
    expect(agreementInForce("0.4", [acc("0.10"), acc("0.5")]).version).toBe("0.10");
    expect(agreementInForce("0.5", [acc("0.4")])).toEqual({ version: "0.5", acceptedAt: null, signatureName: null });
  });

  test("an acceptance of the same version as signed changes nothing", () => {
    expect(agreementInForce("0.5", [acc("0.5")]).acceptedAt).toBeNull();
  });

  test("a row that is not a version number is ignored", () => {
    expect(agreementInForce("0.4", [acc("draft"), acc("")]).version).toBe("0.4");
  });
});

test.describe("who needs the new agreement", () => {
  test("anyone on an older version than the current one", () => {
    expect(AGREEMENT_VERSION).toBe("0.5");
    expect(needsNewAgreement("0.4")).toBe(true);
    expect(needsNewAgreement("0.3")).toBe(true);
    expect(needsNewAgreement("0.5")).toBe(false);
    expect(needsNewAgreement("0.10")).toBe(false);
  });

  test("nobody without a signed agreement: there is nothing to replace", () => {
    expect(needsNewAgreement(null)).toBe(false);
  });
});

test.describe("who is offered it", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const live = { status: "active", agreement_ends_at: "2027-10-22T00:00:00Z" };

  test("a live ambassador on an older version", () => {
    expect(offerNewAgreement({ ambassador: live, applicationStatus: "approved", inForceVersion: "0.4", now })).toBe(true);
    expect(offerNewAgreement({ ambassador: live, applicationStatus: "approved", inForceVersion: "0.3", now })).toBe(true);
  });

  test("an applicant still waiting, who signed an older version", () => {
    expect(offerNewAgreement({ ambassador: null, applicationStatus: "pending", inForceVersion: "0.4", now })).toBe(true);
  });

  test("never someone already on the current version", () => {
    expect(offerNewAgreement({ ambassador: live, applicationStatus: "approved", inForceVersion: "0.5", now })).toBe(false);
    expect(offerNewAgreement({ ambassador: null, applicationStatus: "pending", inForceVersion: "0.5", now })).toBe(false);
  });

  test("never an ended, paused or expired agreement, or a declined applicant", () => {
    const old = "0.4";
    expect(offerNewAgreement({ ambassador: { ...live, status: "ended" }, applicationStatus: "approved", inForceVersion: old, now })).toBe(false);
    expect(offerNewAgreement({ ambassador: { ...live, status: "paused" }, applicationStatus: "approved", inForceVersion: old, now })).toBe(false);
    expect(
      offerNewAgreement({ ambassador: { ...live, agreement_ends_at: "2026-11-01T00:00:00Z" }, applicationStatus: "approved", inForceVersion: old, now }),
    ).toBe(false);
    expect(offerNewAgreement({ ambassador: null, applicationStatus: "declined", inForceVersion: old, now })).toBe(false);
    expect(offerNewAgreement({ ambassador: null, applicationStatus: null, inForceVersion: null, now })).toBe(false);
  });

  test("never an ambassador with no signed application on file", () => {
    expect(offerNewAgreement({ ambassador: live, applicationStatus: null, inForceVersion: null, now })).toBe(false);
  });
});

test.describe("clause 5 for someone who signed before it existed", () => {
  test("applies from the day they accept a version that has it", () => {
    expect(clauseFiveFrom("0.3", [acc("0.5", "2026-11-21T10:00:00Z")])).toEqual(new Date("2026-11-21T10:00:00Z"));
  });

  test("does not apply while they have not accepted", () => {
    expect(clauseFiveFrom("0.3", [])).toBeNull();
  });

  test("a 0.4 signer already had it, so accepting moves nothing", () => {
    expect(clauseFiveFrom("0.4", [acc("0.5")])).toBeNull();
  });

  test("the clock starts at acceptance, so months quiet before it do not count", () => {
    // Approved in October 2026 on 0.3, nobody signed up since, accepts 0.5 in
    // March 2027. Without the start date that is four quiet months: Under review.
    const facts: ActivityFacts = {
      approvedAt: new Date("2026-10-15T12:00:00Z"),
      lastFirstPaidAt: null,
      activeSubscribers: 0,
      agreementVersion: "0.5",
      clauseFiveFrom: new Date("2027-03-02T12:00:00Z"),
      now: new Date("2027-03-20T12:00:00Z"),
    };
    expect(activityStage(facts)).toBe("ok");
    expect(activityStage({ ...facts, now: new Date("2027-05-02T12:00:00Z") })).toBe("quiet");
    expect(activityStage({ ...facts, now: new Date("2027-06-02T12:00:00Z") })).toBe("review");
    // Without it, the old behaviour: the approval date is the anchor.
    expect(activityStage({ ...facts, clauseFiveFrom: null })).toBe("review");
  });

  test("a later subscriber still moves the anchor on past the acceptance", () => {
    const facts: ActivityFacts = {
      approvedAt: new Date("2026-10-15T12:00:00Z"),
      lastFirstPaidAt: new Date("2027-04-10T12:00:00Z"),
      activeSubscribers: 1,
      agreementVersion: "0.5",
      clauseFiveFrom: new Date("2027-03-02T12:00:00Z"),
      now: new Date("2027-06-02T12:00:00Z"),
    };
    expect(activityStage(facts)).toBe("quiet");
  });
});

test.describe("accepting", () => {
  test("needs the current version and a typed full name", () => {
    expect(validateAcceptance({ version: AGREEMENT_VERSION, signature_name: "  Priya Raman " })).toEqual({
      ok: true,
      signature_name: "Priya Raman",
    });
  });

  test("refuses an old or made-up version, so nobody accepts text they were not shown", () => {
    expect(validateAcceptance({ version: "0.4", signature_name: "Priya Raman" }).ok).toBe(false);
    expect(validateAcceptance({ version: "9.9", signature_name: "Priya Raman" }).ok).toBe(false);
    expect(validateAcceptance({ version: undefined, signature_name: "Priya Raman" }).ok).toBe(false);
  });

  test("refuses a missing, short or overlong name, with the same rules as signing", () => {
    expect(validateAcceptance({ version: AGREEMENT_VERSION, signature_name: "" })).toEqual({
      ok: false,
      error: "Type your full name to accept.",
    });
    expect(validateAcceptance({ version: AGREEMENT_VERSION, signature_name: "  Pr " }).ok).toBe(false);
    expect(validateAcceptance({ version: AGREEMENT_VERSION, signature_name: "x".repeat(121) }).ok).toBe(false);
    expect(validateAcceptance({ version: AGREEMENT_VERSION, signature_name: 42 as unknown as string }).ok).toBe(false);
  });
});

test.describe("what the prompt says changed", () => {
  test("names all four changes in plain words", () => {
    const all = AGREEMENT_CHANGES.join(" ");
    expect(AGREEMENT_CHANGES).toHaveLength(4);
    expect(all).toContain("17204207");
    expect(all).toContain("fixed for the whole agreement");
    expect(all).toContain("Free plan");
    expect(all).toContain("your content is yours");
    expect(all).not.toMatch(/[–—]/);
  });
});
