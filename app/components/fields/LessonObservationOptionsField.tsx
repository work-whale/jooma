"use client";

interface Props {
  includeActionPlan: boolean;
  includeFollowUpSupport: boolean;
  onChangeActionPlan: (v: boolean) => void;
  onChangeFollowUpSupport: (v: boolean) => void;
}

export default function LessonObservationOptionsField({
  includeActionPlan,
  includeFollowUpSupport,
  onChangeActionPlan,
  onChangeFollowUpSupport,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Additional sections</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeActionPlan}
            onChange={(e) => onChangeActionPlan(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include simple action plan
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeFollowUpSupport}
            onChange={(e) => onChangeFollowUpSupport(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Suggest follow-up support
        </label>
      </div>
    </div>
  );
}
