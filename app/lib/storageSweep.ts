// Deciding which referenced files a sweep may actually remove.
//
// Since uploads are content-addressed (contentName.ts) and duplicates were
// merged, ONE file can sit on many teachers' slides. "This row pointed at it"
// is therefore never enough to delete a file. Every sweep collects candidates,
// asks storage_paths_in_use() which are still live, and removes only the rest.
//
// `inUse` is null when that check failed: then nothing is removed. A leaked file
// costs storage; a deleted one puts a broken picture in somebody's lesson.
//
// Pure: no database, safe to unit test.

import type { StorageRef } from "./storageRefs";

/** bucket -> paths safe to remove. Buckets with nothing to remove are absent. */
export function sweepablePaths(refs: StorageRef[], inUse: Set<string> | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (inUse === null) return out;
  for (const ref of refs) {
    if (inUse.has(ref.path)) continue;
    const list = out.get(ref.bucket) ?? [];
    list.push(ref.path);
    out.set(ref.bucket, list);
  }
  return out;
}
