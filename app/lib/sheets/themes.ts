// Designs for printed sheets, in the same three families as the slide themes
// so the product has one design language: Playful, Professional, Basic.
//
// A theme is CSS variables plus a few switches. sheet-css.ts holds the one
// stylesheet every theme shares, so the page on screen, Print and the PDF are
// drawn by the same rules from the same values.

import type { ThemeFamily, ThemeTag } from "@/app/lib/slideshowThemes";

export interface SheetTheme {
  id: string;
  name: string;
  description: string;
  family: ThemeFamily;
  tags?: ThemeTag[];
  fonts: { heading: string; body: string };
  colors: {
    paper: string;
    ink: string;
    muted: string;
    heading: string;
    accent: string;
    /** Text set on the accent colour. */
    onAccent: string;
    /** Tinted fills: section bands, the objective, word banks. */
    soft: string;
    /** The passage panel and callouts. */
    panel: string;
    line: string;
  };
  look: {
    radius: number;
    border: number;
    /** How section headings are drawn. */
    section: "band" | "underline" | "tab" | "plain";
    /** Question numbers: a filled circle, a filled square, or just the number. */
    number: "circle" | "square" | "plain";
    /** Whether section emoji are shown. Off for the quieter themes. */
    emoji: boolean;
    lines: "dashed" | "dotted" | "solid";
    /** Soft shadows on cards, the "volume". Off where ink matters. */
    shadow: boolean;
    /** Extra line height, for the reading themes. */
    leading: number;
  };
}

