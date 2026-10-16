"use client";

import { useId } from "react";

const GENDER_OPTIONS = ["Male", "Female", "Non-Binary"] as const;

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

export default function GenderField({ value, onChange, label = "Gender" }: Props) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">{label}</label>
      <select id={`${fieldId}-0`} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Please select an option</option>
        {GENDER_OPTIONS.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
    </div>
  );
}
