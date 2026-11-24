"use client";

import { useCallback, useId, useState } from "react";

import CurriculumOptions from "@/app/components/CurriculumOptions";
import { getCurriculum, yearIfOffered, yearsFor } from "@/app/lib/curricula";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import { useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";

/**
 * A form's curriculum: the teacher's own (from their profile) unless they pick
 * another for this run. Picking one here changes this form only; the default
 * is changed on the profile page. A cleared value falls back to the default,
 * so a prefill that clears every field still leaves a curriculum set.
 */
export function useFormCurriculum() {
  const teacher = useTeacherCurriculum();
  const [chosen, setChosen] = useState("");
  // An old saved label that means a known curriculum is shown as that
  // curriculum's current label, so the select matches an option.
  const setCurriculum = useCallback((v: string) => setChosen(getCurriculum(v)?.promptLabel ?? v), []);
  const curriculum = chosen || (teacher.loaded ? teacher.curriculum.promptLabel : "");
  return [curriculum, setCurriculum] as const;
}

// Call this in the parent form to get curriculum + yearGroup. The year group is
// remembered in the browser across tools, and shown only when it is one of the
// chosen curriculum's years ("Year 4" means nothing to a Grade 3 teacher).
export function useCurriculumYear() {
  const [curriculum, setCurriculum] = useFormCurriculum();
  const [storedYear, setYearGroup] = useLocalStorage("ll:yearGroup", "");
  const yearGroup = yearIfOffered(curriculum, storedYear);
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
          <CurriculumOptions value={curriculum} />
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
          {yearsFor(curriculum).map((y) => <option key={y.label} value={y.label}>{y.label}</option>)}
        </select>
        {yearGroupNote && !mixed && (
          <p className="text-xs text-gray-400">Please note that the year group selected will affect the output.</p>
        )}
      </div>
    </div>
  );
}
