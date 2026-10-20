"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOut, ShieldCheck, ChartBar, UserCircle, Crown, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/app/lib/auth/client";
import Avatar from "@/app/components/ui/Avatar";
import {
  useProfileIdentity,
  setProfileIdentity,
  clearProfileIdentity,
} from "@/app/lib/useProfileIdentity";
import styles from "./AccountLinks.module.css";

/*
 * The account routes, defined once. On a desktop they are the avatar's
 * dropdown in the top bar; on a phone they sit at the foot of the burger
 * drawer. Both read the same useAccount(), which AppShellV2 calls once, so
 * the lookups below are not made twice per page.
 */

export interface Account {
  email: string | null;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** "none" shows nothing at all: the programme is not advertised to someone
   *  who has not applied. */
  ambassador: "none" | "pending" | "active";
  signOut: () => Promise<void>;
}

export function useAccount(): Account {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ambassador, setAmbassador] = useState<Account["ambassador"]>("none");

  // Name and avatar come from a shared store, not local state. The profile form
  // is a SIBLING of the chrome, so it cannot pass a new photo down, and
  // router.refresh() does not reach here: that re-renders server components,
  // and this is a client one whose state survives. The effect below is keyed on
  // pathname, which does not change when you save on the page you are already
  // on. Before the store, the bar kept the old photo until you navigated away.
  const identity = useProfileIdentity();

  // Who is signed in, what they look like, and may they see the Admin link.
  //
  // THIS GATE IS UX ONLY. requireAdmin() and the is_admin() re-check inside
  // every admin_* RPC are the real boundary. Forging this flag in devtools
  // reveals a menu item that leads straight to a redirect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: userData }, { data: admin }, { data: amb }, { data: application }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("is_admin"),
          supabase.rpc("my_ambassador"),
          supabase.rpc("my_ambassador_application"),
        ]);
      if (cancelled) return;
      setEmail(userData.user?.email ?? null);
      // Definer functions scoped to the caller; a failure reads as "none".
      const ambRow = Array.isArray(amb) ? amb[0] : null;
      const appRow = Array.isArray(application) ? application[0] : null;
      setAmbassador(
        ambRow?.status === "active" ? "active" : appRow?.status === "pending" ? "pending" : "none",
      );
      // Starts false and stays false unless the DB says otherwise, so the item
      // is absent on first paint rather than flashing in and out.
      setIsAdmin(admin === true);

      const uid = userData.user?.id;
      if (!uid) {
        clearProfileIdentity();
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, surname, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      setProfileIdentity({
        name: [profile?.first_name, profile?.surname].filter(Boolean).join(" "),
        avatarUrl: profile?.avatar_url ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Drop the cached name and photo, so signing in as someone else on the same
    // tab does not flash the previous teacher's avatar before their own loads.
    clearProfileIdentity();
    router.push("/login");
    router.refresh();
  };

  return {
    email,
    name: identity?.name ?? "",
    avatarUrl: identity?.avatarUrl ?? null,
    isAdmin,
    ambassador,
    signOut,
  };
}

/**
 * Who is signed in, then Ambassador, Admin, Profile, Usage and billing, and
 * Sign out. `menu` is the dropdown, whose rows are menuitems; `drawer` is a
 * plain list of links in the phone drawer.
 */
export function AccountLinks({
  account,
  variant,
  onNavigate,
}: {
  account: Account;
  variant: "menu" | "drawer";
  onNavigate?: () => void;
}) {
  const role = variant === "menu" ? "menuitem" : undefined;
  const item = `${styles.item} ${variant === "drawer" ? styles.itemDrawer : ""}`;

  return (
    <>
      {account.email && (
        <div className={`${styles.who} ${variant === "drawer" ? styles.whoDrawer : ""}`}>
          <Avatar url={account.avatarUrl} name={account.name} size={36} />
          <div className={styles.whoText}>
            {account.name ? (
              <p className={styles.whoName}>{account.name}</p>
            ) : (
              <p className={styles.whoLabel}>Signed in as</p>
            )}
            <p className={styles.whoEmail}>{account.email}</p>
          </div>
        </div>
      )}
      {account.ambassador === "active" && (
        <Link href="/ambassador" className={`${item} ${styles.ambassador}`} role={role} onClick={onNavigate}>
          <Crown weight="fill" className={styles.icon} />
          <span style={{ flex: 1 }}>Ambassador Programme</span>
          <ArrowRight className={styles.icon} />
        </Link>
      )}
      {account.ambassador === "pending" && (
        <Link href="/ambassador" className={`${item} ${styles.ambassadorPending}`} role={role} onClick={onNavigate}>
          <Crown weight="fill" className={styles.icon} />
          <span style={{ flex: 1 }}>Ambassador Programme</span>
          <span className={styles.reviewBadge}>Under review</span>
        </Link>
      )}
      {account.isAdmin && (
        <Link href="/admin" className={item} role={role} onClick={onNavigate}>
          <ShieldCheck className={styles.icon} />
          Admin
        </Link>
      )}
      <Link href="/profile" className={item} role={role} onClick={onNavigate}>
        <UserCircle className={styles.icon} />
        Profile
      </Link>
      {/* Straight to the section rather than through /account/billing's
          redirect, which exists for Stripe's return URLs and old bookmarks,
          not for links we control. */}
      <Link href="/profile?section=subscription" className={item} role={role} onClick={onNavigate}>
        <ChartBar className={styles.icon} />
        Usage and billing
      </Link>
      <button type="button" onClick={account.signOut} className={item} role={role}>
        <SignOut className={styles.icon} />
        Sign out
      </button>
    </>
  );
}
