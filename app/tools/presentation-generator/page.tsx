"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Plus, Monitor, LayoutGrid } from "lucide-react";

interface Slide {
  id: string;
  index: number;
}

interface Presentation {
  id: string;
  title: string;
  n_slides: number;
  created_at: string;
  slides: Slide[];
}

const GRADIENTS = [
  "from-violet-400 to-purple-600",
  "from-blue-400 to-violet-500",
  "from-fuchsia-400 to-violet-500",
  "from-indigo-400 to-blue-500",
  "from-purple-400 to-pink-500",
  "from-violet-500 to-indigo-700",
];

function cardGradient(title: string) {
  const hash = [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PresentationGeneratorPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/presentations")
      .then((r) => r.json())
      .then((data) => setPresentations(Array.isArray(data) ? data : []))
      .catch(() => setPresentations([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = presentations.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Presentations</h1>
        </div>
        <Link
          href="/tools/presentation-generator/new"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Presentation
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search presentations..."
          className="w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#FAF9F5] rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-video bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
            <LayoutGrid className="w-7 h-7 text-violet-400" />
          </div>
          {search ? (
            <>
              <p className="text-base font-semibold text-gray-800">No results for "{search}"</p>
              <p className="text-sm text-gray-400 mt-1">Try a different search term.</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-800">No presentations yet</p>
              <p className="text-sm text-gray-400 mt-1">Create your first one to get started.</p>
              <Link
                href="/tools/presentation-generator/new"
                className="mt-5 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Presentation
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {!search && (
            <p className="text-sm text-gray-500 -mt-4">
              {presentations.length} presentation{presentations.length !== 1 ? "s" : ""}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/presentation/${p.id}`}
                className="group bg-[#FAF9F5] rounded-2xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className={`aspect-video bg-linear-to-br ${cardGradient(p.title)} flex items-center justify-center`}>
                  <Monitor className="w-8 h-8 text-white/60" />
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug group-hover:text-violet-700 transition-colors">
                    {p.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {p.n_slides} slides · {formatDate(p.created_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
