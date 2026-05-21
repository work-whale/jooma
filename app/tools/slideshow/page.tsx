"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Monitor, LayoutGrid, Trash2, Sparkles, Loader2 } from "lucide-react";
import { listPresentations, deletePresentation, createPresentation, type PresentationListItem, type SlideJSON } from "@/app/lib/presentations";
import MiniSlide from "@/app/components/editor/MiniSlide";
import GenerateModal from "@/app/components/slideshow/GenerateModal";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Resizes itself to fill the card's available width, then passes that to
// MiniSlide so the slide renders at the right scale. ResizeObserver keeps it
// in sync when the viewport changes columns.
function SlideThumbnail({ slide }: { slide: SlideJSON }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  // Width-only outer div. MiniSlide imposes its own 16:9 height based on the
  // measured width — relying on Tailwind's `aspect-video` here caused the
  // container to mis-size on first paint and the visible content to look
  // stretched until the ResizeObserver fired.
  return (
    <div ref={ref} className="w-full overflow-hidden bg-white" style={{ aspectRatio: "16 / 9" }}>
      {width > 0 && <MiniSlide slide={slide} width={width} />}
    </div>
  );
}

export default function SlideshowListPage() {
  const router = useRouter();
  const [presentations, setPresentations] = useState<PresentationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PresentationListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Track the create-and-redirect so the button stays in a busy state and the
  // user can't double-click. Once the row exists we push directly to
  // /editor/[id], skipping /editor/new entirely — the next thing the user
  // sees is the editor's own loading.tsx, not a second transit skeleton.
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const p = await createPresentation();
      router.push(`/editor/${p.id}`);
    } catch (err) {
      console.error("Failed to create presentation:", err);
      setError("Could not create a new slideshow. Please try again.");
      setCreating(false);
    }
  };

  useEffect(() => {
    listPresentations()
      .then((data) => {
        // Diagnostic: confirm first_slide is making it through to the client.
        console.log("[slideshow list] first row:", data[0]);
        console.log("[slideshow list] first_slide keys:", data[0]?.first_slide ? Object.keys(data[0].first_slide) : "(null/undefined)");
        setPresentations(data);
      })
      .catch((err) => {
        console.error("Failed to load presentations:", {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          name: err?.name,
        });
        setError(
          err?.message
            ? `Could not load presentations: ${err.message}`
            : "Could not load presentations. Check Supabase env vars.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = presentations.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );

  const requestDelete = (presentation: PresentationListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDelete(presentation);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePresentation(pendingDelete.id);
      setPresentations((prev) => prev.filter((p) => p.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string; details?: string; hint?: string; name?: string };
      console.error("Failed to delete presentation:", {
        message: e?.message, code: e?.code, details: e?.details, hint: e?.hint, name: e?.name,
      });
      setError(e?.message ? `Failed to delete: ${e.message}` : "Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!pendingDelete) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) setPendingDelete(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingDelete, deleting]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#FFCC33" }}
          >
            <Monitor className="w-5 h-5" style={{ color: "#1a1a1a" }} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Slideshows</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGenerateOpen(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
          >
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-70 disabled:cursor-wait"
            style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {creating ? "Creating…" : "New Slideshow"}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search slideshows..."
          className="w-full rounded-xl pl-11 pr-4 py-3 text-sm bg-white border focus:outline-none transition-all"
          style={{ borderColor: "#DAD8D0" }}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <>
          {/* Mirror the loaded layout exactly: same "N slideshows" line
              position (just a shimmer bar) above the same grid, so when the
              real data arrives only the cards swap — header, search bar,
              and count slot all stay put with zero layout shift. */}
          <div className="-mt-4 h-5 w-32 bg-gray-200 rounded animate-pulse" />
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
        </>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "#F1EFE3" }}
          >
            <LayoutGrid className="w-7 h-7" style={{ color: "#1a1a1a" }} />
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
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="mt-5 flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-70 disabled:cursor-wait"
                style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? "Creating…" : "New Slideshow"}
              </button>
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
            {filtered.map((p) => (
              <div
                key={p.id}
                className="group bg-[#FAF9F5] rounded-2xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer relative"
              >
                <Link
                  href={`/editor/${p.id}`}
                  aria-label={p.title || "Open slideshow"}
                  className="absolute inset-0 z-0 rounded-2xl"
                />
                <div className="relative z-10 pointer-events-none">
                  {p.first_slide ? (
                    <SlideThumbnail slide={p.first_slide} />
                  ) : (
                    <div
                      className="aspect-video flex items-center justify-center"
                      style={{ backgroundColor: "#F1EFE3" }}
                    >
                      <Monitor className="w-8 h-8" style={{ color: "#1a1a1a", opacity: 0.4 }} />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">
                      {p.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {p.slide_count} slide{p.slide_count !== 1 ? "s" : ""} · {formatDate(p.updated_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => requestDelete(p, e)}
                  className="absolute top-2 right-2 z-20 w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!deleting) setPendingDelete(null); }}
          />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            style={{ borderColor: "#DAD8D0" }}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="delete-modal-title" className="text-base font-semibold text-gray-900">
                  Delete this slideshow?
                </h2>
                <p className="text-sm text-gray-600 mt-1 wrap-break-word">
                  &ldquo;{pendingDelete.title || "Untitled Slideshow"}&rdquo; will be permanently removed. This can&rsquo;t be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {generateOpen && <GenerateModal onClose={() => setGenerateOpen(false)} />}
    </div>
  );
}
