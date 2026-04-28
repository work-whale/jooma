"use client";

const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: "yes" | "no";
  onChange: (v: "yes" | "no") => void;
  text: string;
  onTextChange: (v: string) => void;
  name?: string;
}

export default function ExamSpecField({ value, onChange, text, onTextChange, name = "examSpec" }: Props) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
      <label className="block text-sm font-semibold text-gray-800">Include content from exam specification or other curriculum guidance</label>
      <div className="flex gap-5">
        {(["yes", "no"] as const).map((val) => (
          <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input type="radio" name={name} value={val} checked={value === val} onChange={() => onChange(val)} className="accent-gray-900" />
            {val.charAt(0).toUpperCase() + val.slice(1)}
          </label>
        ))}
      </div>
      {value === "yes" && (
        <textarea value={text} onChange={(e) => onTextChange(e.target.value)} placeholder="Paste relevant exam specification or curriculum guidance here..." rows={4} className={`${inputClass} resize-none mt-2`} />
      )}
    </div>
  );
}
