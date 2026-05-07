"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const LESSON_LENGTHS = [
  "30 minutes",
  "45 minutes",
  "50 minutes",
  "60 minutes",
  "75 minutes",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function LessonLengthField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Lesson length</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="" disabled>Select length</option>
        {LESSON_LENGTHS.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </div>
  );
}
