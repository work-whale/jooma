"use client";

import { useId } from "react";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/** The usual UK lesson lengths, from a short primary session to a double. */
export const LESSON_MINUTE_OPTIONS = [30, 40, 45, 50, 55, 60, 75, 90, 100, 120];

interface Props {
  value: number;
  onChange: (minutes: number) => void;
}

/**
 * The Lesson Plan's length in minutes: the phases' timings add up to it.
 * (The Cover Lesson form has its own LessonLengthField, which keeps a label
 * such as "60 minutes" rather than a number.)
 */
export default function LessonMinutesField({ value, onChange }: Props) {
  const id = useId();
  // A restored run may hold a length that is not one of the presets.
  const options = LESSON_MINUTE_OPTIONS.includes(value) ? LESSON_MINUTE_OPTIONS : [...LESSON_MINUTE_OPTIONS, value].sort((a, b) => a - b);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800">Lesson length</label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={selectClass}>
        {options.map((m) => (
          <option key={m} value={m}>{m} minutes</option>
        ))}
      </select>
    </div>
  );
}
