"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Lock, Search, Sparkles, Upload, X } from "lucide-react";
import PicturesPanel from "@/app/components/editor/PicturesPanel";
import { listGeneratedImages, saveGeneratedImage, type GeneratedImage } from "@/app/lib/generatedImages";
import { PICTURE_STYLES } from "@/app/lib/sheets/picture-options";
import type { ImageStyle } from "@/app/lib/ai-image-prompt";
import type { FoundPicture } from "@/app/lib/sheets/picture-fill";
import type { ImageBlock } from "@/app/lib/sheets/types";

/*
 * Choosing the picture for one picture block on a sheet: a stock photo, an AI
 * picture (made, or picked from the teacher's AI gallery), or an upload. The
 * same three ways a slide's picture can be changed, in one small dialog.
 *
 * Everything chosen is stored in the public images bucket before it reaches
 * the sheet, so the run never holds base64. A guest can search but has no
 * session to store with; their sheet lives on the page only, so the photo stays
 * a data URL there. AI and Upload are locked for a guest: the tabs are shown,
 * with a lock, so they can see what a subscription adds, and choosing one asks
 * them to sign up instead.
 */

export type PictureTab = "search" | "ai" | "upload";

const TABS: { id: PictureTab; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "ai", label: "AI picture", icon: Sparkles },
  { id: "upload", label: "Upload", icon: Upload },
];

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

async function store(dataUrl: string, hint: string): Promise<string> {
  const res = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, filenameHint: hint }),
  });
  const data = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
  if (!res.ok || !data.src) throw new Error(data.error || "Couldn't save that picture. Please try again.");
  return data.src;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

