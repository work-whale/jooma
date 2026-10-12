import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, type TestTeacher } from "../support/users";

/*
 * The daily cron that ends an ambassador's free year of Pro.
 *
 * It must take the comp off once pro_until has passed, and must NOT touch an
 * ambassador who has since subscribed through Stripe (their plan is Stripe's
 * now), nor one whose year is still running. See
 * app/api/cron/ambassador-terms/route.ts.
 *
 * Calls the route as Vercel Cron does, with CRON_SECRET as a bearer token
 * (read from .env.local by tests/support/users.ts).
 */

const DAY = 86_400_000;

async function ambassadorFor(teacher: TestTeacher, proUntilOffsetDays: number) {
  const t = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const { data, error } = await admin
    .from("ambassadors")
    .insert({
      full_name: `ZZ Term ${t}`,
      email: teacher.email,
      user_id: teacher.id,
      pro_until: new Date(Date.now() + proUntilOffsetDays * DAY).toISOString(),
      pro_granted_at: new Date(Date.now() - 365 * DAY).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the ambassador: ${error.message}`);
  return data.id as string;
}

async function planOf(teacher: TestTeacher) {
  const { data } = await admin
    .from("profiles")
    .select("plan, subscription_status")
    .eq("id", teacher.id)
    .single();
  return data;
}

test.describe("Ambassador free Pro expiry cron", () => {
  const people: TestTeacher[] = [];
  const ambassadors: string[] = [];

  test.afterEach(async () => {
    for (const id of ambassadors.splice(0)) await admin.from("ambassadors").delete().eq("id", id);
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  test("refuses a call without the cron secret", async ({ request }) => {
    const res = await request.get("/api/cron/ambassador-terms");
    expect(res.status()).toBe(401);
  });

  test("ends an expired comp, and leaves subscribers and running years alone", async ({
    request,
  }) => {
    const expired = await createTeacher("Tamsin");
    const subscribed = await createTeacher("Ugo");
    const running = await createTeacher("Vera");
    people.push(expired, subscribed, running);

    // Free year over, still on the comp: must end.
    await setPlan(expired, "pro", "comped");
    ambassadors.push(await ambassadorFor(expired, -1));

    // Free year over, but they subscribed through Stripe: Stripe owns the plan.
    await setPlan(subscribed, "pro", "paying");
    ambassadors.push(await ambassadorFor(subscribed, -1));

    // Free year still running: must stay.
    await setPlan(running, "pro", "comped");
    ambassadors.push(await ambassadorFor(running, 100));

    const res = await request.get("/api/cron/ambassador-terms", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(res.ok(), await res.text()).toBe(true);
    expect((await res.json()).ended).toBeGreaterThanOrEqual(1);

    expect(await planOf(expired)).toEqual({ plan: "free", subscription_status: null });
    expect(await planOf(subscribed)).toEqual({ plan: "pro", subscription_status: "active" });
    expect(await planOf(running)).toEqual({ plan: "pro", subscription_status: "active" });

    // Idempotent: a second run the same day finds nothing of ours left to end.
    const again = await request.get("/api/cron/ambassador-terms", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(again.ok()).toBe(true);
    expect(await planOf(subscribed)).toEqual({ plan: "pro", subscription_status: "active" });
    expect(await planOf(running)).toEqual({ plan: "pro", subscription_status: "active" });
  });
});
