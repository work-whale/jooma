"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholders?: string[];
  label?: string;
  rows?: number;
}

export default function TopicField({ value, onChange, placeholders, label = "Topic", rows = 3 }: Props) {
  const placeholder = useTypingPlaceholder(placeholders ?? ["e.g. Quadratic equations", "e.g. The Water Cycle", "e.g. Shakespeare's Macbeth"]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>
      <div className="relative">
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="" rows={rows} className={`${inputClass} resize-none`} />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
