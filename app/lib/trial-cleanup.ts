// What a batch of expired guest tries owns in Storage.
//
// The cron (app/api/cron/guest-cleanup) clears `output` on these rows and then
// offers the files to storage_paths_in_use(): anything a teacher's deck, the
// image library or a newer guest try still uses is kept.
//
// Pure: no database, safe to unit test.

import { extractStorageRefs, type StorageRef } from "./storageRefs";

export interface ExpiredTrial {
  id: string;
  output: unknown;
}

export interface TrialCleanupPlan {
  /** Every row to clear, including those with no files. */
  ids: string[];
  /** Every distinct Storage object the rows referenced. */
  refs: StorageRef[];
}

export function planTrialCleanup(rows: ExpiredTrial[]): TrialCleanupPlan {
  const ids = rows.map((r) => r.id);
  const texts = rows.map((r) => (r.output == null ? null : typeof r.output === "string" ? r.output : JSON.stringify(r.output)));
  return { ids, refs: extractStorageRefs(...texts) };
}
