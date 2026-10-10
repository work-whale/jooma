"use client";

import { DIFFERENTIATION_BANDS, type Differentiate } from "@/app/lib/differentiation";

interface Props {
  value: Differentiate;
  onChange: (v: Differentiate) => void;
  levels: string[];
  onLevelsChange: (v: string[]) => void;
  /** Radio-group name. Only needs overriding if two instances share a page. */
  name?: string;
}

/**
 * Opt-in differentiation: a Yes/No radio that reveals the four attainment
 * bands, of which the teacher may pick any combination.
 *
 * The conditional lives inside the component (as in ExamSpecField) so the 13
 * parent forms never have to express it.
 */
export default function DifferentiationField({
  value,
  onChange,
  levels,
  onLevelsChange,
  name = "differentiate",
}: Props) {
  const toggle = (band: string) => {
    if (levels.includes(band)) onLevelsChange(levels.filter((b) => b !== band));
    else onLevelsChange([...levels, band]);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
      <label className="block text-sm font-semibold text-gray-800">
        Include differentiation
      </label>

      <div className="flex gap-5">
        {(["yes", "no"] as const).map((val) => (
          <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="radio"
              name={name}
              value={val}
              checked={value === val}
              onChange={() => {
                onChange(val);
                // EXS is the standard version, so switching on starts with it:
                // the standard sheet is made unless the teacher unticks it.
                if (val === "yes" && levels.length === 0) onLevelsChange(["EXS"]);
              }}
              className="accent-gray-900"
            />
            {val.charAt(0).toUpperCase() + val.slice(1)}
          </label>
        ))}
      </div>

      {value === "yes" && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-gray-500">
            Select the attainment bands to adapt for, as many as apply. EXS is the standard version.
          </p>

          <div className="flex flex-wrap gap-3">
            {DIFFERENTIATION_BANDS.map(({ value: band, label, detail }) => {
              const selected = levels.includes(band);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => toggle(band)}
                  aria-pressed={selected}
                  className={`flex-1 min-w-[8rem] flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    selected
                      ? "bg-stone-700 text-white border-stone-700"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-sm font-semibold">{label}</span>
                  <span className={`text-xs mt-0.5 ${selected ? "text-gray-300" : "text-gray-400"}`}>
                    {detail}
                  </span>
                </button>
              );
            })}
          </div>

          {levels.length === 0 && (
            <p className="text-xs text-red-500">Select at least one band.</p>
          )}
        </div>
      )}
    </div>
  );
}
