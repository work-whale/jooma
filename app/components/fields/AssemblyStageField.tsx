"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const STAGE_OPTIONS = [
  "Early Years",
  "KS1",
  "KS2",
  "Primary",
  "KS3",
  "KS4",
  "Secondary",
  "All-through School",
  "Special School",
  "Alternative Provision",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AssemblyStageField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Stage of school</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {STAGE_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
