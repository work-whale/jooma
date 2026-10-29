import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, setPlan, signIn, type TestTeacher } from "../support/users";
import { GUEST_COOKIE, guestCookieValue } from "@/app/lib/guest-cookie";
import { normalizeDraft, parseSheet, serializeSheet, sheetImages } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { placePicture } from "@/app/lib/sheets/picture-fill";

/*
 * Pictures on a Worksheet or Comprehension: asked for on the form, found once
 * the text has streamed, changed by clicking one on the page or from Design.
 * A free try gets web pictures, and sees the rest with a lock.
 *
 * The model is never called, and nor is the picture search for a signed in
 * teacher: /api/worksheet-generator, /api/comprehension-generator and
 * /api/sheet-picture are answered by page.route, and the pictures themselves
 * come from a made up host. NOTHING IS SPENT. The guest route test at the end
 * is real: one Pixabay search per picture, stored in staging's images bucket.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

/** A 1x1 PNG, for every picture the page loads. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const PIC = (name: string) => `https://cdn.test/${name}.png`;

function encodePrefill(prefill: { slug: string; fields: Record<string, unknown> }): string {
  return Buffer.from(JSON.stringify(prefill), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What the model streams with pictures asked for: one near the top, one later. */
const MODEL_SHEET = {
  title: "The water cycle",
  objective: "I am learning to describe the water cycle.",
  intro: { variant: "fact", label: "Did you know?", text: "The water you drink may be millions of years old.", emoji: "💧" },
  sections: [
    {
      title: "Warm up",
      emoji: "🔥",
      instructions: "Circle the right answer.",
      blocks: [
        { type: "image", query: "water cycle evaporation diagram", alt: "A diagram of water rising from the sea into clouds." },
        { type: "mcq", prompt: "What is it called when water turns into a gas?", options: ["Evaporation", "Freezing", "Melting"], answers: [0], marks: 1 },
      ],
    },
    {
      title: "Have a go",
      emoji: "✏️",
      instructions: "",
      blocks: [
        { type: "image", query: "rain clouds over hills", alt: "Grey rain clouds over green hills." },
        { type: "short", prompt: "Why does rain fall?", lines: 2, answer: "Water droplets in clouds get too heavy.", marks: 2 },
      ],
    },
  ],
  teacherNotes: [],
};

/** Pictures load from a made up host, with the CORS header the PDF needs. */
async function servePictures(page: Page) {
  await page.route("https://cdn.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG }),
  );
}

const sheet = (page: Page) => page.getByTestId("sheet-document");

/** Jo fills a prefilled form field by field; touching the form before it has
 *  finished stops the fill. Wait for its question, and fill in the rest by hand. */
async function waitForJoFill(page: Page) {
  await page.getByRole("button", { name: /check the inputs first/i }).click(NAV);
}
const photos = (page: Page) => sheet(page).locator(".js-pages .js-photo");

