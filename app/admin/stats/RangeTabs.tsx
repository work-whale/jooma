"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { C } from "../ui";
import { RANGES, RANGE_LABEL, parseRange } from "./range";

// Links rather than buttons with router.push, so each range prefetches on hover
// and the back button steps through ranges the way a reader expects. The state
// lives in the URL, which is what lets page.tsx read it server side and keep the
// data fetch off the client entirely.
export default function RangeTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = parseRange(params.get("range") ?? undefined);

  return (
    <div
      className="inline-flex rounded-full p-1 border"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      {RANGES.map((r) => {
        const on = r === current;
        return (
          <Link
            key={r}
            href={`${pathname}?range=${r}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={on ? { backgroundColor: C.brand, color: "#fff" } : { color: C.muted }}
          >
            {RANGE_LABEL[r]}
          </Link>
        );
      })}
    </div>
  );
}
