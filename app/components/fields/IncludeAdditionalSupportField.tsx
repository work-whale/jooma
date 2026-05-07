"use client";

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function IncludeAdditionalSupportField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Include additional support suggestions</label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-gray-900 w-4 h-4"
        />
        <span className="text-sm text-gray-700">Add evidence-based strategies alongside student-led input</span>
      </label>
    </div>
  );
}
