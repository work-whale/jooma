"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}

export default function BehaviourDescriptionField({ value, onChange, invalid }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Frequently calls out without permission during whole-class teaching",
    "e.g. Leaves seat and disrupts peers, occurring 3–4 times per lesson",
    "e.g. Refuses tasks verbally and leaves the room when challenged",
    "e.g. Makes threatening comments towards peers in unstructured times",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Challenging behaviour description</label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={3}
          className={`${inputClass} resize-none ${invalid ? "border-red-400 focus:ring-red-400" : ""}`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      {invalid && <p className="text-xs text-red-500">Behaviour description is required</p>}
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
