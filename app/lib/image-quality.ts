// ── AI image quality and price, as configured in /admin/tools ────────────────
//
// Pure: no imports, so the admin card (client), the image generator (server)
// and the unit tests all read the same shape and the same defaults.
//
// The row lives in app_settings under IMAGE_SETTINGS_KEY. Every failure mode,
// a missing row, a malformed value, an unknown quality, degrades to DEFAULTS
// below, which is what the code did before the setting existed except that
// slide images now default to low.

export const IMAGE_SETTINGS_KEY = "image_generation";

export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/** gpt-image-1's three sizes. Portrait and landscape bill the same tokens. */
export const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

/**
 * Where an image is going, which decides its quality.
 *   title  — the slideshow's opening slide, the first thing on screen.
 *   slide  — every other slideshow image, including the small vocab grid and
 *            two-image cells, where low quality is hard to tell apart.
 *   single — one image a teacher asked for in the editor (AI tab, Regenerate).
 */
export type ImageUse = "title" | "slide" | "single";

export interface ImageSettings {
  title: ImageQuality;
  slide: ImageQuality;
  single: ImageQuality;
  /** USD per image, by size then quality. Frozen onto asset_cost at write time. */
  costUsd: Record<ImageSize, Record<ImageQuality, number>>;
}

// Prices. Medium is CALIBRATED to a real OpenAI console measurement (June: a
// 14-image deck of 12x 1024² + 2x 1536x1024 cost about $0.216 of images, so
// about $0.015 a square image). Low and high are that calibrated medium scaled
// by OpenAI's documented output-token ratio for gpt-image-1 (1024²: 272 / 1056 /
// 4160 tokens; 1536x1024: 400 / 1568 / 6208; 1024x1536: 408 / 1584 / 6240),
// rounded up. They are estimates until checked against the console, which is
// what the editable grid in /admin/tools is for.
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  title: "medium",
  slide: "low",
  single: "medium",
  costUsd: {
    "1024x1024": { low: 0.004, medium: 0.015, high: 0.059 },
    "1536x1024": { low: 0.006, medium: 0.022, high: 0.087 },
    "1024x1536": { low: 0.006, medium: 0.022, high: 0.087 },
  },
};

export function isImageQuality(v: unknown): v is ImageQuality {
  return typeof v === "string" && (IMAGE_QUALITIES as readonly string[]).includes(v);
}

/** A price is usable if it is a finite, non-negative number under $1. Anything
 *  else is a typo, and pricing an image at it would corrupt every report. */
function isPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1;
}

/**
 * Read whatever is stored into a complete, valid ImageSettings. Field by field,
 * so one bad value falls back alone rather than discarding the whole row.
 */
export function normalizeImageSettings(raw: unknown): ImageSettings {
  const d = DEFAULT_IMAGE_SETTINGS;
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawCost =
    r.costUsd && typeof r.costUsd === "object" ? (r.costUsd as Record<string, unknown>) : {};

  const costUsd = {} as ImageSettings["costUsd"];
  for (const size of IMAGE_SIZES) {
    const row =
      rawCost[size] && typeof rawCost[size] === "object"
        ? (rawCost[size] as Record<string, unknown>)
        : {};
    costUsd[size] = {} as Record<ImageQuality, number>;
    for (const q of IMAGE_QUALITIES) {
      costUsd[size][q] = isPrice(row[q]) ? row[q] : d.costUsd[size][q];
    }
  }

  return {
    title: isImageQuality(r.title) ? r.title : d.title,
    slide: isImageQuality(r.slide) ? r.slide : d.slide,
    single: isImageQuality(r.single) ? r.single : d.single,
    costUsd,
  };
}

/** The configured quality for an image going to `use`. */
export function qualityFor(settings: ImageSettings, use: ImageUse): ImageQuality {
  return settings[use];
}

/**
 * The use for a slide's MAIN image. Only the opening slide counts as the title;
 * its secondary and activity slots, and every other slide, are "slide".
 * "title-cover" is the older name for the opener, still in saved decks.
 */
export function imageUseForLayout(layout: string): ImageUse {
  return layout === "title-hero" || layout === "title-cover" ? "title" : "slide";
}

/** USD for one gpt-image-1 image. Null for a size this table does not know. */
export function gptImageCostUsd(
  settings: ImageSettings,
  size: string,
  quality: ImageQuality,
): number | null {
  const row = settings.costUsd[size as ImageSize];
  return row ? row[quality] : null;
}

/**
 * Rough image cost of an all-AI slideshow: one title image plus `slideImages`
 * others, all square (the title slide renders square today). Shown on the admin
 * card so a quality change reads as a per-deck figure, not a per-image one.
 */
export function deckImageCostUsd(settings: ImageSettings, slideImages = 10): number {
  const sq = settings.costUsd["1024x1024"];
  return sq[settings.title] + slideImages * sq[settings.slide];
}
