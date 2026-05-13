"use client";

import { useEffect, useRef, useState } from "react";
import { Shapes, Type, Image as ImageIcon, Square, Circle, Triangle as TriangleIcon, Minus, X, MoveRight, Star, Hexagon, Sparkles, Loader2, Search } from "lucide-react";
import GraphicsPanel from "./GraphicsPanel";
import PicturesPanel from "./PicturesPanel";
import FramePicker from "./FramePicker";
import type { FrameShape } from "./frames";
import { GOOGLE_FONTS, injectGoogleFonts } from "./googleFonts";
import { listGeneratedImages, saveGeneratedImage, type GeneratedImage } from "@/app/lib/generatedImages";

type TabId = "elements" | "text" | "uploads" | "ai";

type SidebarShape = "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "hexagon";

interface Props {
  onAddShape: (type: SidebarShape) => void;
  onAddText: (preset: "heading" | "subheading" | "body", fontFamily?: string) => void;
  onAddImage: (dataUrl: string) => void;
  onAddFrame?: (frame: FrameShape) => void;
  // Bumped by the Editor whenever it saves a new image to the gallery (e.g. from
  // the SSE wizard stream or right-click regenerate). Triggers a refetch here.
  galleryRefreshTrigger?: number;
}

const AI_STYLES: { id: "photographic" | "illustration" | "storybook" | "painted" | "line-drawing" | "comic-book"; label: string }[] = [
  { id: "photographic", label: "Photo" },
  { id: "illustration", label: "Illustration" },
  { id: "storybook", label: "Storybook" },
  { id: "painted", label: "Painted" },
  { id: "line-drawing", label: "Line" },
  { id: "comic-book", label: "Comic" },
];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "elements", label: "Elements", icon: <Shapes className="w-5 h-5" /> },
  { id: "text", label: "Text", icon: <Type className="w-5 h-5" /> },
  { id: "uploads", label: "Uploads", icon: <ImageIcon className="w-5 h-5" /> },
  { id: "ai", label: "AI", icon: <Sparkles className="w-5 h-5" /> },
];

type ElementSubTab = "shapes" | "graphics" | "pictures" | "frames";

const SUB_TAB_LABELS: Record<ElementSubTab, string> = {
  shapes: "Shapes",
  graphics: "Graphics",
  pictures: "Pictures",
  frames: "Frames",
};

