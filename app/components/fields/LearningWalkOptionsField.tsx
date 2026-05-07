"use client";

interface Props {
  includeRecommendations: boolean;
  includeNextSteps: boolean;
  onChangeRecommendations: (v: boolean) => void;
  onChangeNextSteps: (v: boolean) => void;
}

export default function LearningWalkOptionsField({
  includeRecommendations,
  includeNextSteps,
  onChangeRecommendations,
  onChangeNextSteps,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800">Additional options</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeRecommendations}
            onChange={(e) => onChangeRecommendations(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Suggest professional recommendations
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeNextSteps}
            onChange={(e) => onChangeNextSteps(e.target.checked)}
            className="accent-gray-900 w-4 h-4"
          />
          Include next steps and timeline
        </label>
      </div>
    </div>
  );
}
