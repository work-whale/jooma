"use client";

import { useState } from "react";
import { Plus, Trash2, ClipboardPaste } from "lucide-react";
import { activeSubjects, EFFORT, MAX_PUPILS, newPupil, SCALES, type PupilRow, type ReportSettings } from "@/app/lib/reports/reports";

/*
 * The class: one row per pupil, a column per subject for the attainment
 * judgement, then effort, a note and a next step. Pasting a column of names
 * (straight from the register or a spreadsheet) adds a row for each.
 */

const cell = "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300";

export default function ReportGrid({
  settings,
  pupils,
  onChange,
  disabled = false,
}: {
  settings: ReportSettings;
  pupils: PupilRow[];
  onChange: (pupils: PupilRow[]) => void;
  disabled?: boolean;
}) {
  const subjects = activeSubjects(settings);
  const scale = SCALES[settings.scale].values;
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const set = (id: string, patch: Partial<PupilRow>) => onChange(pupils.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addNames = () => {
    const names = pasted.split(/\r?\n|\t|,/).map((n) => n.trim()).filter(Boolean);
    const room = MAX_PUPILS - pupils.filter((p) => p.name.trim()).length;
    const blanksDropped = pupils.filter((p) => p.name.trim());
    onChange([...blanksDropped, ...names.slice(0, room).map((n) => newPupil(n))]);
    setPasted("");
    setPasting(false);
  };

  return (
    <div className="space-y-3" data-testid="report-grid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">
          Your class <span className="ml-1 text-xs font-normal text-gray-400">{pupils.length} of up to {MAX_PUPILS} pupils</span>
        </p>
        <button type="button" onClick={() => setPasting((v) => !v)} disabled={disabled} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50">
          <ClipboardPaste className="w-3.5 h-3.5" /> Paste names
        </button>
      </div>

      {pasting && (
        <div className="space-y-2 rounded-xl border border-gray-200 p-3 bg-gray-50">
          <label htmlFor="report-paste" className="block text-xs font-semibold text-gray-700">One first name a line, or copied from a spreadsheet column</label>
          <textarea id="report-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} className={cell} placeholder={"Amira\nBen\nChloe"} />
          <button type="button" onClick={addNames} disabled={!pasted.trim()} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-(--j-purple) text-white disabled:opacity-50 cursor-pointer">Add these pupils</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>
              <th className="px-2 py-2 min-w-32">First name</th>
              <th className="px-2 py-2 min-w-24">Pronouns</th>
              {subjects.map((s) => <th key={s} className="px-2 py-2 min-w-36">{s}</th>)}
              <th className="px-2 py-2 min-w-36">Effort</th>
              <th className="px-2 py-2 min-w-56">Note (what to mention)</th>
              {settings.nextSteps && <th className="px-2 py-2 min-w-48">Next step (optional)</th>}
              <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {pupils.map((p, i) => (
              <tr key={p.id} className="border-t border-gray-100 align-top">
                <td className="px-2 py-2">
                  <input value={p.name} onChange={(e) => set(p.id, { name: e.target.value })} disabled={disabled} className={cell} aria-label={`Pupil ${i + 1} first name`} placeholder="First name" />
                </td>
                <td className="px-2 py-2">
                  <select value={p.pronouns} onChange={(e) => set(p.id, { pronouns: e.target.value as PupilRow["pronouns"] })} disabled={disabled} className={cell} aria-label={`Pupil ${i + 1} pronouns`}>
                    <option value="she">she/her</option>
                    <option value="he">he/him</option>
                    <option value="they">they/them</option>
                  </select>
                </td>
                {subjects.map((s) => (
                  <td key={s} className="px-2 py-2">
                    <select value={p.attainment[s] ?? ""} onChange={(e) => set(p.id, { attainment: { ...p.attainment, [s]: e.target.value } })} disabled={disabled} className={cell} aria-label={`Pupil ${i + 1} ${s}`}>
                      <option value="">Not judged</option>
                      {scale.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                ))}
                <td className="px-2 py-2">
                  <select value={p.effort} onChange={(e) => set(p.id, { effort: e.target.value })} disabled={disabled} className={cell} aria-label={`Pupil ${i + 1} effort`}>
                    <option value="">Not judged</option>
                    {EFFORT.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <textarea value={p.note} onChange={(e) => set(p.id, { note: e.target.value })} disabled={disabled} rows={2} className={cell} aria-label={`Pupil ${i + 1} note`} placeholder="Strengths, progress, anything to mention" />
                </td>
                {settings.nextSteps && (
                  <td className="px-2 py-2">
                    <textarea value={p.nextStep} onChange={(e) => set(p.id, { nextStep: e.target.value })} disabled={disabled} rows={2} className={cell} aria-label={`Pupil ${i + 1} next step`} placeholder="Leave blank to suggest one" />
                  </td>
                )}
                <td className="px-2 py-2">
                  {pupils.length > 1 && (
                    <button type="button" onClick={() => onChange(pupils.filter((x) => x.id !== p.id))} disabled={disabled} aria-label={`Remove pupil ${i + 1}`} className="mt-1.5 text-gray-400 hover:text-red-500 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pupils.length < MAX_PUPILS && (
        <button type="button" onClick={() => onChange([...pupils, newPupil()])} disabled={disabled} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 cursor-pointer disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add a pupil
        </button>
      )}
    </div>
  );
}
