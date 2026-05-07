"use client";

export const QUESTION_TYPES = [
  "Multiple Choice",
  "True/False",
  "Matching",
  "Multiple-Select",
  "Short Answer",
  "Fill in the Blanks",
  "Essay / Open-Ended",
  "Numerical / Computational",
  "Labeling",
  "Ordering / Sequencing",
  "Hotspot / Picture Selection",
  "Closed Questions",
  "Wh- Questions",
  "Word Ordering",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  optional?: boolean;
  showCounts?: boolean;
  counts?: Record<string, number>;
  onCountChange?: (counts: Record<string, number>) => void;
}

export default function QuestionTypesField({
  value,
  onChange,
  optional = false,
  showCounts = false,
  counts = {},
  onCountChange,
}: Props) {
  const toggle = (type: string) => {
    if (value.includes(type)) {
      onChange(value.filter((t) => t !== type));
      if (onCountChange) {
        const next = { ...counts };
        delete next[type];
        onCountChange(next);
      }
    } else {
      onChange([...value, type]);
      if (onCountChange && counts[type] === undefined) {
        onCountChange({ ...counts, [type]: 1 });
      }
    }
  };

  const setCount = (type: string, n: number) => {
    if (onCountChange) onCountChange({ ...counts, [type]: Math.max(1, n) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-800">
          Question types {optional && <span className="font-normal text-gray-400">(optional)</span>}
        </label>
        <button
          type="button"
          onClick={() => {
            if (value.length === QUESTION_TYPES.length) {
              onChange([]);
              if (onCountChange) onCountChange({});
            } else {
              const all = [...QUESTION_TYPES];
              onChange(all);
              if (onCountChange) {
                const next: Record<string, number> = {};
                all.forEach((t) => { next[t] = counts[t] ?? 1; });
                onCountChange(next);
              }
            }
          }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {value.length === QUESTION_TYPES.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUESTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              value.includes(type)
                ? "bg-stone-700 text-white border-stone-700"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {value.length === 0 && !optional && (
        <p className="text-xs text-red-500">Select at least one question type.</p>
      )}

      {showCounts && value.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden mt-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Question type</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600 w-36">How many</th>
              </tr>
            </thead>
            <tbody>
              {value.map((type, i) => (
                <tr key={type} className={i < value.length - 1 ? "border-b border-gray-100" : ""}>
                  <td className="px-4 py-2.5 text-gray-800">{type}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCount(type, (counts[type] ?? 1) - 1)}
                        disabled={(counts[type] ?? 1) <= 1}
                        className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-base flex items-center justify-center hover:bg-white disabled:opacity-40 disabled:cursor-default transition-colors"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={counts[type] ?? 1}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!isNaN(n)) setCount(type, n);
                        }}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setCount(type, isNaN(n) || n < 1 ? 1 : n);
                        }}
                        className="w-10 text-center text-sm font-semibold text-gray-900 border border-gray-200 rounded-lg py-1 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => setCount(type, (counts[type] ?? 1) + 1)}
                        className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-base flex items-center justify-center hover:bg-white transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
