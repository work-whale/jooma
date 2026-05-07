"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function CoverTopicField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. The Water Cycle",
    "e.g. World War Two",
    "e.g. Photosynthesis",
    "e.g. Shakespeare's Macbeth",
    "e.g. Fractions and decimals",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Topic the class is currently studying</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          className={inputClass}
        />
        {!value && <PlaceholderOverlay text={placeholder} />}
      </div>
      <p className="text-xs text-gray-400">This helps generate activities that connect to what pupils are already learning.</p>
    </div>
  );
}
