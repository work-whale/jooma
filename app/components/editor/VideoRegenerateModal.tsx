"use client";

// Right-side "Edit video" panel.
//
// Two ways to swap the slide's video, stacked top-to-bottom:
//   1. Paste a YouTube URL — instant replace.
//   2. Search with AI — refine topic / details / length, pick from up to
//      5 candidates returned by /api/find-youtube.
//
// Form layout mirrors the Audio Activity sidebar — label-on-top fields,
// pill choices, single primary CTA per section. Mounted as a flex sibling
// beside the slide canvas; renders nothing when `open` is false.

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X, ExternalLink, Link2 } from "lucide-react";
import { parseYouTubeId } from "./youtube";

export type VideoLength = "short" | "medium" | "long" | "any";

const LENGTH_OPTIONS: { id: VideoLength; label: string }[] = [
  { id: "short",  label: "Under 5 mins" },
  { id: "medium", label: "5 – 20 mins" },
  { id: "long",   label: "20+ mins" },
  { id: "any",    label: "Any length" },
];

export interface VideoCandidate {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Deck / slide context to send to /api/find-youtube alongside the form. */
  context: {
    deckTitle: string;
    slideTitles: string[];
  };
  defaults?: {
    topic?: string;
    length?: VideoLength;
  };
  /** Apply a YouTube video id directly (used by the URL paste section). */
  onApplyVideoId: (videoId: string) => void;
  /** Apply a candidate from the AI search (used by the results list). */
  onApply: (video: VideoCandidate) => void;
}

export default function VideoEditPanel({ open, onClose, context, defaults, onApplyVideoId, onApply }: Props) {
  // URL paste flow
  const [url, setUrl] = useState("");
  const [urlErr, setUrlErr] = useState<string | null>(null);
  // AI search flow
  const [topic, setTopic] = useState(defaults?.topic ?? "");
  const [details, setDetails] = useState("");
  const [length, setLength] = useState<VideoLength>(defaults?.length ?? "medium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<VideoCandidate[] | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset state + focus the first field whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    setUrl("");
    setUrlErr(null);
    setTopic(defaults?.topic ?? "");
    setDetails("");
    setLength(defaults?.length ?? "medium");
    setBusy(false);
    setErr(null);
    setCandidates(null);
    queueMicrotask(() => firstFieldRef.current?.focus());
  }, [open, defaults?.topic, defaults?.length]);

  if (!open) return null;

  const handleApplyUrl = () => {
    const id = parseYouTubeId(url);
    if (!id) {
      setUrlErr("Couldn't read a YouTube video id from that URL");
      return;
    }
    onApplyVideoId(id);
    onClose();
  };

  const handleSearch = async () => {
    const effectiveTopic = topic.trim() || context.deckTitle.trim() || "Lesson";
    setBusy(true);
    setErr(null);
    setCandidates(null);
    try {
      const r = await fetch("/api/find-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: effectiveTopic,
          deckTitle: context.deckTitle,
          slideTitles: context.slideTitles,
          length,
          extraInstructions: details.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || e.message || "Couldn't find a video");
      }
      const data: { candidates?: VideoCandidate[] } = await r.json();
      const list = data.candidates ?? [];
      if (list.length === 0) {
        setErr("YouTube returned no matches for that search. Try different details or length.");
      } else {
        setCandidates(list);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Search failed";
      setErr(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="shrink-0 w-100 h-full border-l flex flex-col bg-white"
      style={{ borderColor: "#DAD8D0" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between px-4 pt-4 pb-3 border-b shrink-0"
        style={{ borderColor: "#EDEBE2" }}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Edit video</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Paste a URL or search with AI.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="w-7 h-7 -mt-1 -mr-1 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {/* ── Option 1: paste a YouTube URL ────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <Link2 className="w-3 h-3" />
            Paste a YouTube URL
          </h3>
          <input
            ref={firstFieldRef}
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setUrlErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyUrl(); } }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
            style={{ borderColor: "#DAD8D0" }}
          />
          {urlErr && <p className="text-[10px] text-red-600">{urlErr}</p>}
          <button
            type="button"
            onClick={handleApplyUrl}
            disabled={!url.trim()}
            className="w-full px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
          >
            Replace video
          </button>
        </section>

        <div className="relative flex items-center">
          <div className="flex-1 h-px" style={{ backgroundColor: "#EDEBE2" }} />
          <span className="px-2 text-[10px] uppercase tracking-wide text-gray-400">or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: "#EDEBE2" }} />
        </div>

        {/* ── Option 2: search with AI ─────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Search with AI
          </h3>

          <label className="block">
            <span className="text-[11px] font-semibold text-gray-700">Topic</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={context.deckTitle || "E.g. the water cycle"}
              disabled={busy}
              className="mt-1 w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
              style={{ borderColor: "#DAD8D0" }}
            />
            <span className="text-[10px] text-gray-400 mt-1 block">
              Defaults to the deck title if left blank.
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-gray-700">
              Details <span className="text-gray-400 font-normal">(optional)</span>
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="E.g. focus on real-world examples, include an interview, avoid cartoons…"
              rows={3}
              disabled={busy}
              className="mt-1 w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
              style={{ borderColor: "#DAD8D0" }}
            />
          </label>

          <div>
            <span className="text-[11px] font-semibold text-gray-700 block mb-1">Video length</span>
            <div className="flex flex-wrap gap-1">
              {LENGTH_OPTIONS.map((o) => {
                const selected = length === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setLength(o.id)}
                    disabled={busy}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors disabled:opacity-60"
                    style={
                      selected
                        ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                        : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#7c3aed", color: "#fff" }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "Searching…" : candidates ? "Search again" : "Find videos"}
          </button>

          {err && (
            <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </p>
          )}

          {candidates && candidates.length > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "#EDEBE2" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Results — click one to use it
              </p>
              <div className="space-y-2">
                {candidates.map((c) => (
                  <CandidateRow key={c.videoId} candidate={c} onPick={() => { onApply(c); onClose(); }} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

function CandidateRow({ candidate, onPick }: { candidate: VideoCandidate; onPick: () => void }) {
  return (
    <div
      className="flex gap-2 p-2 rounded-xl border bg-white hover:bg-gray-50 cursor-pointer transition-colors"
      style={{ borderColor: "#DAD8D0" }}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
    >
      <div
        className="w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-gray-200"
        style={{
          backgroundImage: candidate.thumbnail ? `url(${candidate.thumbnail})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-800 line-clamp-2 leading-snug">{candidate.title}</p>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{candidate.channel}</p>
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${candidate.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="self-start mt-1 text-gray-400 hover:text-gray-700 shrink-0"
        title="Open on YouTube"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
