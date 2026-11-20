"use client";

// Shared store for the bits of the teacher's profile that the chrome renders:
// their display name and their avatar.
//
// This exists because TopBar and the profile form are siblings, not
// parent/child. When the form saves a new photo it can't hand it up, and
// router.refresh() does NOT help: that re-renders SERVER components, while
// TopBar is a client component whose state survives the refresh. Its fetch
// effect is keyed on pathname, which doesn't change when you save on the page
// you're already on — so the bar kept the old photo until the teacher navigated.
//
// Same shape as useFavouriteTools: useSyncExternalStore so reads are SSR-safe (no
// hydration mismatch, no setState-in-effect) and every consumer updates the
// instant the value changes.
//
// In memory rather than localStorage, unlike the favourites cache: the profiles row is the
// source of truth here, this is only a live cache of it for the current tab, and
// persisting it would mean a stale photo could outlive a sign-out.

import { useSyncExternalStore } from "react";

export interface ProfileIdentity {
  name: string;
  avatarUrl: string | null;
}

const EMPTY: ProfileIdentity = { name: "", avatarUrl: null };

// The snapshot must be referentially stable when nothing changed, or
// useSyncExternalStore re-renders forever. Every write below replaces this
// object exactly once.
let snapshot: ProfileIdentity | null = null;

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): ProfileIdentity | null {
  return snapshot;
}

function getServerSnapshot(): ProfileIdentity | null {
  return null;
}

/**
 * The current name/avatar, or null when nothing has been loaded yet.
 *
 * Null is meaningful: it tells a consumer to fall back to whatever it fetched
 * itself, rather than painting an empty placeholder over a good value.
 */
export function useProfileIdentity(): ProfileIdentity | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Publish the latest identity to every consumer. Called after a load or a save. */
export function setProfileIdentity(next: ProfileIdentity): void {
  const current = snapshot ?? EMPTY;
  // No-op when nothing actually changed, so a re-fetch that returns the same
  // values doesn't wake every subscriber.
  if (current.name === next.name && current.avatarUrl === next.avatarUrl) return;
  snapshot = { name: next.name, avatarUrl: next.avatarUrl };
  listeners.forEach((l) => l());
}

/** Update only the avatar, leaving the name as-is. */
export function setProfileAvatar(avatarUrl: string | null): void {
  setProfileIdentity({ name: (snapshot ?? EMPTY).name, avatarUrl });
}

/** Drop the cached identity — on sign-out, so the next account starts clean. */
export function clearProfileIdentity(): void {
  if (snapshot === null) return;
  snapshot = null;
  listeners.forEach((l) => l());
}
