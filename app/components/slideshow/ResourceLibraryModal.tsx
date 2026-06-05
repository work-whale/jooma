"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, Loader2, Folder, FileText, Presentation } from "lucide-react";
import { listRecentRuns, type ToolRun } from "@/app/lib/toolRuns";
import { listPresentations, getPresentation, type PresentationListItem } from "@/app/lib/presentations";
import { TOOLS } from "@/app/lib/tools";

const SLIDESHOW_SLUG = "__slideshows__";

interface FolderItem {
  slug: string;
  label: string;
  count: number;
}

const prettySlug = (s: string) =>
  s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const toolLabel = (slug: string) =>
  TOOLS.find((t) => t.href.split("/").pop() === slug)?.label ?? prettySlug(slug);

/** Picks the text of an existing slideshow for use as lesson material. */
async function deckToText(id: string): Promise<string> {
  const p = await getPresentation(id);
  return (p?.slides ?? [])
    .flatMap((s) => (s.texts ?? []).map((t) => t.text))
    .filter((t) => t && t.trim())
    .join("\n");
}

export default function ResourceLibraryModal({
  onSelect,
  onClose,
}: {
  onSelect: (text: string, source: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [decks, setDecks] = useState<PresentationListItem[]>([]);
  const [folder, setFolder] = useState<FolderItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, d] = await Promise.all([listRecentRuns(300), listPresentations()]);
        if (cancelled) return;
        setRuns(r);
        setDecks(d);
      } catch {
        if (!cancelled) setError("Couldn't load your library");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Folders: one per tool that has runs, plus a Slideshows folder.
  const folders = useMemo<FolderItem[]>(() => {
    const out: FolderItem[] = [];
    if (decks.length) out.push({ slug: SLIDESHOW_SLUG, label: "Slideshows", count: decks.length });
    const counts = new Map<string, number>();
    for (const run of runs) counts.set(run.tool_slug, (counts.get(run.tool_slug) ?? 0) + 1);
    for (const [slug, count] of counts) out.push({ slug, label: toolLabel(slug), count });
    return out;
  }, [runs, decks]);

  const folderRuns = useMemo(
    () => (folder && folder.slug !== SLIDESHOW_SLUG ? runs.filter((r) => r.tool_slug === folder.slug) : []),
    [folder, runs],
  );

  const pickRun = (run: ToolRun) => {
    if (!run.output?.trim()) return;
    onSelect(run.output, run.title || folder?.label || "Tool output");
    onClose();
  };

  const pickDeck = async (d: PresentationListItem) => {
    setBusyId(d.id);
    try {
      const text = await deckToText(d.id);
      if (!text.trim()) { setError("That deck has no text to use"); return; }
      onSelect(text, d.title || "Untitled deck");
      onClose();
    } catch {
      setError("Couldn't read that deck");
    } finally {
      setBusyId(null);
    }
  };

  return (
      <div
        className="panel-slide-in relative shrink-0 w-80 max-w-[80vw] bg-white rounded-2xl flex flex-col shadow-2xl border overflow-hidden"
        style={{ maxHeight: "90vh", borderColor: "#DAD8D0" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "#DAD8D0" }}>
          {folder && (
            <button
              type="button"
              onClick={() => { setFolder(null); setError(null); }}
              className="w-7 h-7 -ml-1 rounded-lg flex items-center justify-center hover:bg-gray-100"
              aria-label="Back to folders"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate" style={{ color: "#1a1a1a" }}>
              {folder ? folder.label : "Use an existing resource"}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {folder ? "Pick an output to use as lesson material" : "Choose a folder from your tool outputs"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your library…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : !folder ? (
            // ── Folders ──────────────────────────────────────────────────
            folders.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">
                Nothing here yet — generate something with a tool first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {folders.map((f) => (
                  <button
                    key={f.slug}
                    type="button"
                    onClick={() => setFolder(f)}
                    className="flex items-center gap-3 p-3 rounded-xl border text-left hover:bg-gray-50 transition-colors"
                    style={{ borderColor: "#DAD8D0" }}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#F4F2EA" }}>
                      {f.slug === SLIDESHOW_SLUG
                        ? <Presentation className="w-4.5 h-4.5" style={{ color: "#c25034" }} />
                        : <Folder className="w-4.5 h-4.5" style={{ color: "#c25034" }} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#1a1a1a" }}>{f.label}</p>
                      <p className="text-[11px] text-gray-400">{f.count} item{f.count === 1 ? "" : "s"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : folder.slug === SLIDESHOW_SLUG ? (
            // ── Slideshow outputs ────────────────────────────────────────
            <div className="space-y-1.5">
              {decks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickDeck(d)}
                  disabled={busyId !== null}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                  style={{ borderColor: "#EFEEE9" }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate">{d.title || "Untitled deck"}</span>
                  </span>
                  {busyId === d.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />
                    : <span className="text-[11px] text-gray-400 shrink-0">{d.slide_count} slide{d.slide_count === 1 ? "" : "s"}</span>}
                </button>
              ))}
            </div>
          ) : (
            // ── Tool run outputs ─────────────────────────────────────────
            <div className="space-y-1.5">
              {folderRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => pickRun(run)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left hover:bg-gray-50 transition-colors"
                  style={{ borderColor: "#EFEEE9" }}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate">{run.title || "Untitled"}</span>
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
