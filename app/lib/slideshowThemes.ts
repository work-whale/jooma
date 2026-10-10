// Visual themes for slideshows. Themes are purely a visual skin: background
// colours, text colours, fonts, accent. They do NOT influence the AI-generated
// content — the same slide skeleton renders identically across themes apart
// from styling. Think of these like phone/website themes.
//
// Adding a theme: append an entry below. No other code changes required —
// the modal and renderer read from this list dynamically.

/** Groups themes in the picker. `classic` = clean timeless skins, `scenic` =
 *  illustrated landscapes, and one group per school subject. Within a family
 *  tab these become the filter chips (Scenic, Maths, Science...). */
export type ThemeCategory = "classic" | "scenic" | "math" | "science" | "history" | "english";

/**
 * The three style families the theme picker is organised by.
 *
 *   playful       bright and bold, rounded type, motifs: younger classes.
 *   professional  calm and editorial, serif or grotesk type, fine rules.
 *   basic         plain and legible, no motifs: low stimulation and access.
 */
export type ThemeFamily = "playful" | "professional" | "basic";

/** Accessibility qualities a theme was designed for, shown as filter chips. */
export type ThemeTag = "dyslexia-friendly" | "low-stimulation" | "high-contrast";

/**
 * How a theme draws the parts every generated slide shares. Applied by
 * renderSlide (slideshow-layouts.ts) on top of the layout, so each layout keeps
 * its geometry and only the treatment changes. Everything it draws is shapes,
 * texts and image settings the editor already has, so it survives editing,
 * thumbnails, present mode and the PPTX export.
 */
export interface ThemeDesign {
  /** plain; underline (accent bar under the title); highlight (marker swash
   *  behind it); pill (title set white on an accent pill); kicker (a short
   *  accent rule above it, the editorial convention). */
  title: "plain" | "underline" | "highlight" | "pill" | "kicker";
  /** A sheet under the slide's content: none, soft (paper with a shadow),
   *  outline (a drawn border), offset (ink border with a hard offset shadow). */
  card: "none" | "soft" | "outline" | "offset";
  /** How photos are framed. polaroid adds a white border, shadow and a tilt;
   *  sticker a thick ink outline. */
  frame: "rounded" | "square" | "circle" | "blob" | "arch" | "polaroid" | "sticker";
  /** Callout boxes: tint (flat colour), sticky (note with a strip of tape),
   *  rule (tint with an accent bar), outline (drawn box, no fill). */
  callout: "tint" | "sticky" | "rule" | "outline";
  /** Decoration drawn behind the content, always under photos. The last six
   *  are quiet hints of a scene, kept to the edges and corners: waves along
   *  the bottom, low hills, a sun peeking in, a few clouds, a sprinkle of
   *  confetti, a few leaves. */
  motif:
    | "none" | "confetti" | "dots" | "stars" | "doodles" | "blobs" | "grid" | "rules" | "corners"
    | "waves" | "hills" | "sun" | "clouds" | "sprinkles" | "leaves";
}

/** Each family's default treatment. A theme overrides what it needs. */
export const FAMILY_DESIGN: Record<ThemeFamily, ThemeDesign> = {
  playful: { title: "underline", card: "none", frame: "rounded", callout: "tint", motif: "none" },
  professional: { title: "kicker", card: "none", frame: "rounded", callout: "rule", motif: "none" },
  basic: { title: "plain", card: "none", frame: "rounded", callout: "tint", motif: "none" },
};

export interface SlideshowTheme {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
  family: ThemeFamily;
  tags?: ThemeTag[];
  /** Taken out of the picker. Kept here so decks already made with it still
   *  find their theme (getTheme) and look as they did. */
  retired?: true;
  design?: Partial<ThemeDesign>;
  palette: {
    background: string;       // default slide bg color
    text: string;             // primary text color
    muted: string;            // secondary text
    accent: string;           // accent color (bars, highlights, callouts)
    overlayText: string;      // text color used over image/dark slides
    // Secondary palette for the new content primitives. All optional — when a
    // field is undefined the renderer falls back to `accent`/`text`/etc. so
    // legacy themes (and decks) keep rendering without a migration.
    headingColor?: string;          // slide title color — defaults to accent
    paperBg?: string;               // cream "slide paper" surface for paper-style layouts
    paperShadow?: string;           // shadow color under the paper card
    calloutBgKey?: string;          // "Key point" callout bg
    calloutInkKey?: string;
    calloutBgRemember?: string;     // "Remember" callout bg
    calloutInkRemember?: string;
    calloutBgFun?: string;          // "Fun fact" callout bg
    calloutInkFun?: string;
    badgeBg?: string;               // sub-genre badge background
    badgeInk?: string;              // sub-genre badge text
    blockquoteRule?: string;        // left-rule color for italic blockquote
    activityCardBg?: string;        // ordering-activity card bg
    activityCardInk?: string;       // ordering-activity card text
    speechBubbleStroke?: string;    // outline for speech-bubble activity
    checkBadgeBg?: string;          // green tick badge bg on activity answers
    checkBadgeInk?: string;         // green tick badge ink
  };
  fonts: {
    heading: string;          // CSS font-family for titles
    body: string;             // CSS font-family for body
  };
  /** Optional full-bleed illustration background applied to every slide of this
   *  theme (URL/path under /public). Paired with `backgroundArtScrim`, a
   *  semi-transparent veil drawn over it so text stays legible. This is the
   *  default "watercolor" art style. */
  backgroundArt?: string;
  backgroundArtScrim?: string;
  /** Flat-vector "Illustration" art-style variant of the background. Reuses the
   *  same `backgroundArtScrim`. Selected via the art-style switch. */
  artIllustration?: string;
}

/** Background art styles the user can switch between. The id maps to a field on
 *  the theme via `getThemeArt`. */
export const ART_STYLES = [
  { id: "watercolor", name: "Watercolor" },
  { id: "illustration", name: "Illustration" },
] as const;
export type ArtStyleId = (typeof ART_STYLES)[number]["id"];
export const DEFAULT_ART_STYLE: ArtStyleId = "watercolor";

/** Resolve a theme's background art for the chosen style. Falls back to the
 *  watercolor default when a variant is missing. Returns undefined for themes
 *  with no art at all. */
export function getThemeArt(
  theme: SlideshowTheme,
  style: ArtStyleId,
): { src: string; scrim: string } | undefined {
  const src = style === "illustration"
    ? (theme.artIllustration ?? theme.backgroundArt)
    : theme.backgroundArt;
  if (!src) return undefined;
  return { src, scrim: theme.backgroundArtScrim ?? "rgba(255,255,255,0.45)" };
}

