"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function LearningWalkFocusField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Quality of teaching and curriculum sequencing",
    "e.g. Behaviour and attitudes to learning",
    "e.g. SEND provision and adaptive teaching",
    "e.g. Pupil engagement and on-task behaviour",
    "e.g. Literacy across the curriculum",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">
        Focus of learning walk <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={2}
          className={`${inputClass} resize-none`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
    </div>
  );
}
