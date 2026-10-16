"use client";

import { useId } from "react";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const TONE_OPTIONS = [
  "Professional and formal",
  "Warm and friendly",
  "Inspiring and motivational",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function NewsletterToneField({ value, onChange }: Props) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">Newsletter tone</label>
      <select id={`${fieldId}-0`} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">Please select an option</option>
        {TONE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
