"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";

const STYLES: { id: "photographic" | "illustration" | "storybook" | "painted" | "line-drawing" | "comic-book"; label: string }[] = [
  { id: "photographic", label: "Photo" },
  { id: "illustration", label: "Illustration" },
  { id: "storybook", label: "Storybook" },
  { id: "painted", label: "Painted" },
  { id: "line-drawing", label: "Line" },
  { id: "comic-book", label: "Comic" },
];

interface Props {
  initialPrompt?: string;
  /** Width/height of the image being regenerated. Passed through to the API
   *  so the AI picks square / landscape / portrait to match the slide frame
   *  the new image is replacing. */
  frameWidth?: number;
  frameHeight?: number;
  onClose: () => void;
  onGenerated: (result: { dataUrl: string; prompt: string; style: string }) => void;
}

export default function RegenerateImageDialog({ initialPrompt = "", frameWidth, frameHeight, onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [style, setStyle] = useState<typeof STYLES[number]["id"]>("photographic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  const handleGenerate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), style, frameWidth, frameHeight }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }
      const data: { dataUrl: string } = await r.json();
      onGenerated({ dataUrl: data.dataUrl, prompt: prompt.trim(), style });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose(); }}
      />
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden flex flex-col"
        style={{ borderColor: "#DAD8D0", backgroundColor: "#FAF9F5" }}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "#DAD8D0" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#FFCC33" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "#1a1a1a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Regenerate image</h2>
            <p className="text-xs text-gray-500">Describe the new image and we&apos;ll replace this one.</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="A close-up photo of saturn with its rings"
            rows={3}
            disabled={busy}
            autoFocus
            className="w-full px-3 py-2 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
            style={{ borderColor: "#DAD8D0" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => {
              const selected = style === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  disabled={busy}
                  className="px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors"
                  style={
                    selected
                      ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                      : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: "#DAD8D0" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !prompt.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2 min-w-32 justify-center"
            style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
