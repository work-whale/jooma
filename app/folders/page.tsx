"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Folder, MoreVertical, ChevronDown, ArrowUpDown, LayoutGrid, List as ListIcon,
  Search, Pin, Check,
} from "lucide-react";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";
import { listRecentRuns, type ToolRun } from "@/app/lib/toolRuns";
import { toolForSlug, typeLabel, formatDate, TAG_COLORS } from "@/app/lib/toolRunDisplay";

const PIN_STORAGE_KEY = "jooma:pinned-tools";
const DATE_RANGES = ["Any time", "Last 7 days", "Last 30 days", "This year"] as const;
const COUNT_BUCKETS = ["Any", "1–5", "6–10", "11+"] as const;
const SORTS = [
  { key: "recent", label: "Recently updated" },
  { key: "name", label: "Name (A–Z)" },
  { key: "count", label: "Most resources" },
] as const;

interface FolderData {
  slug: string;
  label: string;
  tag: string;
  count: number;
  subjects: string[];
  years: string[];
  latest: number;
}

const DAY = 86_400_000;

function inDateRange(ts: number, range: string) {
  if (range === "Last 7 days") return ts >= Date.now() - 7 * DAY;
  if (range === "Last 30 days") return ts >= Date.now() - 30 * DAY;
  if (range === "This year") return new Date(ts).getFullYear() === new Date().getFullYear();
  return true;
}

function inCountBucket(c: number, b: string) {
  if (b === "1–5") return c >= 1 && c <= 5;
  if (b === "6–10") return c >= 6 && c <= 10;
  if (b === "11+") return c >= 11;
  return true;
}

