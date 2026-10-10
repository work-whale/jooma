import { test, expect } from "@playwright/test";
import {
  PICKER_THEMES,
  SLIDESHOW_THEMES,
  THEME_FAMILIES,
  getThemesByFamily,
  defaultFamilyForYear,
  DEFAULT_THEME_FOR_FAMILY,
  getTheme,
  themeDesign,
} from "@/app/lib/slideshowThemes";
import { renderSlide, rerenderSlideWithTheme, type SlideSpec } from "@/app/lib/slideshow-layouts";
import { GOOGLE_FONTS } from "@/app/components/editor/googleFonts";
import type { ShapeType } from "@/app/lib/presentations";

/*
 * Slide themes in three families: Playful, Professional, Basic.
 *
 * The picker is organised by family, and each designed theme draws its look
 * (title treatment, card, photo frame, callout, motif) on top of the layout.
 * These pin the parts that fail silently: a theme with no family vanishes from
 * the picker, a font missing from the loader falls back to the browser's, and
 * a motif drawn above the photos or in a shape PowerPoint cannot draw ruins
 * the exported deck rather than the editor, where nobody would notice.
 */

const SAMPLE: SlideSpec = {
  layout: "paper-image-right",
  colorScheme: "light",
  accentColor: "#5B2ED6",
  title: "The Water Cycle",
  subHook: "Where does rain come from?",
  body: "Heat from the Sun **evaporates** water.",
  bullets: ["**Evaporation**: water turns to vapour"],
  calloutVariant: "key",
  calloutLabel: "Key point",
  calloutBody: "Water goes round and round.",
  imageDataUrl: "data:image/png;base64,AAAA",
  imageWidth: 540,
  imageHeight: 560,
  // The skeleton a generated slide carries, so it can be re-themed.
};

// Shapes the PPTX export maps to a native PowerPoint shape (Editor.tsx).
const PPTX_SAFE: ShapeType[] = [
  "rect", "ellipse", "triangle", "line", "arrow", "star", "hexagon", "pentagon",
  "octagon", "diamond", "heart", "cloud", "speech", "plus", "bolt",
];

