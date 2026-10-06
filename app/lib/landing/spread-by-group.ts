/**
 * A random order in which no two neighbours share a group.
 *
 * For the hero's tool marquee, where a group is a category and so a tile
 * colour: two greens side by side read as a clump, not a range. The list loops,
 * so the last item must differ from the first as well.
 *
 * Built one item at a time, choosing at random among the groups that can still
 * go next without painting the rest into a corner. A group with more than about
 * half of what is left has to be spaced out from now on, and the feasibility
 * check below is what forces that. If the input cannot be spread at all (one
 * group is most of the list), it does the best it can rather than failing.
 */
export function spreadByGroup<T>(
  items: readonly T[],
  group: (item: T) => string,
  random: () => number = Math.random,
): T[] {
  // The wrap from last back to first is the one thing a single pass cannot see.
  // It fails roughly one time in as many groups as there are, so a few tries
  // all but guarantee it; past that, a seam is better than a hang.
  let best: T[] = [];
  for (let attempt = 0; attempt < 24; attempt++) {
    best = spreadOnce(items, group, random);
    if (best.length < 2 || group(best[0]) !== group(best[best.length - 1])) return best;
  }
  return best;
}

function spreadOnce<T>(items: readonly T[], group: (item: T) => string, random: () => number): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of shuffle(items, random)) {
    const key = group(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const out: T[] = [];
  let prev: string | null = null;
  while (out.length < items.length) {
    const left = items.length - out.length;
    const open = [...buckets.keys()].filter((key) => key !== prev && buckets.get(key)!.length > 0);
    // Groups that can go next and still leave a valid arrangement behind them.
    const safe = open.filter((key) => feasible(buckets, key, left - 1));

    let next: string;
    if (safe.length > 0) next = safe[Math.floor(random() * safe.length)];
    else if (open.length > 0) next = largest(buckets, open);
    // Only the previous group has anything left: a repeat is unavoidable.
    else next = prev!;

    out.push(buckets.get(next)!.pop()!);
    prev = next;
  }
  return out;
}

/** Whether `left` items, after one from `taken`, can still be laid out with no
 *  two neighbours alike: no group may hold more than half of them, and the one
 *  just placed may not hold more than the gaps it leaves. */
function feasible<T>(buckets: Map<string, T[]>, taken: string, left: number): boolean {
  for (const [key, bucket] of buckets) {
    const count = key === taken ? bucket.length - 1 : bucket.length;
    const limit = key === taken ? Math.floor(left / 2) : Math.ceil(left / 2);
    if (count > limit) return false;
  }
  return true;
}

function largest<T>(buckets: Map<string, T[]>, keys: string[]): string {
  return keys.reduce((a, b) => (buckets.get(b)!.length > buckets.get(a)!.length ? b : a));
}

/** Fisher Yates, on a copy. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
