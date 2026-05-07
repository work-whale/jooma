"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const EDUCATION_PHASES = [
  "Early Years",
  "Primary",
  "Secondary",
  "All-through School",
  "Special School",
  "Alternative Provision",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function EducationPhaseField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Education phase</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {EDUCATION_PHASES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
