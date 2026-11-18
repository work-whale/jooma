"use client";

import { useSyncExternalStore } from "react";

/*
 * The generated pictures the open deck form will make, so the tool's cost line
 * (ToolCostLine, in the tools layout) can include them: a deck on library
 * photos is about 15 resources, an all-generated one about 65. The deck form
 * (GenerateModal) writes it as the teacher changes the picture source, mix or
 * slide count, and clears it when it closes.
 */

let pictures = 0;
const listeners = new Set<() => void>();

export function setDeckPictures(n: number): void {
  const next = Math.max(0, Math.floor(n));
  if (next === pictures) return;
  pictures = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDeckPictures(): number {
  return useSyncExternalStore(subscribe, () => pictures, () => 0);
}
