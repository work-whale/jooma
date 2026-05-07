"use client";

import { Minus, Plus } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
}

export default function WordCountField({
  value,
  onChange,
  label = "Length (approx. words)",
  min = 50,
  max = 5000,
  step = 50,
  defaultValue = 500,
}: Props) {
  const num = parseInt(value, 10);

  const adjust = (delta: number) => {
    const current = isNaN(num) ? defaultValue : num;
    onChange(String(Math.min(max, Math.max(min, current + delta))));
  };

  const handleBlur = () => {
    const n = parseInt(value, 10);
    onChange(String(isNaN(n) ? defaultValue : Math.min(max, Math.max(min, n))));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>
      <div className="flex items-center gap-0">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          className="w-24 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
        />
        <button
          type="button"
          onClick={() => adjust(-step)}
          disabled={num <= min}
          className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => adjust(step)}
          disabled={num >= max}
          className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
