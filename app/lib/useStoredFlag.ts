"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * A yes/no remembered in this browser (localStorage), as an external store.
 *
 * For per-viewer conveniences only: the collapsed sidebar, a dismissed offer.
 * Storage can be empty or throw (private window, blocked site data), and then
 * the flag simply reads as `fallback`. Never use this for anything that must
 * persist reliably or reach the server.
 *
 * A store rather than state set in an effect: no cascading render on mount,
 * and the server snapshot is the fallback, so hydration matches.
 */

const EVENT = "jooma:stored-flag";

function read(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  // Another tab changing it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * `fallback` is the value when nothing is stored. `onServer` is what the server
 * render (and hydration) uses, which can differ: a dismissible offer is hidden
 * on the server so it never flashes for someone who dismissed it, then shows
 * in the browser when nothing says otherwise.
 */
export function useStoredFlag(
  key: string,
  fallback = false,
  onServer: boolean = fallback,
): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => onServer,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not remembered. Nothing else to do: the store reads the fallback.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
