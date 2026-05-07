"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AptitudinalDataField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Scores out of 100: verbal reasoning 70, spatial reasoning 90, numerical reasoning 50",
    "e.g. Target grade A*, strong verbal skills, weaker with abstract reasoning",
    "e.g. CAT4 scores: verbal 112, quantitative 95, non-verbal 108",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">
        Aptitudinal data <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={4}
          className={`${inputClass} resize-none`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">
        Describe aptitude, general skills, abilities and potential. If you include survey scores, state what they measure and what they are out of.
      </p>
    </div>
  );
}
