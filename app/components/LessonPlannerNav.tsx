"use client";

import Card from "@/app/components/ui/Card";

const SECTIONS = [
  "Clarity of Objective",
  "Key Vocabulary",
  "Evaluation of Prior Knowledge",
  "Instructional Strategies",
  "Adaptation Strategies",
  "Summative Assessment",
  "Resources and Technology",
];

export default function LessonPlannerNav() {
  const scrollTo = (sectionNum: number) => {
    const headings = document.querySelectorAll("h2");
    for (const h of headings) {
      if (h.textContent?.trim().startsWith(`Section ${sectionNum}`)) {
        const top = h.getBoundingClientRect().top + window.scrollY - 160;
        window.scrollTo({ top, behavior: "smooth" });
        return;
      }
    }
  };

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold text-(--color-muted) uppercase tracking-wide mb-3">Jump to section</p>
      <nav className="space-y-0.5">
        {SECTIONS.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i + 1)}
            className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer flex items-center gap-2.5"
          >
            <span className="text-xs font-semibold text-(--color-muted) w-4 shrink-0">{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
    </Card>
  );
}
