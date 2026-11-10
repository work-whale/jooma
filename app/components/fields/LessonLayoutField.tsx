"use client";

import { Check, LayoutList, Repeat } from "lucide-react";
import { LESSON_LAYOUTS } from "@/app/lib/sheets/lesson";
import type { LessonLayout } from "@/app/lib/sheets/types";

const ICONS: Record<LessonLayout, typeof LayoutList> = { "three-part": LayoutList, cycles: Repeat };

interface Props {
  value: LessonLayout;
  onChange: (layout: LessonLayout) => void;
}

/**
 * "Lesson layout" on the Lesson Plan form. Both layouts are the same plan
 * arranged differently, so it can also be switched afterwards in Design.
 */
export default function LessonLayoutField({ value, onChange }: Props) {
  return (
    <div className="space-y-3" data-testid="lesson-layout-field">
      <div>
        <p id="lesson-layout-label" className="text-sm font-semibold text-gray-800">Lesson layout</p>
        <p className="text-xs text-gray-500">How the plan is set out. You can switch it later in Design.</p>
      </div>
      <div role="radiogroup" aria-labelledby="lesson-layout-label" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LESSON_LAYOUTS.map((l) => {
          const Icon = ICONS[l.id];
          const on = l.id === value;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-layout={l.id}
              onClick={() => onChange(l.id)}
              className="relative flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors hover:bg-gray-50 cursor-pointer"
              style={{ borderColor: on ? "var(--j-purple)" : "var(--j-line)", backgroundColor: on ? "var(--j-tint)" : "#fff" }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: on ? "var(--j-purple)" : "var(--j-tint)", color: on ? "#fff" : "var(--j-purple)" }}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 pr-4">
                <span className="block text-sm font-semibold text-gray-900 leading-tight">{l.label}</span>
                <span className="block text-xs text-gray-500 leading-snug mt-0.5">{l.description}</span>
              </span>
              {on && <Check className="w-4 h-4 absolute top-3 right-3" style={{ color: "var(--j-purple)" }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
