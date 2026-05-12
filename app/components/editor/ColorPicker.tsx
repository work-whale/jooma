"use client";

import { useEffect, useRef, useState } from "react";
import { Pipette } from "lucide-react";

// ── HSV ↔ HEX helpers ─────────────────────────────────────────────────────

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, v: 100 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max ? (d / max) * 100 : 0;
  const v = max * 100;
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// ──────────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

type EyeDropperResult = { sRGBHex: string };
interface EyeDropperConstructor {
  new (): { open(): Promise<EyeDropperResult> };
}

export default function ColorPicker({ value, onChange }: Props) {
  // Track HSV locally so dragging on the SV pad keeps a stable hue at S=0
  // (otherwise hue would snap back to 0 every time saturation hits 0).
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value);
  const [tab, setTab] = useState<"solid" | "gradient">("solid");

  // Sync local HSV when the external value changes from outside (and isn't from our own onChange)
  useEffect(() => {
    setHexInput(value);
    const incoming = hexToHsv(value);
    setHsv((cur) => {
      const cmp = hsvToHex(cur.h, cur.s, cur.v);
      return cmp.toLowerCase() === value.toLowerCase() ? cur : incoming;
    });
  }, [value]);

  const updateHsv = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setHexInput(hex);
    onChange(hex);
  };

  // ── SV pad drag ────────────────────────────────────────────────────────
  const svRef = useRef<HTMLDivElement>(null);
  const handleSvMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const apply = (cx: number, cy: number) => {
      const s = Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100));
      const v = Math.max(0, Math.min(100, 100 - ((cy - rect.top) / rect.height) * 100));
      updateHsv({ h: hsv.h, s, v });
    };
    apply(e.clientX, e.clientY);
    const move = (ev: MouseEvent) => apply(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ── Hue slider drag ────────────────────────────────────────────────────
  const hueRef = useRef<HTMLDivElement>(null);
  const handleHueMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const apply = (cx: number) => {
      const h = Math.max(0, Math.min(360, ((cx - rect.left) / rect.width) * 360));
      updateHsv({ ...hsv, h });
    };
    apply(e.clientX);
    const move = (ev: MouseEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ── Hex input ──────────────────────────────────────────────────────────
  const commitHex = () => {
    let v = hexInput.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)) {
      if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      const upper = v.toUpperCase();
      setHexInput(upper);
      setHsv(hexToHsv(upper));
      onChange(upper);
    } else {
      setHexInput(value);
    }
  };

  // ── Eyedropper (Chrome 95+) ────────────────────────────────────────────
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const pickWithEyeDropper = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperConstructor }).EyeDropper;
      const dropper = new Ctor();
      const result = await dropper.open();
      const hex = result.sRGBHex.toUpperCase();
      setHexInput(hex);
      setHsv(hexToHsv(hex));
      onChange(hex);
    } catch {
      // User cancelled — ignore
    }
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab("solid")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
            tab === "solid"
              ? "border-b-2 border-violet-600 text-gray-900 -mb-px"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Solid color
        </button>
        <button
          onClick={() => setTab("gradient")}
          className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
            tab === "gradient"
              ? "border-b-2 border-violet-600 text-gray-900 -mb-px"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Gradient
        </button>
      </div>

      {tab === "gradient" ? (
        <p className="text-xs text-gray-500 text-center py-6">
          Gradients coming soon
        </p>
      ) : (
        <>
          {/* SV pad — saturation (x) × value (y) at the current hue */}
          <div
            ref={svRef}
            onMouseDown={handleSvMouseDown}
            className="relative h-28 rounded-lg overflow-hidden cursor-crosshair select-none"
            style={{
              background: `
                linear-gradient(to top, #000, transparent),
                linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))
              `,
            }}
          >
            <div
              className="absolute w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
              }}
            />
          </div>

          {/* Hue slider */}
          <div
            ref={hueRef}
            onMouseDown={handleHueMouseDown}
            className="relative h-3 rounded-full cursor-pointer select-none"
            style={{
              background:
                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
            }}
          >
            <div
              className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white pointer-events-none"
              style={{
                left: `${(hsv.h / 360) * 100}%`,
                transform: "translate(-50%, -50%)",
                background: `hsl(${hsv.h}, 100%, 50%)`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
              }}
            />
          </div>

          {/* Hex input row with current swatch + eyedropper */}
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border border-gray-200 shrink-0"
              style={{ background: value }}
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setHexInput(value);
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-form-type="other"
              data-lpignore="true"
              className="flex-1 min-w-0 h-9 px-3 text-sm font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 uppercase"
            />
            {hasEyeDropper && (
              <button
                type="button"
                onClick={pickWithEyeDropper}
                title="Pick from screen"
                className="h-9 w-9 flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50 shrink-0"
              >
                <Pipette className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
