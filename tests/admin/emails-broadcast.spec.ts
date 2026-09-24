import { test, expect, type Page } from "@playwright/test";
import {
  admin,
  asTeacher,
  createAdmin,
  createAdminWithRole,
  createProfilelessTeacher,
  createTeacher,
  deleteTeacher,
  signIn,
  type TestTeacher,
} from "../support/users";

/*
 * Emails & templates: bulk email from the admin console.
 *
 * Every fixture lives on @jooma.test, which the sender skips as undeliverable
 * (isUndeliverable in app/lib/email-templates/broadcast.ts). So these tests run
 * the WHOLE pipeline against staging, audience, claim, render, record, and
 * nothing is ever delivered or bounced. "2 skipped" is the success signal.
 *
 * Needs supabase/migrations/20260924000000_email_campaigns.sql on staging.
 */

const TAG = `e2e${Date.now().toString(36)}`;

let owner: TestTeacher | null = null;
let marketing: TestTeacher | null = null;
let support: TestTeacher | null = null;
let alice: TestTeacher | null = null;
let bob: TestTeacher | null = null;
let optedOut: TestTeacher | null = null;
let stranded: TestTeacher | null = null;

test.beforeAll(async () => {
  owner = await createAdmin("Postie");
  marketing = await createAdminWithRole("Marta", "marketing");
  support = await createAdminWithRole("Suki", "support");
  alice = await createTeacher("Alice");
  bob = await createTeacher("Bob");
  optedOut = await createTeacher("Quiet");
  stranded = await createProfilelessTeacher("Stranded");

  const { error } = await admin.from("email_opt_outs").insert({ email: optedOut.email, source: "admin" });
  if (error) throw new Error(`Could not opt the fixture out: ${error.message}`);
});

test.afterAll(async () => {
  const fixtures = [owner, marketing, support, alice, bob, optedOut, stranded];
  await admin
    .from("email_opt_outs")
    .delete()
    .in("email", fixtures.filter(Boolean).map((f) => f!.email));
  await admin.from("email_campaigns").delete().like("subject", `%${TAG}%`);
  await admin.from("email_broadcast_templates").delete().like("name", `%${TAG}%`);
  for (const f of fixtures) await deleteTeacher(f);
});

async function openCompose(page: Page) {
  await page.goto("/admin/emails?tab=compose");
  await expect(page.getByRole("heading", { name: "Emails & templates" })).toBeVisible();
  // The audience counts arrive after hydration; waiting on one proves React is
  // attached before anything is typed.
  await expect(page.getByTestId("count-all_teachers")).not.toHaveText("...");
}

