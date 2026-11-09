"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LANGUAGE } from "@/app/lib/languages";

/*
 * The language of the deck open in the editor, from its saved generation
 * params. The editor's own AI calls (activities, audio, rewriting a text box)
 * send this, so additions match the deck rather than whatever language the
 * teacher last picked on a form. Decks from before languages existed have no
 * language saved and are UK English.
 */
export const EditorLanguageContext = createContext<string>(DEFAULT_LANGUAGE);

export function useEditorLanguage(): string {
  return useContext(EditorLanguageContext);
}
