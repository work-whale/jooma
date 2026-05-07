"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function LetterContentField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Own clothes day on Friday — bring £1 to raise money for Children in Need. Appropriate clothing only.",
    "e.g. Year 6 residential trip to Robinwood, 14–16 May. Cost £185. Reply slip and deposit due by 28 March.",
    "e.g. School will be closed on Monday 5th May for a bank holiday. Pupils return Tuesday 6th May.",
    "e.g. Parents' evening on Thursday 20th March, 4–7pm. Book slots via the school website.",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Summary of key information for letter content</label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={5}
          className={`${inputClass} resize-none`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