test.describe("families", () => {
  test("every theme belongs to a family, and each family has its own designs", () => {
    for (const t of SLIDESHOW_THEMES) expect(["playful", "professional", "basic"]).toContain(t.family);
    for (const f of THEME_FAMILIES) {
      const themes = getThemesByFamily(f.id);
      expect(themes.length).toBeGreaterThanOrEqual(5);
      expect(themes.map((t) => t.id)).toContain(DEFAULT_THEME_FOR_FAMILY[f.id]);
    }
    // Every pickable theme appears in exactly one tab.
    const listed = THEME_FAMILIES.flatMap((f) => getThemesByFamily(f.id).map((t) => t.id));
    expect(listed.length).toBe(PICKER_THEMES.length);
    expect(new Set(listed).size).toBe(PICKER_THEMES.length);
  });

  test("the busy subject variants and Bold are out of the picker, but old decks still find them", () => {
    const retired = [
      "math-pop", "math-neon", "math-citrus", "science-pop", "science-cosmic", "science-botanic",
      "history-pop", "history-explorer", "history-royal", "english-storybook", "english-comic", "english-poetry", "bold",
    ];
    const listed = new Set(THEME_FAMILIES.flatMap((f) => getThemesByFamily(f.id).map((t) => t.id)));
    for (const id of retired) {
      expect(listed.has(id), id).toBe(false);
      // A deck made with it keeps its own theme rather than falling back.
      expect(getTheme(id).id).toBe(id);
    }
    // The other art themes stay.
    for (const id of ["paper", "light", "dark", "warm", "ocean", "forest", "math", "english"]) expect(listed.has(id), id).toBe(true);
  });

  test("text and headings on every pickable theme are easy to read", () => {
    for (const t of PICKER_THEMES) {
      const p = t.palette;
      expect(contrast(p.text, p.background), `${t.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.headingColor ?? p.accent, p.background), `${t.id} heading`).toBeGreaterThanOrEqual(3);
    }
  });

  test("the picker opens on Playful up to Year 6 and Professional after", () => {
    for (const y of ["Nursery", "Reception", "Year 1", "Year 6", "", undefined]) expect(defaultFamilyForYear(y)).toBe("playful");
    for (const y of ["Year 7", "Year 11", "Year 13", "Adult learners"]) expect(defaultFamilyForYear(y)).toBe("professional");
  });

  test("every theme font is one the editor loads", () => {
    const loaded = new Set(GOOGLE_FONTS.map((f) => f.name));
    const first = (family: string) => family.split(",")[0].trim().replace(/['"]/g, "");
    for (const t of SLIDESHOW_THEMES) {
      expect(loaded, `${t.id} heading`).toContain(first(t.fonts.heading));
      expect(loaded, `${t.id} body`).toContain(first(t.fonts.body));
    }
  });

  test("names and descriptions use no em or en dashes", () => {
    for (const t of SLIDESHOW_THEMES) expect(`${t.name} ${t.description}`).not.toMatch(/[–—]/);
  });
});

test.describe("what a designed theme draws", () => {
  test("motifs and cards sit behind the photos, locked, in shapes PowerPoint can draw", () => {
    for (const t of SLIDESHOW_THEMES) {
      const slide = renderSlide(SAMPLE, t);
      const backdrop = slide.shapes.filter((s) => s.id.startsWith("dec_"));
      for (const s of backdrop) {
        expect(s.z ?? 0, `${t.id} ${s.type}`).toBeLessThan(0);
        expect(s.locked, `${t.id} ${s.type}`).toBe(true);
      }
      for (const s of slide.shapes) expect(PPTX_SAFE, `${t.id}`).toContain(s.type);
      if (themeDesign(t).motif !== "none") expect(backdrop.length, t.id).toBeGreaterThan(0);
    }
  });

  test("the scene motifs stay quiet: at the edges, and small", () => {
    const quiet = ["waves", "hills", "sun", "clouds", "sprinkles", "leaves"];
    const themes = PICKER_THEMES.filter((t) => quiet.includes(themeDesign(t).motif));
    // Every scene motif is used by at least one theme.
    expect(new Set(themes.map((t) => themeDesign(t).motif))).toEqual(new Set(quiet));
    const W = 1280, H = 720;
    for (const t of themes) {
      const backdrop = renderSlide(SAMPLE, t).shapes.filter((s) => s.id.startsWith("dec_"));
      expect(backdrop.length, t.id).toBeGreaterThan(0);
      let area = 0;
      for (const s of backdrop) {
        const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
        // Nothing centred on the middle of the slide, where the lesson is.
        expect(cx > 180 && cx < W - 180 && cy > 130 && cy < H - 130, `${t.id} ${s.type} at ${cx},${cy}`).toBe(false);
        const w = Math.max(0, Math.min(W, s.x + s.width) - Math.max(0, s.x));
        const h = Math.max(0, Math.min(H, s.y + s.height) - Math.max(0, s.y));
        area += w * h;
      }
      expect(area / (W * H), `${t.id} covers`).toBeLessThan(0.18);
    }
  });

  test("a motif is the same every time a slide is rendered", () => {
    const strip = (s: { type: string; x: number; y: number; width: number }) => [s.type, s.x, s.y, s.width];
    const a = renderSlide(SAMPLE, getTheme("confetti")).shapes.filter((s) => s.id.startsWith("dec_")).map(strip);
    const b = renderSlide(SAMPLE, getTheme("confetti")).shapes.filter((s) => s.id.startsWith("dec_")).map(strip);
    expect(a).toEqual(b);
  });

  test("the title treatment follows the theme", () => {
    const pill = renderSlide(SAMPLE, getTheme("sticker"));
    const title = pill.texts.find((t) => t.text === "The Water Cycle")!;
    expect(title.color.toUpperCase()).toBe("#FFFFFF");
    expect(pill.shapes.some((s) => s.id.startsWith("ttl_"))).toBe(true);

    const plain = renderSlide(SAMPLE, getTheme("clean"));
    expect(plain.shapes.some((s) => s.id.startsWith("ttl_"))).toBe(false);
  });

  test("photo frames follow the theme", () => {
    expect(renderSlide(SAMPLE, getTheme("confetti")).images[0].frame).toBe("blob");
    const circle = renderSlide(SAMPLE, getTheme("space")).images[0];
    expect(circle.frame).toBe("circle");
    expect(circle.width).toBe(circle.height);
    expect(renderSlide(SAMPLE, getTheme("editorial")).images[0].frame).toBe("none");
  });

  test("switching theme keeps the slide's photo", () => {
    const original = { ...renderSlide(SAMPLE, getTheme("paper")), skeleton: { ...SAMPLE } };
    for (const id of ["confetti", "space", "editorial", "mono"]) {
      const rethemed = rerenderSlideWithTheme(original, getTheme(id));
      expect(rethemed.images[0]?.src, id).toBe(SAMPLE.imageDataUrl);
    }
  });
});

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
