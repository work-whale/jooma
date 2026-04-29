"use client";

import Card from "@/app/components/ui/Card";

const ACTIVITIES = ["1.", "2.", "3.", "4.", "5."];

export default function SensoryActivitiesNav() {
  const scrollTo = (prefix: string) => {
    const headings = document.querySelectorAll("h2");
    for (const h of headings) {
      if (h.textContent?.trimStart().startsWith(prefix)) {
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
        {ACTIVITIES.map((prefix, i) => (
          <button
            key={prefix}
            type="button"
            onClick={() => scrollTo(prefix)}
            className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer flex items-center gap-2.5"
          >
            <span className="text-xs font-semibold text-(--color-muted) w-4 shrink-0">{i + 1}</span>
            Activity {i + 1}
          </button>
        ))}
      </nav>
    </Card>
  );
}
