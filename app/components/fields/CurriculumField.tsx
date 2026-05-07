"use client";

import { CURRICULA } from "@/app/lib/formOptions";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function CurriculumField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Curriculum</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="" disabled>Select curriculum</option>
        {CURRICULA.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