export const SHEET_THEMES: SheetTheme[] = [
  // Playful
  {
    id: "sunny", name: "Sunny", description: "Teal headings, sunny yellow and soft cards", family: "playful",
    fonts: { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#22223B", muted: "#5C5C7A", heading: "#0E7C6B", accent: "#FFB703", onAccent: "#3A2600", soft: "#FFF4D1", panel: "#F0FAF7", line: "#E6DFCB" },
    look: { radius: 18, border: 2, section: "band", number: "circle", emoji: true, lines: "dashed", shadow: true, leading: 1.5 },
  },
  {
    id: "bubblegum", name: "Bubblegum", description: "Pink and mint, round and bouncy", family: "playful",
    fonts: { heading: "'Baloo 2', sans-serif", body: "'Nunito', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#2B1D2E", muted: "#6E5A70", heading: "#C2185B", accent: "#FF8FB1", onAccent: "#4A0D24", soft: "#FFE6EF", panel: "#EAFBF4", line: "#F1D5DF" },
    look: { radius: 22, border: 2, section: "tab", number: "circle", emoji: true, lines: "dashed", shadow: true, leading: 1.5 },
  },
  {
    id: "doodle", name: "Doodle", description: "Notebook paper and pen-blue headings", family: "playful",
    fonts: { heading: "'Patrick Hand', cursive", body: "'Andika', sans-serif" },
    colors: { paper: "#FFFDF5", ink: "#272727", muted: "#5F5F5F", heading: "#1F3B8C", accent: "#2F6FED", onAccent: "#FFFFFF", soft: "#EEF3FF", panel: "#FFF9E3", line: "#D8D2BF" },
    look: { radius: 12, border: 2, section: "underline", number: "circle", emoji: true, lines: "solid", shadow: false, leading: 1.55 },
  },
  // Professional
  {
    id: "classic", name: "Classic", description: "Jooma purple, crisp and clear", family: "professional",
    fonts: { heading: "'Bricolage Grotesque', sans-serif", body: "'Inter', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#1D1730", muted: "#6D6683", heading: "#3A1C8F", accent: "#5B2ED6", onAccent: "#FFFFFF", soft: "#F1ECFC", panel: "#F7F5FC", line: "#E2DCF2" },
    look: { radius: 14, border: 1.5, section: "underline", number: "circle", emoji: true, lines: "dashed", shadow: true, leading: 1.5 },
  },
  {
    id: "ledger", name: "Ledger", description: "Serif type and maroon, like a good textbook", family: "professional",
    fonts: { heading: "'Fraunces', serif", body: "'Lora', serif" },
    colors: { paper: "#FFFFFF", ink: "#2D1B14", muted: "#7A6255", heading: "#7A1F2B", accent: "#7A1F2B", onAccent: "#FFFFFF", soft: "#F6EEE4", panel: "#FBF7F1", line: "#E5D8C9" },
    look: { radius: 8, border: 1.5, section: "underline", number: "square", emoji: false, lines: "solid", shadow: false, leading: 1.5 },
  },
  {
    id: "slate", name: "Slate", description: "Cool grey and teal, modern and calm", family: "professional",
    fonts: { heading: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#1E293B", muted: "#64748B", heading: "#0F172A", accent: "#0F766E", onAccent: "#FFFFFF", soft: "#E6F4F2", panel: "#F4F6F9", line: "#DCE3EA" },
    look: { radius: 10, border: 1.5, section: "tab", number: "square", emoji: false, lines: "dashed", shadow: true, leading: 1.5 },
  },
  // Basic
  {
    id: "clear-print", name: "Clear Print", description: "Black on white, no fills, saves ink", family: "basic", tags: ["low-stimulation"],
    fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#000000", muted: "#333333", heading: "#000000", accent: "#000000", onAccent: "#FFFFFF", soft: "#FFFFFF", panel: "#FFFFFF", line: "#000000" },
    look: { radius: 6, border: 1.5, section: "plain", number: "plain", emoji: false, lines: "solid", shadow: false, leading: 1.5 },
  },
  {
    id: "easy-read", name: "Easy Read", description: "Lexend on cream, with extra space", family: "basic", tags: ["dyslexia-friendly", "low-stimulation"],
    fonts: { heading: "'Lexend', sans-serif", body: "'Lexend', sans-serif" },
    colors: { paper: "#FFFBF0", ink: "#1F2430", muted: "#4A5162", heading: "#1F2430", accent: "#2F6F9F", onAccent: "#FFFFFF", soft: "#F3EAD3", panel: "#FBF4E2", line: "#D9CDB0" },
    look: { radius: 10, border: 1.5, section: "plain", number: "circle", emoji: false, lines: "solid", shadow: false, leading: 1.75 },
  },
  {
    id: "high-contrast", name: "High Contrast", description: "Bold black rules, for low vision", family: "basic", tags: ["high-contrast"],
    fonts: { heading: "'Atkinson Hyperlegible', sans-serif", body: "'Atkinson Hyperlegible', sans-serif" },
    colors: { paper: "#FFFFFF", ink: "#000000", muted: "#000000", heading: "#000000", accent: "#000000", onAccent: "#FFFFFF", soft: "#FFFFFF", panel: "#FFFFFF", line: "#000000" },
    look: { radius: 8, border: 3, section: "band", number: "square", emoji: false, lines: "solid", shadow: false, leading: 1.6 },
  },
];

export const DEFAULT_SHEET_THEME: Record<ThemeFamily, string> = {
  playful: "sunny",
  professional: "classic",
  basic: "clear-print",
};

export function getSheetTheme(id: string | undefined): SheetTheme {
  return SHEET_THEMES.find((t) => t.id === id) ?? SHEET_THEMES.find((t) => t.id === "classic")!;
}

/** Base type size per font size setting, in CSS pixels on an A4 page. */
export const FONT_SCALE_PX: Record<"s" | "m" | "l" | "xl", number> = { s: 13.5, m: 15, l: 17, xl: 19.5 };

/** Page sizes at 96 dpi. */
export const PAPER_PX: Record<"a4" | "letter", { w: number; h: number }> = {
  a4: { w: 794, h: 1123 },
  letter: { w: 816, h: 1056 },
};

/** The theme as CSS custom properties on the sheet's root element. */
export function sheetThemeVars(theme: SheetTheme, fontScale: keyof typeof FONT_SCALE_PX, paper: keyof typeof PAPER_PX): Record<string, string> {
  const c = theme.colors;
  const l = theme.look;
  return {
    "--js-paper": c.paper,
    "--js-ink": c.ink,
    "--js-muted": c.muted,
    "--js-heading": c.heading,
    "--js-accent": c.accent,
    "--js-on-accent": c.onAccent,
    "--js-soft": c.soft,
    "--js-panel": c.panel,
    "--js-line": c.line,
    "--js-radius": `${l.radius}px`,
    "--js-border": `${l.border}px`,
    "--js-lines": l.lines,
    "--js-shadow": l.shadow ? "0 1px 2px rgba(20, 16, 40, 0.06), 0 6px 18px rgba(20, 16, 40, 0.07)" : "none",
    "--js-leading": String(l.leading),
    "--js-font-heading": theme.fonts.heading,
    "--js-font-body": theme.fonts.body,
    "--js-size": `${FONT_SCALE_PX[fontScale]}px`,
    "--js-page-w": `${PAPER_PX[paper].w}px`,
    "--js-page-h": `${PAPER_PX[paper].h}px`,
  };
}
