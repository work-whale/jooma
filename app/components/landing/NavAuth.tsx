"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, LayoutGrid, LogOut, BarChart3, Shield } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";

interface NavAuthProps {
  /** Display name (first name) when available, falls back to email. */
  name: string | null;
  email: string | null;
  /** Show the Admin link in the dropdown. */
  isAdmin?: boolean;
}

export default function NavAuth({ name, email, isAdmin = false }: NavAuthProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
          style={{ color: "#030303" }}
        >
          Log In
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#030303" }}
        >
          Let&apos;s Try Free
          <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
        </Link>
      </div>
    );
  }

  const label = name || email;
  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-colors hover:bg-black/5"
        style={{ borderColor: "#E0DCCB" }}
      >
        <span
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white text-sm font-semibold"
          style={{ backgroundColor: "#030303" }}
        >
          {initial}
        </span>
        <span className="text-sm font-semibold max-w-35 truncate" style={{ color: "#030303" }}>
          {label}
        </span>
        <ChevronDown className="w-4 h-4" style={{ color: "#4a423a" }} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-gray-900 truncate">{email}</p>
          </div>
          <Link
            href="/tools"
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            Go to dashboard
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          )}
          <Link
            href="/account/usage"
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Usage
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
