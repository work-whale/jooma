"use client";

interface Props {
  includeIcebreaker: boolean;
  includeActionItems: boolean;
  onChangeIcebreaker: (v: boolean) => void;
  onChangeActionItems: (v: boolean) => void;
}

export default function MeetingOptionsField({
  includeIcebreaker,
  includeActionItems,
  onChangeIcebreaker,
  onChangeActionItems,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Additional options</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeIcebreaker}
            onChange={(e) => onChangeIcebreaker(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include icebreaker activity
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeActionItems}
            onChange={(e) => onChangeActionItems(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include action items section
        </label>
      </div>
    </div>
  );
}
