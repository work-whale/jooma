"use client";

import Link from "next/link";
import { C } from "../ui";

// Links rather than buttons, like the Stats range tabs: the tab lives in the
// URL, so page.tsx fetches only what the open tab needs, each tab prefetches on
// hover, and "Use" on a template can link straight into a prefilled Compose.
export default function EmailTabs({
  tabs,
  current,
}: {
  tabs: { key: string; label: string }[];
  current: string;
}) {
  return (
    <nav
      aria-label="Emails sections"
      className="inline-flex rounded-full p-1 border mb-5"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={`/admin/emails?tab=${t.key}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
            style={on ? { backgroundColor: C.brand, color: "#fff" } : { color: C.muted }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
