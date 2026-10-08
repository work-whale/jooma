import { test, expect } from "@playwright/test";
import { toThumbnailUrl } from "@/app/lib/imageUrl";

/*
 * Squashed pictures in slide thumbnails (admin "Made with Jooma", the landing
 * strip, the Slideshows list).
 *
 * Supabase's /render/image/ endpoint, given only a width, keeps the source's
 * height: a 1024x1024 picture at width=200 came back 200x1024, and MiniSlide
 * drew that strip into a square. `resize=contain` scales both sides, so the
 * rewritten URL must always carry it.
 */

const OBJECT = "https://x.supabase.co/storage/v1/object/public/images/pic.png";

test("asks for contain so the picture keeps its shape (regression)", () => {
  expect(toThumbnailUrl(OBJECT, 101)).toBe(
    "https://x.supabase.co/storage/v1/render/image/public/images/pic.png?width=200&resize=contain&quality=75",
  );
});

test("appends to an existing query string", () => {
  expect(toThumbnailUrl(`${OBJECT}?v=2`, 240)).toBe(
    "https://x.supabase.co/storage/v1/render/image/public/images/pic.png?v=2&width=300&resize=contain&quality=75",
  );
});

test("leaves everything that is not a public Storage URL alone", () => {
  expect(toThumbnailUrl(undefined, 200)).toBeUndefined();
  expect(toThumbnailUrl("data:image/png;base64,AAAA", 200)).toBe("data:image/png;base64,AAAA");
  expect(toThumbnailUrl("https://cdn.pixabay.com/a.jpg", 200)).toBe("https://cdn.pixabay.com/a.jpg");
});
