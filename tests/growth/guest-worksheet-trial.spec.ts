import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin } from "../support/users";
import { GUEST_JO_PROMPTS } from "@/app/lib/trial-limits";

/*
 * The database side of a free Worksheet from the landing hero
 * (20261011000000_guest_worksheet_trial.sql), against staging.
 *
 * trial_generations only accepted Slides and Comprehension, so the guest route
 * failed to start a worksheet run and the visitor saw "Something went wrong".
 * The page tests in try-free.spec.ts stub /api/try/worksheet and never reach
 * the table, so this is what guards it.
 *
 * No page, no model, nothing spent.
 */

const ids: string[] = [];

function insertTry(tool: string) {
  return admin
    .from("trial_generations")
    .insert({
      guest_id: randomUUID(),
      tool,
      status: "done",
      title: "Equivalent fractions",
      input: { subject: "Maths", learningObjective: "To find equivalent fractions" },
      output: { text: "{}" },
      run_id: randomUUID(),
      ip_hash: "e2e-not-a-real-ip",
    })
    .select("id, guest_id, run_id")
    .single();
}

test.afterAll(async () => {
  if (ids.length) await admin.from("trial_generations").delete().in("id", ids);
});

test("a worksheet free try can be stored (regression)", async () => {
  const { data, error } = await insertTry("worksheet-generator");
  expect(error).toBeNull();
  ids.push(data!.id as string);
});

test("a tool that is not a free try is still refused", async () => {
  const { data, error } = await insertTry("lesson-plan");
  if (data) ids.push(data.id as string);
  expect(error?.message).toMatch(/trial_generations_tool_check/);
});

test("Jo's three messages work on a worksheet free try", async () => {
  const { data, error } = await insertTry("worksheet-generator");
  expect(error).toBeNull();
  ids.push(data!.id as string);

  const { data: used, error: useErr } = await admin.rpc("use_trial_jo_prompt", {
    p_id: data!.id,
    p_guest: data!.guest_id,
    p_max: GUEST_JO_PROMPTS,
    p_refund: false,
  });
  expect(useErr).toBeNull();
  expect(used).toEqual([{ used: 1, run_id: data!.run_id }]);
});
