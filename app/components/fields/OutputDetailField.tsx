"use client";

const OPTIONS = [
  { value: "condensed", label: "Condensed" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
] as const;

export type OutputDetail = "condensed" | "standard" | "detailed";

interface Props {
  value: OutputDetail;
  onChange: (v: OutputDetail) => void;
}

export default function OutputDetailField({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Output detail</label>
      {/* Wraps rather than running off a phone: each option is at least as
          wide as its word (min-w-fit), and shares the row while they fit. */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {OPTIONS.map(({ value: v, label }) => (
          <label
            key={v}
            className={`flex-1 min-w-fit flex items-center justify-center text-sm font-medium px-3 sm:px-4 py-2.5 rounded-xl border transition-colors cursor-pointer ${
              value === v
                ? "bg-stone-700 text-white border-stone-700"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            }`}
          >
            <input type="radio" name="outputDetail" value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
