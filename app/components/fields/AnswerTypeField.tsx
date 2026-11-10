"use client";

import { useId } from "react";

// The Quiz's question types (app/lib/quiz/quiz.ts QuizAnswerType).
const ANSWER_TYPES = [
  { label: "Multiple choice, one right answer", value: "single" },
  { label: "Multiple choice, more than one right answer", value: "multiple" },
  { label: "True or false", value: "truefalse" },
  { label: "A mix of all three", value: "mixed" },
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AnswerTypeField({ value, onChange }: Props) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">Question type</label>
      <select id={`${fieldId}-0`} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {ANSWER_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