test.describe("signed in", () => {
  let teacher: TestTeacher;
  test.beforeAll(async () => {
    teacher = await createTeacher("Pictures");
  });
  test.afterAll(async () => {
    await deleteTeacher(teacher);
  });

  async function latestRun(tool: string) {
    const { data } = await admin
      .from("tool_runs")
      .select("id, output, input")
      .eq("user_id", teacher.id)
      .eq("tool_slug", tool)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as { id: string; output: string; input: Record<string, unknown> } | null;
  }

  test("pictures asked for on the form are found after the text, and saved with the run", async ({ page }) => {
    await signIn(page, teacher);
    await servePictures(page);

    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/worksheet-generator", (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: JSON.stringify(MODEL_SHEET) });
    });
    const asked: Record<string, unknown>[] = [];
    await page.route("**/api/sheet-picture", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      asked.push(body);
      // The first is found after a moment, so the placeholder can be seen; the
      // second finds nothing.
      if (body.query === "water cycle evaporation diagram") {
        await new Promise((r) => setTimeout(r, 1500));
        return route.fulfill({ json: { src: PIC("cycle"), width: 1536, height: 1024, source: "web" } });
      }
      return route.fulfill({ status: 404, json: { error: "No picture found" } });
    });

    const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", subject: "Science", learningObjective: "Describe the water cycle" };
    await page.goto(`/tools/worksheet-generator?prefill=${encodePrefill({ slug: "worksheet-generator", fields })}`);
    await waitForJoFill(page);

    // Off until asked for; on, web search is the free default.
    const field = page.getByTestId("pictures-field");
    await expect(field).toBeVisible(NAV);
    await expect(field.getByRole("radio")).toHaveCount(0);
    await field.getByRole("checkbox").check();
    await expect(field.getByRole("radio", { name: "Web search" })).toHaveAttribute("aria-checked", "true");
    await expect(field.getByText("Picture style")).toHaveCount(0);

    await page.locator("[data-jo-generate]").click({ timeout: 30_000 });

    // While it is still finding, the frame says so.
    await expect(photos(page).first()).toContainText("Finding a picture...", NAV);
    await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
    expect(sent).toMatchObject({ pictures: { source: "web", style: "illustration" } });

    // One request per picture, with the sheet's title to anchor it.
    expect(asked.map((a) => a.query).sort()).toEqual(["rain clouds over hills", "water cycle evaporation diagram"]);
    expect(asked[0]).toMatchObject({ source: "web", tool: "worksheet", title: "The water cycle" });

    // Found: the picture. Not found: an empty frame to fill, never a broken image.
    await expect(photos(page)).toHaveCount(2);
    await expect(photos(page).nth(0).locator("img")).toHaveAttribute("src", PIC("cycle"));
    await expect(photos(page).nth(1).locator("img")).toHaveCount(0);
    await expect(photos(page).nth(1).getByRole("button", { name: "Find a picture" })).toBeVisible();

    // Questions are numbered as if the pictures were not there.
    await expect(sheet(page).locator(".js-pages .js-num")).toHaveText(["1", "2"]);

    // The run is saved with what was found, and nothing still "finding".
    await expect.poll(async () => (await latestRun("worksheet-generator"))?.output ?? "", NAV).toContain(PIC("cycle"));
    const run = (await latestRun("worksheet-generator"))!;
    expect(run.output).not.toContain('"finding"');
    expect(run.input).toMatchObject({ pictures: { source: "web" } });

    // The pupil's copy leaves out the frame that has nothing in it.
    await page.getByTestId("sheet-preview-toggle").click();
    await expect(photos(page)).toHaveCount(1);
  });

  test("a picture is changed by clicking it, resized from its toolbar, and hidden from Design", async ({ page }) => {
    await servePictures(page);
    // A saved run with one picture found and one not.
    const ctx = sheetContext("worksheet", { yearGroup: "Year 4", subject: "Science" });
    let doc = normalizeDraft(MODEL_SHEET, ctx);
    doc = placePicture(doc, sheetImages(doc)[0].id, { src: PIC("cycle"), width: 1536, height: 1024, source: "web" });
    const { data, error } = await admin
      .from("tool_runs")
      .insert({ user_id: teacher.id, tool_slug: "worksheet-generator", title: "Seeded water cycle", input: {}, output: serializeSheet(doc) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const runId = data.id as string;
    const stored = async () => parseSheet((await admin.from("tool_runs").select("output").eq("id", runId).single()).data!.output as string)!;

    await page.route("**/api/upload-image", (route) => route.fulfill({ json: { src: PIC("mine") } }));
    await signIn(page, teacher);
    await page.goto(`/tools/worksheet-generator?run=${runId}`);
    await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);

    // Click the picture itself: the chooser opens on its own search.
    await photos(page).nth(0).locator(".js-photo-change").click();
    const dialog = page.getByTestId("sheet-picture-dialog");
    await expect(dialog.getByRole("heading", { name: "Change picture" })).toBeVisible();
    await expect(dialog.getByPlaceholder("Search photos...")).toHaveValue("water cycle evaporation diagram");

    // Upload one of their own: stored first, then on the page.
    await dialog.getByRole("tab", { name: /Upload/ }).click();
    await dialog.getByTestId("sheet-picture-file").setInputFiles({ name: "mine.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog).toHaveCount(0);
    await expect(photos(page).nth(0).locator("img")).toHaveAttribute("src", PIC("mine"));
    await expect.poll(async () => sheetImages(await stored())[0].src, NAV).toBe(PIC("mine"));
    expect(sheetImages(await stored())[0].source).toBe("upload");

    // Bigger from the toolbar: the frame is the large size.
    const block = sheet(page).locator('.js-pages .js-block[data-block="image"]').nth(0);
    const frame = block.locator(".js-photo-frame");
    const before = (await frame.boundingBox())!.height;
    await block.hover();
    await block.getByRole("button", { name: "Large picture" }).click();
    await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(before);
    await expect.poll(async () => sheetImages(await stored())[0].size, NAV).toBe("l");

    // Undo puts it back.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(sheet(page).locator('.js-pages .js-photo[data-size="m"]').first()).toBeVisible();

    // Design lists the pictures, changes one, and switches them all off.
    await page.getByTestId("sheet-design-toggle").click();
    const group = page.getByTestId("sheet-design-pictures");
    await expect(group.getByRole("button", { name: /Change picture/ })).toHaveCount(2);
    await group.getByRole("button", { name: "Change picture 2" }).click();
    await expect(page.getByTestId("sheet-picture-dialog").getByRole("heading", { name: "Choose a picture" })).toBeVisible();
    await page.getByTestId("sheet-picture-dialog").getByRole("button", { name: "Close" }).click();

    await group.getByRole("checkbox", { name: "Show pictures" }).uncheck();
    await expect(photos(page)).toHaveCount(0);
    await expect.poll(async () => (await stored()).design.pictures, NAV).toBe(false);

    // Survives a reload.
    await page.reload();
    await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
    await expect(photos(page)).toHaveCount(0);
  });

  test("a comprehension with AI pictures sends the source and style it was set to", async ({ page }) => {
    await signIn(page, teacher);
    await servePictures(page);
    let sent: Record<string, unknown> | null = null;
    await page.route("**/api/comprehension-generator", (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: JSON.stringify({
          title: "Busy bees",
          objective: "",
          intro: { variant: "fact", label: "", text: "", emoji: "" },
          sections: [
            { title: "Read the text", emoji: "📖", instructions: "", blocks: [{ type: "image", query: "honeybee flower pollen", alt: "A bee on a flower." }, { type: "passage", title: "Busy bees", paragraphs: ["Bees carry pollen."] }] },
            { title: "Retrieval", emoji: "🔎", instructions: "", blocks: [{ type: "short", prompt: "What do bees carry?", quote: "", lines: 2, answer: "Pollen", marks: 1, domain: "2b" }] },
          ],
          teacherNotes: [],
        }),
      });
    });
    const asked: Record<string, unknown>[] = [];
    await page.route("**/api/sheet-picture", (route) => {
      asked.push(route.request().postDataJSON());
      return route.fulfill({ json: { src: PIC("bee"), width: 1536, height: 1024, source: "ai", style: "storybook" } });
    });

    const fields = { curriculum: "2014 National Curriculum", yearGroup: "Year 4", topic: "Bees" };
    await page.goto(`/tools/comprehension-generator?prefill=${encodePrefill({ slug: "comprehension-generator", fields })}`);
    await waitForJoFill(page);
    const field = page.getByTestId("pictures-field");
    await field.getByRole("checkbox").check(NAV);
    await field.getByRole("radio", { name: "AI-generated" }).click();
    await field.getByRole("radio", { name: "Storybook" }).click();
    // Generated pictures cost credits, and the form says so.
    await expect(field).toContainText("Generated pictures use more credits.");

    await page.locator("[data-jo-generate]").click(NAV);
    await expect(sheet(page)).toHaveAttribute("data-ready", "true", NAV);
    await expect(photos(page).first().locator("img")).toHaveAttribute("src", PIC("bee"), NAV);
    expect(sent).toMatchObject({ pictures: { source: "ai", style: "storybook" } });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ source: "ai", style: "storybook", tool: "comprehension", query: "honeybee flower pollen" });
  });

  test("the picture route needs a plan, and refuses a request with nothing to look for", async ({ page }) => {
    const planned = await createTeacher("Picplan");
    try {
      // No plan: refused by the spend gate before anything is searched or made.
      await signIn(page, planned);
      const free = await page.request.post("/api/sheet-picture", { data: { query: "volcano", source: "ai", tool: "worksheet" } });
      expect(free.status()).toBe(402);

      await setPlan(planned, "pro", "comped");
      const empty = await page.request.post("/api/sheet-picture", { data: { query: "", source: "web", tool: "worksheet" } });
      expect(empty.status()).toBe(400);
      const bad = await page.request.post("/api/sheet-picture", { data: { query: "volcano", source: "everywhere", tool: "worksheet" } });
      expect(bad.status()).toBe(400);
      const noTool = await page.request.post("/api/sheet-picture", { data: { query: "volcano", source: "web", tool: "lesson" } });
      expect(noTool.status()).toBe(400);
    } finally {
      await deleteTeacher(planned);
    }
  });
});

