"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";

interface Props {
  onAdd: (dataUrl: string) => void;
}

// Icons shown when the search box is empty — a curated starter set.
const DEFAULT_ICONS: string[] = [
  "lucide:heart", "lucide:star", "lucide:check-circle", "lucide:x-circle",
  "lucide:lightbulb", "lucide:rocket", "lucide:zap", "lucide:flag",
  "lucide:book-open", "lucide:graduation-cap", "lucide:trophy", "lucide:target",
  "lucide:circle-arrow-right", "lucide:circle-arrow-down", "lucide:circle-check", "lucide:circle-help",
  "lucide:smile", "lucide:thumbs-up", "lucide:thumbs-down", "lucide:user",
  "lucide:users", "lucide:message-circle", "lucide:mail", "lucide:phone",
  "lucide:calendar", "lucide:clock", "lucide:map-pin", "lucide:globe",
  "lucide:settings", "lucide:bell", "lucide:home", "lucide:folder",
];

const ICON_COLOR = "%231a1a2e"; // url-encoded #1a1a2e

// Convert a string with possibly-non-ASCII chars (rare in icon SVGs but possible)
// into a base64 data URL safely.
function svgToDataUrl(svgText: string): string {
  const utf8 = unescape(encodeURIComponent(svgText));
  return `data:image/svg+xml;base64,${btoa(utf8)}`;
}

export default function GraphicsPanel({ onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>(DEFAULT_ICONS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(DEFAULT_ICONS);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const id = setTimeout(() => {
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=64`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data: { icons?: string[] }) => setResults(data.icons ?? []))
        .catch((err) => {
          if (err.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  const handleAdd = async (icon: string) => {
    try {
      const res = await fetch(`https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`);
      if (!res.ok) throw new Error("Fetch failed");
      const svgText = await res.text();
      onAdd(svgToDataUrl(svgText));
    } catch (err) {
      console.error("Failed to add icon", err);
    }
  };

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons..."
          className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {results.map((icon) => (
          <button
            key={icon}
            onClick={() => handleAdd(icon)}
            title={icon}
            className="aspect-square flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:border-violet-400 hover:bg-violet-50 transition-colors p-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.iconify.design/${icon}.svg?color=${ICON_COLOR}`}
              alt={icon}
              className="w-full h-full object-contain"
              loading="lazy"
              draggable={false}
            />
          </button>
        ))}
        {!loading && results.length === 0 && (
          <p className="col-span-4 text-xs text-gray-400 text-center py-6">No icons found</p>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-3">Powered by Iconify</p>
    </div>
  );
}
