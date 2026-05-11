"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search } from "lucide-react";

const FONTS = [
  "Inter, sans-serif",
  "Arial",
  "Helvetica, sans-serif",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Comic Sans MS",
  "Impact",
  "Bricolage Grotesque, sans-serif",
  "Lucida Console",
  "Palatino",
  "Garamond",
];

interface Props {
  current: string;
  onSelect: (font: string) => void;
  onClose: () => void;
}

export default function FontPanel({ current, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside closes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Defer to next tick so the click that opened the panel doesn't immediately close it.
    const t = setTimeout(() => window.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const filtered = FONTS.filter((f) => !q || f.toLowerCase().includes(q));

  return (
    <div
      ref={panelRef}
      className="absolute top-0 bottom-0 left-0 w-72 bg-white shadow-xl border-r flex flex-col z-30"
      style={{ borderColor: "#DAD8D0" }}
    >
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#DAD8D0" }}>
        <h2 className="text-sm font-semibold text-gray-800">Fonts</h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100" title="Close">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
      <div className="p-3 border-b" style={{ borderColor: "#DAD8D0" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No fonts found.</p>
        ) : (
          filtered.map((f) => (
            <button
              key={f}
              onClick={() => { onSelect(f); onClose(); }}
              className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                current === f
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-800 hover:bg-gray-50"
              }`}
              style={{ fontFamily: f, fontSize: 18 }}
            >
              {f.split(",")[0].replace(/['"]/g, "")}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
