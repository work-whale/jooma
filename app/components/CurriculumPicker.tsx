"use client";

import { useId, useMemo, useState } from "react";

import { getCurriculum, pickerGroups, type Curriculum, type RegionId } from "@/app/lib/curricula";

/** What the second select is called, by region. */
const SECOND_LABEL: Partial<Record<RegionId, string>> = {
  usa: "State",
  canada: "Province or territory",
  "australia-nz": "State or country",
  international: "Programme",
};

/**
 * Choose a school system: where you teach, then which curriculum. With only one
 * region on offer (the UK, until other regions are switched on) it is a single
 * select of the five UK curricula, as before.
 *
 * Works in ids. The value is always one of `offered`, or "" for none yet.
 */
export default function CurriculumPicker({
  value,
  onChange,
  offered,
  selectClassName,
  labelClassName = "block text-sm font-semibold mb-1.5",
}: {
  value: string;
  onChange: (id: string) => void;
  offered: readonly Curriculum[];
  selectClassName: string;
  labelClassName?: string;
}) {
  const fieldId = useId();
  const groups = useMemo(() => pickerGroups(offered), [offered]);
  const current = getCurriculum(value);
  const [regionChoice, setRegionChoice] = useState<RegionId | "">("");
  const region = regionChoice || current?.region || "";
  const inRegion = groups.find((g) => g.region === region)?.curricula ?? [];
  const name = (c: Curriculum) => c.place && c.region !== "uk" && c.region !== "british-isles" ? `${c.place}: ${c.name}` : c.name;

  if (groups.length <= 1) {
    return (
      <div>
        <label htmlFor={`${fieldId}-c`} className={labelClassName}>
          Curriculum
        </label>
        <select id={`${fieldId}-c`} value={value} onChange={(e) => onChange(e.target.value)} className={selectClassName} data-testid="curriculum-picker">
          <option value="" disabled>
            Select curriculum
          </option>
          {offered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    // Stacked, not side by side: region names ("Channel Islands, Isle of Man
    // and Gibraltar") and state curricula are too long for half a column.
    <div className="grid gap-4">
      <div>
        <label htmlFor={`${fieldId}-r`} className={labelClassName}>
          Where you teach
        </label>
        <select
          id={`${fieldId}-r`}
          value={region}
          onChange={(e) => {
            const next = e.target.value as RegionId;
            setRegionChoice(next);
            const only = groups.find((g) => g.region === next)?.curricula;
            // A region with one curriculum needs no second choice.
            if (only?.length === 1) onChange(only[0].id);
            else if (current?.region !== next) onChange("");
          }}
          className={selectClassName}
          data-testid="curriculum-region"
        >
          <option value="" disabled>
            Select where you teach
          </option>
          {groups.map((g) => (
            <option key={g.region} value={g.region}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-c`} className={labelClassName}>
          {SECOND_LABEL[region as RegionId] ?? "Curriculum"}
        </label>
        <select
          id={`${fieldId}-c`}
          value={inRegion.some((c) => c.id === value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={!region}
          className={`${selectClassName} disabled:opacity-50`}
          data-testid="curriculum-picker"
        >
          <option value="" disabled>
            Select curriculum
          </option>
          {inRegion.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
