"use client";

import { useRef } from "react";
import { Loader2 } from "lucide-react";
import { bandTitle, type BandVersion } from "@/app/lib/bands";
import type { DifferentiationBand } from "@/app/lib/differentiation";

interface Props {
  bands: BandVersion[];
  active: DifferentiationBand;
  onSelect: (band: DifferentiationBand) => void;
  /** While Jo is changing the version on screen. Switching mid turn would
   *  land Jo's edit in the wrong version. */
  disabled?: boolean;
}

/**
 * The differentiated versions above a result: one tab per band the teacher
 * picked, each its own document. A spinner marks a version still writing, a
 * red dot one that failed.
 *
 * Scrolls sideways inside itself on a narrow phone rather than wrapping, so
 * the panel below never jumps when a fourth tab appears.
 */
export default function BandTabs({ bands, active, onSelect, disabled = false }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Arrow keys move between tabs, as a tablist should.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = bands.findIndex((b) => b.band === active);
    const next = bands[(i + (e.key === "ArrowRight" ? 1 : bands.length - 1)) % bands.length];
    onSelect(next.band);
    listRef.current?.querySelector<HTMLElement>(`[data-band="${next.band}"]`)?.focus();
  };

  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Differentiated versions</p>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Differentiated versions"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {bands.map((b) => {
          const selected = b.band === active;
          const { label, detail } = bandTitle(b.band);
          return (
            <button
              key={b.band}
              type="button"
              role="tab"
              data-band={b.band}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled && !selected}
              onClick={() => onSelect(b.band)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selected
                  ? "bg-stone-700 text-white border-stone-700"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{label}</span>
                <span className={`text-xs ${selected ? "text-gray-300" : "text-gray-400"}`}>{detail}</span>
              </span>
              {b.pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Still writing" />}
              {b.error && <span className="w-2 h-2 rounded-full bg-red-500" aria-label="Failed" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
