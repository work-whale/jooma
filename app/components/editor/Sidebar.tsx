"use client";

import { useEffect, useRef, useState } from "react";
import { Shapes, Type, Image as ImageIcon, Square, Circle, Triangle as TriangleIcon, Minus, X, MoveRight, Star, Hexagon } from "lucide-react";
import GraphicsPanel from "./GraphicsPanel";
import PicturesPanel from "./PicturesPanel";
import FramePicker from "./FramePicker";
import type { FrameShape } from "./frames";
import { GOOGLE_FONTS, injectGoogleFonts } from "./googleFonts";

type TabId = "elements" | "text" | "uploads";

type SidebarShape = "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "hexagon";

interface Props {
  onAddShape: (type: SidebarShape) => void;
  onAddText: (preset: "heading" | "subheading" | "body", fontFamily?: string) => void;
  onAddImage: (dataUrl: string) => void;
  onAddFrame?: (frame: FrameShape) => void;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "elements", label: "Elements", icon: <Shapes className="w-5 h-5" /> },
  { id: "text", label: "Text", icon: <Type className="w-5 h-5" /> },
  { id: "uploads", label: "Uploads", icon: <ImageIcon className="w-5 h-5" /> },
];

type ElementSubTab = "shapes" | "graphics" | "pictures" | "frames";

export default function Sidebar({
  onAddShape,
  onAddText,
  onAddImage,
  onAddFrame,
}: Props) {
  // Click-toggle only. The panel stays open until the user clicks the same icon,
  // the close button, or anywhere outside the sidebar.
  const [active, setActive] = useState<TabId | null>(null);

  // Lazy-inject the Google Fonts <link> the first time the sidebar mounts.
  useEffect(() => { injectGoogleFonts(); }, []);
  const [elementSubTab, setElementSubTab] = useState<ElementSubTab>("shapes");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<string[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

      {/* Expanded panel — only rendered when a tab is active. Floats over canvas. */}
      {active && (
        <div
          className="absolute top-0 bottom-0 w-72 border-r shadow-lg flex flex-col"
          style={{ borderColor: "#DAD8D0", backgroundColor: "#F1EFE3", left: 72 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#DAD8D0" }}>
            <h3 className="text-sm font-semibold text-gray-800 capitalize">{active}</h3>
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
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                        elementSubTab === id
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {id}
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

                {elementSubTab === "graphics" && <GraphicsPanel onAdd={onAddImage} />}

                {elementSubTab === "pictures" && <PicturesPanel onAdd={onAddImage} />}

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
      )}
    </div>
  );
}
