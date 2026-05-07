"use client";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
}

export default function LessonCountField({
  value,
  onChange,
  min = 1,
  max = 20,
  step = 1,
  label = "Number of lessons",
  unit = "lessons",
}: Props) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>
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
        <span className="text-xs text-gray-400 ml-1">{min}–{max} {unit}</span>
      </div>
    </div>
  );
}
