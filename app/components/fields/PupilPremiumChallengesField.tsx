"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PupilPremiumChallengesField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Vocabulary gaps and weak oral language skills among disadvantaged pupils",
    "e.g. Low attendance rates, particularly among PP cohort in KS2",
    "e.g. Social-emotional barriers affecting engagement and progress",
    "e.g. Attainment gap in reading and writing at the end of KS1",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Challenges</label>
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
      <p className="text-xs text-gray-400">Provide up to 3 challenges at a time for best results.</p>
    </div>
  );
}
