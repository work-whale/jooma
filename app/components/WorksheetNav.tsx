"use client";

import Card from "@/app/components/ui/Card";

const SECTIONS = [
  "Knowledge Recall",
  "Understanding",
  "Application",
  "Analysis and Evaluation",
  "Common Misconceptions",
  "Answer Key",
];

export default function WorksheetNav() {
  const scrollTo = (label: string) => {
    const headings = document.querySelectorAll("h2");
    for (const h of headings) {
      if (h.textContent?.includes(label)) {
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
            key={label}
            type="button"
            onClick={() => scrollTo(label)}
            className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer flex items-center gap-2.5"
          >
            <span className="text-xs font-semibold text-(--color-muted) w-4 shrink-0">
              {i < 4 ? String.fromCharCode(65 + i) : ""}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </Card>
  );
}
