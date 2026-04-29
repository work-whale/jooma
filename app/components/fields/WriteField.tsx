"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function WriteField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Write</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Write a non-chronological report about the water cycle for Year 5 students"
        rows={3}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white resize-none"
      />
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}
