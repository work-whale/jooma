import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";

/*
 * The free tries from the landing hero, end to end in the browser.
 *
 *   hero box  ->  /create  ->  Jo fills what it can  ->  the visitor finishes
 *   and generates  ->  a read only preview  ->  any action asks them to sign up
 *   ->  after signing in, the work is claimed and the action they pressed runs.
 *
 * Every /api/try call is stubbed with page.route, so NOTHING REACHES A MODEL
 * AND NOTHING IS SPENT. What these guard is the page: what it sends, what it
 * shows, and where it goes. The server side (the cookie, the once a day rule,
 * the claim) is covered by the unit tests in tests/unit/guest-*.spec.ts.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// The dev server compiles each route on first visit and talks to the hosted
// staging database, so a first navigation can take most of a minute. Generous
// waits here say nothing about how fast the page is in production.
test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const SLIDE = {
  shapes: [],
  images: [],
  background: "#ffffff",
  texts: [
    {
      id: "t1",
      x: 80,
      y: 80,
      width: 800,
      text: "Volcanoes and the Ring of Fire",
      fontSize: 40,
      fontWeight: "800",
      fontStyle: "normal",
      underline: false,
      fontFamily: "Inter, sans-serif",
      color: "#1a1a1a",
      textAlign: "left",
    },
  ],
};

function sse(events: [string, unknown][]): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}

/** Stub everything /create can call, so the page runs without a model. */
async function stubGuestApi(page: Page, opts: { prefill?: string | null; deckStatus?: number } = {}) {
  const calls = { slideshow: [] as Record<string, unknown>[], finalize: [] as Record<string, unknown>[] };

  await page.route("**/api/try/prefill", (route) =>
    route.fulfill({ json: { prefill: opts.prefill ?? null } }),
  );
  await page.route("**/api/suggest-subject", (route) =>
    route.fulfill({ json: { subject: "", strand: "" } }),
  );
  await page.route("**/api/try/slideshow/finalize", (route) => {
    calls.finalize.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/try/slideshow", (route) => {
    calls.slideshow.push(route.request().postDataJSON());
    if (opts.deckStatus && opts.deckStatus !== 200) {
      return route.fulfill({
        status: opts.deckStatus,
        json: {
          error: "You have used today's free Slides. Sign up to keep going, it is free to start.",
          reason: "used",
        },
      });
    }
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "x-trial-id": "11111111-2222-4333-8444-555555555555" },
      body: sse([
        ["status", { message: "Designing your deck..." }],
        ["meta", { title: "Volcanoes and the Ring of Fire", total: 1 }],
        ["slide", { index: 0, total: 1, slide: SLIDE }],
        ["complete", { title: "Volcanoes and the Ring of Fire" }],
      ]),
    });
  });
  return calls;
}

