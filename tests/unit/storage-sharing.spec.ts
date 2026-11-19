import { test, expect } from "@playwright/test";
import { contentAddressedName } from "@/app/lib/contentName";
import { TRIAL_RETENTION_DAYS, trialRetentionCutoff, isPastRetention } from "@/app/lib/trial-retention";
import { planTrialCleanup } from "@/app/lib/trial-cleanup";
import { sweepablePaths } from "@/app/lib/storageSweep";

/*
 * Keeping the `images` bucket small (Nov 2026: production hit the free plan's
 * 1 GB, 970 MB of it images).
 *
 *   - Uploads are named by their content, so the same Pixabay photo pulled into
 *     ten decks is stored once instead of ten times (911 extra copies, 169 MB).
 *   - Guest tries are kept 14 days, then their pictures are reclaimed (378 MB
 *     was held by unclaimed guest decks alone).
 *   - Because one file can now belong to many resources, nothing may delete a
 *     file on the strength of "this row pointed at it": every sweep goes
 *     through storage_paths_in_use() and keeps whatever that says is live.
 */

const bytes = (s: string) => new TextEncoder().encode(s);
const URL_OF = (path: string) => `https://x.supabase.co/storage/v1/object/public/images/${path}`;

test.describe("content-addressed upload names", () => {
  test("the same bytes always get the same name", () => {
    const a = contentAddressedName(bytes("one picture"), "pixabay", "jpg");
    const b = contentAddressedName(bytes("one picture"), "pixabay", "jpg");
    expect(a).toBe(b);
  });

  test("different bytes get different names", () => {
    const a = contentAddressedName(bytes("one picture"), "pixabay", "jpg");
    const b = contentAddressedName(bytes("one picturf"), "pixabay", "jpg");
    expect(a).not.toBe(b);
  });

  test("no timestamp or randomness: a second upload cannot drift", () => {
    const name = contentAddressedName(bytes("x"), "ai", "png");
    // 32 hex chars of sha256, the hint, the extension. Nothing else.
    expect(name).toMatch(/^[0-9a-f]{32}_ai\.png$/);
  });

  test("the hint keeps the source readable and is sanitised", () => {
    expect(contentAddressedName(bytes("x"), "Pix Abay!!", "jpg")).toMatch(/_pix-abay\.jpg$/);
    expect(contentAddressedName(bytes("x"), "../../etc/passwd", "jpg")).toMatch(/^[0-9a-f]{32}_etc-passwd\.jpg$/);
    expect(contentAddressedName(bytes("x"), "a".repeat(100), "jpg").split("_")[1]).toHaveLength(40 + ".jpg".length);
  });

  test("a missing or empty hint falls back to 'image'", () => {
    expect(contentAddressedName(bytes("x"), undefined, "png")).toMatch(/_image\.png$/);
    expect(contentAddressedName(bytes("x"), "!!!", "png")).toMatch(/_image\.png$/);
  });

  test("the extension is part of the name, so a PNG and a JPEG of one source never collide", () => {
    expect(contentAddressedName(bytes("x"), "ai", "png")).not.toBe(contentAddressedName(bytes("x"), "ai", "jpg"));
  });

  test("empty input still names deterministically rather than throwing", () => {
    expect(contentAddressedName(new Uint8Array(0), "ai", "png")).toMatch(/^[0-9a-f]{32}_ai\.png$/);
  });
});

test.describe("guest trial retention", () => {
  test("is 14 days", () => {
    expect(TRIAL_RETENTION_DAYS).toBe(14);
  });

  test("the cutoff is exactly 14 days before now", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(trialRetentionCutoff(now).toISOString()).toBe("2026-11-04T12:00:00.000Z");
  });

  test("a try one millisecond inside the window is kept, at or past it is not", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(isPastRetention("2026-11-04T12:00:00.001Z", now)).toBe(false);
    expect(isPastRetention("2026-11-04T12:00:00.000Z", now)).toBe(true);
    expect(isPastRetention("2026-10-01T00:00:00Z", now)).toBe(true);
  });

  test("an unreadable date is never treated as expired", () => {
    expect(isPastRetention("not a date", new Date())).toBe(false);
  });
});

test.describe("planning a guest trial cleanup", () => {
  test("collects every picture across a deck's nested slides", () => {
    const plan = planTrialCleanup([
      {
        id: "t1",
        output: {
          slides: [
            { elements: [{ type: "image", src: URL_OF("a_pixabay.jpg") }] },
            { backgroundImage: URL_OF("b_ai.jpg") },
          ],
        },
      },
    ]);
    expect(plan.ids).toEqual(["t1"]);
    expect(plan.refs.map((r) => r.path).sort()).toEqual(["a_pixabay.jpg", "b_ai.jpg"]);
  });

  test("a file shared by two tries is listed once", () => {
    const shared = { slides: [{ src: URL_OF("same_pixabay.jpg") }] };
    const plan = planTrialCleanup([
      { id: "t1", output: shared },
      { id: "t2", output: shared },
    ]);
    expect(plan.ids).toEqual(["t1", "t2"]);
    expect(plan.refs).toHaveLength(1);
  });

  test("text-only and empty outputs still get cleared, with no files", () => {
    const plan = planTrialCleanup([
      { id: "t1", output: { text: "A comprehension with no pictures" } },
      { id: "t2", output: null },
    ]);
    expect(plan.ids).toEqual(["t1", "t2"]);
    expect(plan.refs).toEqual([]);
  });

  test("thumbnail URLs resolve to the same file as plain ones", () => {
    const plan = planTrialCleanup([
      {
        id: "t1",
        output: {
          slides: [
            { src: URL_OF("p.jpg") },
            { src: "https://x.supabase.co/storage/v1/render/image/public/images/p.jpg?width=400" },
          ],
        },
      },
    ]);
    expect(plan.refs).toEqual([{ bucket: "images", path: "p.jpg" }]);
  });
});

test.describe("what a sweep may delete", () => {
  const refs = [
    { bucket: "images", path: "a.jpg" },
    { bucket: "images", path: "b.jpg" },
    { bucket: "audio", path: "c.mp3" },
  ];

  test("files the reference check calls live are kept", () => {
    const out = sweepablePaths(refs, new Set(["a.jpg"]));
    expect(out.get("images")).toEqual(["b.jpg"]);
    expect(out.get("audio")).toEqual(["c.mp3"]);
  });

  test("grouped by bucket so each bucket is one remove() call", () => {
    const out = sweepablePaths(refs, new Set());
    expect([...out.keys()].sort()).toEqual(["audio", "images"]);
  });

  test("a failed reference check (null) deletes nothing at all", () => {
    expect(sweepablePaths(refs, null).size).toBe(0);
  });

  test("every file in use leaves no empty bucket entries behind", () => {
    const out = sweepablePaths(refs, new Set(["a.jpg", "b.jpg", "c.mp3"]));
    expect(out.size).toBe(0);
  });

  test("no refs, nothing to do", () => {
    expect(sweepablePaths([], new Set()).size).toBe(0);
  });
});
