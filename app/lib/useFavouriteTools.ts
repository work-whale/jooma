"use client";

// The teacher's starred tools, shared by the Make page and the sidebar.
//
// The source of truth is profiles.favourite_tools, so the same stars show at
// school and at home. The rules (defaults, old pins carried over, removed
// tools dropped) are pure and live in app/lib/favourites.ts.
//
// useSyncExternalStore, like the pin store it replaced, so every consumer
// updates the instant a star changes and the server render never disagrees
// with the first client render (both use the defaults).
//
// A copy of the last list is kept in localStorage purely to paint the right
// stars before the profile arrives. It is never written back to the profile.

import { useSyncExternalStore } from "react";
import { createClient } from "@/app/lib/auth/client";
import { V2_TOOLS } from "@/app/lib/tools";
import { DEFAULT_FAVOURITES, resolveFavourites, toggleFavourite } from "@/app/lib/favourites";

const CACHE_KEY = "jooma:favourite-tools";
/** The old browser-only pins, carried into the account once. */
const LEGACY_PIN_KEY = "jooma:pinned-tools";

const KNOWN = V2_TOOLS.map((t) => t.href);
const DEFAULTS: string[] = resolveFavourites(null, [], KNOWN);

const listeners = new Set<() => void>();
let snapshot: string[] | null = null;
let loading: Promise<void> | null = null;
let userId: string | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSnapshot(next: string[]) {
  snapshot = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the profile still has it */
  }
  emit();
}

function load(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const id = auth.user?.id ?? null;
    if (!id) return;
    userId = id;
    const { data, error } = await supabase.from("profiles").select("favourite_tools").eq("id", id).maybeSingle();
    if (error) return;
    const stored = (data?.favourite_tools ?? null) as unknown;
    const legacy = readJson(LEGACY_PIN_KEY);
    const resolved = resolveFavourites(stored, legacy, KNOWN);
    setSnapshot(resolved);

    // First visit since stars replaced pins, with pins to bring across: save
    // them with the defaults, so they follow the teacher to other devices and
    // the old key can go. With no pins the column stays null, and the
    // defaults stay the defaults.
    if (stored === null && Array.isArray(legacy) && legacy.length > 0) {
      const { error: writeError } = await supabase.from("profiles").update({ favourite_tools: resolved }).eq("id", id);
      if (!writeError) {
        try {
          localStorage.removeItem(LEGACY_PIN_KEY);
        } catch {
          /* ignore */
        }
      }
    }
  })().catch(() => {
    /* offline or signed out: the cached or default stars stay */
  });
  return loading;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  void load();
  return () => listeners.delete(callback);
}

function getSnapshot(): string[] {
  if (snapshot === null) {
    const cached = readJson(CACHE_KEY);
    snapshot = Array.isArray(cached) ? resolveFavourites(cached, [], KNOWN) : DEFAULTS;
  }
  return snapshot;
}

function getServerSnapshot(): string[] {
  return DEFAULTS;
}

/** The starred tool hrefs, in the order they were starred. */
export function useFavouriteTools(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Star or unstar a tool. Shown at once, then saved to the profile; put back
 * if the save fails, so the screen never claims a star the account lacks.
 */
export async function toggleFavouriteTool(href: string): Promise<void> {
  await load();
  const before = getSnapshot();
  const next = toggleFavourite(before, href);
  setSnapshot(next);
  if (!userId) return;
  const { error } = await createClient().from("profiles").update({ favourite_tools: next }).eq("id", userId);
  if (error) setSnapshot(before);
}

/** For tests and sign-out: forget the in-memory copy. */
export function resetFavouriteTools(): void {
  snapshot = null;
  loading = null;
  userId = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export { DEFAULT_FAVOURITES };
