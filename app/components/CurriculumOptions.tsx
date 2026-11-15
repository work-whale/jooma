"use client";

import { getCurriculum, pickerGroups } from "@/app/lib/curricula";
import { useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";

/**
 * The <option>s for a Curriculum <select>: every curriculum this teacher is
 * offered, grouped by region once there is more than one region (so a UK-only
 * teacher sees exactly the five options they always have). A value that is no
 * longer offered, such as a restored run from a region since switched off, is
 * kept as an option so the select never silently shows blank.
 */
export default function CurriculumOptions({ value }: { value: string }) {
  const { offered } = useTeacherCurriculum();
  const groups = pickerGroups(offered);
  const known = getCurriculum(value);
  const missing = value && !offered.some((c) => c.promptLabel === value) ? (known?.promptLabel ?? value) : null;

  const option = (label: string, name: string) => (
    <option key={label} value={label}>
      {name}
    </option>
  );
  // The UK five keep the wording the dropdown has always shown.
  const shown = (c: { region: string; promptLabel: string; name: string }) => (c.region === "uk" ? c.promptLabel : c.name);

  return (
    <>
      <option value="" disabled>
        Select curriculum
      </option>
      {groups.length === 1
        ? groups[0].curricula.map((c) => option(c.promptLabel, shown(c)))
        : groups.map((g) => (
            <optgroup key={g.region} label={g.label}>
              {g.curricula.map((c) => option(c.promptLabel, shown(c)))}
            </optgroup>
          ))}
      {missing && option(missing, known ? shown(known) : missing)}
    </>
  );
}
