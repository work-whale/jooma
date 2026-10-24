import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sceneThumbUrl } from "@/app/lib/imageUrl";

/*
 * The small copies of the theme backgrounds that thumbnails draw.
 *
 * A thumbnail of a themed slide used to download the full 2 MB background; the
 * homepage's showcase cards pulled about 8 MB that way. MiniSlide in thumbnail
 * mode now asks for /scenes/thumbs/<name>.webp. If a new scene is added without
 * running scripts/make-scene-thumbs.mjs, every thumbnail using it would show a
 * blank background, so this fails first.
 */

const SCENES = join(process.cwd(), "public", "scenes");

test("every scene has a thumbnail", () => {
  const missing = readdirSync(SCENES)
    .filter((n) => n.endsWith(".png"))
    .filter((n) => !existsSync(join(SCENES, "thumbs", n.replace(/\.png$/, ".webp"))));
  expect(missing, "run node scripts/make-scene-thumbs.mjs").toEqual([]);
});

test("thumbnails are small", () => {
  for (const n of readdirSync(join(SCENES, "thumbs"))) {
    expect(statSync(join(SCENES, "thumbs", n)).size, n).toBeLessThan(150_000);
  }
});

test("a scene path maps to its thumbnail, and nothing else changes", () => {
  expect(sceneThumbUrl("/scenes/paper.png")).toBe("/scenes/thumbs/paper.webp");
  expect(sceneThumbUrl("/scenes/forest-3-watercolor.png")).toBe("/scenes/thumbs/forest-3-watercolor.webp");
  expect(sceneThumbUrl("https://example.com/scenes/paper.png")).toBe("https://example.com/scenes/paper.png");
  expect(sceneThumbUrl("/uploads/photo.png")).toBe("/uploads/photo.png");
  expect(sceneThumbUrl(undefined)).toBeUndefined();
});
