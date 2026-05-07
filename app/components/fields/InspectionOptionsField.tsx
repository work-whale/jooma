"use client";

interface Props {
  includeEvidence: boolean;
  includeSuccessCriteria: boolean;
  includePolicyChanges: boolean;
  onChangeEvidence: (v: boolean) => void;
  onChangeSuccessCriteria: (v: boolean) => void;
  onChangePolicyChanges: (v: boolean) => void;
}

export default function InspectionOptionsField({
  includeEvidence,
  includeSuccessCriteria,
  includePolicyChanges,
  onChangeEvidence,
  onChangeSuccessCriteria,
  onChangePolicyChanges,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Additional sections</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeEvidence}
            onChange={(e) => onChangeEvidence(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include evidence examples
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeSuccessCriteria}
            onChange={(e) => onChangeSuccessCriteria(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include success criteria
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includePolicyChanges}
            onChange={(e) => onChangePolicyChanges(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include recent policy changes
        </label>
      </div>
    </div>
  );
}
