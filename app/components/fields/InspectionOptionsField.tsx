"use client";

interface Props {
  includeEvidence: boolean;
  includeSuccessCriteria: boolean;
  onChangeEvidence: (v: boolean) => void;
  onChangeSuccessCriteria: (v: boolean) => void;
  /** Ofsted only: early years and post-16 are inspected where a school has them. */
  showProvision: boolean;
  earlyYears: boolean;
  postSixteen: boolean;
  onChangeEarlyYears: (v: boolean) => void;
  onChangePostSixteen: (v: boolean) => void;
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-gray-900 w-4 h-4" />
      {children}
    </label>
  );
}

export default function InspectionOptionsField(p: Props) {
  return (
    <div className="space-y-4">
      {p.showProvision && (
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-gray-800">Our school has</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Check checked={p.earlyYears} onChange={p.onChangeEarlyYears}>Early years (nursery or reception)</Check>
            <Check checked={p.postSixteen} onChange={p.onChangePostSixteen}>A sixth form or other post-16</Check>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <span className="block text-sm font-semibold text-gray-800">Additional sections</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Check checked={p.includeEvidence} onChange={p.onChangeEvidence}>Include evidence examples</Check>
          <Check checked={p.includeSuccessCriteria} onChange={p.onChangeSuccessCriteria}>Include success criteria</Check>
        </div>
      </div>
    </div>
  );
}
