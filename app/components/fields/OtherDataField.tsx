"use client";

import { useId } from "react";

import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "./PlaceholderOverlay";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function OtherDataField({ value, onChange }: Props) {
  const fieldId = useId();
  const placeholder = useTypingPlaceholder([
    "e.g. On SEN support for reading; attendance 78%",
    "e.g. EAL: strong spoken English, written English still developing",
    "e.g. Works best in a small group; finds starting tasks hard",
  ]);
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">
        Other relevant data <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <div className="relative">
        <textarea id={`${fieldId}-0`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=""
          rows={3}
          className={`${inputClass} resize-none`}
        />
        {!value && <PlaceholderOverlay text={placeholder} area />}
      </div>
      <p className="text-xs text-gray-400">Describe needs and scores, never names. Leave out anything the pupil&rsquo;s family would not expect a planning tool to hold.</p>
    </div>
  );
}