test.describe("signed out", () => {
  test("the hero box opens /create with the tool and topic", async ({ page }) => {
    await stubGuestApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: /Volcanoes and the Ring of Fire, Year 3/ }).click();
    await expect(page.getByLabel("What are you teaching?")).toHaveValue("Volcanoes and the Ring of Fire, Year 3");

    await page.getByRole("link", { name: /^Create/ }).click();
    await page.waitForURL(/\/create\?tool=slides&topic=Volcanoes/, NAV);
    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue(/Volcanoes/, NAV);
  });

  test("an empty box does not navigate, and Worksheets is not open yet", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Create/ }).click();
    await expect(page).toHaveURL(/\/$|\/#try$/);

    await page.getByRole("tab", { name: /Worksheets/ }).click();
    await expect(page.getByText("Coming soon").first()).toBeVisible();
    await expect(page.getByLabel("What are you teaching?")).toBeDisabled();
  });

  test("Jo's year lands in the wizard, the deck streams in, and Export asks them to sign up", async ({ page }) => {
    const calls = await stubGuestApi(page, {
      prefill: encodePrefill({ slug: "slideshow", fields: { topic: "Volcanoes and the Ring of Fire", year: "Year 3" } }),
    });
    await page.goto("/create?tool=slides&topic=Volcanoes%2C%20Year%203");

    // Jo's read of the topic, typed into the real wizard.
    const topic = page.locator('input[name="lesson-topic"]');
    await expect(topic).toHaveValue("Volcanoes and the Ring of Fire", NAV);
    await expect(page.getByRole("button", { name: /Year 3/ }).first()).toBeVisible();

    // The visitor finishes the inputs themselves: every step of the wizard.
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /Generate slideshow/ }).click();

    const deck = page.getByTestId("guest-deck");
    await expect(deck).toBeVisible();
    await expect(deck.getByRole("heading", { name: "Volcanoes and the Ring of Fire" })).toBeVisible();
    await expect(deck.getByText(/1 slides, ready/)).toBeVisible();

    // What the page sent: the wizard's params plus an empty honeypot, and
    // never a run id of its own (the server mints those).
    expect(calls.slideshow).toHaveLength(1);
    expect(calls.slideshow[0]).toMatchObject({ topic: "Volcanoes and the Ring of Fire", year: "Year 3", website: "" });
    expect(calls.slideshow[0].runId).toBeUndefined();

    // The finished deck is handed back once, for the account they will make.
    await expect.poll(() => calls.finalize.length).toBe(1);
    expect(calls.finalize[0]).toMatchObject({ id: "11111111-2222-4333-8444-555555555555" });
    expect((calls.finalize[0].slides as unknown[]).length).toBe(1);

    await deck.getByRole("button", { name: /Export/ }).click();
    const gate = page.getByTestId("auth-gate");
    await expect(gate).toBeVisible();
    await expect(gate.getByRole("heading")).toHaveText("Sign up for free to export your deck");
    await expect(gate.getByRole("link", { name: "I already have an account" })).toHaveAttribute("href", "/login");

    // Remembered for after sign up.
    const pending = await page.evaluate(() => localStorage.getItem("jooma:pending-action"));
    expect(JSON.parse(pending!)).toMatchObject({ action: "export", kind: "slides" });

    // The email carries on into the real sign up, prefilled.
    await gate.getByPlaceholder("you@school.sch.uk").fill("new.teacher@example.com");
    await gate.getByRole("button", { name: "Start free trial" }).click();
    await page.waitForURL(/\/signup\?email=new\.teacher%40example\.com/, NAV);
    await expect(page.locator("#email")).toHaveValue("new.teacher@example.com", NAV);
  });

  test("Ask Jo edits the slides wizard in place and knows the topic (regression)", async ({ page }) => {
    // Jo used to see only the chat (so it asked for a topic, with chips for
    // unrelated ones), and its update remounted the wizard. Now the page sends
    // what the form says, and Jo's fields land without disturbing the rest.
    await stubGuestApi(page, {
      prefill: encodePrefill({ slug: "slideshow", fields: { topic: "Recycling and sustainability", year: "Year 5" } }),
    });
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/try/assistant", (route) => {
      sent = route.request().postDataJSON();
      const header = Buffer.from(
        JSON.stringify({ slug: "slideshow", fields: { year: "Year 6", slideCount: 10 } }),
        "utf8",
      ).toString("base64");
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-assistant-tool": header },
        body: "Done, Year 6 and 10 slides.",
      });
    });
    await page.goto("/create?tool=slides&topic=Recycling%20and%20sustainability%2C%20Year%205");

    const topic = page.locator('input[name="lesson-topic"]');
    await expect(topic).toHaveValue("Recycling and sustainability", NAV);
    // Something the visitor typed themselves, which Jo must not wipe.
    await page.locator('textarea[name="lesson-instructions"]').fill("Include a sorting activity.");

    await page.getByLabel("Message Jo").fill("change to year 6 and 10 slides");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: /Year 6/ }).first()).toBeVisible(NAV);
    await expect(page.getByRole("button", { name: /10 slides/ }).first()).toBeVisible();
    await expect(topic).toHaveValue("Recycling and sustainability");
    await expect(page.locator('textarea[name="lesson-instructions"]')).toHaveValue("Include a sorting activity.");

    // What Jo was told: the wizard's real values.
    expect(sent).toMatchObject({
      guestTool: "slideshow",
      context: { topic: "Recycling and sustainability", year: "Year 5" },
    });
  });

  test("today's free try used: the sign up prompt explains it", async ({ page }) => {
    await stubGuestApi(page, { deckStatus: 429 });
    await page.goto("/create?tool=slides&topic=Volcanoes");

    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /Generate slideshow/ }).click();

    const gate = page.getByTestId("auth-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("You have used today's free Slides");
    await expect(page.getByTestId("guest-deck")).toHaveCount(0);
  });

  test("a comprehension Jo filled opens ready to generate (regression)", async ({ page }) => {
    // Jo fills year, topic and curriculum but never the content domains, and
    // the form used to open with all of them unticked and Generate disabled.
    await page.route("**/api/try/prefill", (route) =>
      route.fulfill({
        json: {
          prefill: encodePrefill({
            slug: "comprehension-generator",
            fields: { topic: "Why do bees matter?", yearGroup: "Year 4", curriculum: "2014 National Curriculum" },
          }),
        },
      }),
    );
    await page.route("**/api/try/comprehension", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": "abc" },
        body: "# Why do bees matter?\n\nBees carry pollen from flower to flower.\n\n## 2b Retrieval\n\n1. What do bees carry? [1 mark]",
      }),
    );
    await page.goto("/create?tool=comp&topic=Why%20do%20bees%20matter%3F");

    const generate = page.locator("[data-jo-generate]");
    await expect(generate).toBeEnabled(NAV);
    await generate.click();

    const result = page.getByTestId("guest-result");
    await expect(result).toContainText("Bees carry pollen");
    await result.getByRole("button", { name: /Copy/ }).click();
    await expect(page.getByTestId("auth-gate").getByRole("heading")).toHaveText(
      "Sign up for free to copy your comprehension",
    );
  });

  test("a signed in teacher is sent to the real tool instead", async ({ page }) => {
    const teacher = await createTeacher("Tryredirect");
    try {
      await signIn(page, teacher);
      await page.goto("/create?tool=slides&topic=Volcanoes");
      await page.waitForURL(/\/tools\/slideshow\?prefill=/, NAV);
    } finally {
      await deleteTeacher(teacher);
    }
  });
});

