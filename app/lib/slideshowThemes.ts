// Visual themes for slideshows. Themes are purely a visual skin: background
// colours, text colours, fonts, accent. They do NOT influence the AI-generated
// content — the same slide skeleton renders identically across themes apart
// from styling. Think of these like phone/website themes.
//
// Adding a theme: append an entry below. No other code changes required —
// the modal and renderer read from this list dynamically.

export interface SlideshowTheme {
  id: string;
  name: string;
  description: string;
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
   *  semi-transparent veil drawn over it so text stays legible. */
  backgroundArt?: string;
  backgroundArtScrim?: string;
}

export const SLIDESHOW_THEMES: SlideshowTheme[] = [
  {
    id: "paper",
    name: "Paper",
    description: "Cream paper, sienna headings — textbook feel",
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
    backgroundArt: "/scenes/ocean.png",
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
    backgroundArt: "/scenes/desert.png",
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
    backgroundArt: "/scenes/cloudy.png",
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
    backgroundArtScrim: "rgba(246, 251, 244, 0.5)",
  },
  {
    id: "dusk",
    name: "Dusk",
    description: "Warm sunset glow over the horizon",
    backgroundArt: "/scenes/dusk.png",
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
];

/** Default theme for newly-created decks. Paper matches the textbook feel of
 *  the competitor's output. */
export const DEFAULT_THEME_ID = "paper";

export function getTheme(id: string | undefined): SlideshowTheme {
  return SLIDESHOW_THEMES.find((t) => t.id === id) ?? SLIDESHOW_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? SLIDESHOW_THEMES[0];
}
