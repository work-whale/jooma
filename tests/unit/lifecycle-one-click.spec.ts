import { test, expect } from "@playwright/test";
import { lifecycleOutgoing, renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";

/*
 * Regression (found 19 Nov in Phase 3): the lifecycle cron sent every email
 * with oneClickUrl null, so the marketing emails E9a, E9b and E10 never
 * carried the List-Unsubscribe header (RFC 8058), although they rendered a
 * one-click path; and it labelled every footer "Email settings", so the
 * marketing unsubscribe link read "Email settings". lifecycleOutgoing is what
 * the cron now passes to sendBroadcastEmail.
 *
 * Edge cases: every marketing email gets an absolute one-click URL on the
 * site, carrying the teacher's own token; account emails get none (they are
 * not bulk marketing, and a header there would let a teacher "unsubscribe"
 * from billing notices); the site URL's trailing slash does not double up.
 */

const vars: LifecycleVars = {
  firstName: "Sam",
  trialEnds: "Wednesday 25 November",
  trialEndsDay: "Wednesday",
  made: 2,
  hours: 1,
  plan: "Pro",
  resources: 1000,
  refill: "3 December",
  planEnds: "3 December",
  offerEnds: "Sunday 6 December",
  offerEndsDay: "Sunday",
  idea: { text: "a quiz", href: "/tools/quiz-generator", cost: 1 },
};

test("marketing emails carry a one-click URL with the teacher's token", () => {
  for (const id of ["E9a", "E9b", "E10"] as const) {
    const m = renderLifecycleEmail(id, vars, { unsubToken: "u1.abc.sig" });
    const { opts, rendered } = lifecycleOutgoing(m, "https://jooma.ai");
    expect(opts.oneClickUrl, id).toBe("https://jooma.ai/api/email/unsubscribe?t=u1.abc.sig");
    expect(opts.purpose).toBe("lifecycle");
    expect(rendered.html).toContain(">Unsubscribe</a>");
    expect(rendered.html).not.toContain("Email settings");
    expect(rendered.text).toContain("Unsubscribe: https://jooma.ai/unsubscribe?t=u1.abc.sig");
  }
});

test("account emails carry no one-click header", () => {
  for (const id of ["E1", "E7", "E11", "E12", "E14"] as const) {
    const m = renderLifecycleEmail(id, vars);
    const { opts, rendered } = lifecycleOutgoing(m, "https://jooma.ai");
    expect(opts.oneClickUrl, id).toBeNull();
    expect(rendered.html, id).toContain(">Email settings</a>");
    expect(rendered.html, id).not.toContain("Unsubscribe");
  }
});

test("a trailing slash on the site URL does not double up", () => {
  const m = renderLifecycleEmail("E10", vars, { unsubToken: "t" });
  expect(lifecycleOutgoing(m, "https://jooma.ai/").opts.oneClickUrl).toBe("https://jooma.ai/api/email/unsubscribe?t=t");
});
