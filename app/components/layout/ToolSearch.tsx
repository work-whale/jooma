"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CiSearch } from "react-icons/ci";
import { TOOLS } from "@/app/lib/tools";

const TAG_COLORS: Record<string, string> = {
  Planning: "bg-blue-100 text-blue-700",
  Literacy: "bg-amber-100 text-amber-700",
  Assessment: "bg-violet-100 text-violet-700",
  "Early Years": "bg-emerald-100 text-emerald-700",
  SEND: "bg-emerald-100 text-emerald-700",
  Leadership: "bg-rose-100 text-rose-700",
};

interface ToolSearchProps {
  /**
   * "bar"    — TopBar: a fixed-width input with an absolutely-positioned
   *            results panel. Desktop only.
   * "drawer" — inside the mobile SideNav: full width, results listed inline
   *            below the input rather than floating.
   */
  variant: "bar" | "drawer";
  /** Called after a result is chosen — lets the drawer close itself. */
  onNavigate?: () => void;
}

/*
 * Tool search, shared by the TopBar (desktop) and the mobile nav drawer.
 *
 * It moved out of TopBar because there is no room for it on a phone: the
 * results panel alone is 384px, wider than the viewport, and it is anchored
 * right so it overflowed the left edge. Rather than shrink it into
 * unusability, the drawer hosts a full-width version — which is also where a
 * teacher already is when they are looking for somewhere to go.
 */
export default function ToolSearch({ variant, onNavigate }: ToolSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? TOOLS.filter(
        (t) =>
          t.label.toLowerCase().includes(trimmed) ||
          t.description.toLowerCase().includes(trimmed) ||
          t.tag.toLowerCase().includes(trimmed)
      ).slice(0, 6)
    : [];

  // Close the floating panel on outside click. The drawer variant lists its
  // results inline, so it has nothing to dismiss.
  useEffect(() => {
    if (variant !== "bar") return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [variant]);

  const handleSelect = (href: string) => {
    setQuery("");
    setOpen(false);
    router.push(href);
    onNavigate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      handleSelect(results[activeIndex].href);
    }
  };

  const drawer = variant === "drawer";

  const resultRows = results.map((tool, i) => (
    <li key={tool.href} role="presentation">
      {/* mousedown so a pointer pick lands before the input's blur closes the
          panel; click as well, so a keyboard or switch user who reaches the
          button can activate it too. The first one to fire clears the list. */}
      <button
        type="button"
        id={`${listId}-${i}`}
        role="option"
        aria-selected={i === activeIndex}
        onMouseDown={() => handleSelect(tool.href)}
        onClick={() => handleSelect(tool.href)}
        onMouseEnter={() => setActiveIndex(i)}
        className={`w-full min-h-12 flex items-start gap-3 px-4 py-3 transition-colors text-left cursor-pointer active:bg-gray-100 ${
          i === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900 truncate">{tool.label}</span>
            <span
              className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                TAG_COLORS[tool.tag] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {tool.tag}
            </span>
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">{tool.description}</p>
        </div>
      </button>
    </li>
  ));

  return (
    <div className="relative" ref={wrapperRef}>
      {/* A visible label in the drawer, where there is room for one and the
          field must not rely on its placeholder. The desktop top bar is a
          single 64px row with no room above the field, so there it is named
          for assistive tech only. */}
      <label
        htmlFor={inputId}
        className={drawer ? "block mb-1.5 text-sm font-semibold text-(--j-ink)" : "sr-only"}
      >
        Search tools
      </label>
      <div className="relative">
      <CiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none z-10" />
      <input
        id={inputId}
        type="text"
        // The search key on a phone keyboard, and "search" on its enter key.
        inputMode="search"
        enterKeyHint="search"
        role="combobox"
        aria-expanded={drawer ? results.length > 0 : open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? `${listId}-${activeIndex}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search tools"
        /* text-base below sm: iOS Safari auto-zooms the page on focus for any
           input under 16px, which strands the teacher at 2x with no way back. */
        className={`pl-9 pr-4 py-2 border border-line font-light rounded-2xl text-base sm:text-sm placeholder-muted focus:outline-none focus:border-gray-400 transition-all bg-white ${
          drawer ? "w-full min-h-12" : "w-48 xl:w-64"
        }`}
      />
      </div>

      {drawer ? (
        <>
          {trimmed && results.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Tools" className="mt-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {resultRows}
            </ul>
          )}
          {trimmed && results.length === 0 && (
            <p className="mt-2 px-1 text-sm text-gray-500">
              No tools match <span className="font-medium text-gray-700">&quot;{query}&quot;</span>
            </p>
          )}
        </>
      ) : (
        <>
          {open && results.length > 0 && (
            <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden">
              <p className="px-4 pt-3 pb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Tools
              </p>
              <ul id={listId} role="listbox" aria-label="Tools">{resultRows}</ul>
            </div>
          )}
          {open && trimmed && results.length === 0 && (
            <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-2xl shadow-lg z-50 px-4 py-4">
              <p className="text-sm text-gray-500">
                No tools match <span className="font-medium text-gray-700">&quot;{query}&quot;</span>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
