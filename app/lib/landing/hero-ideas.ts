// The v3 hero: which tools the topic box can open, and the example pills under
// it. Lives in app/lib/landing so the language check covers every string.

export type HeroToolId = "slides" | "comp" | "ws";

export interface HeroTool {
  id: HeroToolId;
  name: string;
  /** Phosphor icon, rendered in a squircle tile. */
  icon: string;
  /** The category solid from app/lib/tools.ts, so the tile matches the app. */
  solid: string;
  /** False until the guest flow supports it. Shown, not hidden, with a badge. */
  available: boolean;
  placeholder: string;
}

export const HERO_TOOLS: readonly HeroTool[] = [
  {
    id: "slides",
    name: "Slides",
    icon: "presentation-chart",
    solid: "#5B2ED6",
    available: true,
    placeholder: "What are you teaching? Try Volcanoes, Year 3",
  },
  {
    id: "comp",
    name: "Comprehension",
    icon: "book-open-text",
    solid: "#1D6FD0",
    available: true,
    placeholder: "Give it a topic. Try The Great Fire of London, Year 2",
  },
  {
    id: "ws",
    name: "Worksheets",
    icon: "file-text",
    solid: "#0F8A63",
    available: false,
    placeholder: "Worksheets are coming soon",
  },
];

export function heroTool(id: HeroToolId): HeroTool {
  return HERO_TOOLS.find((t) => t.id === id) ?? HERO_TOOLS[0];
}

export const HERO_IDEAS: readonly [HeroToolId, string][] = [
  ["slides", "Recycling and sustainability, Year 5"],
  ["comp", "The Great Fire of London, Year 2"],
  ["slides", "Volcanoes and the Ring of Fire, Year 3"],
  ["comp", "Why do bees matter? Year 2"],
  ["slides", "Ancient Egypt, Year 5"],
  ["comp", "Life in Victorian Britain, Year 5"],
  ["slides", "Light and shadows, Year 3"],
  ["comp", "The water cycle, Year 4"],
  ["slides", "Equivalent fractions, Year 4"],
  ["comp", "The Titanic, Year 6"],
  ["slides", "Persuasive writing, Year 6"],
  ["comp", "Florence Nightingale, Year 2"],
];

/** Three ideas starting at `offset`, wrapping round the list. */
export function ideasAt(offset: number, count = 3): [HeroToolId, string][] {
  const n = HERO_IDEAS.length;
  const start = ((offset % n) + n) % n;
  return Array.from({ length: count }, (_, i) => HERO_IDEAS[(start + i) % n]);
}

/**
 * Where Create goes. Null when there is nothing to open: an empty topic (the
 * box asks for one instead) or a tool that is not available yet.
 */
export function heroHref(tool: HeroToolId, topic: string): string | null {
  const t = topic.trim();
  if (!t || !heroTool(tool).available) return null;
  const params = new URLSearchParams({ tool, topic: t.slice(0, 200) });
  return `/create?${params.toString()}`;
}
