import { test, expect, type Page, type Route } from "@playwright/test";
import { admin, createTeacher, deleteTeacher, signIn, type TestTeacher } from "../support/users";
import { renderSlide, type SlideSpec } from "@/app/lib/slideshow-layouts";
import { DEFAULT_ART_STYLE, getTheme } from "@/app/lib/slideshowThemes";

/*
 * Ask Jo in the slides editor: the teacher asks for a change and watches Jo
 * go to the slide, ring it, and write the new words in; a slide Jo adds gets
 * its picture; the turn saves once and undoes in one click.
 *
 * The model is never called: /api/jo is answered by page.route, built from
 * the slide ids the page actually sent. The stock photo search is stubbed
 * too. NOTHING IS SPENT. The deck is real, in staging, for a throwaway
 * teacher, so Jo's edit is checked all the way to the saved row.
 *
 * localhost, never 127.0.0.1: React never hydrates on the latter here.
 */

test.setTimeout(240_000);
const NAV = { timeout: 120_000 };

const theme = getTheme("paper");
const PHOTO = "https://e2e.jooma.test/photo.png";
/** A 1x1 PNG, for every picture the page asks for. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function aiSlide(spec: Partial<SlideSpec>, first = false) {
  const full = { colorScheme: "light", accentColor: theme.palette.accent, title: "", ...spec } as SlideSpec;
  const rendered = renderSlide({ ...full, imageDataUrl: PHOTO, imageWidth: 800, imageHeight: 600 }, theme, DEFAULT_ART_STYLE);
  const skeleton: Record<string, unknown> = { ...full };
  delete skeleton.accentColor;
  return { ...rendered, skeleton, ...(first ? { themeId: "paper", artStyleId: DEFAULT_ART_STYLE } : {}) };
}

let teacher: TestTeacher;

test.beforeAll(async () => {
  teacher = await createTeacher("Joslides");
});

test.afterAll(async () => {
  await deleteTeacher(teacher);
});

async function seedDeck(): Promise<string> {
  const { data, error } = await admin
    .from("presentations")
    .insert({
      user_id: teacher.id,
      title: "Volcanoes",
      slides: [
        aiSlide({ layout: "title-hero", title: "Volcanoes", subtitle: "Year 4 Geography", imageQuery: "volcano eruption" }, true),
        aiSlide({ layout: "paper-image-right", title: "How volcanoes erupt", subHook: "Pressure builds up", bullets: ["**Magma** rises from deep underground", "**Gas** pushes it up"], imageQuery: "magma chamber diagram" }),
        aiSlide({ layout: "paper-image-left", title: "Famous volcanoes", body: "Vesuvius buried Pompeii.", imageQuery: "mount vesuvius" }),
      ],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function storedSlides(id: string) {
  const { data } = await admin.from("presentations").select("slides").eq("id", id).single();
  return data!.slides as { texts: { text: string }[]; images?: { src?: string }[]; backgroundImage?: string }[];
}

const words = (slide: { texts: { text: string }[] }) => slide.texts.map((t) => t.text).join(" ");

async function stubPictures(page: Page) {
  await page.route("https://pixabay.com/api/**", (route) => route.fulfill({ json: { hits: [{ largeImageURL: PHOTO }] } }));
  await page.route("https://e2e.jooma.test/**", (route) => route.fulfill({ status: 200, headers: { "content-type": "image/png", "access-control-allow-origin": "*" }, body: PNG }));
}

/** Jo's answer, built from the ids in what the page sent. */
function jo(build: (slides: { id: string; number: number }[]) => Record<string, unknown>) {
  return async (route: Route) => {
    const body = route.request().postDataJSON() as { snapshot: { slides: { id: string; number: number }[] } };
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify({ reply: "", clarify: null, ops: [], summary: "", ...build(body.snapshot.slides) }),
    });
  };
}

async function openDeck(page: Page, id: string) {
  await signIn(page, teacher);
  await page.goto(`/editor/${id}`);
  await expect(page.getByTestId("jo-panel")).toBeVisible(NAV);
  await expect(page.locator("[data-text-id]").first()).toBeVisible(NAV);
}

