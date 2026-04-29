"use client";

export const QUESTION_TYPES = [
  "Multiple Choice",
  "True/False",
  "Matching",
  "Multiple-Select",
  "Short Answer",
  "Fill in the Blanks",
  "Essay / Open-Ended",
  "Numerical / Computational",
  "Labeling",
  "Ordering / Sequencing",
  "Hotspot / Picture Selection",
  "Closed Questions",
  "Wh- Questions",
  "Word Ordering",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
}

export default function QuestionTypesField({ value, onChange }: Props) {
  const toggle = (type: string) => {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-800">Question types</label>
        <button
          type="button"
          onClick={() => onChange(value.length === QUESTION_TYPES.length ? [] : [...QUESTION_TYPES])}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {value.length === QUESTION_TYPES.length ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUESTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              value.includes(type)
                ? "bg-stone-700 text-white border-stone-700"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {type}
          </button>
        ))}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-red-500">Select at least one question type.</p>
      )}
    </div>
  );
}
