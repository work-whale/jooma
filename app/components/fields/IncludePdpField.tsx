"use client";

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function IncludePdpField({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Additional sections</label>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-gray-900 w-4 h-4"
        />
        Include professional development plan
      </label>
    </div>
  );
}
