import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { admin, anonClient, asTeacher, createTeacher, deleteTeacher, type TestTeacher } from "../support/users";
import { GUEST_JO_PROMPTS } from "@/app/lib/trial-limits";

/*
 * The database side of Ask Jo (20261010000000_jo_editor.sql), against staging:
 *
 *   - use_trial_jo_prompt: a free try's three messages, counted on the server,
 *     unreachable for anyone but the service role.
 *   - jo_threads / jo_messages: a teacher's conversation is theirs alone.
 *
 * No page, no model, nothing spent.
 */

const ids: string[] = [];

async function freeTry(status = "done") {
  const guest = randomUUID();
  const { data, error } = await admin
    .from("trial_generations")
    .insert({ guest_id: guest, tool: "comprehension-generator", status, title: "Jo prompts", input: {}, run_id: randomUUID(), ip_hash: "e2e-not-a-real-ip" })
    .select("id, run_id")
    .single();
  if (error) throw new Error(error.message);
  ids.push(data.id as string);
  return { id: data.id as string, runId: data.run_id as string, guest };
}

const use = (id: string, guest: string, refund = false) =>
  admin.rpc("use_trial_jo_prompt", { p_id: id, p_guest: guest, p_max: GUEST_JO_PROMPTS, p_refund: refund });

test.afterAll(async () => {
  if (ids.length) await admin.from("trial_generations").delete().in("id", ids);
});

test.describe("a free try's Jo messages", () => {
  test("three are allowed, the fourth is refused, and a refund gives one back", async () => {
    const t = await freeTry();
    for (let n = 1; n <= GUEST_JO_PROMPTS; n++) {
      const { data, error } = await use(t.id, t.guest);
      expect(error).toBeNull();
      expect(data).toEqual([{ used: n, run_id: t.runId }]);
    }
    expect((await use(t.id, t.guest)).data).toEqual([]);

    expect((await use(t.id, t.guest, true)).data).toEqual([{ used: 2, run_id: t.runId }]);
    expect((await use(t.id, t.guest)).data).toEqual([{ used: 3, run_id: t.runId }]);
  });

  test("a refund never goes below none", async () => {
    const t = await freeTry();
    expect((await use(t.id, t.guest, true)).data).toEqual([{ used: 0, run_id: t.runId }]);
  });

  test("another guest's try, or one still being written, is refused", async () => {
    const t = await freeTry();
    expect((await use(t.id, randomUUID())).data).toEqual([]);
    const running = await freeTry("running");
    expect((await use(running.id, running.guest)).data).toEqual([]);
  });

  test("the public key cannot spend or reset a count", async () => {
    const t = await freeTry();
    const { error } = await anonClient().rpc("use_trial_jo_prompt", { p_id: t.id, p_guest: t.guest, p_max: 99, p_refund: true });
    expect(error).not.toBeNull();
    const { data } = await admin.from("trial_generations").select("jo_prompts").eq("id", t.id).single();
    expect(data?.jo_prompts).toBe(0);
  });
});

test.describe("a teacher's conversation with Jo", () => {
  let owner: TestTeacher;
  let other: TestTeacher;

  test.beforeAll(async () => {
    owner = await createTeacher("Jothread");
    other = await createTeacher("Jonosy");
  });

  test.afterAll(async () => {
    await deleteTeacher(owner);
    await deleteTeacher(other);
  });

  test("is kept per document, and nobody else can read it or write into it", async () => {
    const doc = randomUUID();
    const mine = await asTeacher(owner);
    const { data: thread, error } = await mine.from("jo_threads").insert({ doc_kind: "tool_run", doc_id: doc }).select("id").single();
    expect(error).toBeNull();
    // One thread per document.
    expect((await mine.from("jo_threads").insert({ doc_kind: "tool_run", doc_id: doc })).error).not.toBeNull();

    const { error: msgError } = await mine.from("jo_messages").insert({ thread_id: thread!.id, role: "user", content: "Make it easier" });
    expect(msgError).toBeNull();

    const theirs = await asTeacher(other);
    expect((await theirs.from("jo_threads").select("id").eq("id", thread!.id)).data).toEqual([]);
    expect((await theirs.from("jo_messages").select("id").eq("thread_id", thread!.id)).data).toEqual([]);
    // Not even into the owner's thread under their own name.
    expect((await theirs.from("jo_messages").insert({ thread_id: thread!.id, role: "user", content: "hello" })).error).not.toBeNull();
    // And nobody signed out.
    expect((await anonClient().from("jo_messages").select("id").eq("thread_id", thread!.id)).data ?? []).toEqual([]);
  });
});
