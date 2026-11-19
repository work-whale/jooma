import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Ask Jo for every plan that should have it.
 *
 * Reported: ambassadors (comped Pro) could not use Ask Jo. A comped ambassador
 * made through the real grant route was let through everywhere; what was
 * actually broken was the plan read on the assistant page and the Live route,
 * which turned "pro_trial" into Free, so the Pro trial (and Free on 4.5) got
 * the locked page. Unit side: tests/unit/ask-jo-access.spec.ts.
 *
 * The API probes send a body each route rejects (400) AFTER the proxy's gates,
 * so 400 means "let through" and 402/403 means "refused", and nothing reaches
 * a model.
 */

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const GATED = ["/api/assistant", "/api/jo", "/api/jo/speak"];

async function expectLetThrough(page: Page) {
  for (const path of GATED) {
    const res = await page.request.post(path, { data: {} });
    expect(res.status(), path).toBe(400);
  }
}

async function expectAskJoOpen(page: Page, live: boolean) {
  await page.goto("/assistant");
  await expect(page.getByTestId("assistant-splash")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("assistant-locked")).toHaveCount(0);
  if (live) await expect(page.getByTestId("assistant-live")).toBeVisible();
  else await expect(page.getByTestId("assistant-live")).toHaveCount(0);
}

test.describe("Ask Jo access", () => {
  const people: TestTeacher[] = [];
  let ambassadorId: string | null = null;

  test.afterEach(async () => {
    if (ambassadorId) await admin.from("ambassadors").delete().eq("id", ambassadorId);
    ambassadorId = null;
    for (const p of people.splice(0)) await deleteTeacher(p);
  });

  test("a comped ambassador has Ask Jo, Live included, like paying Pro", async ({ page, browser }) => {
    const amb = await createTeacher("Imani");
    const boss = await createAdmin("Bea");
    people.push(amb, boss);

    const t = tag();
    const { data: ambassador, error } = await admin
      .from("ambassadors")
      .insert({ full_name: `${amb.firstName} ${amb.surname}`, email: amb.email })
      .select()
      .single();
    if (error) throw new Error(error.message);
    ambassadorId = ambassador.id;
    await admin
      .from("ambassador_codes")
      .insert({ ambassador_id: ambassador.id, promotion_code_id: `promo_zz${t}`, code: `ZZAMB${t}`.toUpperCase() });

    // The grant through the real route, so the profile is exactly what an
    // admin's grant writes.
    await signIn(page, boss);
    const res = await page.request.post("/api/admin/ambassadors/grant-pro", {
      data: { ambassadorId: ambassador.id, reason: "e2e" },
    });
    expect(res.ok(), await res.text()).toBe(true);

    const ctx = await browser.newContext();
    const mine = await ctx.newPage();
    await signIn(mine, amb);
    await expectLetThrough(mine);
    await expectAskJoOpen(mine, true);
    await ctx.close();
  });

  test("the Pro trial has Ask Jo, Live included", async ({ page }) => {
    const t = await createTeacher("Tia");
    people.push(t);
    const { error } = await admin
      .from("profiles")
      .update({
        plan: "pro_trial",
        trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        free_trial_started_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    expect(error).toBeNull();
    await signIn(page, t);
    await expectLetThrough(page);
    await expectAskJoOpen(page, true);
  });

  test("Free chats with Jo but is not offered Live", async ({ page }) => {
    const t = await createTeacher("Fern");
    people.push(t);
    await admin.from("profiles").update({ plan: "free" }).eq("id", t.id);
    await signIn(page, t);
    await expectLetThrough(page);
    await expectAskJoOpen(page, false);
  });
});
