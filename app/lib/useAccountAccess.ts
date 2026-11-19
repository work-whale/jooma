"use client";

import { useEffect, useState } from "react";
import { createClient } from "./auth/client";
import { accountAccess, type AccessRow, type AccountAccess } from "./account-access";
import { registerExportMarkLoader, setExportMark } from "./export-mark";
import { exportMark } from "./plan-features";

/*
 * The signed-in teacher's account state, for the banner, the dashboard and the
 * export lock.
 *
 * One request per page load however many components ask, because the export
 * controls alone mount in half a dozen places. Starting a trial and returning
 * from Stripe are both full navigations, so nothing needs to invalidate this.
 *
 * Fails open, like checkAllGates: null while loading, signed out, or when the
 * read errors, and every caller treats null as not locked. A database blip must
 * not stop a paying teacher exporting.
 */

let cached: Promise<AccountAccess | null> | null = null;

function load(): Promise<AccountAccess | null> {
  cached ??= (async () => {
    const supabase = createClient();
    // Read locally, so a signed out visitor on /create sends no request.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase.rpc("my_account_access");
    if (error) {
      console.warn("[account-access] could not read account state:", error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as AccessRow | undefined;
    if (!row) return null;
    const access = accountAccess(row);
    // Jooma 4.5: exports carry the mark on Free and the trial. Only a 4.5 row
    // (the migration is pushed) sets it, so nothing changes before then.
    if (row.resources_made !== undefined) setExportMark(exportMark(access.accountPlan));
    return access;
  })().catch(() => null);
  return cached;
}
registerExportMarkLoader(load);

/** The same cached read, for code that must tell "still loading" from
 *  "failed" (resolves to null on failure; the hook cannot say which). */
export const loadAccountAccess = load;

export function useAccountAccess(): AccountAccess | null {
  const [access, setAccess] = useState<AccountAccess | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load().then((value) => {
      if (!cancelled) setAccess(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return access;
}

/** True when this account may not take anything out of Jooma. */
export function useExportLocked(): boolean {
  const access = useAccountAccess();
  return access !== null && access.state === "locked" && !access.canExportLibrary;
}
