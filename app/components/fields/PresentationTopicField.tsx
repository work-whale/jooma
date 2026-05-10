"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PresentationTopicField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Introduction to the water cycle for Year 5 Science",
    "e.g. The causes of World War One for GCSE History",
    "e.g. Place value and rounding for Year 4 Maths",
    "e.g. Shakespeare's use of language in Macbeth",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Topic</label>
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
      <p className="text-xs text-gray-400">Be specific — include the subject, year group, and any key focus areas.</p>
    </div>
  );
}