test("Jo goes to the slide, rewrites it in place, adds one with a picture, saves once and undoes", async ({ page }) => {
  const id = await seedDeck();
  await stubPictures(page);
  let sent: { kind?: string; snapshot?: { slides: { id: string; kind: string; fields?: Record<string, string> }[] } } | null = null;
  await page.route("**/api/jo", async (route) => {
    sent = route.request().postDataJSON();
    await jo((slides) => ({
      reply: "I'll simplify slide 2 and add a recap.",
      ops: [
        { op: "rewriteSlide", label: "Simplifying slide 2", slideId: slides[1].id, fields: [{ key: "title", value: "Why volcanoes blow" }, { key: "bullets", value: "Hot rock rises\nGas pushes it out" }] },
        { op: "addSlide", label: "Adding a recap slide", afterSlideId: slides[2].id, layout: "paper-image-left", fields: [{ key: "title", value: "What we learned" }, { key: "body", value: "Pressure makes volcanoes erupt." }], imageQuery: "volcano cross section" },
      ],
      summary: "Slide 2 is simpler, and there is a recap at the end.",
    }))(route);
  });

  await openDeck(page, id);
  await page.getByTestId("jo-input").fill("Make slide 2 simpler and add a recap at the end");
  await page.getByTestId("jo-send").click();

  // Jo goes to slide 2, rings it and says what it is doing.
  const ring = page.getByTestId("jo-canvas-focus");
  await expect(ring).toContainText("Simplifying slide 2", NAV);
  await expect(page.locator("[data-text-id]").filter({ hasText: "Why volcanoes blow" })).toBeVisible(NAV);

  // Then the recap slide, written in.
  await expect(ring).toContainText("Adding a recap slide", NAV);
  await expect(page.locator("[data-text-id]").filter({ hasText: "What we learned" })).toBeVisible(NAV);
  const changes = page.getByTestId("jo-changes");
  await expect(changes).toContainText("2 changes", NAV);
  await expect(page.getByTestId("jo-reply")).toContainText("there is a recap at the end");

  // What Jo was sent: the deck's words by slide, and no picture bytes.
  expect(sent).toMatchObject({ kind: "slides" });
  expect(sent!.snapshot!.slides[1]).toMatchObject({ kind: "content", fields: { title: "How volcanoes erupt" } });
  expect(JSON.stringify(sent)).not.toContain("data:image");

  // Saved: the new words, the new slide, and its picture once found.
  await expect.poll(async () => (await storedSlides(id)).length, NAV).toBe(4);
  await expect.poll(async () => words((await storedSlides(id))[1]), NAV).toContain("Why volcanoes blow");
  await expect
    .poll(async () => JSON.stringify((await storedSlides(id))[3]).includes("data:image/png"), NAV)
    .toBe(true);

  // "Show me" goes back to the slide.
  await changes.getByRole("button", { name: /Simplifying slide 2/ }).click();
  await expect(page.locator("[data-text-id]").filter({ hasText: "Why volcanoes blow" })).toBeVisible();

  // Undo puts the deck back as it was before the turn.
  await page.getByTestId("jo-undo").click();
  await expect(changes).toContainText("Undone");
  await expect.poll(async () => (await storedSlides(id)).length, NAV).toBe(3);
  await expect.poll(async () => words((await storedSlides(id))[1]), NAV).toContain("How volcanoes erupt");
});

test("the theme and slide order change through Jo too, and the chat comes back on reload", async ({ page }) => {
  const id = await seedDeck();
  await page.route(
    "**/api/jo",
    jo((slides) => ({
      reply: "Done.",
      ops: [
        { op: "moveSlide", label: "Moving slide 3 up", slideId: slides[2].id, afterSlideId: slides[0].id },
        { op: "setTheme", label: "Switching to Dark", themeId: "dark" },
      ],
      summary: "Famous volcanoes is now slide 2, on the Dark theme.",
    })),
  );

  await openDeck(page, id);
  await page.getByTestId("jo-input").fill("Move famous volcanoes up and make it dark");
  await page.getByTestId("jo-send").click();
  await expect(page.getByTestId("jo-changes")).toContainText("2 changes", NAV);

  const titleOf = (s: { texts: { text: string }[] }) => ["Famous volcanoes", "How volcanoes erupt", "Volcanoes"].find((t) => words(s).includes(t));
  await expect.poll(async () => (await storedSlides(id)).map(titleOf), NAV).toEqual(["Volcanoes", "Famous volcanoes", "How volcanoes erupt"]);
  await expect
    .poll(async () => {
      const { data } = await admin.from("presentations").select("slides").eq("id", id).single();
      return (data!.slides as { themeId?: string }[])[0].themeId;
    }, NAV)
    .toBe("dark");

  await expect
    .poll(async () => {
      const { data } = await admin.from("jo_threads").select("jo_messages(role)").eq("doc_id", id).maybeSingle();
      return ((data?.jo_messages as { role: string }[] | undefined) ?? []).length;
    }, NAV)
    .toBe(2);
  await page.reload();
  await expect(page.getByTestId("jo-user-message")).toHaveText("Move famous volcanoes up and make it dark", NAV);
  await expect(page.getByTestId("jo-changes")).toContainText("Switching to Dark");
});
