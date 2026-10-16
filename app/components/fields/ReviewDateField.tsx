"use client";

import { useId } from "react";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function ReviewDateField({ value, onChange }: Props) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">
        Next review date <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <input id={`${fieldId}-0`} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}
