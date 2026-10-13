import { test, expect } from "@playwright/test";
import {
  admin,
  createAdmin,
  createTeacher,
  deleteTeacher,
  setPlan,
  signIn,
  type TestTeacher,
} from "../support/users";
import {
  IMAGE_SETTINGS_KEY,
  normalizeImageSettings,
  type ImageSettings,
} from "@/app/lib/image-quality";

/*
 * The Image generation card on /admin/tools.
 *
 * AI images are billed per image, so they had no row in the tools table and no
 * admin control: every slideshow image was medium, priced from a hardcoded
 * table. The card sets the quality per use and the price per size and quality,
 * stored in app_settings.image_generation.
 *
 * The save test needs that row, which arrives with the
 * 20261013000000_image_generation_settings migration; before it is pushed the
 * card must say it is running on defaults instead of pretending to save.
 *
 * Tests tagged @lab make real images and spend real money (a few pence), so
 * they only run with IMAGE_LAB=1.
 */

let person: TestTeacher | null = null;
let teacher: TestTeacher | null = null;
let stored: { value: unknown } | null = null;
let settings: ImageSettings;

test.beforeAll(async () => {
  person = await createAdmin("Ivy");
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", IMAGE_SETTINGS_KEY)
    .maybeSingle();
  stored = data;
  settings = normalizeImageSettings(data?.value);
});

test.afterAll(async () => {
  await deleteTeacher(person);
  await deleteTeacher(teacher);
});

test("shows each image use at its configured quality, with the price grid", async ({ page }) => {
  await signIn(page, person!);
  await page.goto("/admin/tools");

  await expect(page.getByRole("heading", { name: "Image generation" })).toBeVisible();
  await expect(page.getByLabel("Slideshow title image")).toHaveValue(settings.title);
  await expect(page.getByLabel("Other slideshow images")).toHaveValue(settings.slide);
  await expect(page.getByLabel("Single images")).toHaveValue(settings.single);

  // 3 qualities x 3 sizes.
  await expect(page.getByTestId("image-price-grid").locator("input")).toHaveCount(9);
  await expect(page.getByLabel("low 1024x1024 price")).toHaveValue(
    String(settings.costUsd["1024x1024"].low),
  );
});

test("the per-deck figure follows the quality picker before saving", async ({ page }) => {
  await signIn(page, person!);
  await page.goto("/admin/tools");

  const figure = page.getByTestId("deck-image-cost");
  const before = await figure.textContent();
  const other = settings.slide === "high" ? "low" : "high";
  await page.getByLabel("Other slideshow images").selectOption(other);
  await expect(figure).not.toHaveText(before ?? "");
});

test("saving writes the row the image generator reads", async ({ page }) => {
  test.skip(!stored, "image_generation row not in this database yet: push the migration");

  const next = settings.slide === "medium" ? "low" : "medium";
  try {
    await signIn(page, person!);
    await page.goto("/admin/tools");
    await page.getByLabel("Other slideshow images").selectOption(next);
    await page.getByRole("button", { name: "Save image settings" }).click();
    await expect(page.getByText("Image settings saved.")).toBeVisible();

    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", IMAGE_SETTINGS_KEY)
      .single();
    expect(normalizeImageSettings(data!.value).slide).toBe(next);
  } finally {
    // Put back exactly what was there, whatever happened above.
    await admin.from("app_settings").update({ value: stored!.value }).eq("key", IMAGE_SETTINGS_KEY);
  }
});

test("without the row the card says so and cannot save", async ({ page }) => {
  test.skip(!!stored, "image_generation row exists here");

  await signIn(page, person!);
  await page.goto("/admin/tools");
  await expect(page.getByText("Running on defaults.")).toBeVisible();
  await page.getByLabel("Other slideshow images").selectOption("high");
  await expect(page.getByRole("button", { name: "Save image settings" })).toBeDisabled();
});

test.describe("@lab real images", () => {
  test.skip(process.env.IMAGE_LAB !== "1", "spends real money: set IMAGE_LAB=1");
  test.setTimeout(240_000);

  test("side by side: one image per quality, priced and logged as a lab run", async ({ page }) => {
    await signIn(page, person!);
    await page.goto("/admin/tools");

    const started = new Date().toISOString();
    await page.getByRole("button", { name: /^Generate 2 images$/ }).click();
    const results = page.getByTestId("image-test-results");
    await expect(results.getByRole("img")).toHaveCount(2, { timeout: 200_000 });
    // The <img> appears with its URL before the picture has downloaded.
    for (const img of await results.getByRole("img").all()) {
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), {
          timeout: 60_000,
        })
        .toBeGreaterThan(0);
    }
    await results.screenshot({ path: "test-results/image-lab-side-by-side.png" });

    const { data: rows } = await admin
      .from("asset_cost")
      .select("cost_usd, step")
      .eq("user_id", person!.id)
      .gte("created_at", started);
    const costs = (rows ?? []).map((r) => Number(r.cost_usd)).sort();
    expect(rows!.every((r) => r.step === "model-lab")).toBe(true);
    expect(costs).toEqual([settings.costUsd["1024x1024"].low, settings.costUsd["1024x1024"].medium]);
  });

  test("a teacher sending __labQuality gets the configured quality, not theirs", async ({ page }) => {
    teacher = await createTeacher("Tom");
    // Past the paywall: a planless teacher gets a 402 before the route runs.
    await setPlan(teacher, "pro", "comped");
    await signIn(page, teacher);

    const res = await page.request.post("/api/generate-image", {
      data: { prompt: "A red apple on a desk", orientation: "square", __labQuality: "high" },
      timeout: 200_000,
    });
    expect(res.ok(), `${res.status()} ${await res.text()}`).toBe(true);
    const body = await res.json();
    expect(body.quality).toBe(settings.single);
    expect(body.costUsd).toBe(settings.costUsd["1024x1024"][settings.single]);

    const { data: rows } = await admin
      .from("asset_cost")
      .select("step")
      .eq("user_id", teacher.id);
    expect(rows!.map((r) => r.step)).toEqual([null]);
  });
});
