"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Plus, Monitor, LayoutGrid, Trash2 } from "lucide-react";
import { listPresentations, deletePresentation, type Presentation, type SlideJSON } from "@/app/lib/presentations";
import MiniSlide from "@/app/components/editor/MiniSlide";

function SlideThumbnail({ slide }: { slide: SlideJSON }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full aspect-video overflow-hidden bg-white">
      {width > 0 && <MiniSlide slide={slide} width={width} />}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SlideshowListPage() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPresentations()
      .then((data) => setPresentations(data))
      .catch((err) => {
        console.error(err);
        setError("Could not load presentations. Check Supabase env vars.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = presentations.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this slideshow?")) return;
    try {
      await deletePresentation(id);
      setPresentations((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <Monitor className="w-5 h-5 text-violet-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Slideshows</h1>
        </div>
        <Link
          href="/editor/new"
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Slideshow
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search slideshows..."
          className="w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
      )}

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
              <p className="text-base font-semibold text-gray-800">No results for &ldquo;{search}&rdquo;</p>
              <p className="text-sm text-gray-400 mt-1">Try a different search term.</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-800">No slideshows yet</p>
              <p className="text-sm text-gray-400 mt-1">Create your first one to get started.</p>
              <Link
                href="/editor/new"
                className="mt-5 flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Slideshow
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {!search && (
            <p className="text-sm text-gray-500 -mt-4">
              {presentations.length} slideshow{presentations.length !== 1 ? "s" : ""}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((p) => {
              const firstSlide = p.slides?.[0];
              return (
                <Link
                  key={p.id}
                  href={`/editor/${p.id}`}
                  className="group bg-[#FAF9F5] rounded-2xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer relative"
                >
                  {firstSlide ? (
                    <SlideThumbnail slide={firstSlide} />
                  ) : (
                    <div className="aspect-video bg-linear-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                      <Monitor className="w-8 h-8 text-white/60" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug group-hover:text-violet-700 transition-colors">
                      {p.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {p.slides.length} slide{p.slides.length !== 1 ? "s" : ""} · {formatDate(p.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
