"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}

export default function BehaviouralTriggersField({ value, onChange, invalid }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Unstructured tasks, extended writing, transitions between lessons",
    "e.g. Seating near certain peers, perceived criticism from staff",
    "e.g. Loud environments, unexpected changes to routine",
    "e.g. Being asked to read aloud, starting independent work",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Behavioural triggers</label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={3}
          className={`${inputClass} resize-none ${invalid ? "border-red-400 focus:ring-red-400" : ""}`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      {invalid && <p className="text-xs text-red-500">Behavioural triggers are required</p>}
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
