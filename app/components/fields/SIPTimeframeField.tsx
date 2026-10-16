"use client";

import { Minus, Plus } from "lucide-react";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function SIPTimeframeField({ value, onChange }: Props) {
  const adjust = (delta: number) => {
    onChange(Math.max(1, Math.min(5, value + delta)));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Plan timeframe (years)</label>
      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => adjust(-1)}
          disabled={value <= 1}
          className="px-3 py-3 pointer-coarse:min-w-12 pointer-coarse:min-h-12 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 border-r border-gray-200"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="text"
          // Text with a numeric keypad rather than type="number": no spinner
          // that a scroll or a stray swipe can change, and the digit pad on
          // iOS instead of the full keyboard.
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) onChange(Math.max(1, Math.min(5, v)));
          }}
          className="flex-1 min-w-0 text-center text-sm text-gray-900 py-3 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-300"
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => adjust(1)}
          disabled={value >= 5}
          className="px-3 py-3 pointer-coarse:min-w-12 pointer-coarse:min-h-12 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 border-l border-gray-200"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