export default function Sidebar({
  onAddShape,
  onAddText,
  onAddImage,
  onAddFrame,
  galleryRefreshTrigger = 0,
}: Props) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState<typeof AI_STYLES[number]["id"]>("photographic");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce the search input so we don't hammer Supabase on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(gallerySearch.trim()), 250);
    return () => clearTimeout(t);
  }, [gallerySearch]);

  // Re-fetch when search changes or the Editor signals a new save.
  useEffect(() => {
    let cancelled = false;
    setGalleryLoading(true);
    listGeneratedImages({ search: debouncedSearch, limit: 100 })
      .then((rows) => { if (!cancelled) setGallery(rows); })
      .catch((err) => { if (!cancelled) console.warn("Gallery fetch failed:", err); })
      .finally(() => { if (!cancelled) setGalleryLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, galleryRefreshTrigger]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim(), style: aiStyle }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }
      const data: { dataUrl: string } = await r.json();
      const saved = await saveGeneratedImage({ prompt: aiPrompt.trim(), style: aiStyle, dataUrl: data.dataUrl });
      setGallery((prev) => [saved, ...prev]);
      setAiPrompt("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiBusy(false);
    }
  };
  // Click-toggle only. The panel stays open until the user clicks the same icon,
  // the close button, or anywhere outside the sidebar.
  const [active, setActive] = useState<TabId | null>(null);

  // Lazy-inject the Google Fonts <link> the first time the sidebar mounts.
  useEffect(() => { injectGoogleFonts(); }, []);
  const [elementSubTab, setElementSubTab] = useState<ElementSubTab>("shapes");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<string[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Track which sub-tabs have ever been opened. Graphics + Pictures keep their
  // own search/scroll state, so once the user opens them we KEEP them mounted
  // and only hide them via display:none. Re-opening the sidebar then preserves
  // whatever the user had typed/scrolled.
  const [openedSubTabs, setOpenedSubTabs] = useState<Set<ElementSubTab>>(() => new Set(["shapes"]));
  useEffect(() => {
    if (active === "elements") {
      setOpenedSubTabs((prev) => prev.has(elementSubTab) ? prev : new Set(prev).add(elementSubTab));
    }
  }, [active, elementSubTab]);

  // Close when clicking outside the sidebar
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [active]);

  const handleClick = (id: TabId) => {
    setActive((prev) => (prev === id ? null : id));
  };

  const handleClose = () => setActive(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setUploads((prev) => [dataUrl, ...prev]);
        onAddImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      ref={sidebarRef}
      className="flex shrink-0 relative z-20 [&_button]:cursor-pointer [&_a]:cursor-pointer [&_label]:cursor-pointer"
      style={{ backgroundColor: "#F1EFE3" }}
    >
      {/* Vertical icon strip */}
      <div
        className="flex flex-col items-center py-3 gap-1 border-r"
        style={{ borderColor: "#DAD8D0", width: 72, backgroundColor: "#F1EFE3" }}
      >
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleClick(t.id)}
              className={`w-14 flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-gray-600 hover:bg-violet-100 hover:text-violet-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Expanded panel — kept in the DOM once mounted, hidden via display:none
          when no tab is active so stateful sub-panels (Graphics search, Pictures
          search/scroll) survive close-and-reopen. */}
      <div
        className="absolute top-0 bottom-0 w-72 border-r shadow-lg flex flex-col"
        style={{
          borderColor: "#DAD8D0",
          backgroundColor: "#F1EFE3",
          left: 72,
          display: active ? "flex" : "none",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#DAD8D0" }}>
          <h3 className="text-sm font-semibold text-gray-800 capitalize">{active ?? ""}</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            title="Close"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

          <div className="flex-1 overflow-y-auto p-4">
            {active === "elements" && (
              <div className="space-y-3">
                {/* Sub-tabs (horizontally scrollable) */}
                <div
                  className="flex gap-1 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {(["shapes", "graphics", "pictures", "frames"] as ElementSubTab[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => setElementSubTab(id)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        elementSubTab === id
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {SUB_TAB_LABELS[id]}
                    </button>
                  ))}
                </div>

                {elementSubTab === "shapes" && (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => onAddShape("rect")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Rectangle"
                    >
                      <Square className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("ellipse")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Ellipse"
                    >
                      <Circle className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("triangle")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Triangle"
                    >
                      <TriangleIcon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("hexagon")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Hexagon"
                    >
                      <Hexagon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("star")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Star"
                    >
                      <Star className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("line")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Line"
                    >
                      <Minus className="w-7 h-7 text-gray-700" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => onAddShape("arrow")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Arrow"
                    >
                      <MoveRight className="w-7 h-7 text-gray-700" strokeWidth={1.75} />
                    </button>
                  </div>
                )}

                {/* Keep Graphics + Pictures mounted once first opened so their
                    search query, results, and scroll position survive across
                    close/reopen and sub-tab switches. */}
                {openedSubTabs.has("graphics") && (
                  <div style={{ display: elementSubTab === "graphics" ? "block" : "none" }}>
                    <GraphicsPanel onAdd={onAddImage} />
                  </div>
                )}

                {openedSubTabs.has("pictures") && (
                  <div style={{ display: elementSubTab === "pictures" ? "block" : "none" }}>
                    <PicturesPanel onAdd={onAddImage} />
                  </div>
                )}

                {elementSubTab === "frames" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-gray-500">
                      Click a frame to drop it on the slide. Then drag any photo from Pictures, Graphics, or Uploads onto it.
                    </p>
                    <FramePicker
                      onSelect={(f) => onAddFrame?.(f)}
                      columns={3}
                      showLabels
                    />
                  </div>
                )}

              </div>
            )}

            {active === "ai" && (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500">
                  Describe an image and AI will generate it. Results join the gallery below.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiGenerate();
                    }
                  }}
                  placeholder="A photo of saturn with its rings"
                  rows={2}
                  disabled={aiBusy}
                  className="w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
                  style={{ borderColor: "#DAD8D0" }}
                />
                <div className="flex flex-wrap gap-1">
                  {AI_STYLES.map((s) => {
                    const selected = aiStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAiStyle(s.id)}
                        disabled={aiBusy}
                        className="px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors"
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
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiBusy || !aiPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
                >
                  {aiBusy ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate
                    </>
                  )}
                </button>
                {aiError && (
                  <p className="text-[10px] text-red-600">{aiError}</p>
                )}
                <div className="pt-2 border-t" style={{ borderColor: "#DAD8D0" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Gallery</p>
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      type="text"
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      placeholder="Search across all slideshows"
                      className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                      style={{ borderColor: "#DAD8D0" }}
                    />
                  </div>
                  {galleryLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  ) : gallery.length === 0 ? (
                    <p className="text-[11px] text-gray-400">
                      {debouncedSearch ? "No images match that search." : "Generated images from all your slideshows will appear here."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {gallery.map((g) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={g.id}
                          src={g.data_url}
                          alt={g.prompt}
                          title={g.prompt}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("application/x-jooma-image", g.data_url)}
                          onClick={() => onAddImage(g.data_url)}
                          className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 border border-gray-200"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {active === "text" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <button
                    onClick={() => onAddText("heading")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-xl font-bold text-gray-900">Add a heading</p>
                  </button>
                  <button
                    onClick={() => onAddText("subheading")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-base font-semibold text-gray-700">Add a subheading</p>
                  </button>
                  <button
                    onClick={() => onAddText("body")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-sm text-gray-600">Add body text</p>
                  </button>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Fonts</p>
                  <div className="space-y-1">
                    {GOOGLE_FONTS.map((f) => (
                      <button
                        key={f.name}
                        onClick={() => onAddText("heading", f.family)}
                        title={`Add heading in ${f.name}`}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 truncate"
                        style={{ fontFamily: f.family, fontSize: 16 }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {active === "uploads" && (
              <div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                >
                  Upload image
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
                {uploads.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {uploads.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={u}
                        alt=""
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("application/x-jooma-image", u)}
                        onClick={() => onAddImage(u)}
                        className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 border border-gray-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