test.describe("signed out", () => {
  const TRIAL_ID = "33333333-4444-4555-8666-777777777777";

  test("a free try shows every picture option, and the paid ones ask them to sign up", async ({ page }) => {
    await servePictures(page);
    await page.route("**/api/try/prefill", (route) =>
      route.fulfill({
        json: {
          prefill: encodePrefill({
            slug: "worksheet-generator",
            fields: { curriculum: "2014 National Curriculum", yearGroup: "Year 4", subject: "Science", learningObjective: "Describe the water cycle" },
          }),
        },
      }),
    );
    let sentWorksheet: Record<string, unknown> | null = null;
    await page.route("**/api/try/worksheet", (route) => {
      sentWorksheet = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8", "x-trial-id": TRIAL_ID },
        body: JSON.stringify(MODEL_SHEET),
      });
    });
    // The server fills the stored try and hands the filled sheet back.
    let askedFor: Record<string, unknown> | null = null;
    await page.route("**/api/try/sheet-pictures", (route) => {
      askedFor = route.request().postDataJSON();
      const ctx = sheetContext("worksheet", { yearGroup: "Year 4", subject: "Science" });
      let doc = normalizeDraft(MODEL_SHEET, ctx);
      doc = placePicture(doc, sheetImages(doc)[0].id, { src: PIC("cycle"), width: 1536, height: 1024, source: "web" });
      doc = placePicture(doc, sheetImages(doc)[1].id, null);
      return route.fulfill({ json: { sheet: serializeSheet(doc) } });
    });
    // The stock search inside the chooser.
    await page.route("https://pixabay.com/api/**", (route) =>
      route.fulfill({ json: { hits: [{ id: 1, previewURL: PIC("thumb"), largeImageURL: PIC("stock"), tags: "rain, clouds", user: "someone", pageURL: "https://pixabay.com/x" }] } }),
    );
    await page.route("https://api.pexels.com/**", (route) => route.fulfill({ json: { photos: [] } }));
    await page.route("https://api.unsplash.com/**", (route) => route.fulfill({ json: { results: [] } }));

    await page.goto("/create?tool=ws&topic=The%20water%20cycle%2C%20Year%204");
    const field = page.getByTestId("pictures-field");
    await field.getByRole("checkbox").check(NAV);

    // Made-for-you pictures are shown, locked: choosing one asks them to sign
    // up and leaves the free web search chosen.
    const ai = field.getByRole("radio", { name: /AI-generated/ });
    await expect(ai).toHaveAttribute("data-locked", "true");
    await ai.click();
    const gate = page.getByTestId("auth-gate");
    await expect(gate.getByRole("heading")).toHaveText("Sign up for free to unlock every editor tool");
    await expect(gate).toContainText("Searching for a photo is free here.");
    await gate.getByRole("button", { name: "Close" }).click();
    await expect(field.getByRole("radio", { name: "Web search" })).toHaveAttribute("aria-checked", "true");
    await expect(field.getByText("Picture style")).toHaveCount(0);

    const generate = page.locator("[data-jo-generate]");
    await expect(generate).toBeEnabled(NAV);
    await generate.click();

    const result = page.getByTestId("guest-result");
    await expect(result.locator(".js-pages .js-photo img").first()).toHaveAttribute("src", PIC("cycle"), NAV);
    expect(sentWorksheet).toMatchObject({ pictures: { source: "web" } });
    expect(askedFor).toEqual({ trialId: TRIAL_ID });

    // The chooser: AI and Upload are there, locked; Search works.
    await result.locator(".js-pages .js-photo").nth(1).locator(".js-photo-change").click();
    const dialog = page.getByTestId("sheet-picture-dialog");
    await expect(dialog).toContainText("Made-for-you pictures and uploads come with a subscription.");
    for (const name of [/AI picture/, /Upload/]) {
      const tab = dialog.getByRole("tab", { name });
      await expect(tab).toHaveAttribute("data-locked", "true");
    }
    await dialog.getByRole("tab", { name: /AI picture/ }).click();
    await expect(page.getByTestId("auth-gate").getByRole("heading")).toHaveText("Sign up for free to unlock every editor tool");
    await page.getByTestId("auth-gate").getByRole("button", { name: "Close" }).click();
    await expect(dialog.getByRole("tab", { name: /Search/ })).toHaveAttribute("aria-selected", "true");

    await dialog.getByRole("button", { name: "rain, clouds" }).click();
    await expect(dialog).toHaveCount(0);
    // A guest has no session to store with: the photo stays on the page.
    await expect(result.locator(".js-pages .js-photo").nth(1).locator("img")).toHaveAttribute("src", /^data:image\/png/);
  });

  test("the guest picture route fills only the visitor's own try, from the web, once", async ({ request }) => {
    const secret = process.env.TRIAL_SECRET?.trim();
    test.skip(!secret || secret.length < 16, "TRIAL_SECRET is not set in .env.local");
    const guestId = randomUUID();
    const ctx = sheetContext("worksheet", { yearGroup: "Year 4", subject: "Science" });
    const text = serializeSheet(normalizeDraft(MODEL_SHEET, ctx));
    const { data, error } = await admin
      .from("trial_generations")
      .insert({ guest_id: guestId, tool: "worksheet-generator", status: "done", title: "The water cycle", input: {}, output: { text }, run_id: randomUUID(), ip_hash: "e2e-not-a-real-ip" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = data.id as string;
    const cookie = (guest: string) => ({ Cookie: `${GUEST_COOKIE}=${guestCookieValue(guest, secret!)}` });

    try {
      // Someone else's cookie, or none, finds nothing to fill.
      expect((await request.post("/api/try/sheet-pictures", { data: { trialId: id }, headers: cookie(randomUUID()) })).status()).toBe(404);
      expect((await request.post("/api/try/sheet-pictures", { data: { trialId: id } })).status()).toBe(404);

      // Their own, even asking for AI pictures: web pictures, stored in the try.
      const res = await request.post("/api/try/sheet-pictures", { data: { trialId: id, source: "ai" }, headers: cookie(guestId) });
      expect(res.status()).toBe(200);
      const filled = parseSheet(((await res.json()) as { sheet: string }).sheet)!;
      const srcs = sheetImages(filled).map((b) => b.src).filter(Boolean);
      expect(srcs.length).toBeGreaterThan(0);
      // Stored with the "pixabay" filename hint: a web picture, never AI.
      for (const src of srcs) expect(src).toMatch(/pixabay/);
      expect(sheetImages(filled).every((b) => !b.finding)).toBe(true);

      const { data: row } = await admin.from("trial_generations").select("output").eq("id", id).single();
      const stored = parseSheet((row!.output as { text: string }).text)!;
      expect(sheetImages(stored).map((b) => b.src)).toEqual(sheetImages(filled).map((b) => b.src));

      // Again: what was found is kept, not searched for and replaced.
      const again = parseSheet(((await (await request.post("/api/try/sheet-pictures", { data: { trialId: id }, headers: cookie(guestId) })).json()) as { sheet: string }).sheet)!;
      for (const [i, b] of sheetImages(filled).entries()) if (b.src) expect(sheetImages(again)[i].src).toBe(b.src);
    } finally {
      await admin.from("trial_generations").delete().eq("id", id);
    }
  });
});
