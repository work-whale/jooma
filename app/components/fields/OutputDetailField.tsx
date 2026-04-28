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
      <div className="flex gap-3">
        {OPTIONS.map(({ value: v, label }) => (
          <label
            key={v}
            className={`flex-1 flex items-center justify-center cursor-pointer text-sm font-medium px-4 py-2.5 rounded-xl border transition-colors ${
              value === v
                ? "bg-gray-900 text-white border-gray-900"
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
