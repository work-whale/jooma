"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AssemblyThemeField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Treating people with respect",
    "e.g. Anti-bullying and kindness",
    "e.g. Using social media responsibly",
    "e.g. Resilience and growth mindset",
    "e.g. Black History Month — trailblazers and changemakers",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Theme</label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={3}
          className={`${inputClass} resize-none`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
