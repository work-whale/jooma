"use client";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const DEFAULT_PLACEHOLDERS = [
  "e.g. Link the lesson to Harry Potter and the Chamber of Secrets",
  "e.g. Use Minecraft as a context for the examples",
  "e.g. Reference the school's reading spine where possible",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholders?: string[];
  label?: string;
  rows?: number;
  labelSlot?: React.ReactNode;
}

export default function AdditionalContextField({
  value,
  onChange,
  placeholders = DEFAULT_PLACEHOLDERS,
  label = "Additional context",
  rows,
  labelSlot,
}: Props) {
  const placeholder = useTypingPlaceholder(placeholders);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-800">
          {label} <span className="text-xs font-normal text-gray-400">(optional)</span>
        </label>
        {labelSlot}
      </div>
      <div className="relative">
        {rows ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder=""
            rows={rows}
            className={`${inputClass} resize-none`}
          />
        ) : (
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="" className={inputClass} />
        )}
        {!value && <PlaceholderOverlay text={placeholder} area={!!rows} />}
      </div>
    </div>
  );
}
