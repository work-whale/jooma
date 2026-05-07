"use client";

const selectClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const RESOURCES = [
  "No resources needed (verbal / discussion only)",
  "Basic stationery only (pen and paper)",
  "Printed worksheets provided",
  "Computers or tablets available",
  "Whiteboard / projector only",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function CoverResourcesField({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">Resources available</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="" disabled>Select resources</option>
        {RESOURCES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}
