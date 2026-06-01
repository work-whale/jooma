"use client";

// Shared pinned-tools store backed by localStorage.
//
// Uses useSyncExternalStore so reads are SSR-safe (no hydration mismatch, no
// setState-in-effect) and every consumer — the Tools grid and the SideNav —
// stays in sync the instant a pin changes, even within the same tab (the
// native `storage` event only fires for OTHER tabs, so we notify locally too).

import { useSyncExternalStore } from "react";

const PIN_STORAGE_KEY = "jooma:pinned-tools";

const listeners = new Set<() => void>();

// Cache the parsed snapshot. useSyncExternalStore requires getSnapshot to
// return a referentially-stable value when nothing changed — re-parsing the
// JSON each call would return a new array every render and loop forever.
let cache: string[] = [];
let cacheRaw: string | null = null;

function read(): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(PIN_STORAGE_KEY);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    cache = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

const EMPTY: string[] = [];
function getServerSnapshot(): string[] {
  return EMPTY;
}

/** Reactive list of pinned tool hrefs. */
export function usePinnedTools(): string[] {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

/** Pin or unpin a tool, persisting to localStorage and notifying all consumers. */
export function togglePin(href: string): void {
  const current = read();
  const next = current.includes(href)
    ? current.filter((h) => h !== href)
    : [...current, href];
  try {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — ignore */
  }
  // Invalidate cache so the next read() reflects the write immediately.
  cacheRaw = null;
  listeners.forEach((l) => l());
}
