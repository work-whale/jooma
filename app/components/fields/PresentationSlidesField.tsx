"use client";

import { Minus, Plus } from "lucide-react";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function PresentationSlidesField({ value, onChange }: Props) {
  const adjust = (delta: number) => {
    onChange(Math.max(5, Math.min(20, value + delta)));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Number of slides</label>
      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-36">
        <button
          type="button"
          onClick={() => adjust(-1)}
          disabled={value <= 5}
          className="px-3 py-3 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 border-r border-gray-200"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) onChange(Math.max(5, Math.min(20, v)));
          }}
          className="flex-1 text-center text-sm text-gray-900 py-3 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-300"
        />
        <button
          type="button"
          onClick={() => adjust(1)}
          disabled={value >= 20}
          className="px-3 py-3 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 border-l border-gray-200"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
