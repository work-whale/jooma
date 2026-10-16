"use client";

import { useId } from "react";

import { CURRICULA, YEAR_GROUPS } from "@/app/lib/formOptions";
import { useLocalStorage } from "@/app/lib/useLocalStorage";

// Call this in the parent form to get curriculum + yearGroup with persistence
export function useCurriculumYear() {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [yearGroup, setYearGroup] = useLocalStorage("ll:yearGroup", "");
  return { curriculum, setCurriculum, yearGroup, setYearGroup };
}

interface Props {
  curriculum: string;
  onCurriculumChange: (v: string) => void;
  yearGroup: string;
  onYearGroupChange: (v: string) => void;
  mixed: boolean;
  onMixedChange: (v: boolean) => void;
  yearGroupNote?: boolean;
}

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function CurriculumYearFields({
  curriculum,
  onCurriculumChange,
  yearGroup,
  onYearGroupChange,
  mixed,
  onMixedChange,
  yearGroupNote = false,
}: Props) {
  const fieldId = useId();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="space-y-1.5">
        <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800 mb-1.5">Curriculum</label>
        <select id={`${fieldId}-0`} value={curriculum} onChange={(e) => onCurriculumChange(e.target.value)} className={selectClass}>
          <option value="" disabled>Select curriculum</option>
          {CURRICULA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={`${fieldId}-1`} className="text-sm font-semibold text-gray-800">Year group</label>
          <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600">
            <input type="checkbox" checked={mixed} onChange={(e) => onMixedChange(e.target.checked)} className="rounded accent-gray-900" />
            Mixed
          </label>
        </div>
        <select id={`${fieldId}-1`} value={yearGroup} onChange={(e) => onYearGroupChange(e.target.value)} disabled={mixed} className={`${selectClass} disabled:opacity-50 disabled:cursor-not-allowed`}>
          <option value="" disabled>Select year group</option>
          {YEAR_GROUPS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {yearGroupNote && !mixed && (
          <p className="text-xs text-gray-400">Please note that the year group selected will affect the output.</p>
        )}
      </div>
    </div>
  );
}
