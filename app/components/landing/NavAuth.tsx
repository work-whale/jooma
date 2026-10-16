"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  LayoutGrid,
  LogOut,
  BarChart3,
  Shield,
  UserRound,
} from "lucide-react";
import { createClient } from "@/app/lib/auth/client";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import Avatar from "@/app/components/ui/Avatar";

interface NavAuthProps {
  /** Display name (first name) when available, falls back to email. */
  name: string | null;
  /** First name + surname, for the avatar's initials placeholder. */
  fullName?: string | null;
  /** Profile photo. Null falls back to initials, then to a glyph. */
  avatarUrl?: string | null;
  email: string | null;
  /** Show the Admin link in the dropdown. */
  isAdmin?: boolean;
}

export default function NavAuth({
  name,
  fullName,
  avatarUrl,
  email,
  isAdmin = false,
}: NavAuthProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // pointerdown, not mousedown: iOS Safari sends no mouse events for a tap on
  // something that is not itself clickable, so the menu never closed on a tap.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  // Focus into the menu on open, Tab kept inside it, and Escape hands focus
  // back to the trigger.
  useFocusTrap(menuRef, open);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  // Logged out — original Log In / Try Free buttons.
  if (!email) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-black/5"
          style={{ color: "var(--j-ink)" }}
        >
          Log In
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--j-purple)" }}
        >
          Let&apos;s Try Free
          <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
        </Link>
      </div>
    );
  }

  const label = name || email;
  // The avatar prefers the full name for two-letter initials; the email is the
  // last resort, and gives one letter.
  const avatarName = fullName || name || email || "";

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="nav-auth-menu"
        className="flex items-center gap-2 pointer-coarse:min-h-12 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-colors hover:bg-black/5 active:bg-black/5"
        style={{ borderColor: "var(--j-line-2)" }}
      >
        <Avatar url={avatarUrl} name={avatarName} size={28} />
        <span className="text-sm font-semibold max-w-35 truncate" style={{ color: "var(--j-ink)" }}>
          {label}
        </span>
        <ChevronDown className="w-4 h-4" style={{ color: "var(--j-muted)" }} />
      </button>

      {open && (
        <div
          id="nav-auth-menu"
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full mt-2 w-60 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <Avatar url={avatarUrl} name={avatarName} size={36} />
            <div className="min-w-0">
              {fullName ? (
                <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
              ) : (
                <p className="text-xs text-gray-400">Signed in as</p>
              )}
              <p className="text-xs text-gray-400 truncate">{email}</p>
            </div>
          </div>
          <Link
            href="/tools"
            role="menuitem"
            className="w-full pointer-coarse:min-h-12 flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            Go to dashboard
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="w-full pointer-coarse:min-h-12 flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          )}
          <Link
            href="/profile"
            role="menuitem"
            className="w-full pointer-coarse:min-h-12 flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <UserRound className="w-4 h-4" />
            Profile
          </Link>
          {/* Straight to the canonical route, not the /account/billing redirect:
              prefetching a route that immediately redirects is wasted work. That
              one exists for Stripe's return URLs and old bookmarks. */}
          <Link
            href="/profile?section=subscription"
            role="menuitem"
            className="w-full pointer-coarse:min-h-12 flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Usage &amp; Billing
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            role="menuitem"
            className="w-full pointer-coarse:min-h-12 flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
