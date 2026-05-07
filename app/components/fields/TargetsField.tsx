"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function TargetsField({ value, onChange }: Props) {
  const placeholder = useTypingPlaceholder([
    "e.g. Improve reading fluency, complete independent tasks without prompting",
    "e.g. Manage transitions calmly, develop self-regulation strategies",
    "e.g. Increase participation in group work and class discussions",
    "e.g. Apply number facts accurately and show working in written tasks",
  ]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Targets</label>
      <div className="relative">
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="" rows={5} className={`${inputClass} resize-none`} />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
