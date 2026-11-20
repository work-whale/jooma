"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  BADGE_LEVELS,
  badgesToNextLevel,
  levelFraction,
  levelForEarned,
  levelTitle,
  TOTAL_BADGES,
} from "@/app/lib/badges";
import { buildStats, evaluate } from "@/app/lib/badgeCriteria";
import { claimBadges, listUserBadges } from "@/app/lib/userBadges";
import { listRecentRuns, onToolRunSaved, type ToolRun } from "@/app/lib/toolRuns";
import { shareCounts } from "@/app/lib/colleagues";
import { createClient } from "@/app/lib/auth/client";

/*
 * Streak, level and badges, for every surface that shows them.
 *
 * Three components need this at once (Today's metrics, the sidebar level box,
 * the profile header and collection) and they are siblings, so this is a
 * module-level store rather than per-component state: one load, one evaluation,
 * one claim, however many mount. Same shape as useProfileIdentity and
 * useFavouriteTools, and useSyncExternalStore for the same reasons — SSR-safe
 * reads, no setState in an effect, and every consumer updates together.
 *
 * It also owns the run history, which Today and the profile header each used to
 * fetch for themselves. Both now read it from here, so this removes a duplicate
 * query rather than adding a third.
 *
 * The claim is deliberately quiet. Evaluation is free (a few passes over rows
 * already in memory), but the RPC only fires when the evaluation turns up
 * something not already held, so a teacher who has earned nothing new since
 * their last visit makes zero writes.
 */

export interface BadgeProgress {
  loading: boolean;
  /** False when the migration has not been applied. Every surface falls back to
   *  the "Not yet" state it showed before badges existed. */
  available: boolean;
  /** badge_id to the ISO date it was earned. */
  earned: Map<string, string>;
  earnedCount: number;
  /** The teacher's own runs, so consumers do not fetch them again. */
  runs: ToolRun[];
  level: number;
  levelTitle: string;
  /** Badges still to collect before the next level. 0 at level 10. */
  toNextLevel: number;
  /** Progress through the current level, 0 to 1. */
  levelFraction: number;
  currentStreak: number;
  /** Earned during this visit, for the card on Today. Cleared once dismissed. */
  justEarned: string[];
  total: number;
  maxLevel: number;
}

const EMPTY_EARNED = new Map<string, string>();
const NO_RUNS: ToolRun[] = [];

const INITIAL: BadgeProgress = {
  loading: true,
  available: false,
  earned: EMPTY_EARNED,
  earnedCount: 0,
  runs: NO_RUNS,
  level: 1,
  levelTitle: levelTitle(1),
  toNextLevel: badgesToNextLevel(0),
  levelFraction: 0,
  currentStreak: 0,
  justEarned: [],
  total: TOTAL_BADGES,
  maxLevel: BADGE_LEVELS.length,
};

// Referentially stable while nothing changes, or useSyncExternalStore loops.
let snapshot: BadgeProgress = INITIAL;
const listeners = new Set<() => void>();

function emit(next: BadgeProgress): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

const getSnapshot = () => snapshot;
/** The server knows none of this, so it renders the loading state and the
 *  client fills it in. Returning a different object here would be a hydration
 *  mismatch; INITIAL is the same object both sides. */
const getServerSnapshot = () => INITIAL;

/*
 * Whether a load is in flight, NOT whether one has ever happened.
 *
 * This was a "has it started" flag, which was wrong in a way that made the whole
 * feature look broken: the store is module state, so it survives client-side
 * navigation, and a one-shot flag meant the first load was the only one. A
 * teacher made a resource, went back to Today, and nothing re-evaluated —
 * badges only ever appeared after a hard refresh.
 *
 * Now it only guards against two concurrent loads, and `refresh()` below is
 * what actually re-runs the evaluation.
 */
let loading = false;

function derive(
  earned: Map<string, string>,
  runs: ToolRun[],
  currentStreak: number,
  justEarned: string[],
): BadgeProgress {
  const count = earned.size;
  return {
    loading: false,
    available: true,
    earned,
    earnedCount: count,
    runs,
    level: levelForEarned(count),
    levelTitle: levelTitle(levelForEarned(count)),
    toNextLevel: badgesToNextLevel(count),
    levelFraction: levelFraction(count),
    currentStreak,
    justEarned,
    total: TOTAL_BADGES,
    maxLevel: BADGE_LEVELS.length,
  };
}

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    await runLoad();
  } finally {
    loading = false;
  }
}