export default function FoldersPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedHrefs, setPinnedHrefs] = useState<string[]>([]);

  // Filters
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [toolName, setToolName] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>("Any time");
  const [countBucket, setCountBucket] = useState<string>("Any");
  const [sort, setSort] = useState<string>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    listRecentRuns(1000).then(setRuns).catch(() => setRuns([])).finally(() => setLoading(false));
    try {
      const stored = localStorage.getItem(PIN_STORAGE_KEY);
      setPinnedHrefs(stored ? JSON.parse(stored) : []);
    } catch {
      setPinnedHrefs([]);
    }
  }, []);

  const togglePin = (slug: string) => {
    const href = `/tools/${slug}`;
    setPinnedHrefs((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      try { localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Build one folder per tool that has at least one saved run.
  const folders = useMemo<FolderData[]>(() => {
    const map = new Map<string, FolderData>();
    for (const r of runs) {
      const tool = toolForSlug(r.tool_slug);
      const input = r.input as Record<string, unknown>;
      const f = map.get(r.tool_slug) ?? {
        slug: r.tool_slug,
        label: tool?.label ?? typeLabel(r.tool_slug),
        tag: tool?.tag ?? "",
        count: 0,
        subjects: [],
        years: [],
        latest: 0,
      };
      f.count++;
      const subj = input.subject as string | undefined;
      const yr = input.yearGroup as string | undefined;
      if (subj && !f.subjects.includes(subj)) f.subjects.push(subj);
      if (yr && !f.years.includes(yr)) f.years.push(yr);
      f.latest = Math.max(f.latest, new Date(r.created_at).getTime());
      map.set(r.tool_slug, f);
    }
    return [...map.values()];
  }, [runs]);

  // Filter option lists, derived from the data.
  const options = useMemo(() => {
    const subjects = new Set<string>();
    const years = new Set<string>();
    for (const r of runs) {
      const input = r.input as Record<string, unknown>;
      if (input.subject) subjects.add(input.subject as string);
      if (input.yearGroup) years.add(input.yearGroup as string);
    }
    return {
      types: [...new Set(folders.map((f) => f.tag).filter(Boolean))].sort(),
      toolNames: folders.map((f) => f.label).sort(),
      subjects: [...subjects].sort(),
      years: [...years].sort(),
    };
  }, [runs, folders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = folders.filter((f) =>
      (!q || f.label.toLowerCase().includes(q)) &&
      (!type || f.tag === type) &&
      (!toolName || f.label === toolName) &&
      (!subject || f.subjects.includes(subject)) &&
      (!year || f.years.includes(year)) &&
      inDateRange(f.latest, dateRange) &&
      inCountBucket(f.count, countBucket)
    );
    out.sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      if (sort === "count") return b.count - a.count;
      return b.latest - a.latest;
    });
    return out;
  }, [folders, query, type, toolName, subject, year, dateRange, countBucket, sort]);

  const pinned = filtered.filter((f) => pinnedHrefs.includes(`/tools/${f.slug}`));
  const rest = filtered.filter((f) => !pinnedHrefs.includes(`/tools/${f.slug}`));

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F1EFE3" }}>
      <SideNav />
      <main className="grow flex flex-col overflow-y-auto">
        <TopBar title="Folders" />

        <div className="px-10 pb-16 space-y-4">
          {/* Search + action */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a tool"
                className="w-full pl-11 pr-4 py-3 border border-line rounded-2xl bg-[#FAF9F5] text-sm font-light placeholder-[#A5A5A5] focus:outline-none focus:border-dark transition-colors"
              />
            </div>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#030303] text-white text-sm font-medium hover:bg-black transition-colors cursor-pointer shrink-0"
            >
              Browse tools
            </button>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown label="Type" value={type} options={options.types} onChange={setType} />
            <FilterDropdown label="Subject" value={subject} options={options.subjects} onChange={setSubject} />
            <FilterDropdown label="Tool name" value={toolName} options={options.toolNames} onChange={setToolName} />
            <FilterDropdown label="Year" value={year} options={options.years} onChange={setYear} />
            <FilterDropdown label="Date created" value={dateRange === "Any time" ? null : dateRange}
              options={[...DATE_RANGES]} onChange={(v) => setDateRange(v ?? "Any time")} allLabel="Any time" />
            <FilterDropdown label="Number of resources" value={countBucket === "Any" ? null : countBucket}
              options={[...COUNT_BUCKETS]} onChange={(v) => setCountBucket(v ?? "Any")} allLabel="Any" />

            <SortMenu value={sort} onChange={setSort} />

            <div className="ml-auto flex items-center gap-1 border border-line rounded-xl p-1 bg-[#FAF9F5]">
              <button onClick={() => setView("grid")} aria-label="Grid view"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${view === "grid" ? "bg-[#1a1a1a] text-white" : "text-muted hover:bg-gray-100"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView("list")} aria-label="List view"
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${view === "list" ? "bg-[#1a1a1a] text-white" : "text-muted hover:bg-gray-100"}`}>
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted py-16 text-center">Loading…</p>
          ) : folders.length === 0 ? (
            <p className="text-sm text-muted py-16 text-center">
              No folders yet — generate something with a tool and it&apos;ll be filed here automatically.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted py-16 text-center">No folders match your filters.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <Section title="Pinned" folders={pinned} view={view} pinnedHrefs={pinnedHrefs} onTogglePin={togglePin} onOpen={(s) => router.push(`/folders/${s}`)} />
              )}
              <Section title="All folders" folders={rest} view={view} pinnedHrefs={pinnedHrefs} onTogglePin={togglePin} onOpen={(s) => router.push(`/folders/${s}`)} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({
  title, folders, view, pinnedHrefs, onTogglePin, onOpen,
}: {
  title: string; folders: FolderData[]; view: "grid" | "list";
  pinnedHrefs: string[]; onTogglePin: (slug: string) => void; onOpen: (slug: string) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <section>
      <div className="flex items-center gap-4 mb-4 mt-2">
        <h4 className="text-sm text-muted shrink-0">{title}</h4>
        <div className="h-px bg-muted/30 w-full" />
      </div>
      {view === "grid" ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {folders.map((f) => (
            <FolderCard key={f.slug} folder={f} pinned={pinnedHrefs.includes(`/tools/${f.slug}`)} onTogglePin={onTogglePin} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line overflow-hidden bg-[#FAF9F5]">
          {folders.map((f) => (
            <FolderRow key={f.slug} folder={f} pinned={pinnedHrefs.includes(`/tools/${f.slug}`)} onTogglePin={onTogglePin} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function FolderCard({
  folder, pinned, onTogglePin, onOpen,
}: {
  folder: FolderData; pinned: boolean; onTogglePin: (slug: string) => void; onOpen: (slug: string) => void;
}) {
  const colors = TAG_COLORS[folder.tag] ?? { bg: "bg-gray-100", icon: "text-gray-600" };
  return (
    <div
      onClick={() => onOpen(folder.slug)}
      className="group relative rounded-2xl border border-line bg-[#FAF9F5] p-5 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <FolderMenu pinned={pinned} onTogglePin={() => onTogglePin(folder.slug)} onOpen={() => onOpen(folder.slug)} />
      <span className={`w-11 h-11 rounded-xl ${colors.bg} flex items-center justify-center mb-4`}>
        <Folder className={`w-5 h-5 ${colors.icon}`} />
      </span>
      <h5 className="font-semibold text-dark truncate pr-6">{folder.label}</h5>
      <p className="text-sm text-muted mt-0.5">{folder.count} {folder.count === 1 ? "item" : "items"}</p>
    </div>
  );
}

function FolderRow({
  folder, pinned, onTogglePin, onOpen,
}: {
  folder: FolderData; pinned: boolean; onTogglePin: (slug: string) => void; onOpen: (slug: string) => void;
}) {
  const colors = TAG_COLORS[folder.tag] ?? { bg: "bg-gray-100", icon: "text-gray-600" };
  return (
    <div
      onClick={() => onOpen(folder.slug)}
      className="group flex items-center gap-4 px-5 py-3 border-b border-line/60 last:border-0 hover:bg-[#F1EFE3] transition-colors cursor-pointer"
    >
      <span className={`w-9 h-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
        <Folder className={`w-4 h-4 ${colors.icon}`} />
      </span>
      <span className="font-medium text-dark flex-1 truncate">{folder.label}</span>
      <span className="text-sm text-muted w-28 shrink-0">{folder.count} items</span>
      <span className="text-sm text-muted w-44 shrink-0 whitespace-nowrap">{formatDate(new Date(folder.latest).toISOString())}</span>
      <FolderMenu pinned={pinned} onTogglePin={() => onTogglePin(folder.slug)} onOpen={() => onOpen(folder.slug)} inline />
    </div>
  );
}

function FolderMenu({
  pinned, onTogglePin, onOpen, inline,
}: {
  pinned: boolean; onTogglePin: () => void; onOpen: () => void; inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className={inline ? "relative shrink-0" : "absolute top-4 right-4"}>
      <button
        aria-label="Folder menu"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:bg-white transition-colors cursor-pointer"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onOpen(); }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            Open
          </button>
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onTogglePin(); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            <Pin className={`w-3.5 h-3.5 ${pinned ? "fill-current text-violet-600" : ""}`} />
            {pinned ? "Unpin" : "Pin"}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  label, value, options, onChange, allLabel = "All",
}: {
  label: string; value: string | null; options: string[]; onChange: (v: string | null) => void; allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = value !== null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors cursor-pointer ${
          active ? "border-dark bg-[#1a1a1a] text-white" : "border-line bg-[#FAF9F5] text-gray-700 hover:border-dark"
        }`}
      >
        {value ?? label}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          <button onClick={() => { onChange(null); setOpen(false); }}
            className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            {allLabel}
            {!active && <Check className="w-3.5 h-3.5" />}
          </button>
          {options.length === 0 ? (
            <p className="px-4 py-2 text-xs text-muted">No options</p>
          ) : options.map((opt) => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              <span className="truncate">{opt}</span>
              {value === opt && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortMenu({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="Sort"
        className="w-9 h-9 flex items-center justify-center rounded-xl border border-line bg-[#FAF9F5] text-gray-700 hover:border-dark transition-colors cursor-pointer">
        <ArrowUpDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
          {SORTS.map((s) => (
            <button key={s.key} onClick={() => { onChange(s.key); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              {s.label}
              {value === s.key && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
