// Visual themes for AI-generated slideshows. Each theme drives:
//   1. The AI prompt (style hints, tone)
//   2. The layout renderer's color/font choices
//   3. The preview card shown in the Generate modal
//
// Adding a theme: append an entry below. No other code changes required —
// the modal, API, and renderer all read from this list dynamically.

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
  };
  fonts: {
    heading: string;          // CSS font-family for titles
    body: string;             // CSS font-family for body
  };
  /** Hint to the AI generator about which colorScheme to bias toward. */
  preferredScheme: "light" | "dark" | "accent";
  /** Free-text style hint injected into the AI prompt. */
  promptHint: string;
}

export const SLIDESHOW_THEMES: SlideshowTheme[] = [
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
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
    preferredScheme: "light",
    promptHint: "Clean and minimal — generous whitespace, restrained accent colour, neutral type.",
  },
  {
    id: "dark",
    name: "Dark",
    description: "For the night owls",
    palette: {
      background: "#0f172a",
      text: "#ffffff",
      muted: "#94a3b8",
      accent: "#fbbf24",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
    },
    preferredScheme: "dark",
    promptHint: "Bold and atmospheric — dark canvas, glowing accent, succinct copy.",
  },
  {
    id: "classroom",
    name: "Classroom",
    description: "Bright and friendly",
    palette: {
      background: "#fffaeb",
      text: "#1a1a2e",
      muted: "#6b6244",
      accent: "#ff6b6b",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'Bricolage Grotesque', sans-serif",
      body: "'Inter', sans-serif",
    },
    preferredScheme: "light",
    promptHint: "Warm and welcoming for young learners — playful but clear, primary colour accent.",
  },
  {
    id: "academic",
    name: "Academic",
    description: "Polished and serious",
    palette: {
      background: "#fdfcf8",
      text: "#1c1917",
      muted: "#57534e",
      accent: "#0f766e",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Crimson Text', serif",
    },
    preferredScheme: "light",
    promptHint: "Editorial and considered — serif type, restrained palette, rigorous content.",
  },
  {
    id: "pastel",
    name: "Pastel",
    description: "Soft and calm",
    palette: {
      background: "#fdf2f8",
      text: "#3f1d4e",
      muted: "#7c5e87",
      accent: "#a855f7",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'Nunito', sans-serif",
      body: "'Nunito', sans-serif",
    },
    preferredScheme: "light",
    promptHint: "Gentle and approachable — pastel surfaces, rounded type, kind tone.",
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
    },
    fonts: {
      heading: "'Archivo Black', sans-serif",
      body: "'Inter', sans-serif",
    },
    preferredScheme: "accent",
    promptHint: "Loud and confident — oversized headlines, saturated accent, punchy copy.",
  },
  {
    id: "mono",
    name: "Mono",
    description: "Just black and white",
    palette: {
      background: "#ffffff",
      text: "#000000",
      muted: "#525252",
      accent: "#000000",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'JetBrains Mono', monospace",
      body: "'Inter', sans-serif",
    },
    preferredScheme: "light",
    promptHint: "Strict monochrome — no colour, only typographic hierarchy and contrast.",
  },
  {
    id: "storybook",
    name: "Storybook",
    description: "Warm and whimsical",
    palette: {
      background: "#fef7e6",
      text: "#3e2723",
      muted: "#8d6e63",
      accent: "#e07a5f",
      overlayText: "#ffffff",
    },
    fonts: {
      heading: "'Caveat', cursive",
      body: "'Lora', serif",
    },
    preferredScheme: "light",
    promptHint: "Hand-drawn warmth — script titles, gentle body type, cosy palette.",
  },
];

export function getTheme(id: string | undefined): SlideshowTheme {
  return SLIDESHOW_THEMES.find((t) => t.id === id) ?? SLIDESHOW_THEMES[0];
}
