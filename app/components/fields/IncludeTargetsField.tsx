"use client";

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function IncludeTargetsField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Include targets?</label>
      <div className="flex gap-6 pt-2">
        {[true, false].map((val) => (
          <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="includeTargets"
              checked={value === val}
              onChange={() => onChange(val)}
              className="accent-gray-900"
            />
            <span className="text-sm text-gray-700">{val ? "Yes" : "No"}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
