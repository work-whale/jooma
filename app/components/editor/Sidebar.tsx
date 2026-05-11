"use client";

import { useRef, useState } from "react";
import { Shapes, Type, Image as ImageIcon, Square, Circle, Triangle as TriangleIcon, Minus } from "lucide-react";

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
  const [active, setActive] = useState<TabId>("elements");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<string[]>([]);

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
    <div className="flex shrink-0" style={{ backgroundColor: "#F1EFE3" }}>
      {/* Vertical icon strip */}
      <div
        className="w-18 flex flex-col items-center py-3 gap-1 border-r"
        style={{ borderColor: "#DAD8D0", width: 72 }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`w-14 flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
              active === t.id ? "bg-violet-100 text-violet-700" : "text-gray-600 hover:bg-white"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Expanded panel */}
      <div className="w-64 border-r p-4 overflow-y-auto" style={{ borderColor: "#DAD8D0" }}>
        {active === "elements" && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Shapes</h3>
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
          </div>
        )}

        {active === "text" && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Add text</h3>
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
          </div>
        )}

        {active === "uploads" && (
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Uploads</h3>
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
  );
}