test.describe("super admin", () => {
  test("sees the three tabs, and the preview follows what is typed", async ({ page }) => {
    await signIn(page, owner!);
    await openCompose(page);

    const tabs = page.getByRole("navigation", { name: "Emails sections" });
    for (const name of ["Compose", "History", "Templates"]) {
      await expect(tabs.getByRole("link", { name })).toBeVisible();
    }

    await page.getByLabel("Subject", { exact: true }).fill(`Hello {{firstName}} ${TAG}`);
    await page.getByLabel("Body", { exact: true }).fill(`A **unique** line ${TAG}`);

    // The preview renders as the sample reader, Sam, through the same function
    // the sender uses.
    await expect(page.getByTestId("preview-subject")).toHaveText(`Hello Sam ${TAG}`);
    const frame = page.frameLocator('iframe[title="Email preview"]');
    await expect(frame.getByText(`line ${TAG}`)).toBeVisible();
    await expect(frame.locator("strong", { hasText: "unique" })).toBeVisible();
    // Marketing is the default kind, so the footer carries an unsubscribe link.
    await expect(frame.getByRole("link", { name: "Unsubscribe" })).toBeVisible();
  });

  test("a test send goes only to the admin, and a test address is not delivered", async ({ page }) => {
    await signIn(page, owner!);
    await openCompose(page);

    await page.getByLabel("Subject", { exact: true }).fill(`Test send ${TAG}`);
    await page.getByLabel("Body", { exact: true }).fill("Checking the test button.");
    await page.getByRole("button", { name: "Send test to me" }).click();

    await expect(page.getByRole("status")).toContainText(owner!.email);
    await expect(page.getByRole("status")).toContainText("nothing was delivered");
  });

  test("a template can be created, edited, and used to start an email", async ({ page }) => {
    await signIn(page, owner!);
    await page.goto("/admin/emails?tab=templates");

    await page.getByRole("button", { name: "New template" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Template name").fill(`Welcome back ${TAG}`);
    await modal.getByLabel("Subject", { exact: true }).fill(`First subject ${TAG}`);
    await modal.getByLabel("Body", { exact: true }).fill("Template body.");
    await modal.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("cell", { name: `Welcome back ${TAG}`, exact: true })).toBeVisible();

    // Edit it.
    await page
      .getByRole("row", { name: new RegExp(`Welcome back ${TAG}`) })
      .getByRole("button", { name: "Edit" })
      .click();
    await page.getByRole("dialog").getByLabel("Subject", { exact: true }).fill(`Second subject ${TAG}`);
    await page.getByRole("dialog").getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText(`Second subject ${TAG}`)).toBeVisible();

    // Use it: Compose opens prefilled.
    await page.getByRole("link", { name: `Use Welcome back ${TAG}` }).click();
    await expect(page).toHaveURL(/tab=compose/);
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(`Second subject ${TAG}`);
  });

  test("incomplete signups are an audience, and reachable", async ({ page }) => {
    await signIn(page, owner!);
    await openCompose(page);

    const n = Number((await page.getByTestId("count-incomplete_signups").innerText()).replace(/,/g, ""));
    expect(n).toBeGreaterThanOrEqual(1);

    // And specifically this profileless fixture, through the same resolver.
    const client = await asTeacher(owner!);
    const { data, error } = await client.rpc("admin_email_audience_count", {
      p_audience: { kind: "emails", emails: [stranded!.email] },
      p_purpose: "signup_reminder",
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
  });

  test("send now runs end to end, and leaves out anyone who unsubscribed", async ({ page }) => {
    await signIn(page, owner!);
    await openCompose(page);

    const subject = `Newsletter ${TAG}`;
    await page.getByLabel("Subject", { exact: true }).fill(subject);
    await page.getByLabel("Body", { exact: true }).fill("Hi {{firstName}}, here is the news.");

    await page.getByRole("radio", { name: "Chosen addresses" }).check();
    await page
      .getByRole("textbox", { name: "Addresses" })
      .fill([alice!.email, bob!.email, optedOut!.email].join("\n"));
    await expect(page.getByText("3 addresses, 2 with a reachable Jooma account.")).toBeVisible();

    await page.getByRole("button", { name: "Send now" }).click();
    const confirm = page.getByRole("dialog");
    const go = confirm.getByRole("button", { name: "Send to 2 people" });
    await expect(go).toBeDisabled();
    await confirm.getByRole("checkbox").check();
    await go.click();

    await expect(page.getByTestId("send-progress")).toHaveText("0 sent, 0 failed, 2 skipped of 2", {
      timeout: 30_000,
    });

    // What the database recorded, read back through the service role.
    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("id, status, recipient_count, skipped_count, created_by")
      .eq("subject", subject)
      .single();
    expect(campaign!.status).toBe("sent");
    expect(campaign!.recipient_count).toBe(2);
    expect(campaign!.skipped_count).toBe(2);
    expect(campaign!.created_by).toBe(owner!.id);

    const { data: recipients } = await admin
      .from("email_campaign_recipients")
      .select("email")
      .eq("campaign_id", campaign!.id);
    const emails = (recipients ?? []).map((r) => r.email).sort();
    expect(emails).toEqual([alice!.email, bob!.email].sort());

    // And History lists it.
    await page.goto("/admin/emails?tab=history");
    await expect(page.getByRole("row", { name: new RegExp(subject) })).toContainText("Sent");
  });

  test("a send interrupted by a closed tab can be resumed from History", async ({ page }) => {
    await signIn(page, owner!);
    await page.goto("/admin/emails?tab=history");

    // Creating a campaign through the route but never calling the send loop is
    // exactly what a tab closed straight after "Send now" leaves behind.
    const subject = `Interrupted ${TAG}`;
    const res = await page.request.post("/api/admin/emails/campaigns", {
      data: {
        purpose: "information",
        content: { subject, preheader: "", heading: "", body: "Part way.", ctaLabel: "", ctaUrl: "" },
        audience: { kind: "emails", emails: [alice!.email] },
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("sending");

    await page.reload();
    const row = page.getByRole("row", { name: new RegExp(subject) });
    await expect(row).toContainText("Sending");
    await row.click();
    await page.getByRole("button", { name: "Resume sending" }).click();
    await expect(page.getByTestId("campaign-counts")).toHaveText("0 sent, 0 failed, 1 skipped of 1.");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(row).toContainText("Sent");
  });

  test("the create route no longer schedules, it always sends now", async ({ page }) => {
    await signIn(page, owner!);
    const subject = `Not later ${TAG}`;
    const res = await page.request.post("/api/admin/emails/campaigns", {
      data: {
        purpose: "information",
        content: { subject, preheader: "", heading: "", body: "Now.", ctaLabel: "", ctaUrl: "" },
        audience: { kind: "emails", emails: [bob!.email] },
        // Ignored: a stale client asking for later still gets now.
        scheduledFor: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect((await res.json()).status).toBe("sending");
  });
});

test.describe("unsubscribing", () => {
  test("the footer link asks first, then opts the reader out", async ({ page }) => {
    const { data: row } = await admin
      .from("email_campaign_recipients")
      .select("unsub_token, email_campaigns!inner(subject)")
      .eq("email", alice!.email)
      .like("email_campaigns.subject", `%${TAG}%`)
      .limit(1)
      .single();
    expect(row).not.toBeNull();

    // Signed out, the way a reader arrives from their inbox.
    await page.goto(`/unsubscribe?t=${row!.unsub_token}`);
    await expect(page.getByRole("heading", { name: "Unsubscribe from Jooma emails?" })).toBeVisible();

    // Opening the page alone must not unsubscribe: link scanners do exactly that.
    const before = await admin.from("email_opt_outs").select("email").eq("email", alice!.email);
    expect(before.data ?? []).toHaveLength(0);

    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { name: "You are unsubscribed" })).toBeVisible();

    const after = await admin.from("email_opt_outs").select("source").eq("email", alice!.email).single();
    expect(after.data?.source).toBe("link");
  });

  test("a mail client's one-click POST opts the reader out", async ({ request }) => {
    const { data: row } = await admin
      .from("email_campaign_recipients")
      .select("unsub_token, email_campaigns!inner(subject)")
      .eq("email", bob!.email)
      .like("email_campaigns.subject", `%${TAG}%`)
      .limit(1)
      .single();

    const res = await request.post(`/api/email/unsubscribe?t=${row!.unsub_token}`, {
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(res.status()).toBe(200);

    const { data } = await admin.from("email_opt_outs").select("source").eq("email", bob!.email).single();
    expect(data?.source).toBe("one_click");
  });

  test("a made-up token is refused", async ({ request }) => {
    const res = await request.post(`/api/email/unsubscribe?t=00000000-0000-4000-8000-000000000000`, {
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("roles", () => {
  test("marketing can compose, but never sees the system emails", async ({ page }) => {
    await signIn(page, marketing!);
    await openCompose(page);
    await page.goto("/admin/emails?tab=templates");
    await expect(page.getByRole("heading", { name: "Bulk email templates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "System emails" })).toHaveCount(0);
  });

  test("support edits system emails but cannot send", async ({ page }) => {
    await signIn(page, support!);
    await page.goto("/admin/emails");
    await expect(page.getByRole("heading", { name: "System emails" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Compose" })).toHaveCount(0);

    const res = await page.request.post("/api/admin/emails/campaigns", {
      data: {
        purpose: "marketing",
        content: { subject: `Nope ${TAG}`, preheader: "", heading: "", body: "x", ctaLabel: "", ctaUrl: "" },
        audience: { kind: "all_teachers" },
      },
    });
    expect(res.status()).toBe(403);
  });

  test("a teacher is refused every bulk email function", async () => {
    const client = await asTeacher(alice!);
    const counts = await client.rpc("admin_email_audience_counts", { p_purpose: "marketing" });
    expect(counts.error).not.toBeNull();

    const create = await client.rpc("admin_create_email_campaign", {
      payload: { purpose: "marketing", subject: "x", body: "x", audience: { kind: "all_teachers" } },
    });
    expect(create.error).not.toBeNull();

    // Service-role only: not even an admin's session can call these.
    const claim = await client.rpc("email_campaign_claim", {
      p_id: "00000000-0000-4000-8000-000000000000",
      p_limit: 10,
    });
    expect(claim.error).not.toBeNull();
  });

  test("the cron refuses a caller without the secret", async ({ request }) => {
    const res = await request.get("/api/cron/email-campaigns");
    expect([401, 500]).toContain(res.status());
  });
});
