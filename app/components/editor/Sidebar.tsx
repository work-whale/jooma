"use client";

import { useEffect, useRef, useState } from "react";
import { Shapes, Type, Image as ImageIcon, Square, Circle, Triangle as TriangleIcon, Minus, X } from "lucide-react";

type TabId = "elements" | "text" | "uploads";

interface Props {
  onAddShape: (type: "rect" | "ellipse" | "triangle" | "line") => void;
  onAddText: (preset: "heading" | "subheading" | "body") => void;
  onAddImage: (dataUrl: string) => void;
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "elements", label: "Elements", icon: <Shapes className="w-5 h-5" /> },
  { id: "text", label: "Text", icon: <Type className="w-5 h-5" /> },
  { id: "uploads", label: "Uploads", icon: <ImageIcon className="w-5 h-5" /> },
];

export default function Sidebar({ onAddShape, onAddText, onAddImage }: Props) {
  // active = which tab is currently displayed (if any)
  // locked = panel was opened explicitly via click; mouse-leave doesn't auto-close it.
  //          When false, the panel is "hover-preview" mode and closes on mouse leave.
  const [active, setActive] = useState<TabId | null>(null);
  const [locked, setLocked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<string[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside the sidebar (covers both hover + locked modes)
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setActive(null);
        setLocked(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [active]);

  const handleHoverOpen = (id: TabId) => {
    if (!locked) setActive(id);
  };

  const handleClick = (id: TabId) => {
    if (active === id && locked) {
      // Clicked the same icon while locked → close + unlock.
      setActive(null);
      setLocked(false);
    } else {
      setActive(id);
      setLocked(true);
    }
  };

  const handleMouseLeave = () => {
    // Only auto-close on leave if the user never clicked to lock it open.
    if (!locked) setActive(null);
  };

  const handleClose = () => {
    setActive(null);
    setLocked(false);
  };

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
      className="flex shrink-0 relative z-20"
      style={{ backgroundColor: "#F1EFE3" }}
      onMouseLeave={handleMouseLeave}
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
              onMouseEnter={() => handleHoverOpen(t.id)}
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
          className="absolute top-0 bottom-0 w-64 border-r shadow-lg flex flex-col"
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
                  onClick={() => onAddShape("line")}
                  className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                  title="Line"
                >
                  <Minus className="w-7 h-7 text-gray-700" strokeWidth={2} />
                </button>
              </div>
            )}

            {active === "text" && (
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
