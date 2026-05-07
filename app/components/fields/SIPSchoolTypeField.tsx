"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const SCHOOL_TYPES = [
  "Primary",
  "Secondary",
  "All-through School",
  "Special School",
  "Alternative Provision",
  "Nursery",
  "Sixth Form / FE College",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SIPSchoolTypeField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">School type</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {SCHOOL_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
