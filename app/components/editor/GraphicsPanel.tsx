"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";

interface Props {
  onAdd: (dataUrl: string) => void;
}

// Result type covers both Iconify icons (rendered from Iconify URL) and Pixabay
// illustrations (raster previews + full image URL).
interface GraphicResult {
  id: string;
  thumb: string;          // displayed in the grid
  fetchUrl: string;       // fetched on click and converted to data URL
  kind: "icon" | "illustration";
  alt: string;
}

const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_KEY;
const ICON_COLOR = "%231a1a2e";
const PER_PAGE_ICON = 36;
const PER_PAGE_ILLUS = 12;

// Curated empty-state catalog — mix of color illustrations + line icons.
// All names verified against Iconify (fluent-emoji, flat-color-icons, lucide).
const DEFAULT_ICONS: string[] = [
  // Fluent emoji — color illustration style
  "fluent-emoji:rocket", "fluent-emoji:light-bulb", "fluent-emoji:trophy", "fluent-emoji:graduation-cap",
  "fluent-emoji:red-heart", "fluent-emoji:star", "fluent-emoji:sparkles", "fluent-emoji:fire",
  "fluent-emoji:party-popper", "fluent-emoji:bullseye", "fluent-emoji:books", "fluent-emoji:pencil",
  "fluent-emoji:thinking-face", "fluent-emoji:thumbs-up", "fluent-emoji:check-mark-button", "fluent-emoji:cross-mark",
  "fluent-emoji:warning", "fluent-emoji:sun", "fluent-emoji:rainbow", "fluent-emoji:school",
  "fluent-emoji:money-bag", "fluent-emoji:laptop", "fluent-emoji:bell", "fluent-emoji:globe-showing-americas",
  // Flat color icons
  "flat-color-icons:idea", "flat-color-icons:like", "flat-color-icons:bookmark", "flat-color-icons:calendar",
  "flat-color-icons:graduation-cap", "flat-color-icons:reading", "flat-color-icons:bar-chart", "flat-color-icons:line-chart",
  // Lucide line icons
  "lucide:heart", "lucide:star", "lucide:circle-check", "lucide:circle-x",
  "lucide:lightbulb", "lucide:rocket", "lucide:zap", "lucide:flag",
  "lucide:book-open", "lucide:graduation-cap", "lucide:trophy", "lucide:target",
  "lucide:user", "lucide:users", "lucide:message-circle", "lucide:mail",
  "lucide:calendar", "lucide:clock", "lucide:map-pin", "lucide:globe",
  "lucide:settings", "lucide:bell", "lucide:search", "lucide:download",
];

const DEFAULT_RESULTS: GraphicResult[] = DEFAULT_ICONS.map((icon) => ({
  id: `icon-${icon}`,
  thumb: `https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`,
  fetchUrl: `https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`,
  kind: "icon",
  alt: icon,
}));

function svgToDataUrl(svgText: string): string {
  const utf8 = unescape(encodeURIComponent(svgText));
  return `data:image/svg+xml;base64,${btoa(utf8)}`;
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Iconify returns SVG text — base64-encode as data URL ourselves so the
    // result is identical regardless of fetch path.
    if (blob.type.includes("svg")) {
      const text = await blob.text();
      return svgToDataUrl(text);
    }
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return window;
}

interface PixabayHit {
  id: number;
  previewURL: string;
  largeImageURL: string;
  tags: string;
}

async function searchIconify(query: string, start: number, signal: AbortSignal): Promise<GraphicResult[]> {
  const r = await fetch(
    `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${PER_PAGE_ICON}&start=${start}`,
    { signal },
  );
  const data: { icons?: string[] } = await r.json();
  return (data.icons ?? []).map((icon) => ({
    id: `icon-${icon}`,
    thumb: `https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`,
    fetchUrl: `https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`,
    kind: "icon",
    alt: icon,
  }));
}

