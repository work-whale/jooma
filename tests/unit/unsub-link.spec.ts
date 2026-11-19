import { test, expect } from "@playwright/test";
import { isTeacherToken, signUnsubToken, unsubSecret, verifyUnsubToken } from "@/app/lib/unsub-link";
import { renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { dropOptedOutMarketing, type DueEmail } from "@/app/lib/lifecycle";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";

/*
 * One-click unsubscribe for the lifecycle marketing emails (E9a, E9b, later
 * E10). Phase 2, Step 6 rule 4: "The footer carries an unsubscribe link on
 * marketing emails".
 *
 * The link is signed per teacher (no stored token, no migration). Edge cases:
 * a token for another teacher, a tampered or truncated signature, another
 * secret, an empty secret, a broadcast uuid token (must not be read as a
 * teacher token), upper-case ids, junk. Rendering: marketing gets the
 * unsubscribe footer and the one-click URL; account mail keeps email settings;
 * a marketing email with no token cannot be rendered at all. The cron drops
 * marketing for addresses already on the opt-out list, and only marketing.
 */

const SECRET = "test-secret-for-unsubscribe-links";
const A = "3f2b8c1e-9d4a-4b7e-8f21-0c5d6e7f8a9b";
const B = "7a1c2d3e-4f50-4612-8a7b-9c0d1e2f3a4b";

test.describe("signed teacher token", () => {
  test("round trips to the same teacher", () => {
    expect(verifyUnsubToken(signUnsubToken(A, SECRET), SECRET)).toBe(A);
  });

  test("is marked as a teacher token, and a broadcast uuid is not", () => {
    expect(isTeacherToken(signUnsubToken(A, SECRET))).toBe(true);
    expect(isTeacherToken(B)).toBe(false);
    expect(isTeacherToken("")).toBe(false);
  });

  test("another teacher's signature does not unlock this teacher", () => {
    const sigOfB = signUnsubToken(B, SECRET).split(".")[2];
    expect(verifyUnsubToken(`u1.${A}.${sigOfB}`, SECRET)).toBeNull();
  });

  test("a tampered, truncated or missing signature fails", () => {
    const tok = signUnsubToken(A, SECRET);
    const sig = tok.split(".")[2];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyUnsubToken(`u1.${A}.${flipped}`, SECRET)).toBeNull();
    expect(verifyUnsubToken(`u1.${A}.${sig.slice(0, -1)}`, SECRET)).toBeNull();
    expect(verifyUnsubToken(`u1.${A}.`, SECRET)).toBeNull();
    expect(verifyUnsubToken(`u1.${A}`, SECRET)).toBeNull();
    expect(verifyUnsubToken(`${tok}.extra`, SECRET)).toBeNull();
  });

  test("a token signed with another secret fails", () => {
    expect(verifyUnsubToken(signUnsubToken(A, "other-secret-entirely"), SECRET)).toBeNull();
  });

  test("an empty secret neither signs nor verifies", () => {
    expect(() => signUnsubToken(A, "")).toThrow();
    expect(verifyUnsubToken(signUnsubToken(A, SECRET), "")).toBeNull();
  });

  test("the id must be a uuid; upper case reads as the same teacher", () => {
    expect(() => signUnsubToken("not-a-uuid", SECRET)).toThrow();
    expect(verifyUnsubToken("u1.not-a-uuid.abc", SECRET)).toBeNull();
    const upper = signUnsubToken(A.toUpperCase(), SECRET);
    expect(verifyUnsubToken(upper, SECRET)).toBe(A);
    expect(verifyUnsubToken(`u1.${A.toUpperCase()}.${signUnsubToken(A, SECRET).split(".")[2]}`, SECRET)).toBe(A);
  });

  test("junk is refused, never thrown", () => {
    for (const junk of ["", "u1", "u1..", "u2." + A + ".x", B, "%%%", "u1." + A + ".!!!!"]) {
      expect(verifyUnsubToken(junk, SECRET)).toBeNull();
    }
  });

  test("the secret is UNSUB_SECRET, else derived from the service role key, else none", () => {
    expect(unsubSecret({ UNSUB_SECRET: "x", SUPABASE_SERVICE_ROLE_KEY: "y" })).toBe("x");
    const derived = unsubSecret({ SUPABASE_SERVICE_ROLE_KEY: "y" });
    expect(derived).toBeTruthy();
    // Derived, not the raw service key itself.
    expect(derived).not.toBe("y");
    expect(unsubSecret({})).toBeNull();
    expect(unsubSecret({ UNSUB_SECRET: "  " })).toBeNull();
  });
});

const vars: LifecycleVars = {
  firstName: "Sam",
  trialEnds: "Wednesday 25 November",
  trialEndsDay: "Wednesday",
  made: 3,
  hours: 1,
  plan: "Pro",
  resources: 1000,
  refill: "",
  planEnds: "",
  offerEnds: "Sunday 6 December",
  offerEndsDay: "Sunday",
};

test.describe("lifecycle footers", () => {
  const tok = signUnsubToken(A, SECRET);

  test("E9a and E9b carry the unsubscribe page and the one-click URL", () => {
    for (const id of ["E9a", "E9b"] as const) {
      const m = renderLifecycleEmail(id, vars, { unsubToken: tok });
      expect(m.kind).toBe("marketing");
      expect(m.footerLabel).toBe("Unsubscribe");
      expect(m.footerPath).toBe(`/unsubscribe?t=${encodeURIComponent(tok)}`);
      expect(m.oneClickPath).toBe(`/api/email/unsubscribe?t=${encodeURIComponent(tok)}`);
    }
  });

  test("a marketing email with no token cannot be rendered", () => {
    expect(() => renderLifecycleEmail("E9a", vars)).toThrow(/unsubscribe/i);
  });

  test("account emails keep email settings and no one-click header, token or not", () => {
    for (const id of ["E1", "E5", "E8", "E14"] as const) {
      for (const opts of [undefined, { unsubToken: tok }]) {
        const m = renderLifecycleEmail(id, vars, opts);
        expect(m.kind).toBe("account");
        expect(m.footerLabel).toBe("Email settings");
        expect(m.footerPath).toBe("/profile#email-settings");
        expect(m.oneClickPath).toBeNull();
      }
    }
  });

  test("the HTML footer shows the label it is given", () => {
    const html = lifecycleHtml("S", "B", "Go", "https://x/a", "https://x/unsubscribe?t=1", "Unsubscribe");
    expect(html).toContain(">Unsubscribe</a>");
    expect(html).not.toContain("Email settings");
    // The old four-argument call still reads "Email settings" (launch notice).
    expect(lifecycleHtml("S", "B", "Go", "https://x/a", "https://x/p")).toContain(">Email settings</a>");
  });
});

test.describe("opt-out list in the cron", () => {
  const due: DueEmail[] = [
    { id: "E8", key: "E8:2026-11-29", kind: "account" },
    { id: "E9a", key: "E9a:2026-W48", kind: "marketing" },
  ];

  test("an address on the opt-out list loses marketing, keeps account mail", () => {
    expect(dropOptedOutMarketing(due, true).map((e) => e.id)).toEqual(["E8"]);
  });

  test("not on the list: nothing is dropped", () => {
    expect(dropOptedOutMarketing(due, false)).toEqual(due);
  });
});
