"use client";

import { useEffect, useState } from "react";
import { createClient } from "./auth/client";
import { accountAccess, type AccessRow, type AccountAccess } from "./account-access";

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
    return row ? accountAccess(row) : null;
  })().catch(() => null);
  return cached;
}

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
