import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { GUEST_COOKIE, guestCookieValue } from "@/app/lib/guest-cookie";

/*
 * The free tries from the landing hero, end to end in the browser.
 *
 *   hero box  ->  /create  ->  Jo fills what it can  ->  the visitor finishes
 *   and generates  ->  the editor, in guest mode  ->  present, export and the
 *   paid tools ask them to sign up
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
          error: "You have used today's three free tries. Sign up to keep going, it is free to start.",
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

const TRIAL_ID = "22222222-3333-4444-8555-666666666666";

/** A comprehension free try, streamed as a sheet, with Jo's form fill. */
async function stubComprehension(page: Page) {
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
      headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": TRIAL_ID },
      body: JSON.stringify({
        title: "Why do bees matter?",
        objective: "",
        intro: { variant: "fact", label: "", text: "", emoji: "" },
        sections: [
          { title: "Read the text", emoji: "📖", instructions: "", blocks: [{ type: "passage", title: "Busy bees", paragraphs: ["Bees carry pollen from flower to flower."] }] },
          { title: "Retrieval", emoji: "🔎", instructions: "", blocks: [{ type: "short", prompt: "What do bees carry?", quote: "", lines: 2, answer: "Pollen", marks: 1, domain: "2b" }] },
        ],
        teacherNotes: [],
      }),
    }),
  );
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

  test("the teacher count stands alone, with no countries under it", async ({ page }) => {
    await page.goto("/");

    // The count comes from Vercel analytics, which a machine without the token
    // cannot reach.
    const count = page.getByTestId("hero-count");
    test.skip((await count.count()) === 0, "Vercel analytics is not configured here");

    await expect(count).toBeVisible();
    await expect(page.getByTestId("hero-countries")).toHaveCount(0);
  });

  test("Jo's year lands in the wizard, the deck streams into the editor, and Export asks them to sign up", async ({ page }) => {
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

    // The teacher's own editor, in guest mode, with the deck streamed into it.
    const title = page.getByPlaceholder("Untitled Slideshow");
    await expect(title).toHaveValue("Volcanoes and the Ring of Fire", NAV);

    // What the page sent: the wizard's params plus an empty honeypot, and
    // never a run id of its own (the server mints those).
    expect(calls.slideshow).toHaveLength(1);
    expect(calls.slideshow[0]).toMatchObject({ topic: "Volcanoes and the Ring of Fire", year: "Year 3", website: "" });
    expect(calls.slideshow[0].runId).toBeUndefined();

    // The finished deck is saved to the free try, for the account they will make.
    await expect.poll(() => calls.finalize.length, NAV).toBeGreaterThanOrEqual(1);
    expect(calls.finalize[0]).toMatchObject({ id: "11111111-2222-4333-8444-555555555555" });
    expect((calls.finalize[0].slides as unknown[]).length).toBe(1);

    // Editing works, and the edit is saved to the same try.
    const before = calls.finalize.length;
    await title.fill("Volcanoes, edited");
    await expect.poll(() => calls.finalize.length, NAV).toBeGreaterThan(before);
    expect(calls.finalize.at(-1)).toMatchObject({
      id: "11111111-2222-4333-8444-555555555555",
      title: "Volcanoes, edited",
    });

    // Present is behind sign up.
    const gate = page.getByTestId("auth-gate");
    await page.getByRole("button", { name: "Present" }).click();
    await expect(gate.getByRole("heading")).toHaveText("Sign up for free to present your deck");
    await gate.getByRole("button", { name: "Close" }).click();

    // So is Export, from either format in its menu.
    await page.getByRole("button", { name: "Export options" }).click();
    await page.getByRole("menuitem", { name: /PowerPoint/ }).click();
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

  test("in the guest editor, Elements, Text and picture search are open, the rest is behind sign up", async ({ page }) => {
    await stubGuestApi(page);
    await page.goto("/create?tool=slides&topic=Volcanoes");
    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /Generate slideshow/ }).click();
    await expect(page.getByPlaceholder("Untitled Slideshow")).toHaveValue("Volcanoes and the Ring of Fire", NAV);

    const gate = page.getByTestId("auth-gate");
    const tab = (name: string) => page.getByRole("button", { name, exact: true });

    // Locked tabs open the prompt, never their panel.
    for (const name of ["Activities", "Audio", "Video"]) {
      await tab(name).click();
      await expect(gate.getByRole("heading")).toHaveText("Sign up for free to unlock every editor tool");
      await gate.getByRole("button", { name: "Close" }).click();
      await expect(gate).toHaveCount(0);
    }

    // Open tabs open, with no prompt.
    await tab("Elements").click();
    await expect(gate).toHaveCount(0);
    await tab("Text").click();
    await expect(gate).toHaveCount(0);

    // Pictures: stock search is open; Upload and generating are not. Reopened
    // each time: closing the prompt is a click outside the sidebar, which
    // closes its panel, as any click outside it does.
    for (const name of ["Upload", "AI generate"]) {
      await tab("Pictures").click();
      await expect(gate).toHaveCount(0);
      await page.getByRole("button", { name, exact: true }).click();
      await expect(gate).toBeVisible();
      await gate.getByRole("button", { name: "Close" }).click();
    }
  });

  test("Ask Jo is not on the forms, only beside a finished comprehension, which opens it", async ({ page }) => {
    await stubGuestApi(page);
    // Folded on an earlier visit: a finished generation opens it again.
    await page.addInitScript(() => window.localStorage.setItem("jooma:jo-open", "0"));

    await page.goto("/create?tool=slides&topic=Volcanoes");
    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
    await expect(page.getByTestId("jo-panel")).toHaveCount(0);

    // Registered after the slides check: its prefill answers for the comprehension.
    await stubComprehension(page);

    await page.goto("/create?tool=comp&topic=Why%20do%20bees%20matter%3F");
    const generate = page.locator("[data-jo-generate]");
    await expect(generate).toBeEnabled(NAV);
    await expect(page.getByTestId("jo-panel")).toHaveCount(0);
    await generate.click();

    await expect(page.getByTestId("guest-result")).toContainText("Bees carry pollen", NAV);
    await expect(page.getByTestId("jo-panel")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("jo-prompts-left")).toContainText("3 free messages with Jo left");
    // No voice on a free try: it is offered on sign up instead.
    await expect(page.getByTestId("jo-voice-toggle")).toHaveCount(0);
  });

  test("a visitor gets three messages with Jo per comprehension, then the sign up card", async ({ page }) => {
    await stubGuestApi(page);
    await stubComprehension(page);

    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/try/jo**", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { left: 3 } });
      bodies.push(route.request().postDataJSON());
      const n = bodies.length;
      const body =
        n === 1
          ? { reply: "Which part?", clarify: { question: "What should change?", options: ["The passage", "The questions"], multi: false }, ops: [], summary: "" }
          : { reply: "On it.", clarify: null, ops: [{ op: "setText", label: `Rewording question ${n}`, target: "s1b0.prompt", text: `What do bees carry, take ${n}?` }], summary: "Reworded." };
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-jo-prompts-left": String(3 - n) },
        body: JSON.stringify(body),
      });
    });

    await page.goto("/create?tool=comp&topic=Why%20do%20bees%20matter%3F");
    await page.locator("[data-jo-generate]").click({ timeout: 120_000 });
    const result = page.getByTestId("guest-result");
    await expect(result).toContainText("Bees carry pollen", NAV);

    // 1: a question back. Answering it is the second message.
    await page.getByTestId("jo-input").fill("change it");
    await page.getByTestId("jo-send").click();
    await expect(page.getByTestId("jo-prompts-left")).toContainText("2 free messages", NAV);
    await page.getByTestId("jo-question").getByRole("button", { name: "The questions" }).click();
    await expect(result).toContainText("What do bees carry, take 2?", NAV);
    await expect(page.getByTestId("jo-prompts-left")).toContainText("1 free message ");

    // 3: the last one, then the card in place of the box.
    await page.getByTestId("jo-input").fill("again please");
    await page.getByTestId("jo-send").click();
    await expect(result).toContainText("What do bees carry, take 3?", NAV);
    await expect(page.getByTestId("jo-signup")).toBeVisible();
    await expect(page.getByTestId("jo-input")).toHaveCount(0);
    // What was done stays readable above it.
    await expect(page.getByTestId("jo-changes")).toHaveCount(2);

    // Every message carried the free try and the honeypot, and the sheet.
    for (const b of bodies) {
      expect(b).toMatchObject({ kind: "sheet", trialId: TRIAL_ID, website: "" });
    }

    await page.getByTestId("jo-signup").getByRole("button", { name: "Sign up free" }).click();
    await expect(page.getByTestId("auth-gate")).toContainText("keep editing with Jo");
  });

  test("the server's limit shows the same card (regression)", async ({ page }) => {
    await stubGuestApi(page);
    await stubComprehension(page);
    await page.route("**/api/try/jo**", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { left: 1 } })
        : route.fulfill({ status: 403, json: { error: "That's your free messages with Jo for this one.", code: "jo_trial_limit", left: 0 } }),
    );
    await page.goto("/create?tool=comp&topic=Why%20do%20bees%20matter%3F");
    await page.locator("[data-jo-generate]").click({ timeout: 120_000 });
    await expect(page.getByTestId("jo-prompts-left")).toContainText("1 free message ", NAV);
    await page.getByTestId("jo-input").fill("shorter please");
    await page.getByTestId("jo-send").click();
    await expect(page.getByTestId("jo-signup")).toBeVisible(NAV);
  });

  test("today's free tries used: the sign up prompt explains it", async ({ page }) => {
    await stubGuestApi(page, { deckStatus: 429 });
    await page.goto("/create?tool=slides&topic=Volcanoes");

    await expect(page.locator('input[name="lesson-topic"]')).toHaveValue("Volcanoes", NAV);
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.getByRole("button", { name: /Generate slideshow/ }).click();

    const gate = page.getByTestId("auth-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("You have used today's three free tries");
    // Back on the form exactly where they left it, the last step of the
    // wizard, not in an empty editor.
    await gate.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: /Generate slideshow/ })).toBeVisible();
    await expect(page.getByPlaceholder("Untitled Slideshow")).toHaveCount(0);
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
    // The route streams the comprehension as a sheet (JSON), not markdown.
    await page.route("**/api/try/comprehension", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": "abc" },
        body: JSON.stringify({
          title: "Why do bees matter?",
          objective: "",
          intro: { variant: "fact", label: "", text: "", emoji: "" },
          sections: [
            { title: "Read the text", emoji: "📖", instructions: "", blocks: [{ type: "passage", title: "Busy bees", paragraphs: ["Bees carry pollen from flower to flower."] }] },
            { title: "Retrieval", emoji: "🔎", instructions: "", blocks: [{ type: "short", prompt: "What do bees carry?", quote: "", lines: 2, answer: "Pollen", marks: 1, domain: "2b" }] },
          ],
          teacherNotes: [],
        }),
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

test.describe("a guest's own creations", () => {
  // Real rows and the real save route, not stubs: reopening is server side
  // (the page reads the try against the signed guest cookie) and so is saving.
  // Nothing here reaches a model.
  const guestId = randomUUID();
  const title = `Reopened deck ${Date.now().toString(36)}`;
  let runId: string;

  test.beforeAll(async () => {
    const { data, error } = await admin
      .from("trial_generations")
      .insert({
        guest_id: guestId,
        tool: "slideshow",
        status: "done",
        title,
        input: { topic: title },
        // Saved once already, two days ago: older than a day, which the save
        // route used to refuse even though the list still showed the deck.
        output: { slides: [SLIDE], savedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 },
        run_id: randomUUID(),
        ip_hash: "e2e-not-a-real-ip",
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    runId = data.id as string;
  });

  test.afterAll(async () => {
    await admin.from("trial_generations").delete().eq("id", runId);
  });

  test("one of Your creations reopens in the editor, and edits to it save (regression)", async ({ page }) => {
    const secret = process.env.TRIAL_SECRET?.trim();
    test.skip(!secret || secret.length < 16, "TRIAL_SECRET is not set in .env.local");
    await page.context().addCookies([
      { name: GUEST_COOKIE, value: guestCookieValue(guestId, secret!), url: "http://localhost:3000" },
    ]);

    await page.goto("/create?tool=slides");
    const creations = page.getByRole("region", { name: "Your creations" });
    await expect(creations).toBeVisible(NAV);

    // A click, the way a visitor does it: a client navigation to this same
    // page, which used to change the URL and open nothing.
    await creations.getByRole("link", { name: new RegExp(title) }).click();
    const deckTitle = page.getByPlaceholder("Untitled Slideshow");
    await expect(deckTitle).toHaveValue(title, NAV);

    // Edited, and saved to the same try.
    await deckTitle.fill(`${title} edited`);
    await expect
      .poll(
        async () =>
          (await admin.from("trial_generations").select("title").eq("id", runId).single()).data?.title,
        NAV,
      )
      .toBe(`${title} edited`);

    // The way back is to the list, not the landing page.
    await expect(page.getByRole("link", { name: "Back to your creations" })).toHaveAttribute(
      "href",
      "/create?tool=slides",
    );
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