test.describe("after signing up", () => {
  let teacher: TestTeacher;
  let deckId: string;

  test.beforeAll(async () => {
    teacher = await createTeacher("Tryclaim");
    const { data, error } = await admin
      .from("presentations")
      .insert({ user_id: teacher.id, title: "Volcanoes and the Ring of Fire", slides: [SLIDE] })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    deckId = data.id as string;
  });

  test.afterAll(async () => {
    await deleteTeacher(teacher);
  });

  test("the claimed deck opens in the editor with Export already open", async ({ page }) => {
    await signIn(page, teacher);

    // As a guest they pressed Export, then signed up. The claim itself is
    // stubbed (the migration that backs it is pushed separately); what is
    // checked here is where the claim takes them.
    await page.evaluate(() =>
      localStorage.setItem(
        "jooma:pending-action",
        JSON.stringify({ action: "export", kind: "slides", at: Date.now() }),
      ),
    );
    await page.context().addCookies([
      { name: "jooma_guest_has_work", value: "1", url: "http://localhost:3000" },
    ]);
    await page.route("**/api/try/claim", (route) =>
      route.fulfill({ json: { claimed: [{ kind: "slides", id: deckId, title: "Volcanoes and the Ring of Fire" }] } }),
    );

    await page.goto("/dashboard");
    await expect(page.getByText(/is now in your library/)).toBeVisible(NAV);
    await page.waitForURL(new RegExp(`/editor/${deckId}`), NAV);

    // ?then=export pressed the editor's own Export button.
    await expect(page.getByText("Download PowerPoint (PPTX)")).toBeVisible(NAV);
    // And the parameter is gone, so a refresh does not press it again.
    await expect(page).not.toHaveURL(/then=/);
    expect(await page.evaluate(() => localStorage.getItem("jooma:pending-action"))).toBeNull();
  });
});
