import { test, expect } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, type TestTeacher } from "../support/users";
import { signUnsubToken, unsubSecret } from "@/app/lib/unsub-link";

/*
 * Phase 2, Step 6: one-click unsubscribe from the lifecycle marketing emails
 * (E9a, E9b), through the real route on localhost against STAGING.
 *
 * The signing logic is pinned in tests/unit/unsub-link.spec.ts. This proves
 * the wiring: the inbox's one-click POST and the confirm page both switch off
 * the teacher's marketing consent and add the address to email_opt_outs; a
 * signature made for another teacher, or a tampered one, changes nothing; a
 * GET never acts. The server and this test derive the same secret from the
 * staging service key (scripts/with-staging-env.sh).
 */

if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("hhgfhhofbhzioywnppzr")) {
  throw new Error("Refusing to run against PRODUCTION.");
}

const KEY = unsubSecret(process.env)!;
const teachers: TestTeacher[] = [];

async function consenting(name: string): Promise<TestTeacher> {
  const t = await createTeacher(name);
  teachers.push(t);
  const { error } = await admin.from("profiles").update({ marketing_consent: true }).eq("id", t.id);
  if (error) throw error;
  return t;
}

async function state(t: TestTeacher) {
  const [{ data: p }, { data: o }] = await Promise.all([
    admin.from("profiles").select("marketing_consent").eq("id", t.id).single(),
    admin.from("email_opt_outs").select("source").eq("email", t.email.toLowerCase()).maybeSingle(),
  ]);
  return { consent: p?.marketing_consent as boolean, optOut: (o?.source as string | undefined) ?? null };
}

test.afterEach(async () => {
  for (const t of teachers.splice(0)) {
    await admin.from("email_opt_outs").delete().eq("email", t.email.toLowerCase());
    await deleteTeacher(t);
  }
});

test("the inbox one-click POST unsubscribes that teacher only", async ({ request }) => {
  const a = await consenting("UnsubA");
  const b = await consenting("UnsubB");
  const tok = signUnsubToken(a.id, KEY);

  const res = await request.post(`/api/email/unsubscribe?t=${encodeURIComponent(tok)}`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(res.status()).toBe(200);
  expect(await state(a)).toEqual({ consent: false, optOut: "one_click" });
  expect(await state(b)).toEqual({ consent: true, optOut: null });
});

test("another teacher's signature, or a tampered one, changes nothing", async ({ request }) => {
  const a = await consenting("UnsubC");
  const b = await consenting("UnsubD");
  const sigOfB = signUnsubToken(b.id, KEY).split(".")[2];
  const tok = signUnsubToken(a.id, KEY);
  const tampered = tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A");

  for (const bad of [`u1.${a.id}.${sigOfB}`, tampered]) {
    const res = await request.post(`/api/email/unsubscribe?t=${encodeURIComponent(bad)}`, {
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(res.status()).toBe(400);
  }
  expect(await state(a)).toEqual({ consent: true, optOut: null });
});

test("a GET only redirects to the confirm page; the button unsubscribes", async ({ page, request }) => {
  const a = await consenting("UnsubE");
  const tok = signUnsubToken(a.id, KEY);

  const get = await request.get(`/api/email/unsubscribe?t=${encodeURIComponent(tok)}`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect(get.headers()["location"]).toContain(`/unsubscribe?t=${encodeURIComponent(tok)}`);
  expect(await state(a)).toEqual({ consent: true, optOut: null });

  await page.goto(`/unsubscribe?t=${encodeURIComponent(tok)}`);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You are unsubscribed" })).toBeVisible();
  expect(await state(a)).toEqual({ consent: false, optOut: "link" });
});