async function runLoad(): Promise<void> {
  // The clock, read once per load. Everything downstream takes it as an
  // argument rather than calling Date.now() itself, so a re-render cannot
  // produce a different streak than the one that was rendered.
  const now = new Date();

  const [runs, held] = await Promise.all([
    listRecentRuns(1000).catch(() => [] as ToolRun[]),
    listUserBadges().catch(() => null),
  ]);

  // null means the table is not there yet. Keep the runs (Today's other metrics
  // need them) but leave every badge surface in its pre-feature state.
  if (held === null) {
    emit({ ...INITIAL, loading: false, available: false, runs });
    return;
  }

  const earned = new Map(held.map((b) => [b.badge_id, b.earned_at]));

  // Context the runs do not carry. Each is optional: a failure here should cost
  // at most the handful of badges that depend on it, never the whole feature.
  const context = await loadContext().catch(() => ({
    accountCreatedAt: null,
    profileComplete: null,
    assistantMessageCount: null,
    folderCount: null,
    sharesSent: null,
    shareRecipients: null,
    sharesSaved: null,
  }));

  const stats = buildStats({
    runs,
    now,
    ...context,
    earnedCount: earned.size,
  });

  // Show what we know before the round trip, so the numbers do not arrive twice.
  // Anything already earned in this session stays on the card: a refresh
  // triggered by saving a resource must not wipe the badge that resource won.
  emit(derive(earned, runs, stats.currentStreak, snapshot.justEarned));

  const candidates = evaluate(stats).filter((id) => !earned.has(id));
  if (candidates.length === 0) return;

  let granted: string[] = [];
  try {
    granted = await claimBadges(candidates);
  } catch (error) {
    // Swallowing this silently is how a broken claim looks identical to having
    // earned nothing. The teacher still sees a working page; we get a reason.
    console.error("Could not claim badges", error);
    return;
  }
  if (granted.length === 0) return;

  const nowIso = now.toISOString();
  const next = new Map(earned);
  for (const id of granted) next.set(id, nowIso);
  // Accumulate rather than replace, so two grants in one session both show.
  emit(derive(next, runs, stats.currentStreak, [...snapshot.justEarned, ...granted]));
}

/** Account age, profile completeness, Ask Jo use, folder count and share
 *  counts: cheap reads that a handful of badges depend on and nothing else
 *  does. */
async function loadContext(): Promise<{
  accountCreatedAt: string | null;
  profileComplete: boolean | null;
  assistantMessageCount: number | null;
  folderCount: number | null;
  sharesSent: number | null;
  shareRecipients: number | null;
  sharesSaved: number | null;
}> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      accountCreatedAt: null,
      profileComplete: null,
      assistantMessageCount: null,
      folderCount: null,
      sharesSent: null,
      shareRecipients: null,
      sharesSaved: null,
    };
  }

  const [profileResult, messageResult, folderResult, shares] = await Promise.all([
    // `surname`, not `last_name`. This selected a column that has never existed,
    // so PostgREST rejected it, the catch below swallowed the error, and
    // profileComplete was permanently null: the profile-complete badge could
    // not be earned by anybody. Every other site in the codebase uses `surname`.
    supabase.from("profiles").select("first_name, surname").eq("id", user.id).maybeSingle(),
    supabase
      .from("assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user"),
    // head + exact, so this costs a count and not the rows.
    supabase.from("folders").select("id", { count: "exact", head: true }),
    shareCounts(),
  ]);

  const profile = profileResult.data as { first_name?: string; surname?: string } | null;

  return {
    accountCreatedAt: user.created_at ?? null,
    profileComplete: profile
      ? Boolean(profile.first_name?.trim() && profile.surname?.trim())
      : null,
    assistantMessageCount: messageResult.error ? null : (messageResult.count ?? 0),
    // null rather than 0 when the table is not there yet: "no folders" and
    // "folders have not shipped here" are different facts, and the criterion
    // renders them differently. Same for the three share counts below, which
    // shareCounts returns as a single null for exactly that reason.
    folderCount: folderResult.error ? null : (folderResult.count ?? 0),
    sharesSent: shares?.sent ?? null,
    shareRecipients: shares?.distinctRecipients ?? null,
    sharesSaved: shares?.savedFromOthers ?? null,
  };
}

/**
 * Re-check what has been earned.
 *
 * Called on mount and whenever a resource is saved. Cheap when nothing has
 * changed: it still re-reads, but the claim only fires for a badge that is
 * genuinely new, so a teacher with nothing to earn makes no writes.
 */
export function refreshBadgeProgress(): void {
  void load();
}

export function useBadgeProgress(): BadgeProgress {
  const progress = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // On EVERY mount, not once per page session. The store is module state and
    // survives client-side navigation, so a one-shot guard here meant returning
    // to Today after making something never re-evaluated. `load` no-ops while
    // one is already in flight, so three components mounting together still
    // share a single fetch.
    void load();

    // A resource saved anywhere in the app is the event that earns most badges,
    // so award against it immediately rather than waiting for the next visit.
    return onToolRunSaved(() => {
      void load();
    });
  }, []);

  return progress;
}

/** Stop showing the "you earned these" card without re-fetching anything. */
export function dismissJustEarned(): void {
  if (snapshot.justEarned.length === 0) return;
  emit({ ...snapshot, justEarned: [] });
}

/** Drop everything on sign-out, so the next account does not inherit a level. */
export function clearBadgeProgress(): void {
  emit(INITIAL);
}
