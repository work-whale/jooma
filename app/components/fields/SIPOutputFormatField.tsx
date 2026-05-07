"use client";

interface Props {
  value: "table" | "narrative";
  onChange: (v: "table" | "narrative") => void;
}

export default function SIPOutputFormatField({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Output format</label>
      <div className="flex flex-wrap gap-6">
        {[
          { val: "table", label: "Table format", sub: "a briefer summary" },
          { val: "narrative", label: "Narrative format", sub: "a more detailed plan" },
        ].map(({ val, label, sub }) => (
          <label key={val} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="outputFormat"
              value={val}
              checked={value === val}
              onChange={() => onChange(val as "table" | "narrative")}
              className="mt-0.5 accent-gray-900"
            />
            <span className="text-sm text-gray-700">
              {label} <span className="text-gray-400">({sub})</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
