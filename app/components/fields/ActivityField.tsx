"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function ActivityField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Visit to the local nature reserve",
    "e.g. Science experiment with Bunsen burners",
    "e.g. Year 6 residential trip to Robinwood",
    "e.g. DT lesson using saws and chisels",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Activity or trip</label>
      <div className="relative">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="" className={inputClass} />
        {!value && <PlaceholderOverlay text={placeholder} />}
      </div>
    </div>
  );
}