export default function SheetPictureDialog({
  block,
  locked = [],
  onLocked,
  onPick,
  onClose,
}: {
  block: ImageBlock;
  /** Tabs shown with a lock: choosing one calls onLocked instead. */
  locked?: PictureTab[];
  onLocked?: () => void;
  onPick: (picture: FoundPicture & { query?: string; alt?: string }) => void;
  onClose: () => void;
}) {
  const guest = locked.length > 0;
  const [tab, setTab] = useState<PictureTab>("search");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const choose = async (dataUrlOrSrc: string, source: FoundPicture["source"], extra: { query?: string; alt?: string } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const src = dataUrlOrSrc.startsWith("data:") && !guest ? await store(dataUrlOrSrc, "sheet") : dataUrlOrSrc;
      const { width, height } = await measure(src);
      onPick({ src, width, height, source, ...extra });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that picture. Please try again.");
      setBusy(false);
    }
  };

  const pickTab = (id: PictureTab) => {
    if (locked.includes(id)) {
      onLocked?.();
      return;
    }
    setError(null);
    setTab(id);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sheet-picture-title" data-testid="sheet-picture-dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-lg max-h-[min(40rem,calc(100dvh-2rem))] flex flex-col rounded-2xl border border-(--j-line) bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-(--j-line)">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-(--j-tint) text-(--j-deep)">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="sheet-picture-title" className="text-sm font-semibold text-gray-900">{block.src ? "Change picture" : "Choose a picture"}</h2>
            <p className="text-xs text-gray-500 truncate">{block.alt || "Pick a photo, make one, or upload your own."}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3" role="tablist" aria-label="Where the picture comes from">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isLocked = locked.includes(id);
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pickTab(id)}
                disabled={busy}
                data-locked={isLocked ? "true" : undefined}
                title={isLocked ? "Comes with a subscription" : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  on ? "bg-(--j-purple) border-(--j-purple) text-white" : "bg-white border-(--j-line) text-gray-700 hover:border-(--j-lilac)"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {isLocked && <Lock className="w-3 h-3" aria-label="Locked" />}
              </button>
            );
          })}
        </div>
        {guest && (
          <p className="px-5 pt-2 text-xs text-gray-500">
            <Lock className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden="true" />
            Made-for-you pictures and uploads come with a subscription.
          </p>
        )}

        <div className="relative flex-1 min-h-0 overflow-y-auto p-4" style={{ backgroundColor: "var(--j-bg)" }}>
          {tab === "search" && <PicturesPanel initialQuery={block.query} onAdd={(dataUrl) => choose(dataUrl, "web")} />}
          {tab === "ai" && <AiTab initialPrompt={block.query} busy={busy} setBusy={setBusy} setError={setError} onDone={(src, prompt) => choose(src, "ai", { query: prompt })} />}
          {tab === "upload" && <UploadTab busy={busy} setError={setError} onFile={(dataUrl) => choose(dataUrl, "upload")} />}
          {busy && tab !== "ai" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <Loader2 className="w-6 h-6 animate-spin text-(--j-deep)" />
            </div>
          )}
        </div>
        {error && <p className="px-5 py-2 text-xs text-red-600 border-t border-(--j-line)" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function AiTab({
  initialPrompt,
  busy,
  setBusy,
  setError,
  onDone,
}: {
  initialPrompt: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  onDone: (src: string, prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [style, setStyle] = useState<ImageStyle>("illustration");
  const [gallery, setGallery] = useState<GeneratedImage[] | null>(null);

  useEffect(() => {
    let live = true;
    listGeneratedImages({ limit: 24 })
      .then((list) => live && setGallery(list))
      .catch(() => live && setGallery([]));
    return () => { live = false; };
  }, []);

  const generate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The same call, and so the same processing, as regenerating a slide's
      // picture: the configured models, quality and compression.
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, style, orientation: "landscape" }),
      });
      const data = (await res.json().catch(() => ({}))) as { dataUrl?: string; width?: number; height?: number; model?: string };
      if (!res.ok || !data.dataUrl) throw new Error("Couldn't make that picture. Please try again.");
      saveGeneratedImage({ prompt: p, style, dataUrl: data.dataUrl, source: "regenerate", width: data.width, height: data.height, model: data.model }).catch(() => {});
      onDone(data.dataUrl, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make that picture. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            generate();
          }
        }}
        rows={3}
        disabled={busy}
        aria-label="Describe the picture"
        placeholder="A diagram of the water cycle"
        className="w-full px-3 py-2 text-sm bg-white border border-(--j-line) rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
      />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Style">
        {PICTURE_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            onClick={() => setStyle(s.id)}
            disabled={busy}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              style === s.id ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-(--j-line) text-gray-800 hover:border-(--j-lilac)"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={busy || !prompt.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-(--j-purple) text-white hover:bg-(--j-deep) disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy ? "Making your picture..." : "Make picture"}
      </button>

      {gallery && gallery.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mt-2 mb-1.5">Or use one you made before</p>
          <div className="grid grid-cols-3 gap-1.5">
            {gallery.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={busy}
                onClick={() => onDone(g.data_url, g.prompt)}
                title={g.title ?? g.prompt}
                className="aspect-square overflow-hidden rounded-lg border border-gray-200 hover:border-violet-400 disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.data_url} alt={g.title ?? g.prompt} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadTab({ busy, setError, onFile }: { busy: boolean; setError: (e: string | null) => void; onFile: (dataUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setError("Please choose a PNG, JPEG, WebP or GIF picture.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("That picture is over 10 MB. Please choose a smaller one.");
    try {
      onFile(await readFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-(--j-line) bg-white px-6 py-10 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files?.[0]);
      }}
    >
      <Upload className="w-6 h-6 text-(--j-deep)" />
      <p className="text-sm text-gray-700">Drop a picture here, or</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-(--j-purple) text-white hover:bg-(--j-deep) disabled:opacity-50"
      >
        Choose a file
      </button>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" data-testid="sheet-picture-file" onChange={(e) => take(e.target.files?.[0])} />
      <p className="text-xs text-gray-500">PNG, JPEG, WebP or GIF, up to 10 MB.</p>
    </div>
  );
}
