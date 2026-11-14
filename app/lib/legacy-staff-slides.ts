// A deck from the old Staff Slides engine (before batch 6), as its runs
// store it: a JSON array of these. New Staff Slides decks are presentations
// made by the main Slides engine (app/lib/deck-kind.ts); old runs still open
// read-only in app/components/staff-slides/LegacyStaffSlides.tsx.

export interface SlideData {
  type: "title" | "content" | "quote" | "stat" | "two-column" | "activity";
  title: string;
  presentationTitle: string;
  // title / content
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
  callout?: { type: "key-point" | "reflection" | "try-this" | "discussion"; text: string };
  // quote
  quote?: string;
  quoteAuthor?: string;
  // stat
  stat?: string;
  statLabel?: string;
  statContext?: string;
  // two-column
  leftTitle?: string;
  leftContent?: string;
  rightTitle?: string;
  rightContent?: string;
  // activity
  activityPrompt?: string;
  activitySubtask?: string;
}
