"use client";

import { createContext, useContext } from "react";
import type { GuestAction } from "@/app/lib/guest-actions";

/**
 * The editor, opened by a signed out visitor on /create.
 *
 * They can edit the deck in front of them: text, layout, themes, elements,
 * and photos from the stock and web picture search. Everything else is behind
 * sign up and opens the prompt instead, through `gate`: the Activities, GIFs,
 * Audio and Video tabs, uploading or generating a picture, rewriting text, and
 * anything that takes the deck out of the page (present, export). The sidebar's
 * locked tabs are listed in Sidebar.tsx (GUEST_LOCKED_TABS).
 *
 * A context rather than a prop, because the gated buttons live several
 * components down (the sidebar, the text toolbar, the video panel). Null for a
 * teacher, so every check is `if (guest)` and a teacher's editor is untouched.
 */
export interface EditorGuest {
  /** Opens the sign up prompt in place of something a guest cannot do. Null
   *  for a plain "sign up", with no action to carry out afterwards. */
  gate: (action: GuestAction | null, message?: string | null) => void;
  /** The honeypot's value, sent with the generation request. */
  honeypot: () => string;
  /** The free run was refused before it started: today's tries are used, or
   *  tries are paused. The page goes back to the form behind the prompt. */
  onRefused: (message: string | null) => void;
}

export const EditorGuestContext = createContext<EditorGuest | null>(null);

export function useEditorGuest(): EditorGuest | null {
  return useContext(EditorGuestContext);
}
