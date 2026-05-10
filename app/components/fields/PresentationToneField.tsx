"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const TONE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "funny", label: "Funny" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PresentationToneField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Tone</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {TONE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