export const SLIDESHOW_THEMES: SlideshowTheme[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Cream paper and sienna headings, a textbook feel",
    category: "classic", family: "professional",
    backgroundArt: "/scenes/paper.png",
    artIllustration: "/scenes/paper-illus.png",
    backgroundArtScrim: "rgba(251, 245, 227, 0.55)",
    palette: {
      // Outer slide canvas — neutral so the cream paper card pops on top.
      background: "#efe9d8",
      paperBg: "#fbf5e3",
      paperShadow: "rgba(91, 70, 38, 0.10)",
      text: "#2c1d10",
      muted: "#7a604a",
      accent: "#b15a23",
      overlayText: "#fbf5e3",
      headingColor: "#a85220",
      calloutBgKey: "#fcecc7",
      calloutInkKey: "#3a2814",
      calloutBgRemember: "#e2eef9",
      calloutInkRemember: "#1f2f49",
      calloutBgFun: "#ece1f3",
      calloutInkFun: "#2d1e44",
      badgeBg: "#a85220",
      badgeInk: "#fbf5e3",
      blockquoteRule: "#b15a23",
      activityCardBg: "#e7eef7",
      activityCardInk: "#1c2435",
      speechBubbleStroke: "#1a1a1a",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Lora', 'Playfair Display', serif",
      body: "'Lora', 'Georgia', serif",
    },
  },
  {
    id: "light",
    name: "Light",
    description: "Clean and crisp",
    category: "classic", family: "basic",
    backgroundArt: "/scenes/light.png",
    artIllustration: "/scenes/light-illus.png",
    backgroundArtScrim: "rgba(255, 255, 255, 0.5)",
    palette: {
      background: "#ffffff",
      text: "#1a1a2e",
      muted: "#5b6478",
      accent: "#7c3aed",
      overlayText: "#ffffff",
      headingColor: "#1a1a2e",
      paperBg: "#ffffff",
      paperShadow: "rgba(20, 20, 40, 0.08)",
      calloutBgKey: "#fef3c7",
      calloutInkKey: "#1a1a2e",
      calloutBgRemember: "#dbeafe",
      calloutInkRemember: "#1a1a2e",
      calloutBgFun: "#ede9fe",
      calloutInkFun: "#1a1a2e",
      badgeBg: "#1a1a2e",
      badgeInk: "#ffffff",
      blockquoteRule: "#7c3aed",
      activityCardBg: "#eef2ff",
      activityCardInk: "#1a1a2e",
      speechBubbleStroke: "#1a1a2e",
      checkBadgeBg: "#16a34a",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "dark",
    name: "Dark",
    description: "For the night owls",
    category: "classic", family: "professional",
    backgroundArt: "/scenes/dark.png",
    artIllustration: "/scenes/dark-illus.png",
    backgroundArtScrim: "rgba(10, 10, 26, 0.55)",
    palette: {
      background: "#0a0a1a",
      text: "#f0f0f5",
      muted: "#94a3b8",
      accent: "#fbbf24",
      overlayText: "#ffffff",
      headingColor: "#fbbf24",
      paperBg: "#15152a",
      paperShadow: "rgba(0, 0, 0, 0.35)",
      calloutBgKey: "#3b2f12",
      calloutInkKey: "#fde68a",
      calloutBgRemember: "#1a2b44",
      calloutInkRemember: "#bfdbfe",
      calloutBgFun: "#2a1f3d",
      calloutInkFun: "#e9d5ff",
      badgeBg: "#fbbf24",
      badgeInk: "#0a0a1a",
      blockquoteRule: "#fbbf24",
      activityCardBg: "#1a2238",
      activityCardInk: "#f0f0f5",
      speechBubbleStroke: "#f0f0f5",
      checkBadgeBg: "#22c55e",
      checkBadgeInk: "#0a0a1a",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "warm",
    name: "Warm",
    description: "Editorial and cosy",
    category: "classic", family: "professional",
    backgroundArt: "/scenes/warm.png",
    artIllustration: "/scenes/warm-illus.png",
    backgroundArtScrim: "rgba(253, 246, 227, 0.55)",
    palette: {
      background: "#fdf6e3",
      text: "#3e2723",
      muted: "#8d6e63",
      accent: "#c2410c",
      overlayText: "#fdf6e3",
      headingColor: "#c2410c",
      paperBg: "#fdf6e3",
      paperShadow: "rgba(62, 39, 35, 0.10)",
      calloutBgKey: "#fde7c1",
      calloutInkKey: "#3e2723",
      calloutBgRemember: "#dceaf0",
      calloutInkRemember: "#1f3340",
      calloutBgFun: "#e7dff0",
      calloutInkFun: "#2f2240",
      badgeBg: "#c2410c",
      badgeInk: "#fdf6e3",
      blockquoteRule: "#c2410c",
      activityCardBg: "#e9efef",
      activityCardInk: "#1f3340",
      speechBubbleStroke: "#3e2723",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif",
    },
  },
  {
    id: "bold",
    name: "Bold",
    description: "Make a statement",
    category: "classic", family: "playful",
    retired: true,
    backgroundArt: "/scenes/bold.png",
    artIllustration: "/scenes/bold-illus.png",
    backgroundArtScrim: "rgba(254, 243, 199, 0.55)",
    palette: {
      background: "#fef3c7",
      text: "#0c0a09",
      muted: "#44403c",
      accent: "#dc2626",
      overlayText: "#ffffff",
      headingColor: "#dc2626",
      paperBg: "#fef3c7",
      paperShadow: "rgba(12, 10, 9, 0.12)",
      calloutBgKey: "#fcd34d",
      calloutInkKey: "#0c0a09",
      calloutBgRemember: "#bae6fd",
      calloutInkRemember: "#0c0a09",
      calloutBgFun: "#ddd6fe",
      calloutInkFun: "#0c0a09",
      badgeBg: "#0c0a09",
      badgeInk: "#fef3c7",
      blockquoteRule: "#dc2626",
      activityCardBg: "#fde68a",
      activityCardInk: "#0c0a09",
      speechBubbleStroke: "#0c0a09",
      checkBadgeBg: "#16a34a",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Archivo Black', sans-serif",
      body: "'Inter', sans-serif",
    },
  },

  // ── Scenic themes ────────────────────────────────────────────────────────
  // These pair a light, legible canvas + paper surface with a flat-illustration
  // backdrop (sky/water/sand bands, sun, clouds, dunes) drawn as low-opacity
  // decoration SHAPES — see `sceneDecorations` in slideshow-layouts.ts. Shapes
  // render on every surface (editor, thumbnails, present mode, PPTX export), so
  // the scene survives export without any special handling. Keep backgrounds
  // light so dark body text stays readable on card-less layouts.
  {
    id: "ocean",
    name: "Ocean",
    description: "Calm coastal blues with a wave horizon",
    category: "scenic", family: "playful",
    backgroundArt: "/scenes/ocean.png",
    artIllustration: "/scenes/ocean-illus.png",
    backgroundArtScrim: "rgba(246, 251, 253, 0.5)",
    palette: {
      background: "#e3f1f6",
      paperBg: "#f6fbfd",
      paperShadow: "rgba(13, 74, 99, 0.12)",
      text: "#0f3a4d",
      muted: "#4a7382",
      accent: "#0e7490",
      overlayText: "#f6fbfd",
      headingColor: "#0c5870",
      calloutBgKey: "#cfeaf2",
      calloutInkKey: "#0f3a4d",
      calloutBgRemember: "#d8ecf6",
      calloutInkRemember: "#123a52",
      calloutBgFun: "#dbeede",
      calloutInkFun: "#194a36",
      badgeBg: "#0e7490",
      badgeInk: "#f6fbfd",
      blockquoteRule: "#0e7490",
      activityCardBg: "#d7ecf3",
      activityCardInk: "#0f3a4d",
      speechBubbleStroke: "#0f3a4d",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "desert",
    name: "Desert",
    description: "Warm sands, dunes and a low sun",
    category: "scenic", family: "playful",
    backgroundArt: "/scenes/desert.png",
    artIllustration: "/scenes/desert-illus.png",
    backgroundArtScrim: "rgba(253, 248, 236, 0.5)",
    palette: {
      background: "#f6ecd6",
      paperBg: "#fdf8ec",
      paperShadow: "rgba(91, 68, 35, 0.12)",
      text: "#5b4423",
      muted: "#8a7150",
      accent: "#c2682f",
      overlayText: "#fdf8ec",
      headingColor: "#a8521f",
      calloutBgKey: "#f6e3bf",
      calloutInkKey: "#5b4423",
      calloutBgRemember: "#e6ebd6",
      calloutInkRemember: "#3f4a2a",
      calloutBgFun: "#f1ddd0",
      calloutInkFun: "#5b3322",
      badgeBg: "#c2682f",
      badgeInk: "#fdf8ec",
      blockquoteRule: "#c2682f",
      activityCardBg: "#f1e3c8",
      activityCardInk: "#5b4423",
      speechBubbleStroke: "#5b4423",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif",
    },
  },
  {
    id: "cloudy",
    name: "Cloudy",
    description: "Soft overcast sky with drifting clouds",
    category: "scenic", family: "playful",
    backgroundArt: "/scenes/cloudy.png",
    artIllustration: "/scenes/cloudy-illus.png",
    backgroundArtScrim: "rgba(255, 255, 255, 0.42)",
    palette: {
      background: "#e6edf3",
      paperBg: "#ffffff",
      paperShadow: "rgba(51, 65, 85, 0.10)",
      text: "#334155",
      muted: "#64748b",
      accent: "#3b82c4",
      overlayText: "#ffffff",
      headingColor: "#2c6aa0",
      calloutBgKey: "#dbe7f2",
      calloutInkKey: "#334155",
      calloutBgRemember: "#e2eaf2",
      calloutInkRemember: "#2a3a4f",
      calloutBgFun: "#e8e6f3",
      calloutInkFun: "#3a3460",
      badgeBg: "#3b82c4",
      badgeInk: "#ffffff",
      blockquoteRule: "#3b82c4",
      activityCardBg: "#e3ebf3",
      activityCardInk: "#334155",
      speechBubbleStroke: "#334155",
      checkBadgeBg: "#16a34a",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Fresh sage hills and treetops",
    category: "scenic", family: "playful",
    palette: {
      background: "#e6efe4",
      paperBg: "#f6fbf4",
      paperShadow: "rgba(33, 74, 46, 0.12)",
      text: "#214a2e",
      muted: "#5a7a60",
      accent: "#2f7d4f",
      overlayText: "#f6fbf4",
      headingColor: "#256040",
      calloutBgKey: "#d8eccf",
      calloutInkKey: "#214a2e",
      calloutBgRemember: "#d6ecdd",
      calloutInkRemember: "#1f4632",
      calloutBgFun: "#e7eccd",
      calloutInkFun: "#3a4521",
      badgeBg: "#2f7d4f",
      badgeInk: "#f6fbf4",
      blockquoteRule: "#2f7d4f",
      activityCardBg: "#dcecd6",
      activityCardInk: "#214a2e",
      speechBubbleStroke: "#214a2e",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Lora', serif",
      body: "'Lora', serif",
    },
    backgroundArt: "/scenes/forest-3-watercolor.png",
    artIllustration: "/scenes/forest-illus.png",
    backgroundArtScrim: "rgba(246, 251, 244, 0.5)",
  },
  {
    id: "dusk",
    name: "Dusk",
    description: "Warm sunset glow over the horizon",
    category: "scenic", family: "playful",
    backgroundArt: "/scenes/dusk.png",
    artIllustration: "/scenes/dusk-illus.png",
    backgroundArtScrim: "rgba(254, 246, 240, 0.55)",
    palette: {
      background: "#f7e6da",
      paperBg: "#fef6f0",
      paperShadow: "rgba(74, 44, 64, 0.12)",
      text: "#4a2c40",
      muted: "#8a6071",
      accent: "#d4663f",
      overlayText: "#fef6f0",
      headingColor: "#b8452f",
      calloutBgKey: "#f7dcc6",
      calloutInkKey: "#4a2c40",
      calloutBgRemember: "#f0dce0",
      calloutInkRemember: "#4a2c40",
      calloutBgFun: "#ecd9e6",
      calloutInkFun: "#43284a",
      badgeBg: "#d4663f",
      badgeInk: "#fef6f0",
      blockquoteRule: "#d4663f",
      activityCardBg: "#f4e0d2",
      activityCardInk: "#4a2c40",
      speechBubbleStroke: "#4a2c40",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif",
    },
  },

  // ── Subject themes ───────────────────────────────────────────────────────
  // Tailored to a school subject rather than a scene. They carry NO background
  // PNG — their identity comes from a code-drawn motif (grid + geometry, atoms,
  // columns, book + quill) in `subjectDecorations` (slideshow-layouts.ts), which
  // renders on every surface and survives PPTX export for free.
  {
    id: "math",
    name: "Math",
    description: "Indigo geometry: rulers, compass and shapes",
    category: "math", family: "professional",
    backgroundArt: "/scenes/math.png",
    artIllustration: "/scenes/math.png",
    backgroundArtScrim: "rgba(244, 246, 253, 0.42)",
    palette: {
      background: "#eef1fb",
      paperBg: "#ffffff",
      paperShadow: "rgba(30, 42, 82, 0.10)",
      text: "#1e2a52",
      muted: "#5a648a",
      accent: "#4f46e5",
      overlayText: "#ffffff",
      headingColor: "#3730a3",
      calloutBgKey: "#e0e3fb",
      calloutInkKey: "#1e2a52",
      calloutBgRemember: "#dbeafe",
      calloutInkRemember: "#1e3a5f",
      calloutBgFun: "#e9e3fb",
      calloutInkFun: "#3a2a60",
      badgeBg: "#4f46e5",
      badgeInk: "#ffffff",
      blockquoteRule: "#4f46e5",
      activityCardBg: "#e6e9fb",
      activityCardInk: "#1e2a52",
      speechBubbleStroke: "#1e2a52",
      checkBadgeBg: "#16a34a",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "science",
    name: "Science",
    description: "Teal lab: atoms, molecules and beakers",
    category: "science", family: "professional",
    backgroundArt: "/scenes/science.png",
    artIllustration: "/scenes/science.png",
    backgroundArtScrim: "rgba(244, 251, 250, 0.42)",
    palette: {
      background: "#e4f3f0",
      paperBg: "#f5fbfa",
      paperShadow: "rgba(17, 64, 58, 0.12)",
      text: "#11403a",
      muted: "#4a766e",
      accent: "#0d9488",
      overlayText: "#f5fbfa",
      headingColor: "#0b6e63",
      calloutBgKey: "#cfeae5",
      calloutInkKey: "#11403a",
      calloutBgRemember: "#d6ecf2",
      calloutInkRemember: "#123a52",
      calloutBgFun: "#dcecd9",
      calloutInkFun: "#234a1f",
      badgeBg: "#0d9488",
      badgeInk: "#f5fbfa",
      blockquoteRule: "#0d9488",
      activityCardBg: "#d7ece8",
      activityCardInk: "#11403a",
      speechBubbleStroke: "#11403a",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
  },
  {
    id: "history",
    name: "History",
    description: "Parchment: columns, scrolls and amphora",
    category: "history", family: "professional",
    backgroundArt: "/scenes/history.png",
    artIllustration: "/scenes/history.png",
    backgroundArtScrim: "rgba(250, 243, 226, 0.40)",
    palette: {
      background: "#f0e6d0",
      paperBg: "#faf3e2",
      paperShadow: "rgba(58, 44, 26, 0.12)",
      text: "#3a2c1a",
      muted: "#7a6448",
      accent: "#9a6b3f",
      overlayText: "#faf3e2",
      headingColor: "#7c4a25",
      calloutBgKey: "#efdcb8",
      calloutInkKey: "#3a2c1a",
      calloutBgRemember: "#e3e7d4",
      calloutInkRemember: "#3a3f24",
      calloutBgFun: "#ecdcc8",
      calloutInkFun: "#4a3320",
      badgeBg: "#9a6b3f",
      badgeInk: "#faf3e2",
      blockquoteRule: "#9a6b3f",
      activityCardBg: "#eee0c6",
      activityCardInk: "#3a2c1a",
      speechBubbleStroke: "#3a2c1a",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif",
    },
  },
  {
    id: "english",
    name: "English",
    description: "Literary cream: books, quill and ink",
    category: "english", family: "professional",
    backgroundArt: "/scenes/english.png",
    artIllustration: "/scenes/english.png",
    backgroundArtScrim: "rgba(253, 250, 243, 0.40)",
    palette: {
      background: "#f3ede2",
      paperBg: "#fdfaf3",
      paperShadow: "rgba(46, 42, 34, 0.10)",
      text: "#2e2a22",
      muted: "#6f6657",
      accent: "#9a4a55",
      overlayText: "#fdfaf3",
      headingColor: "#7a3a44",
      calloutBgKey: "#f0e4d6",
      calloutInkKey: "#2e2a22",
      calloutBgRemember: "#e6e2d0",
      calloutInkRemember: "#3a3528",
      calloutBgFun: "#efddd9",
      calloutInkFun: "#5a2e34",
      badgeBg: "#9a4a55",
      badgeInk: "#fdfaf3",
      blockquoteRule: "#9a4a55",
      activityCardBg: "#efe7d8",
      activityCardInk: "#2e2a22",
      speechBubbleStroke: "#2e2a22",
      checkBadgeBg: "#2e9d54",
      checkBadgeInk: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lora', serif",
    },
  },

  // ── Subject variations ───────────────────────────────────────────────────
  // Vibrant, playful alternates for each subject. Each carries its subject's
  // category (math/science/history/english) so it sits under that subject's
  // heading in the picker, alongside the original. Light, clear centres keep
  // dark text legible; backgrounds in /public/scenes/<id>.png.
  {
    id: "math-pop", name: "Math · Pop", description: "Coral & yellow geometry confetti", category: "math", family: "playful", retired: true,
    backgroundArt: "/scenes/math-pop.png", artIllustration: "/scenes/math-pop.png", backgroundArtScrim: "rgba(255, 244, 239, 0.40)",
    palette: {
      background: "#fff4ef", paperBg: "#fffaf7", paperShadow: "rgba(42, 26, 46, 0.10)",
      text: "#2a1a2e", muted: "#7a5e74", accent: "#ff5a5f", overlayText: "#ffffff", headingColor: "#e23b50",
      calloutBgKey: "#ffe0dd", calloutInkKey: "#2a1a2e", calloutBgRemember: "#dbeafe", calloutInkRemember: "#1e3a5f",
      calloutBgFun: "#fde9c7", calloutInkFun: "#5a3a14", badgeBg: "#ff5a5f", badgeInk: "#ffffff", blockquoteRule: "#ff5a5f",
      activityCardBg: "#ffe7e3", activityCardInk: "#2a1a2e", speechBubbleStroke: "#2a1a2e", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Archivo Black', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "math-neon", name: "Math · Neon", description: "Electric violet & cyan geometry", category: "math", family: "playful", retired: true,
    backgroundArt: "/scenes/math-neon.png", artIllustration: "/scenes/math-neon.png", backgroundArtScrim: "rgba(241, 243, 255, 0.40)",
    palette: {
      background: "#f1f3ff", paperBg: "#fafbff", paperShadow: "rgba(26, 21, 53, 0.10)",
      text: "#1a1535", muted: "#5a5680", accent: "#6c4cf0", overlayText: "#ffffff", headingColor: "#5b3ce0",
      calloutBgKey: "#e2def9", calloutInkKey: "#1a1535", calloutBgRemember: "#d6f3ff", calloutInkRemember: "#13384a",
      calloutBgFun: "#fbdcf3", calloutInkFun: "#4a1f3d", badgeBg: "#6c4cf0", badgeInk: "#ffffff", blockquoteRule: "#6c4cf0",
      activityCardBg: "#e6e3fb", activityCardInk: "#1a1535", speechBubbleStroke: "#1a1535", checkBadgeBg: "#16a34a", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "math-citrus", name: "Math · Citrus", description: "Zesty orange & lime geometry", category: "math", family: "playful", retired: true,
    backgroundArt: "/scenes/math-citrus.png", artIllustration: "/scenes/math-citrus.png", backgroundArtScrim: "rgba(246, 251, 233, 0.40)",
    palette: {
      background: "#f6fbe9", paperBg: "#fbfdf2", paperShadow: "rgba(46, 42, 20, 0.10)",
      text: "#2e2a14", muted: "#6f6a3f", accent: "#ff7a18", overlayText: "#ffffff", headingColor: "#e8650a",
      calloutBgKey: "#ffe6cf", calloutInkKey: "#2e2a14", calloutBgRemember: "#dcefd0", calloutInkRemember: "#2f4a1f",
      calloutBgFun: "#e7eccd", calloutInkFun: "#3a4521", badgeBg: "#ff7a18", badgeInk: "#ffffff", blockquoteRule: "#ff7a18",
      activityCardBg: "#eef3d8", activityCardInk: "#2e2a14", speechBubbleStroke: "#2e2a14", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "science-pop", name: "Science · Lab Pop", description: "Bright beakers, bubbles & atoms", category: "science", family: "playful", retired: true,
    backgroundArt: "/scenes/science-pop.png", artIllustration: "/scenes/science-pop.png", backgroundArtScrim: "rgba(238, 254, 248, 0.40)",
    palette: {
      background: "#eefef8", paperBg: "#f6fffb", paperShadow: "rgba(17, 64, 58, 0.12)",
      text: "#11403a", muted: "#4a766e", accent: "#18c29c", overlayText: "#ffffff", headingColor: "#0e9e80",
      calloutBgKey: "#cdeee6", calloutInkKey: "#11403a", calloutBgRemember: "#d6ecf2", calloutInkRemember: "#123a52",
      calloutBgFun: "#fbdcef", calloutInkFun: "#4a1f3a", badgeBg: "#18c29c", badgeInk: "#ffffff", blockquoteRule: "#18c29c",
      activityCardBg: "#d7ece8", activityCardInk: "#11403a", speechBubbleStroke: "#11403a", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "science-cosmic", name: "Science · Cosmic", description: "Purple atoms, planets & stars", category: "science", family: "playful", retired: true,
    backgroundArt: "/scenes/science-cosmic.png", artIllustration: "/scenes/science-cosmic.png", backgroundArtScrim: "rgba(244, 240, 255, 0.40)",
    palette: {
      background: "#f4f0ff", paperBg: "#fbf9ff", paperShadow: "rgba(34, 26, 64, 0.12)",
      text: "#221a40", muted: "#5e5685", accent: "#8b5cf6", overlayText: "#ffffff", headingColor: "#7a45e8",
      calloutBgKey: "#e6dcfb", calloutInkKey: "#221a40", calloutBgRemember: "#d6e6ff", calloutInkRemember: "#1f3358",
      calloutBgFun: "#fbdcf3", calloutInkFun: "#4a1f3d", badgeBg: "#8b5cf6", badgeInk: "#ffffff", blockquoteRule: "#8b5cf6",
      activityCardBg: "#e9e3fb", activityCardInk: "#221a40", speechBubbleStroke: "#221a40", checkBadgeBg: "#16a34a", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Bricolage Grotesque', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "science-botanic", name: "Science · Botanic", description: "Leaves, DNA & blooms", category: "science", family: "playful", retired: true,
    backgroundArt: "/scenes/science-botanic.png", artIllustration: "/scenes/science-botanic.png", backgroundArtScrim: "rgba(241, 251, 239, 0.40)",
    palette: {
      background: "#f1fbef", paperBg: "#f8fdf7", paperShadow: "rgba(31, 64, 35, 0.12)",
      text: "#1f4023", muted: "#5a7a60", accent: "#2fb344", overlayText: "#ffffff", headingColor: "#259a38",
      calloutBgKey: "#d6efce", calloutInkKey: "#1f4023", calloutBgRemember: "#d6ecf2", calloutInkRemember: "#123a52",
      calloutBgFun: "#ffe0d6", calloutInkFun: "#5a2e1f", badgeBg: "#2fb344", badgeInk: "#ffffff", blockquoteRule: "#2fb344",
      activityCardBg: "#dcecd6", activityCardInk: "#1f4023", speechBubbleStroke: "#1f4023", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "history-pop", name: "History · Pop", description: "Bright columns, amphora & scrolls", category: "history", family: "playful", retired: true,
    backgroundArt: "/scenes/history-pop.png", artIllustration: "/scenes/history-pop.png", backgroundArtScrim: "rgba(253, 243, 230, 0.40)",
    palette: {
      background: "#fdf3e6", paperBg: "#fff9f0", paperShadow: "rgba(58, 36, 24, 0.12)",
      text: "#3a2418", muted: "#7a5e48", accent: "#e2683c", overlayText: "#ffffff", headingColor: "#c8502a",
      calloutBgKey: "#f7ddca", calloutInkKey: "#3a2418", calloutBgRemember: "#d2ece6", calloutInkRemember: "#163f3a",
      calloutBgFun: "#f6e3bf", calloutInkFun: "#5a4423", badgeBg: "#e2683c", badgeInk: "#ffffff", blockquoteRule: "#e2683c",
      activityCardBg: "#f1e3d2", activityCardInk: "#3a2418", speechBubbleStroke: "#3a2418", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Archivo Black', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "history-explorer", name: "History · Explorer", description: "Maps, compass & ships", category: "history", family: "playful", retired: true,
    backgroundArt: "/scenes/history-explorer.png", artIllustration: "/scenes/history-explorer.png", backgroundArtScrim: "rgba(253, 246, 233, 0.40)",
    palette: {
      background: "#fdf6e9", paperBg: "#fffaf0", paperShadow: "rgba(58, 42, 26, 0.12)",
      text: "#3a2a1a", muted: "#7a6248", accent: "#1f9e8f", overlayText: "#ffffff", headingColor: "#18897b",
      calloutBgKey: "#cfeae5", calloutInkKey: "#3a2a1a", calloutBgRemember: "#d6e6f2", calloutInkRemember: "#1f3a52",
      calloutBgFun: "#ffe0d2", calloutInkFun: "#5a2e1a", badgeBg: "#1f9e8f", badgeInk: "#ffffff", blockquoteRule: "#1f9e8f",
      activityCardBg: "#dcebe4", activityCardInk: "#3a2a1a", speechBubbleStroke: "#3a2a1a", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Playfair Display', serif", body: "'Lora', serif" },
  },
  {
    id: "history-royal", name: "History · Royal", description: "Crowns, castles & shields", category: "history", family: "playful", retired: true,
    backgroundArt: "/scenes/history-royal.png", artIllustration: "/scenes/history-royal.png", backgroundArtScrim: "rgba(250, 242, 232, 0.40)",
    palette: {
      background: "#faf2e8", paperBg: "#fdf8f0", paperShadow: "rgba(46, 26, 51, 0.12)",
      text: "#2e1a33", muted: "#6a5470", accent: "#7b3fa0", overlayText: "#ffffff", headingColor: "#6a2f90",
      calloutBgKey: "#e7d8f0", calloutInkKey: "#2e1a33", calloutBgRemember: "#f6e3bf", calloutInkRemember: "#5a4423",
      calloutBgFun: "#f1d8e6", calloutInkFun: "#4a2040", badgeBg: "#7b3fa0", badgeInk: "#ffffff", blockquoteRule: "#7b3fa0",
      activityCardBg: "#ece0f3", activityCardInk: "#2e1a33", speechBubbleStroke: "#2e1a33", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Playfair Display', serif", body: "'Lora', serif" },
  },
  {
    id: "english-storybook", name: "English · Storybook", description: "Books, quill & speech bubbles", category: "english", family: "playful", retired: true,
    backgroundArt: "/scenes/english-storybook.png", artIllustration: "/scenes/english-storybook.png", backgroundArtScrim: "rgba(255, 247, 238, 0.40)",
    palette: {
      background: "#fff7ee", paperBg: "#fffbf5", paperShadow: "rgba(58, 34, 48, 0.10)",
      text: "#3a2230", muted: "#7a6070", accent: "#ff8a5c", overlayText: "#ffffff", headingColor: "#f06a3a",
      calloutBgKey: "#ffe6da", calloutInkKey: "#3a2230", calloutBgRemember: "#d6eef5", calloutInkRemember: "#163f4a",
      calloutBgFun: "#fdebc4", calloutInkFun: "#5a4414", badgeBg: "#ff8a5c", badgeInk: "#ffffff", blockquoteRule: "#ff8a5c",
      activityCardBg: "#ffe7dd", activityCardInk: "#3a2230", speechBubbleStroke: "#3a2230", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Bricolage Grotesque', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "english-comic", name: "English · Comic", description: "Bold speech bubbles & bursts", category: "english", family: "playful", retired: true,
    backgroundArt: "/scenes/english-comic.png", artIllustration: "/scenes/english-comic.png", backgroundArtScrim: "rgba(255, 249, 240, 0.40)",
    palette: {
      background: "#fff9f0", paperBg: "#fffcf6", paperShadow: "rgba(26, 19, 32, 0.10)",
      text: "#1a1320", muted: "#5a5260", accent: "#ff3b3b", overlayText: "#ffffff", headingColor: "#e62020",
      calloutBgKey: "#ffd9d9", calloutInkKey: "#1a1320", calloutBgRemember: "#d6e2ff", calloutInkRemember: "#1a2f5a",
      calloutBgFun: "#fff0c4", calloutInkFun: "#5a4a14", badgeBg: "#ff3b3b", badgeInk: "#ffffff", blockquoteRule: "#ff3b3b",
      activityCardBg: "#ffe2e2", activityCardInk: "#1a1320", speechBubbleStroke: "#1a1320", checkBadgeBg: "#16a34a", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Archivo Black', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "english-poetry", name: "English · Poetry", description: "Quills, feathers & ink swirls", category: "english", family: "playful", retired: true,
    backgroundArt: "/scenes/english-poetry.png", artIllustration: "/scenes/english-poetry.png", backgroundArtScrim: "rgba(250, 245, 255, 0.40)",
    palette: {
      background: "#faf5ff", paperBg: "#fdfbff", paperShadow: "rgba(46, 36, 64, 0.10)",
      text: "#2e2440", muted: "#645a80", accent: "#a06bd6", overlayText: "#ffffff", headingColor: "#8a4fc8",
      calloutBgKey: "#ebdff7", calloutInkKey: "#2e2440", calloutBgRemember: "#d6f0e8", calloutInkRemember: "#16453a",
      calloutBgFun: "#f7dcee", calloutInkFun: "#4a1f3d", badgeBg: "#a06bd6", badgeInk: "#ffffff", blockquoteRule: "#a06bd6",
      activityCardBg: "#ece0f3", activityCardInk: "#2e2440", speechBubbleStroke: "#2e2440", checkBadgeBg: "#2e9d54", checkBadgeInk: "#ffffff",
    },
    fonts: { heading: "'Playfair Display', serif", body: "'Lora', serif" },
  },

  // ── Designed themes ──────────────────────────────────────────────────────
  // No background PNG: each one's look comes from its `design` (title
  // treatment, card, photo frame, callout style and a code-drawn motif), so it
  // renders the same in the editor, the thumbnails, present mode and the PPTX.

  // Playful: bright and bold, for younger classes.
  {
    id: "confetti", name: "Confetti", description: "Sunny yellow with a burst of confetti", category: "classic", family: "playful",
    palette: {
      background: "#FFF4CC", paperBg: "#FFFBEA", paperShadow: "rgba(110, 72, 0, 0.14)",
      text: "#2B1D3A", muted: "#6A5878", accent: "#E8457A", overlayText: "#FFFFFF", headingColor: "#D02F68",
      calloutBgKey: "#FFE08A", calloutInkKey: "#2B1D3A", calloutBgRemember: "#D5EEFF", calloutInkRemember: "#16324F",
      calloutBgFun: "#FFD6E5", calloutInkFun: "#4A1530", badgeBg: "#E8457A", badgeInk: "#FFFFFF", blockquoteRule: "#E8457A",
      activityCardBg: "#FFE9A8", activityCardInk: "#2B1D3A", speechBubbleStroke: "#2B1D3A", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lilita One', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "highlight", frame: "blob", callout: "sticky", motif: "confetti" },
  },
  {
    id: "sticker", name: "Sticker", description: "Crisp white, bold outlines and stars", category: "classic", family: "playful",
    palette: {
      background: "#FFFFFF", paperBg: "#FFFFFF", paperShadow: "rgba(22, 22, 22, 0.12)",
      text: "#161616", muted: "#4F4F4F", accent: "#FF6B35", overlayText: "#FFFFFF", headingColor: "#161616",
      calloutBgKey: "#FFE3D6", calloutInkKey: "#161616", calloutBgRemember: "#DCEBFF", calloutInkRemember: "#161616",
      calloutBgFun: "#FFF1B8", calloutInkFun: "#161616", badgeBg: "#161616", badgeInk: "#FFFFFF", blockquoteRule: "#FF6B35",
      activityCardBg: "#FFE9DF", activityCardInk: "#161616", speechBubbleStroke: "#161616", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "pill", frame: "sticker", callout: "outline", motif: "stars" },
  },
  {
    id: "doodle", name: "Doodle", description: "Notebook paper with hand-drawn doodles", category: "classic", family: "playful",
    palette: {
      background: "#FFFDF4", paperBg: "#FFFFFF", paperShadow: "rgba(39, 39, 39, 0.10)",
      text: "#272727", muted: "#5F5F5F", accent: "#2F6FED", overlayText: "#FFFFFF", headingColor: "#1F3B8C",
      calloutBgKey: "#FFF2A8", calloutInkKey: "#272727", calloutBgRemember: "#DDEBFF", calloutInkRemember: "#1F2F4D",
      calloutBgFun: "#FFDDE8", calloutInkFun: "#4A1F2E", badgeBg: "#2F6FED", badgeInk: "#FFFFFF", blockquoteRule: "#2F6FED",
      activityCardBg: "#EEF3FF", activityCardInk: "#272727", speechBubbleStroke: "#272727", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Patrick Hand', cursive", body: "'Andika', sans-serif" },
    design: { title: "underline", frame: "polaroid", callout: "sticky", motif: "doodles" },
  },
  {
    id: "space", name: "Space", description: "Deep navy with stars and planets", category: "classic", family: "playful",
    palette: {
      background: "#15163D", paperBg: "#1E1F52", paperShadow: "rgba(0, 0, 0, 0.35)",
      text: "#F3F1FF", muted: "#B9B5E6", accent: "#FFC93C", overlayText: "#FFFFFF", headingColor: "#FFD45E",
      calloutBgKey: "#3B3214", calloutInkKey: "#FFE7A3", calloutBgRemember: "#1D2F55", calloutInkRemember: "#CFE0FF",
      calloutBgFun: "#3A1F4D", calloutInkFun: "#F2D9FF", badgeBg: "#FFC93C", badgeInk: "#15163D", blockquoteRule: "#FFC93C",
      activityCardBg: "#262869", activityCardInk: "#F3F1FF", speechBubbleStroke: "#F3F1FF", checkBadgeBg: "#22C55E", checkBadgeInk: "#0B1020",
    },
    fonts: { heading: "'Baloo 2', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "plain", frame: "circle", callout: "tint", motif: "stars" },
  },
  {
    id: "rainbow", name: "Rainbow", description: "Soft rainbow shapes on clean white", category: "classic", family: "playful",
    palette: {
      background: "#FFFFFF", paperBg: "#FFFFFF", paperShadow: "rgba(36, 50, 74, 0.10)",
      text: "#24324A", muted: "#5D6B82", accent: "#7B61FF", overlayText: "#FFFFFF", headingColor: "#3A2E9C",
      calloutBgKey: "#FFF0C2", calloutInkKey: "#24324A", calloutBgRemember: "#DDEBFF", calloutInkRemember: "#1D3557",
      calloutBgFun: "#FFE0EC", calloutInkFun: "#5A1F3A", badgeBg: "#7B61FF", badgeInk: "#FFFFFF", blockquoteRule: "#7B61FF",
      activityCardBg: "#EFEBFF", activityCardInk: "#24324A", speechBubbleStroke: "#24324A", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "underline", frame: "arch", callout: "tint", motif: "blobs" },
  },
  {
    id: "chalkboard", name: "Chalkboard", description: "Classroom green board and chalk", category: "classic", family: "playful",
    palette: {
      background: "#24453A", paperBg: "#2B5145", paperShadow: "rgba(0, 0, 0, 0.3)",
      text: "#F4F1E6", muted: "#C9D7CF", accent: "#F7D36B", overlayText: "#FFFFFF", headingColor: "#F7D36B",
      calloutBgKey: "#3D5A2E", calloutInkKey: "#F9EFC5", calloutBgRemember: "#2D4B5C", calloutInkRemember: "#D7ECF7",
      calloutBgFun: "#5A3B4A", calloutInkFun: "#F7DDE8", badgeBg: "#F7D36B", badgeInk: "#24453A", blockquoteRule: "#F7D36B",
      activityCardBg: "#2F5A4D", activityCardInk: "#F4F1E6", speechBubbleStroke: "#F4F1E6", checkBadgeBg: "#7BD389", checkBadgeInk: "#123026",
    },
    fonts: { heading: "'Patrick Hand', cursive", body: "'Andika', sans-serif" },
    design: { title: "underline", card: "outline", frame: "polaroid", callout: "outline", motif: "doodles" },
  },

  // Professional: calm and editorial.
  {
    id: "editorial", name: "Editorial", description: "Ivory pages, serif headings, fine rules", category: "classic", family: "professional",
    palette: {
      background: "#F8F5EE", paperBg: "#FFFFFF", paperShadow: "rgba(31, 29, 26, 0.08)",
      text: "#1F1D1A", muted: "#6D675E", accent: "#B4532A", overlayText: "#FFFFFF", headingColor: "#1F1D1A",
      calloutBgKey: "#F4E6D8", calloutInkKey: "#1F1D1A", calloutBgRemember: "#E3ECEF", calloutInkRemember: "#1D2F36",
      calloutBgFun: "#EEE5F0", calloutInkFun: "#2E2236", badgeBg: "#1F1D1A", badgeInk: "#F8F5EE", blockquoteRule: "#B4532A",
      activityCardBg: "#EFE8DC", activityCardInk: "#1F1D1A", speechBubbleStroke: "#1F1D1A", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fraunces', serif", body: "'Source Sans 3', sans-serif" },
    design: { title: "kicker", frame: "square", callout: "rule", motif: "rules" },
  },
  {
    id: "midnight", name: "Midnight", description: "Navy and gold, quietly confident", category: "classic", family: "professional",
    palette: {
      background: "#0F1B2D", paperBg: "#16243A", paperShadow: "rgba(0, 0, 0, 0.35)",
      text: "#EEF2F7", muted: "#A9B6C8", accent: "#D4A64A", overlayText: "#FFFFFF", headingColor: "#F0D398",
      calloutBgKey: "#2B2614", calloutInkKey: "#F6E3B4", calloutBgRemember: "#16304A", calloutInkRemember: "#CFE3F7",
      calloutBgFun: "#2A1F3D", calloutInkFun: "#E9D5FF", badgeBg: "#D4A64A", badgeInk: "#0F1B2D", blockquoteRule: "#D4A64A",
      activityCardBg: "#1B2C45", activityCardInk: "#EEF2F7", speechBubbleStroke: "#EEF2F7", checkBadgeBg: "#22C55E", checkBadgeInk: "#0F1B2D",
    },
    fonts: { heading: "'Fraunces', serif", body: "'Inter', sans-serif" },
    design: { title: "kicker", frame: "rounded", callout: "rule", motif: "corners" },
  },
  {
    id: "blueprint", name: "Blueprint", description: "Technical blue on a fine grid", category: "classic", family: "professional",
    palette: {
      background: "#EAF1FB", paperBg: "#F7FAFE", paperShadow: "rgba(19, 41, 75, 0.10)",
      text: "#13294B", muted: "#4D6385", accent: "#1F5FBF", overlayText: "#FFFFFF", headingColor: "#13294B",
      calloutBgKey: "#DCE8F8", calloutInkKey: "#13294B", calloutBgRemember: "#E2F1EC", calloutInkRemember: "#163F33",
      calloutBgFun: "#ECE6F8", calloutInkFun: "#2C2350", badgeBg: "#1F5FBF", badgeInk: "#FFFFFF", blockquoteRule: "#1F5FBF",
      activityCardBg: "#DDE8F7", activityCardInk: "#13294B", speechBubbleStroke: "#13294B", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    design: { title: "kicker", card: "outline", frame: "square", callout: "rule", motif: "grid" },
  },
  {
    id: "slate", name: "Slate", description: "Cool grey and teal, clean and modern", category: "classic", family: "professional",
    palette: {
      background: "#EEF1F5", paperBg: "#FFFFFF", paperShadow: "rgba(15, 23, 42, 0.10)",
      text: "#1E293B", muted: "#64748B", accent: "#0F766E", overlayText: "#FFFFFF", headingColor: "#0F172A",
      calloutBgKey: "#DDF1EE", calloutInkKey: "#0F2A27", calloutBgRemember: "#E2E8F0", calloutInkRemember: "#1E293B",
      calloutBgFun: "#EDE9FE", calloutInkFun: "#2E1065", badgeBg: "#0F766E", badgeInk: "#FFFFFF", blockquoteRule: "#0F766E",
      activityCardBg: "#E2E8F0", activityCardInk: "#1E293B", speechBubbleStroke: "#1E293B", checkBadgeBg: "#16A34A", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    design: { title: "underline", card: "soft", frame: "rounded", callout: "rule" },
  },
  {
    id: "folio", name: "Folio", description: "Gallery white with a vermilion accent", category: "classic", family: "professional",
    palette: {
      background: "#FFFFFF", paperBg: "#FFFFFF", paperShadow: "rgba(17, 17, 17, 0.08)",
      text: "#111111", muted: "#5E5E5E", accent: "#E4572E", overlayText: "#FFFFFF", headingColor: "#111111",
      calloutBgKey: "#FDE7DF", calloutInkKey: "#3A140A", calloutBgRemember: "#E8EEF6", calloutInkRemember: "#162436",
      calloutBgFun: "#F1EAF8", calloutInkFun: "#2B1A3D", badgeBg: "#111111", badgeInk: "#FFFFFF", blockquoteRule: "#E4572E",
      activityCardBg: "#F3F3F3", activityCardInk: "#111111", speechBubbleStroke: "#111111", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Playfair Display', serif", body: "'Inter', sans-serif" },
    design: { title: "kicker", frame: "square", callout: "rule", motif: "corners" },
  },
  {
    id: "ledger", name: "Ledger", description: "Parchment and maroon, scholarly and warm", category: "classic", family: "professional",
    palette: {
      background: "#F6F0E6", paperBg: "#FFFBF4", paperShadow: "rgba(45, 27, 20, 0.10)",
      text: "#2D1B14", muted: "#7A6255", accent: "#7A1F2B", overlayText: "#FFFFFF", headingColor: "#7A1F2B",
      calloutBgKey: "#F1E2CC", calloutInkKey: "#2D1B14", calloutBgRemember: "#E4E6D6", calloutInkRemember: "#2F3324",
      calloutBgFun: "#EEDDD9", calloutInkFun: "#4A1C24", badgeBg: "#7A1F2B", badgeInk: "#FFFBF4", blockquoteRule: "#7A1F2B",
      activityCardBg: "#EFE4D2", activityCardInk: "#2D1B14", speechBubbleStroke: "#2D1B14", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fraunces', serif", body: "'Lora', serif" },
    design: { title: "kicker", card: "soft", frame: "rounded", callout: "rule", motif: "corners" },
  },

  // Basic: plain and legible, nothing drawn behind the content.
  {
    id: "clean", name: "Clean", description: "Plain white, nothing to distract", category: "classic", family: "basic",
    tags: ["low-stimulation"],
    palette: {
      background: "#FFFFFF", paperBg: "#FFFFFF", paperShadow: "rgba(26, 26, 46, 0.08)",
      text: "#1A1A2E", muted: "#5B6478", accent: "#5B2ED6", overlayText: "#FFFFFF", headingColor: "#1A1A2E",
      calloutBgKey: "#F1ECFC", calloutInkKey: "#1A1A2E", calloutBgRemember: "#E6F1FB", calloutInkRemember: "#1A1A2E",
      calloutBgFun: "#FBF3DF", calloutInkFun: "#1A1A2E", badgeBg: "#1A1A2E", badgeInk: "#FFFFFF", blockquoteRule: "#5B2ED6",
      activityCardBg: "#F4F2F8", activityCardInk: "#1A1A2E", speechBubbleStroke: "#1A1A2E", checkBadgeBg: "#16A34A", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
  },
  {
    id: "mono", name: "Mono", description: "Black on white and nothing else", category: "classic", family: "basic",
    tags: ["high-contrast", "low-stimulation"],
    palette: {
      background: "#FFFFFF", paperBg: "#FFFFFF", paperShadow: "rgba(0, 0, 0, 0.10)",
      text: "#000000", muted: "#3D3D3D", accent: "#000000", overlayText: "#FFFFFF", headingColor: "#000000",
      calloutBgKey: "#F2F2F2", calloutInkKey: "#000000", calloutBgRemember: "#F2F2F2", calloutInkRemember: "#000000",
      calloutBgFun: "#F2F2F2", calloutInkFun: "#000000", badgeBg: "#000000", badgeInk: "#FFFFFF", blockquoteRule: "#000000",
      activityCardBg: "#F2F2F2", activityCardInk: "#000000", speechBubbleStroke: "#000000", checkBadgeBg: "#000000", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
    design: { frame: "square", callout: "outline" },
  },
  {
    id: "readable", name: "Readable", description: "Cream background and Lexend, easier to read", category: "classic", family: "basic",
    tags: ["dyslexia-friendly", "low-stimulation"],
    palette: {
      background: "#FBF6E9", paperBg: "#FFFCF3", paperShadow: "rgba(31, 36, 48, 0.08)",
      text: "#1F2430", muted: "#4A5162", accent: "#2F6F9F", overlayText: "#FFFFFF", headingColor: "#1F2430",
      calloutBgKey: "#F3E9CF", calloutInkKey: "#1F2430", calloutBgRemember: "#E1ECF4", calloutInkRemember: "#1F2430",
      calloutBgFun: "#EDE6F2", calloutInkFun: "#1F2430", badgeBg: "#2F6F9F", badgeInk: "#FFFFFF", blockquoteRule: "#2F6F9F",
      activityCardBg: "#F1EAD7", activityCardInk: "#1F2430", speechBubbleStroke: "#1F2430", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lexend', sans-serif", body: "'Lexend', sans-serif" },
  },
  {
    id: "high-contrast", name: "High Contrast", description: "Black and yellow, for low vision", category: "classic", family: "basic",
    tags: ["high-contrast"],
    palette: {
      background: "#0B0B0B", paperBg: "#161616", paperShadow: "rgba(0, 0, 0, 0.4)",
      text: "#FFFFFF", muted: "#E6E6E6", accent: "#FFE066", overlayText: "#FFFFFF", headingColor: "#FFE066",
      calloutBgKey: "#2B2610", calloutInkKey: "#FFF3B0", calloutBgRemember: "#10243A", calloutInkRemember: "#D6EBFF",
      calloutBgFun: "#2A1736", calloutInkFun: "#F0DBFF", badgeBg: "#FFE066", badgeInk: "#0B0B0B", blockquoteRule: "#FFE066",
      activityCardBg: "#1E1E1E", activityCardInk: "#FFFFFF", speechBubbleStroke: "#FFFFFF", checkBadgeBg: "#4ADE80", checkBadgeInk: "#0B0B0B",
    },
    fonts: { heading: "'Atkinson Hyperlegible', sans-serif", body: "'Atkinson Hyperlegible', sans-serif" },
    design: { title: "underline", frame: "square", callout: "outline" },
  },
  {
    id: "calm", name: "Calm", description: "Soft sage, gentle on the eyes", category: "classic", family: "basic",
    tags: ["low-stimulation"],
    palette: {
      background: "#EEF4F0", paperBg: "#F8FBF9", paperShadow: "rgba(35, 51, 43, 0.08)",
      text: "#23332B", muted: "#5C6E64", accent: "#4F7F69", overlayText: "#FFFFFF", headingColor: "#2E4A3D",
      calloutBgKey: "#E1EDE5", calloutInkKey: "#23332B", calloutBgRemember: "#E3ECF2", calloutInkRemember: "#23332B",
      calloutBgFun: "#ECE8F2", calloutInkFun: "#23332B", badgeBg: "#4F7F69", badgeInk: "#FFFFFF", blockquoteRule: "#4F7F69",
      activityCardBg: "#E3ECE6", activityCardInk: "#23332B", speechBubbleStroke: "#23332B", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lexend', sans-serif", body: "'Nunito', sans-serif" },
  },

  // The second designed set: more colour, each with a light touch of
  // decoration (a sun peeking in, a ripple of sea, a few leaves) kept to the
  // edges, so it lifts the slide without competing with the lesson.

  // Playful.
  {
    id: "sunbeam", name: "Sunbeam", description: "Sunshine yellow with a cobalt pop", category: "classic", family: "playful",
    palette: {
      background: "#FFE066", paperBg: "#FFF6CC", paperShadow: "rgba(90, 70, 0, 0.14)",
      text: "#1D1A2F", muted: "#4A4560", accent: "#2546F0", overlayText: "#FFFFFF", headingColor: "#1F3BD1",
      calloutBgKey: "#FFF3B3", calloutInkKey: "#1D1A2F", calloutBgRemember: "#DCE4FF", calloutInkRemember: "#14235E",
      calloutBgFun: "#FFD6E0", calloutInkFun: "#4A1530", badgeBg: "#2546F0", badgeInk: "#FFFFFF", blockquoteRule: "#2546F0",
      activityCardBg: "#FFF1A6", activityCardInk: "#1D1A2F", speechBubbleStroke: "#1D1A2F", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Baloo 2', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "underline", frame: "rounded", callout: "tint", motif: "sun" },
  },
  {
    id: "lagoon", name: "Lagoon", description: "Deep teal water and coral", category: "classic", family: "playful",
    palette: {
      background: "#0E5E6F", paperBg: "#12707F", paperShadow: "rgba(0, 0, 0, 0.3)",
      text: "#FFF8EC", muted: "#CFE6E6", accent: "#FF8A70", overlayText: "#FFFFFF", headingColor: "#FFC9A8",
      calloutBgKey: "#1D4C57", calloutInkKey: "#FFE9D6", calloutBgRemember: "#134B5B", calloutInkRemember: "#D6F3F5",
      calloutBgFun: "#5A2F3A", calloutInkFun: "#FFE0E6", badgeBg: "#FF8A70", badgeInk: "#0B2E36", blockquoteRule: "#FF8A70",
      activityCardBg: "#13707F", activityCardInk: "#FFF8EC", speechBubbleStroke: "#FFF8EC", checkBadgeBg: "#4ADE80", checkBadgeInk: "#0B2E36",
    },
    fonts: { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "underline", frame: "rounded", callout: "tint", motif: "waves" },
  },
  {
    id: "meadow", name: "Meadow", description: "Spring green hills and a red poppy", category: "classic", family: "playful",
    palette: {
      background: "#E6F4DC", paperBg: "#F6FBF1", paperShadow: "rgba(30, 53, 36, 0.10)",
      text: "#1E3524", muted: "#4B6352", accent: "#E2483D", overlayText: "#FFFFFF", headingColor: "#2F6B3A",
      calloutBgKey: "#FFE1DC", calloutInkKey: "#4A1410", calloutBgRemember: "#C5E3B3", calloutInkRemember: "#1E3524",
      calloutBgFun: "#FFF0BF", calloutInkFun: "#3D2E00", badgeBg: "#E2483D", badgeInk: "#FFFFFF", blockquoteRule: "#E2483D",
      activityCardBg: "#B5D99F", activityCardInk: "#1E3524", speechBubbleStroke: "#1E3524", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fredoka', sans-serif", body: "'Andika', sans-serif" },
    design: { title: "underline", frame: "arch", callout: "tint", motif: "hills" },
  },
  {
    id: "candy", name: "Candy", description: "Bubblegum pink with a sprinkle on top", category: "classic", family: "playful",
    palette: {
      background: "#FFD3E2", paperBg: "#FFF0F5", paperShadow: "rgba(90, 20, 60, 0.12)",
      text: "#3B0D2C", muted: "#6E3A5A", accent: "#C2185B", overlayText: "#FFFFFF", headingColor: "#8E1450",
      calloutBgKey: "#FFF0F5", calloutInkKey: "#3B0D2C", calloutBgRemember: "#E1E8FF", calloutInkRemember: "#1C2559",
      calloutBgFun: "#FFF2C4", calloutInkFun: "#3D2E00", badgeBg: "#8E1450", badgeInk: "#FFFFFF", blockquoteRule: "#C2185B",
      activityCardBg: "#FFE4EE", activityCardInk: "#3B0D2C", speechBubbleStroke: "#3B0D2C", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lilita One', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "pill", frame: "blob", callout: "sticky", motif: "sprinkles" },
  },
  {
    id: "grape", name: "Grape", description: "Purple night with lime stars", category: "classic", family: "playful",
    palette: {
      background: "#4B2A8C", paperBg: "#573399", paperShadow: "rgba(0, 0, 0, 0.3)",
      text: "#FFFFFF", muted: "#D9CCF5", accent: "#C6F432", overlayText: "#FFFFFF", headingColor: "#C6F432",
      calloutBgKey: "#3A2070", calloutInkKey: "#EAFFB0", calloutBgRemember: "#2F2F7A", calloutInkRemember: "#DCE2FF",
      calloutBgFun: "#6A2A6E", calloutInkFun: "#FFD9F5", badgeBg: "#C6F432", badgeInk: "#2A1450", blockquoteRule: "#C6F432",
      activityCardBg: "#5E3AA3", activityCardInk: "#FFFFFF", speechBubbleStroke: "#FFFFFF", checkBadgeBg: "#4ADE80", checkBadgeInk: "#1A0B33",
    },
    fonts: { heading: "'Baloo 2', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "plain", frame: "circle", callout: "tint", motif: "stars" },
  },
  {
    id: "daydream", name: "Daydream", description: "Pale sky, soft clouds, orange accents", category: "classic", family: "playful",
    palette: {
      background: "#C7E3FF", paperBg: "#FFFFFF", paperShadow: "rgba(19, 41, 75, 0.10)",
      text: "#13294B", muted: "#4A5E80", accent: "#FF8A00", overlayText: "#FFFFFF", headingColor: "#1E3A8A",
      calloutBgKey: "#FFE7C7", calloutInkKey: "#3D2200", calloutBgRemember: "#FFFFFF", calloutInkRemember: "#13294B",
      calloutBgFun: "#EDE4FF", calloutInkFun: "#2E1A5C", badgeBg: "#FF8A00", badgeInk: "#13294B", blockquoteRule: "#FF8A00",
      activityCardBg: "#EAF4FF", activityCardInk: "#13294B", speechBubbleStroke: "#13294B", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
    design: { title: "underline", frame: "polaroid", callout: "tint", motif: "clouds" },
  },
  {
    id: "tangerine", name: "Tangerine", description: "Juicy orange with indigo ink", category: "classic", family: "playful",
    palette: {
      background: "#FF8A3D", paperBg: "#FFA765", paperShadow: "rgba(80, 30, 0, 0.16)",
      text: "#1B1030", muted: "#3F2A3D", accent: "#2B2D8F", overlayText: "#FFFFFF", headingColor: "#1B1030",
      calloutBgKey: "#FFE3C7", calloutInkKey: "#1B1030", calloutBgRemember: "#FFF4E0", calloutInkRemember: "#1B1030",
      calloutBgFun: "#FFD1DC", calloutInkFun: "#3B0D2C", badgeBg: "#1B1030", badgeInk: "#FFFFFF", blockquoteRule: "#2B2D8F",
      activityCardBg: "#FFB27A", activityCardInk: "#1B1030", speechBubbleStroke: "#1B1030", checkBadgeBg: "#1F9D55", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lilita One', sans-serif", body: "'Rubik', sans-serif" },
    design: { title: "underline", frame: "sticker", callout: "outline", motif: "dots" },
  },

  // Professional.
  {
    id: "rust", name: "Rust", description: "Terracotta and cream with gold corners", category: "classic", family: "professional",
    palette: {
      background: "#A6452B", paperBg: "#B4533A", paperShadow: "rgba(0, 0, 0, 0.25)",
      text: "#FFF6EA", muted: "#F3D5C5", accent: "#F6C177", overlayText: "#FFFFFF", headingColor: "#FFE2B0",
      calloutBgKey: "#8E3A22", calloutInkKey: "#FFE9C9", calloutBgRemember: "#7A3A2E", calloutInkRemember: "#FFE0D6",
      calloutBgFun: "#5E3A4A", calloutInkFun: "#FFDDE8", badgeBg: "#F6C177", badgeInk: "#3A160B", blockquoteRule: "#F6C177",
      activityCardBg: "#B85C42", activityCardInk: "#FFF6EA", speechBubbleStroke: "#FFF6EA", checkBadgeBg: "#86EFAC", checkBadgeInk: "#1A2E1A",
    },
    fonts: { heading: "'Fraunces', serif", body: "'Source Sans 3', sans-serif" },
    design: { title: "kicker", frame: "square", callout: "rule", motif: "corners" },
  },
  {
    id: "fern", name: "Fern", description: "Forest green, cream and a few leaves", category: "classic", family: "professional",
    palette: {
      background: "#1F3D2B", paperBg: "#26492F", paperShadow: "rgba(0, 0, 0, 0.3)",
      text: "#F4EFE1", muted: "#C5D3C4", accent: "#E9B949", overlayText: "#FFFFFF", headingColor: "#F2CB6B",
      calloutBgKey: "#2E4A22", calloutInkKey: "#FCEFC4", calloutBgRemember: "#23413A", calloutInkRemember: "#D4EDE3",
      calloutBgFun: "#4A3A24", calloutInkFun: "#F9E4C2", badgeBg: "#E9B949", badgeInk: "#1F3D2B", blockquoteRule: "#E9B949",
      activityCardBg: "#2B5136", activityCardInk: "#F4EFE1", speechBubbleStroke: "#F4EFE1", checkBadgeBg: "#7BD389", checkBadgeInk: "#123026",
    },
    fonts: { heading: "'Lora', serif", body: "'Karla', sans-serif" },
    design: { title: "kicker", frame: "rounded", callout: "rule", motif: "leaves" },
  },
  {
    id: "coast", name: "Coast", description: "Crisp white, deep navy, a ripple of sea", category: "classic", family: "professional",
    palette: {
      background: "#FFFFFF", paperBg: "#F3F8FC", paperShadow: "rgba(11, 37, 64, 0.08)",
      text: "#0B2540", muted: "#4D6580", accent: "#0EA5E9", overlayText: "#FFFFFF", headingColor: "#0B2540",
      calloutBgKey: "#E0F2FE", calloutInkKey: "#0B2540", calloutBgRemember: "#EEF2F6", calloutInkRemember: "#0B2540",
      calloutBgFun: "#FDEBD8", calloutInkFun: "#4A2508", badgeBg: "#0B2540", badgeInk: "#FFFFFF", blockquoteRule: "#0EA5E9",
      activityCardBg: "#EEF4FA", activityCardInk: "#0B2540", speechBubbleStroke: "#0B2540", checkBadgeBg: "#16A34A", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Manrope', sans-serif", body: "'Inter', sans-serif" },
    design: { title: "kicker", frame: "rounded", callout: "rule", motif: "waves" },
  },
  {
    id: "storm", name: "Storm", description: "Slate grey sky with an amber glow", category: "classic", family: "professional",
    palette: {
      background: "#4F5B66", paperBg: "#5E6B77", paperShadow: "rgba(0, 0, 0, 0.25)",
      text: "#FFFFFF", muted: "#D7DEE4", accent: "#FFC857", overlayText: "#FFFFFF", headingColor: "#FFFFFF",
      calloutBgKey: "#3F4A55", calloutInkKey: "#FFE6A8", calloutBgRemember: "#44525E", calloutInkRemember: "#E1ECF5",
      calloutBgFun: "#5B4B5E", calloutInkFun: "#F3DDEB", badgeBg: "#FFC857", badgeInk: "#2A2F36", blockquoteRule: "#FFC857",
      activityCardBg: "#5A6874", activityCardInk: "#FFFFFF", speechBubbleStroke: "#FFFFFF", checkBadgeBg: "#4ADE80", checkBadgeInk: "#1A2E1A",
    },
    fonts: { heading: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    design: { title: "underline", frame: "rounded", callout: "tint", motif: "clouds" },
  },
  {
    id: "plum", name: "Plum", description: "Lilac paper and aubergine ink", category: "classic", family: "professional",
    palette: {
      background: "#F5EEF6", paperBg: "#FFFFFF", paperShadow: "rgba(42, 20, 48, 0.08)",
      text: "#2A1430", muted: "#6B5470", accent: "#8E2C6B", overlayText: "#FFFFFF", headingColor: "#5A1846",
      calloutBgKey: "#F3DCEB", calloutInkKey: "#2A1430", calloutBgRemember: "#E6E9F5", calloutInkRemember: "#1E2344",
      calloutBgFun: "#FCEFD6", calloutInkFun: "#3D2A05", badgeBg: "#8E2C6B", badgeInk: "#FFFFFF", blockquoteRule: "#8E2C6B",
      activityCardBg: "#EFE4F1", activityCardInk: "#2A1430", speechBubbleStroke: "#2A1430", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Playfair Display', serif", body: "'Lato', sans-serif" },
    design: { title: "kicker", frame: "square", callout: "rule", motif: "rules" },
  },
  {
    id: "dune", name: "Dune", description: "Warm sand, low dunes and a teal accent", category: "classic", family: "professional",
    palette: {
      background: "#EFE3CC", paperBg: "#FAF4E8", paperShadow: "rgba(58, 42, 26, 0.10)",
      text: "#3A2A1A", muted: "#6F5B45", accent: "#127C7A", overlayText: "#FFFFFF", headingColor: "#3A2A1A",
      calloutBgKey: "#D6EDEA", calloutInkKey: "#0E3B3A", calloutBgRemember: "#E6D3B0", calloutInkRemember: "#3A2A1A",
      calloutBgFun: "#F3DCD2", calloutInkFun: "#4A1F12", badgeBg: "#127C7A", badgeInk: "#FFFFFF", blockquoteRule: "#127C7A",
      activityCardBg: "#DCC59A", activityCardInk: "#3A2A1A", speechBubbleStroke: "#3A2A1A", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Bricolage Grotesque', sans-serif", body: "'Work Sans', sans-serif" },
    design: { title: "kicker", frame: "arch", callout: "rule", motif: "hills" },
  },

  // Basic.
  {
    id: "soft-blue", name: "Soft Blue", description: "Pale blue and white, quiet and clear", category: "classic", family: "basic",
    tags: ["low-stimulation"],
    palette: {
      background: "#F2F6FC", paperBg: "#FFFFFF", paperShadow: "rgba(28, 43, 66, 0.08)",
      text: "#1C2B42", muted: "#52627A", accent: "#2B5BD7", overlayText: "#FFFFFF", headingColor: "#1C2B42",
      calloutBgKey: "#E3ECFB", calloutInkKey: "#1C2B42", calloutBgRemember: "#EEF1F5", calloutInkRemember: "#1C2B42",
      calloutBgFun: "#FBF1E1", calloutInkFun: "#1C2B42", badgeBg: "#2B5BD7", badgeInk: "#FFFFFF", blockquoteRule: "#2B5BD7",
      activityCardBg: "#E9EFF8", activityCardInk: "#1C2B42", speechBubbleStroke: "#1C2B42", checkBadgeBg: "#16A34A", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Nunito', sans-serif", body: "'Nunito', sans-serif" },
  },
  {
    id: "warm-grey", name: "Warm Grey", description: "Soft stone with a gentle sun", category: "classic", family: "basic",
    palette: {
      background: "#F5F3EF", paperBg: "#FFFFFF", paperShadow: "rgba(43, 40, 36, 0.08)",
      text: "#2B2824", muted: "#5F5A52", accent: "#B45309", overlayText: "#FFFFFF", headingColor: "#2B2824",
      calloutBgKey: "#F1D9BC", calloutInkKey: "#2B2824", calloutBgRemember: "#E9E6E0", calloutInkRemember: "#2B2824",
      calloutBgFun: "#EDE7F1", calloutInkFun: "#2B2824", badgeBg: "#2B2824", badgeInk: "#FFFFFF", blockquoteRule: "#B45309",
      activityCardBg: "#ECE8E1", activityCardInk: "#2B2824", speechBubbleStroke: "#2B2824", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Source Sans 3', sans-serif", body: "'Source Sans 3', sans-serif" },
    design: { motif: "sun" },
  },
  {
    id: "night-read", name: "Night Read", description: "Dark and low glare for dim rooms", category: "classic", family: "basic",
    tags: ["low-stimulation"],
    palette: {
      background: "#1C1F26", paperBg: "#242832", paperShadow: "rgba(0, 0, 0, 0.35)",
      text: "#E8E6E3", muted: "#A9ADB6", accent: "#8AB4F8", overlayText: "#FFFFFF", headingColor: "#F1EFEC",
      calloutBgKey: "#2A3346", calloutInkKey: "#DCE7FB", calloutBgRemember: "#2B2F38", calloutInkRemember: "#E8E6E3",
      calloutBgFun: "#3A2E3E", calloutInkFun: "#F0DDF2", badgeBg: "#8AB4F8", badgeInk: "#1C1F26", blockquoteRule: "#8AB4F8",
      activityCardBg: "#2B2F38", activityCardInk: "#E8E6E3", speechBubbleStroke: "#E8E6E3", checkBadgeBg: "#4ADE80", checkBadgeInk: "#0B1020",
    },
    fonts: { heading: "'Atkinson Hyperlegible', sans-serif", body: "'Atkinson Hyperlegible', sans-serif" },
  },
  {
    id: "peach", name: "Peach", description: "Warm peach and Lexend, easy on the eyes", category: "classic", family: "basic",
    tags: ["dyslexia-friendly"],
    palette: {
      background: "#FFF1E8", paperBg: "#FFF9F4", paperShadow: "rgba(43, 33, 24, 0.08)",
      text: "#2B2118", muted: "#5E4E42", accent: "#C2410C", overlayText: "#FFFFFF", headingColor: "#2B2118",
      calloutBgKey: "#FFE2CF", calloutInkKey: "#2B2118", calloutBgRemember: "#E5EEF3", calloutInkRemember: "#2B2118",
      calloutBgFun: "#EFE6F3", calloutInkFun: "#2B2118", badgeBg: "#C2410C", badgeInk: "#FFFFFF", blockquoteRule: "#C2410C",
      activityCardBg: "#FCE8DA", activityCardInk: "#2B2118", speechBubbleStroke: "#2B2118", checkBadgeBg: "#2E7D4F", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Lexend', sans-serif", body: "'Lexend', sans-serif" },
  },
  {
    id: "ink-cream", name: "Ink on Cream", description: "Pure black on cream, strong and clear", category: "classic", family: "basic",
    tags: ["high-contrast"],
    palette: {
      background: "#FFF8E1", paperBg: "#FFFDF3", paperShadow: "rgba(0, 0, 0, 0.10)",
      text: "#000000", muted: "#262626", accent: "#0033CC", overlayText: "#FFFFFF", headingColor: "#000000",
      calloutBgKey: "#FFF0B3", calloutInkKey: "#000000", calloutBgRemember: "#E0E8FF", calloutInkRemember: "#000000",
      calloutBgFun: "#F5E0FF", calloutInkFun: "#000000", badgeBg: "#000000", badgeInk: "#FFF8E1", blockquoteRule: "#0033CC",
      activityCardBg: "#FFF0C2", activityCardInk: "#000000", speechBubbleStroke: "#000000", checkBadgeBg: "#000000", checkBadgeInk: "#FFFFFF",
    },
    fonts: { heading: "'Atkinson Hyperlegible', sans-serif", body: "'Atkinson Hyperlegible', sans-serif" },
    design: { title: "underline", frame: "square", callout: "outline" },
  },
];

/** Default theme for newly-created decks. Paper matches the textbook feel of
 *  the competitor's output. */
export const DEFAULT_THEME_ID = "paper";

export function getTheme(id: string | undefined): SlideshowTheme {
  return SLIDESHOW_THEMES.find((t) => t.id === id) ?? SLIDESHOW_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? SLIDESHOW_THEMES[0];
}

/** Display order + labels for the theme-picker section headings. */
export const THEME_CATEGORIES: { id: ThemeCategory; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Clean, timeless looks" },
  { id: "scenic", label: "Scenic", description: "Illustrated landscapes" },
  { id: "math", label: "Math", description: "Geometry & numbers" },
  { id: "science", label: "Science", description: "Atoms & nature" },
  { id: "history", label: "History", description: "Eras & artefacts" },
  { id: "english", label: "English", description: "Books & language" },
];

/** Themes belonging to a category, in their declared order. */
export function getThemesByCategory(category: ThemeCategory): SlideshowTheme[] {
  return SLIDESHOW_THEMES.filter((t) => t.category === category);
}

/** The picker's three tabs, in order. */
export const THEME_FAMILIES: { id: ThemeFamily; label: string; description: string }[] = [
  { id: "playful", label: "Playful", description: "Bright and bold, made for younger classes" },
  { id: "professional", label: "Professional", description: "Calm, editorial and polished" },
  { id: "basic", label: "Basic", description: "Plain and easy to read" },
];

/** A theme's full treatment: its family's defaults with its own overrides. */
export function themeDesign(theme: SlideshowTheme): ThemeDesign {
  return { ...FAMILY_DESIGN[theme.family], ...theme.design };
}

/** The themes a teacher can pick: all but the retired ones. */
export const PICKER_THEMES: SlideshowTheme[] = SLIDESHOW_THEMES.filter((t) => !t.retired);

/** Pickable themes in a family, designed ones first and art ones last. */
export function getThemesByFamily(family: ThemeFamily): SlideshowTheme[] {
  const inFamily = PICKER_THEMES.filter((t) => t.family === family);
  const designed = inFamily.filter((t) => !t.backgroundArt);
  const art = inFamily.filter((t) => !!t.backgroundArt);
  return [...designed, ...art];
}

/** The filter chip a theme sits under within its family, if any. */
export function themeGroupLabel(theme: SlideshowTheme): string | null {
  switch (theme.category) {
    case "scenic": return "Scenic";
    case "math": return "Maths";
    case "science": return "Science";
    case "history": return "History";
    case "english": return "English";
    default: return null;
  }
}

export const THEME_TAG_LABEL: Record<ThemeTag, string> = {
  "dyslexia-friendly": "Dyslexia-friendly",
  "low-stimulation": "Low stimulation",
  "high-contrast": "High contrast",
};

/** The design a new deck starts on in each family, until the teacher picks. */
export const DEFAULT_THEME_FOR_FAMILY: Record<ThemeFamily, string> = {
  playful: "sticker",
  professional: "paper",
  basic: "clean",
};

/** Which tab the picker opens on: Playful up to Year 6, Professional after. */
export function defaultFamilyForYear(year: string | undefined | null): ThemeFamily {
  if (!year) return "playful";
  if (year === "Nursery" || year === "Reception") return "playful";
  const n = Number(year.match(/^Year (\d{1,2})$/)?.[1]);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return "playful";
  return "professional";
}
