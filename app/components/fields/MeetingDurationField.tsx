"use client";

import { Minus, Plus } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MeetingDurationField({ value, onChange }: Props) {
  const num = parseInt(value, 10);

  const adjust = (delta: number) => {
    const current = parseInt(value, 10) || 60;
    onChange(String(Math.min(480, Math.max(5, current + delta))));
  };

  const handleBlur = () => {
    const n = parseInt(value, 10);
    onChange(String(isNaN(n) ? 60 : Math.min(480, Math.max(5, n))));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Duration (minutes)</label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          min={5}
          max={480}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          className="w-20 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
        />
        <button
          type="button"
          onClick={() => adjust(-5)}
          disabled={num <= 5}
          className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => adjust(5)}
          disabled={num >= 480}
          className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
