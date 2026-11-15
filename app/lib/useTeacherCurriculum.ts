"use client";

/*
 * The teacher's curriculum: the default every tool form starts from.
 *
 * Lives on the profile (profiles.curriculum_id) so it follows the teacher
 * across devices. Loaded once per tab and shared through a tiny external store,
 * the same shape as useProfileIdentity, so every form on the page agrees and
 * the profile page's change reaches an open form at once.
 *
 * A teacher with nothing saved yet gets one inferred (what their browser last
 * picked in a form, else their profile country, else England), saved to the
 * profile UNCONFIRMED; CurriculumBanner then asks them once to confirm it.
 *
 * Every failure, including the column not existing yet, degrades to what the
 * app did before: England, with the five UK curricula on offer.
 */

import { useEffect, useSyncExternalStore } from "react";

import { createClient } from "@/app/lib/auth/client";
import {
  getCurriculum,
  inferCurriculum,
  languageAfterChoosing,
  parseCurriculum,
  regionsFromSettings,
  visibleCurricula,
  type Curriculum,
  type RegionId,
} from "@/app/lib/curricula";

export interface TeacherCurriculum {
  /** False until the profile and switches have been read (or failed to be). */
  loaded: boolean;
  /** Always a known id. */
  id: string;
  curriculum: Curriculum;
  /** True once the teacher picked or confirmed it themselves. */
  confirmed: boolean;
  /** What the picker may offer this teacher. */
  offered: Curriculum[];
  regionsOn: RegionId[];
  isAdmin: boolean;
}

const LANGUAGE_KEY = "ll:language";
const LEGACY_CURRICULUM_KEY = "ll:curriculum";

function initial(): TeacherCurriculum {
  return {
    loaded: false,
    id: "england",
    curriculum: getCurriculum("england")!,
    confirmed: true,
    offered: visibleCurricula([], false),
    regionsOn: [],
    isAdmin: false,
  };
}

let snapshot: TeacherCurriculum = initial();
let loading: Promise<void> | null = null;
let userId: string | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<TeacherCurriculum>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savedLegacyLabel(): string | null {
  const raw = readLocal(LEGACY_CURRICULUM_KEY);
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

async function load(): Promise<void> {
  const supabase = createClient();
  try {
    const [{ data: auth }, settings] = await Promise.all([supabase.auth.getUser(), supabase.rpc("public_settings")]);
    const regionsOn = regionsFromSettings(settings.error ? [] : settings.data);
    const user = auth.user;
    if (!user) {
      publish({ loaded: true, regionsOn, offered: visibleCurricula(regionsOn, false) });
      return;
    }
    userId = user.id;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("curriculum_id, curriculum_confirmed_at, country, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    // Before the migration is pushed the column does not exist: read what we
    // can and carry on without saving anything.
    let row = profile as { curriculum_id?: string | null; curriculum_confirmed_at?: string | null; country?: string | null; is_admin?: boolean } | null;
    let canSave = !error;
    if (error) {
      const fallback = await supabase.from("profiles").select("country, is_admin").eq("id", user.id).maybeSingle();
      row = (fallback.data as typeof row) ?? null;
      canSave = false;
    }

    const isAdmin = row?.is_admin === true;
    const offered = visibleCurricula(regionsOn, isAdmin);
    const saved = parseCurriculum(row?.curriculum_id);

    if (saved && offered.some((c) => c.id === saved)) {
      publish({ loaded: true, id: saved, curriculum: getCurriculum(saved)!, confirmed: Boolean(row?.curriculum_confirmed_at), offered, regionsOn, isAdmin });
      return;
    }

    const inferred = inferCurriculum({ savedLabel: savedLegacyLabel(), country: row?.country }, offered);
    // Save only into an empty column: a saved curriculum whose region has since
    // been switched off is the teacher's real choice and must survive.
    // `.is(null)` in the write too, not just the read above: this load can
    // land after the teacher has already chosen (complete-profile submits
    // while it is in flight), and must never overwrite that choice.
    if (canSave && !row?.curriculum_id) {
      await supabase.from("profiles").update({ curriculum_id: inferred }).eq("id", user.id).is("curriculum_id", null);
    }
    // Unconfirmed only when it could be saved: with no column to save into,
    // asking the teacher to confirm would ask again on every page.
    publish({ loaded: true, id: inferred, curriculum: getCurriculum(inferred)!, confirmed: !canSave, offered, regionsOn, isAdmin });
  } catch {
    publish({ loaded: true });
  }
}

function ensureLoaded() {
  if (!loading && typeof window !== "undefined") loading = load();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureLoaded();
  return () => {
    listeners.delete(cb);
  };
}

const getServerSnapshot = () => SERVER;
const SERVER = initial();

export function useTeacherCurriculum(): TeacherCurriculum {
  const state = useSyncExternalStore(subscribe, () => snapshot, getServerSnapshot);
  useEffect(ensureLoaded, []);
  return state;
}

/** The teacher picked or confirmed a curriculum: save it, confirmed. Also
 *  switches the output language to the curriculum's own if they never chose
 *  one. Returns false if the save failed. */
export async function chooseCurriculum(id: string): Promise<boolean> {
  const entry = getCurriculum(id);
  if (!entry || !userId) return false;
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ curriculum_id: entry.id, curriculum_confirmed_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return false;

  const language = languageAfterChoosing(entry.id, readLocal(LANGUAGE_KEY));
  if (language) {
    try {
      localStorage.setItem(LANGUAGE_KEY, JSON.stringify(language));
    } catch {
      // Storage blocked: the teacher can still pick the language by hand.
    }
  }
  publish({ id: entry.id, curriculum: entry, confirmed: true });
  return true;
}

/** Test seam and sign-out: forget the loaded value. */
export function resetTeacherCurriculum() {
  snapshot = initial();
  loading = null;
  userId = null;
  listeners.forEach((l) => l());
}
