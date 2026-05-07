"use client";

const ANSWER_TYPES = [
  { label: "Single correct answer", value: "single" },
  { label: "Multiple correct answers", value: "multiple" },
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AnswerTypeField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Single or multiple choice</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {ANSWER_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
