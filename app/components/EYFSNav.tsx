"use client";

import Card from "@/app/components/ui/Card";

const CORE_SECTIONS = [
  "Overview",
  "Communication and Language",
  "Physical Development",
  "Personal, Social and Emotional Development",
  "Literacy",
  "Mathematics",
  "Understanding the World",
  "Expressive Arts and Design",
];

interface Props {
  includeBookList?: boolean;
  includeHomeLearning?: boolean;
  includeWeeklyOverview?: boolean;
}

export default function EYFSNav({ includeBookList, includeHomeLearning, includeWeeklyOverview }: Props) {
  const sections = [
    ...CORE_SECTIONS,
    ...(includeBookList ? ["Book List"] : []),
    ...(includeHomeLearning ? ["Home Learning Ideas"] : []),
    ...(includeWeeklyOverview ? ["Weekly Overview"] : []),
  ];

  const scrollTo = (label: string) => {
    const headings = document.querySelectorAll("h1, h2");
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
        {sections.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => scrollTo(label)}
            className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {label}
          </button>
        ))}
      </nav>
    </Card>
  );
}