async function searchPixabay(query: string, page: number, signal: AbortSignal): Promise<GraphicResult[]> {
  if (!PIXABAY_KEY) return [];
  const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=${PER_PAGE_ILLUS}&page=${page}&image_type=illustration&safesearch=true`;
  const r = await fetch(url, { signal });
  const data: { hits?: PixabayHit[] } = await r.json();
  return (data.hits ?? []).map((p) => ({
    id: `illus-${p.id}`,
    thumb: p.previewURL,
    fetchUrl: p.largeImageURL,
    kind: "illustration",
    alt: p.tags,
  }));
}

// Round-robin merge: icon, illustration, icon, illustration, ... so the grid feels mixed.
function interleave(iconList: GraphicResult[], illusList: GraphicResult[]): GraphicResult[] {
  const result: GraphicResult[] = [];
  const max = Math.max(iconList.length, illusList.length);
  for (let i = 0; i < max; i++) {
    if (illusList[i] !== undefined) result.push(illusList[i]);
    if (iconList[i] !== undefined) result.push(iconList[i]);
  }
  return result;
}

export default function GraphicsPanel({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphicResult[]>(DEFAULT_RESULTS);
  const [iconStart, setIconStart] = useState(0);
  const [illusPage, setIllusPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(DEFAULT_RESULTS);
      setIconStart(0);
      setIllusPage(1);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setIconStart(0);
    setIllusPage(1);
    setHasMore(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const [icons, illus] = await Promise.all([
          searchIconify(q, 0, controller.signal).catch(() => []),
          searchPixabay(q, 1, controller.signal).catch(() => []),
        ]);
        const merged = interleave(icons, illus);
        setResults(merged);
        if (icons.length < PER_PAGE_ICON && illus.length < PER_PAGE_ILLUS) setHasMore(false);
      } catch (err) {
        const e = err as { name?: string };
        if (e.name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !query.trim()) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const nextIconStart = iconStart + PER_PAGE_ICON;
    const nextIllusPage = illusPage + 1;
    try {
      const controller = new AbortController();
      const [icons, illus] = await Promise.all([
        searchIconify(query.trim(), nextIconStart, controller.signal).catch(() => []),
        searchPixabay(query.trim(), nextIllusPage, controller.signal).catch(() => []),
      ]);
      const merged = interleave(icons, illus);
      if (merged.length === 0) {
        setHasMore(false);
      } else {
        setResults((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...merged.filter((x) => !seen.has(x.id))];
        });
        setIconStart(nextIconStart);
        setIllusPage(nextIllusPage);
        if (icons.length < PER_PAGE_ICON && illus.length < PER_PAGE_ILLUS) setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [hasMore, iconStart, illusPage, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = findScrollParent(sentinel);
    const rootEl = root instanceof Window ? null : root;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { root: rootEl, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleAdd = async (item: GraphicResult) => {
    const dataUrl = await urlToDataUrl(item.fetchUrl);
    if (dataUrl) onAdd(dataUrl);
  };

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search graphics..."
          className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {results.map((item) => (
          <button
            key={item.id}
            onClick={() => handleAdd(item)}
            title={item.alt}
            className="aspect-square flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-violet-400 hover:bg-violet-50 transition-colors p-1.5 overflow-hidden"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-jooma-image", item.fetchUrl);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumb}
              alt={item.alt}
              className={item.kind === "icon" ? "w-full h-full object-contain" : "w-full h-full object-cover rounded"}
              loading="lazy"
              draggable={false}
            />
          </button>
        ))}
        {!loading && results.length === 0 && (
          <p className="col-span-2 text-xs text-gray-400 text-center py-6">No graphics found</p>
        )}
      </div>

      <div ref={sentinelRef} className="flex items-center justify-center py-3">
        {loadingMore && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        {!hasMore && query.trim() && results.length > 0 && (
          <span className="text-[10px] text-gray-400">No more results</span>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-1">Icons by Iconify · Illustrations by Pixabay</p>
    </div>
  );
}
