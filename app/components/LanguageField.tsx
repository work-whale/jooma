"use client";

import { useId } from "react";

import { DEFAULT_LANGUAGE, LANGUAGES, parseLanguage } from "@/app/lib/languages";
import { useLocalStorage } from "@/app/lib/useLocalStorage";

/*
 * The output language of a generation: the "Language" dropdown on every tool
 * form, and the value Jo, voice and Live mode send with their requests.
 *
 * One choice for the whole app, remembered in the browser under ll:language,
 * the same way Curriculum is remembered (ll:curriculum). No profile column: a
 * teacher switching between a French and an English worksheet just changes it.
 * UK English is the default and sends nothing new to the model.
 */

export const LANGUAGE_STORAGE_KEY = "ll:language";

/** The form's language, persisted. Anything stored that is no longer a known
 *  code reads as UK English. */
export function useGenerationLanguage() {
  const [stored, setStored] = useLocalStorage<string>(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE);
  return [parseLanguage(stored), (code: string) => setStored(parseLanguage(code))] as const;
}

/** The current choice, read once, for code that sends a request without
 *  rendering the dropdown (Jo, voice, Live). UK English when unset. */
export function readGenerationLanguage(): string {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return parseLanguage(raw === null ? null : JSON.parse(raw));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Overrides the select's classes, for forms with their own field style. */
  className?: string;
}

export default function LanguageField({ value, onChange, className }: Props) {
  const id = useId();
  return (
    <div className="space-y-1.5" data-testid="language-field">
      <label htmlFor={id} className="block text-sm font-semibold text-gray-800 mb-1.5">
        Language
      </label>
      <select
        id={id}
        name="language"
        value={parseLanguage(value)}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? selectClass}
        // The stored choice is read on the client only, so the server renders
        // the default and the first client render may differ. Expected.
        suppressHydrationWarning
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
