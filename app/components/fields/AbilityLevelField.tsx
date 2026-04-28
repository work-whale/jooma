"use client";

const LEVELS = [
  { value: "WTS", label: "WTS", detail: "Working Towards Standard" },
  { value: "EXS", label: "EXS", detail: "Expected Standard" },
  { value: "GDS", label: "GDS", detail: "Greater Depth Standard" },
] as const;

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AbilityLevelField({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Adaptation / Differentiation</label>
      <div className="flex gap-3">
        {LEVELS.map(({ value: v, label, detail }) => (
          <label
            key={v}
            className={`flex-1 flex flex-col cursor-pointer px-4 py-3 rounded-xl border transition-colors ${
              value === v
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
            }`}
          >
            <input type="radio" name="abilityLevel" value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            <span className="text-sm font-semibold">{label}</span>
            <span className={`text-xs mt-0.5 ${value === v ? "text-gray-300" : "text-gray-400"}`}>{detail}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
