"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { V2_TOOLS, v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { isToolHiddenFor } from "@/app/lib/curricula/tool-scope";
import { useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";
import { matchTools, ilikeContains } from "@/app/lib/app-search";
import { createClient } from "@/app/lib/auth/client";
import { ToolTile } from "@/app/components/v2/Squircle";

interface ToolSearchProps {
  /**
   * "bar"    — TopBar: an input with a floating results panel. Desktop only.
   * "drawer" — inside the phone drawer (dark): full width, results inline.
   */
  variant: "bar" | "drawer";
  /** Called after a result is chosen — lets the drawer close itself. */
  onNavigate?: () => void;
}

interface Result {
  key: string;
  href: string;
  title: string;
  sub: string;
  icon: string;
  solid: string;
}

/** Wait this long after typing stops before asking the library. */
const LIBRARY_DEBOUNCE_MS = 200;

/*
 * "Search your library and the 35 tools" (v4 top bar).
 *
 * Tools are matched locally (app/lib/app-search.ts). The library is a title
 * lookup on tool_runs, scoped to the teacher by RLS, debounced, and escaped so
 * what they type is never a wildcard. One keyboard list runs across both
 * groups. On a phone it lives in the drawer, where there is room for it.
 */
export default function ToolSearch({ variant, onNavigate }: ToolSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tagged with the query it answers, so an answer to an older query is never
  // shown against a newer one.
  const [libraryFor, setLibraryFor] = useState<{ query: string; results: Result[] }>({ query: "", results: [] });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();
  const drawer = variant === "drawer";

  const { id: curriculumId } = useTeacherCurriculum();
  const trimmed = query.trim();

  const tools: Result[] = matchTools(query, V2_TOOLS, (slug) => isToolHiddenFor(slug, curriculumId)).map((t) => ({
    key: t.href,
    href: t.href,
    title: t.name,
    sub: t.description,
    icon: t.icon,
    solid: toolSolid(t),
  }));

  // The library half, fetched after typing pauses.
  useEffect(() => {
    const pattern = ilikeContains(query);
    if (!pattern) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data } = await createClient()
        .from("tool_runs")
        .select("id, title, tool_slug")
        .ilike("title", pattern)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      setLibraryFor({
        query: query.trim(),
        results: (data ?? []).flatMap((run) => {
          const tool = v2ToolForSlug(run.tool_slug);
          if (!tool) return [];
          return [
            {
              key: run.id,
              href: `${tool.href}?run=${run.id}`,
              title: run.title?.trim() || "Untitled",
              sub: tool.name,
              icon: tool.icon,
              solid: toolSolid(tool),
            },
          ];
        }),
      });
    }, LIBRARY_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const library = trimmed && libraryFor.query === trimmed ? libraryFor.results : [];
  const results = trimmed ? [...tools, ...library] : [];

  // Close the floating panel on outside click. The drawer lists inline.
  useEffect(() => {
    if (drawer) return;
    const handler = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [drawer]);

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
      handleSelect(results[Math.min(activeIndex, results.length - 1)]!.href);
    }
  };

  const row = (r: Result, i: number) => (
    <li key={r.key} role="presentation">
      {/* mousedown so a pointer pick lands before the input's blur; click as
          well, for keyboard and switch users. */}
      <button
        type="button"
        id={`${listId}-${i}`}
        role="option"
        aria-selected={i === activeIndex}
        onMouseDown={() => handleSelect(r.href)}
        onClick={() => handleSelect(r.href)}
        onMouseEnter={() => setActiveIndex(i)}
        className={`w-full min-h-12 flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors ${
          i === activeIndex ? "bg-(--j-tint)" : "hover:bg-(--j-bg)"
        }`}
      >
        <ToolTile icon={r.icon} solid={r.solid} size="xs" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-(--j-ink) truncate">{r.title}</span>
          <span className="block text-xs text-(--j-faint) truncate">{r.sub}</span>
        </span>
      </button>
    </li>
  );

  const groupHead = (label: string) => (
    <li role="presentation" className="px-4 pt-3 pb-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-(--j-faint)">
      {label}
    </li>
  );

  const list = (
    <ul id={listId} role="listbox" aria-label="Search results" className="py-1">
      {tools.length > 0 && groupHead("Tools")}
      {tools.map((r, i) => row(r, i))}
      {library.length > 0 && groupHead("Your library")}
      {library.map((r, i) => row(r, tools.length + i))}
    </ul>
  );

  const nothing = (
    <p className={`text-sm ${drawer ? "mt-2 px-1 text-(--j-on-chrome-mid)" : "px-4 py-4 text-(--j-muted)"}`}>
      Nothing matches <span className="font-bold">&quot;{trimmed}&quot;</span>
    </p>
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <label
        htmlFor={inputId}
        className={drawer ? "block mb-1.5 text-sm font-semibold text-(--j-on-chrome-mid)" : "sr-only"}
      >
        Search your library and the tools
      </label>
      <div className="relative">
        <MagnifyingGlass
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
            drawer ? "text-(--j-on-chrome-dim)" : "text-(--j-faint)"
          }`}
        />
        <input
          id={inputId}
          type="text"
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
            if (trimmed) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={drawer ? "Search" : "Search your library and the 35 tools"}
          /* text-base below sm: iOS zooms the page on focus under 16px. */
          className={`pl-9 pr-4 py-2 rounded-full text-base sm:text-[0.84rem] focus:outline-none transition-colors ${
            drawer
              ? "w-full min-h-12 bg-white/10 border border-white/15 text-white placeholder:text-(--j-on-chrome-dim) focus:border-white/40"
              : "w-[min(400px,36vw)] bg-(--j-bg) border border-(--j-line) text-(--j-ink) placeholder:text-(--j-faint) focus:border-(--j-line-2) focus:bg-white"
          }`}
        />
      </div>

      {drawer ? (
        trimmed &&
        (results.length > 0 ? (
          <div className="mt-2 bg-white rounded-2xl overflow-hidden">{list}</div>
        ) : (
          nothing
        ))
      ) : (
        open &&
        trimmed && (
          <div className="absolute left-0 top-full mt-2 w-[min(26rem,calc(100vw-2rem))] bg-white border border-(--j-line) rounded-2xl shadow-lg z-50 overflow-hidden">
            {results.length > 0 ? list : nothing}
          </div>
        )
      )}
    </div>
  );
}
