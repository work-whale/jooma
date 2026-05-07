"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AttitudinalDataField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Low self-regard as a learner, positive attitude to attending school, good peer relationships",
    "e.g. Scores out of 100: learner self-regard 50, attitude to curriculum 90",
    "e.g. Disengaged in class but motivated by practical tasks; avoids written work",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Attitudinal data</label>
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
        Describe attitude to self, school and learning. If you include survey scores, state what they measure and what they are out of.
      </p>
    </div>
  );
}
