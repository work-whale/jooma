"use client";

import { useEffect, useState } from "react";
import { createClient } from "./auth/client";
import { meterFromResources, type ResourcesMeter, type ResourcesMeterRow } from "./resource-meter";

/*
 * The teacher's resources balance (Jooma 4.5), from my_resources().
 *
 * One request per page however many components ask (the sidebar, Today, the
 * tool form's cost line, the P3 sheet). refreshResources() re-reads it after a
 * generation, and every mounted hook updates.
 *
 * Three outcomes:
 *   - a meter: the migration is in and the read worked;
 *   - "missing": my_resources() does not exist yet (PGRST202), so callers use
 *     the pre-4.5 meter;
 *   - null: signed out, still loading, or the read failed. Callers keep what
 *     they showed and never invent a zero.
 */

export type ResourcesState = ResourcesMeter | "missing" | null;

/** The raw row as well, for the trial and refine fields the meter drops. */
export interface ResourcesRow extends ResourcesMeterRow {
  refines_used?: number | null;
  /** The allowance alone, without top-ups (P9, E11). */
  allowance_left?: number | null;
  /** When the current allowance period began: P9 and P10's "month". */
  period_start?: string | null;
  trial_ended_now?: boolean | null;
}

let cached: Promise<{ meter: ResourcesState; row: ResourcesRow | null }> | null = null;
const listeners = new Set<() => void>();

function load() {
  cached ??= (async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { meter: null, row: null };
    const { data, error } = await supabase.rpc("my_resources");
    if (error) {
      if (error.code === "PGRST202") return { meter: "missing" as const, row: null };
      console.warn("[resources] could not read the balance:", error.message);
      return { meter: null, row: null };
    }
    const row = (Array.isArray(data) ? data[0] : data) as ResourcesRow | undefined;
    return { meter: meterFromResources(row ?? null), row: row ?? null };
  })().catch(() => ({ meter: null, row: null }));
  return cached;
}

/** Re-read the balance, e.g. after a generation finishes. */
export function refreshResources(): void {
  cached = null;
  for (const fn of listeners) fn();
}

export function useResourcesRow(): { meter: ResourcesState; row: ResourcesRow | null; loading: boolean } {
  const [state, setState] = useState<{ meter: ResourcesState; row: ResourcesRow | null; loading: boolean }>({
    meter: null,
    row: null,
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void load().then((v) => {
        if (!cancelled) setState({ ...v, loading: false });
      });
    };
    read();
    listeners.add(read);
    return () => {
      cancelled = true;
      listeners.delete(read);
    };
  }, []);
  return state;
}

export function useResources(): ResourcesState {
  return useResourcesRow().meter;
}
