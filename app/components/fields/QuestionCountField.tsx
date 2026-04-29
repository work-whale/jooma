"use client";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export default function QuestionCountField({ value, onChange, min = 5, max = 30 }: Props) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Number of questions</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-700 text-lg font-medium flex items-center justify-center hover:bg-gray-50 disabled:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-default cursor-pointer"
        >
          −
        </button>
        <span className="w-10 text-center text-sm font-semibold text-gray-900">{value}</span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-700 text-lg font-medium flex items-center justify-center hover:bg-gray-50 disabled:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-default cursor-pointer"
        >
          +
        </button>
        <span className="text-xs text-gray-400 ml-1">{min}–{max} questions</span>
      </div>
    </div>
  );
}
