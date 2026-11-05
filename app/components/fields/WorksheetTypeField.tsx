"use client";

import { useState } from "react";
import {
  Backpack,
  BookMarked,
  Check,
  DoorOpen,
  Flag,
  Layers,
  Link2,
  ListChecks,
  MessageSquareQuote,
  ScrollText,
  TextCursorInput,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  TEMPLATE_GROUPS,
  WORKSHEET_TEMPLATES,
  type WorksheetTemplate,
  type WorksheetTemplateGroup,
} from "@/app/lib/sheets/worksheet-templates";

const ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  zap: Zap,
  door: DoorOpen,
  "list-checks": ListChecks,
  scroll: ScrollText,
  flag: Flag,
  backpack: Backpack,
  "text-cursor": TextCursorInput,
  timer: Timer,
  link: Link2,
  bookmark: BookMarked,
  quote: MessageSquareQuote,
};

interface Props {
  value: string;
  /** Called with the whole type, so the form can apply its question presets. */
  onChange: (template: WorksheetTemplate) => void;
}

/**
 * "Worksheet type" on the Worksheet form: the shape the sheet takes (a lesson
 * starter, an exam paper, a fluency drill). Picking one also ticks the
 * question types and sets the count that suit it; both stay editable below.
 */
export default function WorksheetTypeField({ value, onChange }: Props) {
  const [group, setGroup] = useState<WorksheetTemplateGroup | "all">("all");
  const shown = group === "all" ? WORKSHEET_TEMPLATES : WORKSHEET_TEMPLATES.filter((t) => t.group === group);

  return (
    <div className="space-y-3" data-testid="worksheet-type-field">
      <div>
        <p id="worksheet-type-label" className="text-sm font-semibold text-gray-800">Worksheet type</p>
        <p className="text-xs text-gray-500">Sets how the sheet is laid out and suggests question types to match.</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter worksheet types">
        {[{ id: "all" as const, label: "All" }, ...TEMPLATE_GROUPS].map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            aria-pressed={group === g.id}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
              group === g.id ? "bg-stone-700 text-white border-stone-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-labelledby="worksheet-type-label" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {shown.map((t) => {
          const Icon = ICONS[t.icon] ?? Layers;
          const on = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-template={t.id}
              onClick={() => onChange(t)}
              className="relative flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors hover:bg-gray-50 cursor-pointer"
              style={{
                borderColor: on ? "var(--j-purple)" : "var(--j-line)",
                backgroundColor: on ? "var(--j-tint)" : "#fff",
              }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: on ? "var(--j-purple)" : "var(--j-tint)", color: on ? "#fff" : "var(--j-purple)" }}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 pr-4">
                <span className="block text-sm font-semibold text-gray-900 leading-tight">{t.name}</span>
                <span className="block text-xs text-gray-500 leading-snug mt-0.5">{t.blurb}</span>
                <span className="block text-[11px] font-medium text-gray-400 mt-1">{t.minutes}</span>
              </span>
              {on && (
                <Check className="w-4 h-4 absolute top-3 right-3" style={{ color: "var(--j-purple)" }} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
