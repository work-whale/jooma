// Visual themes for slideshows. Themes are purely a visual skin: background
// colours, text colours, fonts, accent. They do NOT influence the AI-generated
// content — the same slide skeleton renders identically across themes apart
// from styling. Think of these like phone/website themes.
//
// Adding a theme: append an entry below. No other code changes required —
// the modal and renderer read from this list dynamically.

/** Groups themes in the picker. `classic` = clean timeless skins, `scenic` =
 *  illustrated landscapes, and one group per school subject. */
export type ThemeCategory = "classic" | "scenic" | "math" | "science" | "history" | "english";

export interface SlideshowTheme {
  id: string;
  name: string;
  description: string;
  category: ThemeCategory;
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
    description: "Cream paper, sienna headings — textbook feel",
    category: "classic",
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
    category: "classic",
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
    category: "classic",
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
    category: "classic",
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
    category: "classic",
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
    category: "scenic",
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
    category: "scenic",
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
    category: "scenic",
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
    category: "scenic",
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
    category: "scenic",
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
    description: "Indigo geometry — rulers, compass, shapes",
    category: "math",
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
    description: "Teal lab — atoms, molecules, beakers",
    category: "science",
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
    description: "Parchment — columns, scrolls, amphora",
    category: "history",
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
    description: "Literary cream — books, quill, ink",
    category: "english",
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
    id: "math-pop", name: "Math · Pop", description: "Coral & yellow geometry confetti", category: "math",
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
    id: "math-neon", name: "Math · Neon", description: "Electric violet & cyan geometry", category: "math",
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
    id: "math-citrus", name: "Math · Citrus", description: "Zesty orange & lime geometry", category: "math",
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
    id: "science-pop", name: "Science · Lab Pop", description: "Bright beakers, bubbles & atoms", category: "science",
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
    id: "science-cosmic", name: "Science · Cosmic", description: "Purple atoms, planets & stars", category: "science",
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
    id: "science-botanic", name: "Science · Botanic", description: "Leaves, DNA & blooms", category: "science",
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
    id: "history-pop", name: "History · Pop", description: "Bright columns, amphora & scrolls", category: "history",
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
    id: "history-explorer", name: "History · Explorer", description: "Maps, compass & ships", category: "history",
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
    id: "history-royal", name: "History · Royal", description: "Crowns, castles & shields", category: "history",
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
    id: "english-storybook", name: "English · Storybook", description: "Books, quill & speech bubbles", category: "english",
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
    id: "english-comic", name: "English · Comic", description: "Bold speech bubbles & bursts", category: "english",
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
    id: "english-poetry", name: "English · Poetry", description: "Quills, feathers & ink swirls", category: "english",
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
