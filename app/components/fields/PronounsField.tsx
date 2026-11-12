"use client";

import { useId } from "react";
import type { PupilPronouns } from "@/app/lib/sheets/types";

const OPTIONS: { value: PupilPronouns; label: string }[] = [
  { value: "he", label: "He / him" },
  { value: "she", label: "She / her" },
  { value: "they", label: "They / them" },
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/** How the plan refers to the pupil. Replaces the old gender field: the
 *  plan needs pronouns, not a gender. */
export default function PronounsField({ value, onChange }: { value: PupilPronouns; onChange: (v: PupilPronouns) => void }) {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">Pronouns</label>
      <select id={`${fieldId}-0`} value={value} onChange={(e) => onChange(e.target.value as PupilPronouns)} className={inputClass}>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Under the name: what happens to it, and what to keep out of the boxes. */
export function PupilPrivacyNote({ doc = "plan", optional = false }: { doc?: string; optional?: boolean }) {
  return (
    <p className="text-xs text-gray-500 leading-relaxed" data-testid="pupil-privacy-note">
      {optional ? "The name is optional. " : ""}The name stays on your device and in your saved copy. Jooma writes the {doc} with &ldquo;the pupil&rdquo; in its place and puts the name back on your page.
      Please use a first name only, and keep surnames and other children&rsquo;s names out of the boxes below.
    </p>
  );
}
