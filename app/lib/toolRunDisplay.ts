import { TOOLS } from "@/app/lib/tools";

// Shared display helpers for rendering tool_runs (dashboard + analytics).

// Friendly short "type" labels; falls back to the tool's full label.
const TYPE_LABEL: Record<string, string> = {
  "lesson-planner": "Lesson plan",
  "worksheet-generator": "Worksheet",
  "quiz-generator": "Quiz",
  "comprehension-generator": "Comprehension",
  "lesson-slideshow": "Slideshow",
  "cpd-slideshow": "CPD Slideshow",
  "homework-generator": "Homework",
  "report-writer": "Report",
};

export function toolForSlug(slug: string) {
  return TOOLS.find((t) => t.href === `/tools/${slug}`);
}

export function typeLabel(slug: string) {
  return TYPE_LABEL[slug] ?? toolForSlug(slug)?.label ?? slug;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export const TAG_COLORS: Record<string, { bg: string; icon: string }> = {
  Planning: { bg: "bg-blue-100", icon: "text-blue-600" },
  Literacy: { bg: "bg-amber-100", icon: "text-amber-600" },
  Assessment: { bg: "bg-violet-100", icon: "text-violet-600" },
  "Early Years": { bg: "bg-emerald-100", icon: "text-emerald-600" },
  SEND: { bg: "bg-emerald-100", icon: "text-emerald-600" },
  Leadership: { bg: "bg-rose-100", icon: "text-rose-600" },
};
