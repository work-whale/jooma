"use client";

type OutputType = "full" | "structure";

const OPTIONS: { value: OutputType; label: string }[] = [
  { value: "full", label: "Draft full policy" },
  { value: "structure", label: "Draft policy section structure" },
];

interface Props {
  value: OutputType;
  onChange: (v: OutputType) => void;
}

export default function OutputTypeField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Output type</label>
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="outputType"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-gray-900"
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
