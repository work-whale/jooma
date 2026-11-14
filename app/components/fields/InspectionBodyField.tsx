"use client";

import { useId } from "react";
import { INSPECTION_BODIES } from "@/app/lib/sheets/inspection";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";
const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  /** A body id from INSPECTION_BODIES. */
  value: string;
  onChange: (v: string) => void;
  /** The body's name when "Other" is picked. */
  other: string;
  onChangeOther: (v: string) => void;
}

export default function InspectionBodyField({ value, onChange, other, onChangeOther }: Props) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">Inspection or accreditation body</label>
      <select id={`${fieldId}-0`} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {INSPECTION_BODIES.map((b) => (
          <option key={b.id} value={b.id}>{b.label}</option>
        ))}
      </select>
      {value === "other" && (
        <input
          aria-label="Name of the inspection or accreditation body"
          type="text"
          value={other}
          onChange={(e) => onChangeOther(e.target.value)}
          placeholder="e.g. CIS, BSO, KHDA"
          className={`${inputClass} mt-2`}
        />
      )}
      {value !== "ofsted" && (
        <p className="text-xs text-gray-500">Only Ofsted&apos;s areas are built in. For other bodies the headings are drafted from general knowledge, so check them against the current framework.</p>
      )}
    </div>
  );
}
