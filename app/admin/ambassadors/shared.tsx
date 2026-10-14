"use client";

// Small pieces shared by the ambassador page's view, drawer and dropdown.

import { C } from "../ui";

/** The mockup's gold, as hex for the console's inline styles. */
export const GOLD = {
  main: "#C08A1E",
  light: "#E8B944",
  pale: "#F4D98B",
  bg: "#FDF7E7",
  ink: "#7A5610",
  line: "#EEDCA8",
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** A round initials badge. Gold for a live ambassador, lilac for an applicant. */
export function Person({
  name,
  sub,
  gold = false,
}: {
  name: string;
  sub?: string;
  gold?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="w-7 h-7 rounded-full grid place-items-center text-[0.66rem] font-extrabold shrink-0"
        style={
          gold
            ? { background: `linear-gradient(135deg, ${GOLD.pale}, ${GOLD.main})`, color: "#2B1D02" }
            : { backgroundColor: C.brandBg, color: C.brand }
        }
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <b className="block text-sm font-semibold truncate" style={{ color: C.ink }}>
          {name}
        </b>
        {sub && (
          <span className="block text-xs truncate" style={{ color: C.muted }}>
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}

/** A code, set in monospace on a pale chip. */
export function CodeChip({ code }: { code: string }) {
  return (
    <span
      className="font-mono font-bold text-xs rounded-md border px-2 py-0.5"
      style={{ backgroundColor: C.page, borderColor: C.border, color: C.brand }}
    >
      {code}
    </span>
  );
}

/** "2 days ago", "4 hours ago", "yesterday". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function shortDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Not set";
}
