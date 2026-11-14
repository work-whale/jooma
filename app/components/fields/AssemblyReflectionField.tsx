"use client";

import { useId } from "react";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";
const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const OPTIONS = [
  { value: "reflection", label: "Reflection (no prayer)" },
  { value: "worship", label: "Collective worship (broadly Christian)" },
  { value: "faith", label: "Faith school prayer" },
];

/*
 * How the assembly closes. Schools in England hold a daily act of collective
 * worship, mainly of a broadly Christian character unless exempt; many state
 * schools meet it with a quiet reflection, and faith schools use a prayer.
 */
export default function AssemblyReflectionField({
  value,
  onChange,
  faith,
  onChangeFaith,
}: {
  value: string;
  onChange: (v: string) => void;
  faith: string;
  onChangeFaith: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800">Closing</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {value === "faith" && (
        <input
          aria-label="Your school's faith"
          type="text"
          value={faith}
          onChange={(e) => onChangeFaith(e.target.value)}
          placeholder="e.g. Catholic, Church of England, Muslim, Jewish"
          className={`${inputClass} mt-2`}
        />
      )}
    </div>
  );
}
