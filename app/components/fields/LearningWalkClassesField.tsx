"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function LearningWalkClassesField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. 3L, 4B, Year 6",
    "e.g. Year 7, 8A, 10C",
    "e.g. All KS2 classes",
    "e.g. Reception, Year 1, Year 2",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">
        Classes visited <span className="text-gray-400 font-normal">(optional)</span>
      </label>
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
    </div>
  );
}
