"use client";

// The bell in the TopBar, and the panel behind it.
//
// It used to be a bare router.push("/notifications"). A bell that navigates away
// is a link wearing a notification's clothes — the point of the icon is that you
// can glance at what arrived without losing the page you were on. "View all"
// still goes to the full list, which is where dismissal and the complete history
// live.
//
// Built to match the profile menu next to it: a relative wrapper, an absolutely
// positioned panel, and a mousedown listener for outside clicks. It additionally
// handles Escape and returns focus to the trigger, which that menu does not —
// see app/components/ui/DropdownMenu.tsx, which is where that behaviour is
// already written down.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";
import {
  type MyNotification,
  toneFor,
  labelFor,
  formatDate,
  formatBadge,
} from "@/app/lib/notifications";

/** How many rows the panel shows. The rest are a "View all" away — a popover
 *  that scrolls for a screenful is a page in a costume. */
const PREVIEW_LIMIT = 5;

export default function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  // Set once the panel has been opened against the current set of rows. The
  // badge is DERIVED from this rather than stored, so opening the panel doesn't
  // have to write two pieces of state that could disagree — and the refetch on
  // navigation clears it, at which point the freshly-fetched `seen` flags are
  // the authority again.
  const [acknowledged, setAcknowledged] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The rows AND the count come from one call. my_announcements_unread is
  // defined as a count over my_announcements, so asking for both separately
  // would be two round trips that can disagree in the window between them.
  //
  // Keyed on pathname so it re-checks on navigation, which is what refreshes the
  // badge after a visit to /notifications marks everything seen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("my_announcements");
      if (cancelled) return;
      const list = error ? [] : ((data ?? []) as MyNotification[]);
      setRows(list);
      // Fresh rows carry their own `seen` flags, so a previous acknowledgement
      // no longer applies — a notification published since the last fetch must
      // be able to light the badge again.
      setAcknowledged(false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // `reported` is the set of ids already sent to the server. A ref rather than
  // state because it must not drive rendering, and it survives the pathname
  // refetch — so navigating with the panel open doesn't re-report the same ids.
  //
  // This effect writes nothing local: the badge is derived from `acknowledged`
  // below, so all that happens here is the round trip. It depends on `rows` as
  // well as `open` to cover the teacher who opens the panel before the fetch
  // lands; those rows would otherwise never be marked seen.
  const reported = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const unseen = rows.filter((r) => !r.seen && !reported.current.has(r.id));
    if (unseen.length === 0) return;

    unseen.forEach((r) => reported.current.add(r.id));
    const supabase = createClient();
    void Promise.all(
      unseen.map((r) => supabase.rpc("announcement_seen", { p_id: r.id })),
    );
  }, [open, rows]);

  // Opening the panel counts as reading everything in it, mirroring what
  // /notifications does. announcement_seen is idempotent per teacher — it only
  // bumps seen_count when it actually inserts a row — so repeated opens cannot
  // inflate the figure the admin console reports.
  const unread = acknowledged ? 0 : rows.filter((r) => !r.seen).length;

  // Close on outside click. pointerdown, not mousedown: iOS Safari sends no
  // mouse events for a tap on something that is not itself clickable.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Focus moves into the panel on open, so the next Tab walks its links
  // rather than the page behind it.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Close on Escape, and put focus back where it came from — otherwise a
  // keyboard user who dismisses the panel is left at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const preview = rows.slice(0, PREVIEW_LIMIT);

  return (
    <div className="relative group/bell" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setAcknowledged(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={
          unread > 0
            ? `${unread} new ${unread === 1 ? "notification" : "notifications"}`
            : "Notifications"
        }
        // The after: layer widens the hit area to 48px without changing the
        // 36px button anyone sees.
        className="relative w-9 h-9 flex items-center justify-center rounded-2xl border border-line bg-white hover:border-gray-400 active:bg-gray-100 transition-colors cursor-pointer after:absolute after:-inset-1.5 after:content-['']"
      >
        <Bell className="w-4 h-4 text-muted" />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: "#B3261E" }}
          >
            {formatBadge(unread)}
          </span>
        )}
      </button>

      {/* The hover tooltip only makes sense when the panel is shut and there is
          no badge already saying the same thing. */}
      {!open && unread === 0 && (
        <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover/bell:opacity-100 transition-opacity">
          Notifications
        </span>
      )}

      {open && (
        <div
          id="notification-panel"
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Notifications"
          /* min() width so the panel survives a narrow phone; right-0 anchors it
             under the bell rather than letting it run off the edge. */
          className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden focus:outline-none"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
          </div>

          {loading ? (
            <div className="p-3 space-y-2 animate-pulse">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl"
                  style={{ backgroundColor: "var(--j-tint)" }}
                />
              ))}
            </div>
          ) : preview.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium" style={{ color: "var(--j-ink)" }}>
                Nothing to report
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--j-faint)" }}>
                Notifications from the Jooma team show up here.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-2 space-y-2">
              {preview.map((r) => {
                const tone = toneFor(r.type);
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border px-3 py-2.5"
                    style={{ backgroundColor: tone.bg, borderColor: tone.border }}
                  >
                    <div
                      className="text-[10px] font-bold uppercase tracking-wide mb-1"
                      style={{ color: tone.fg, opacity: 0.75 }}
                    >
                      {labelFor(r.type)} · {formatDate(r.starts_at)}
                    </div>
                    {/* Clamped: the panel previews, the page reads. */}
                    <p
                      className="text-xs leading-snug line-clamp-3"
                      style={{ color: tone.fg }}
                    >
                      {r.message}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-gray-100">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm font-semibold text-center text-gray-700 hover:bg-gray-50 transition-colors"
            >
              View all
              {rows.length > preview.length && ` (${rows.length})`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
