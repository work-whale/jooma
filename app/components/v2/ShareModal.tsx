"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleNotch, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ToolTile } from "@/app/components/v2/Squircle";
import {
  listColleagues,
  shareRun,
  type Colleague,
  type ColleagueProfile,
} from "@/app/lib/colleagues";
import { listRecentRuns, type ToolRun } from "@/app/lib/toolRuns";
import { displayName, initialsOf } from "@/app/lib/colleagueDisplay";
import { v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import styles from "./ShareModal.module.css";
import { useFocusTrap } from "@/app/lib/useFocusTrap";

/*
 * Share with colleagues.
 *
 * The model is copy, not link: the recipient is OFFERED a snapshot, and their
 * own copy is made when they save it. The sender's resource is never touched.
 * See app/lib/colleagues.ts and the migration header.
 *
 * One component, two directions. From a resource (the Library row menu, a
 * recent row on Today, a tool result) the resource is known and colleagues are
 * picked. From a colleague row on the Colleagues page the colleague is known
 * and the resource is picked. The picklist markup and the "Share with N" /
 * "Select someone" button are identical either way, which is the part worth
 * sharing; only the list being chosen from differs.
 */

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** The resource to share. Omit to have the teacher pick one. */
  runId?: string;
  /** Shown under the heading so it is clear what is being sent. */
  runTitle?: string | null;
  /** The colleague to share with. Omit to have the teacher pick. */
  recipient?: ColleagueProfile;
  /** Fired after a successful share, with how many colleagues received it. */
  onShared?: (count: number) => void;
}

/*
 * A gate, so the body below only exists while the modal is open.
 *
 * That unmount IS the reset. Clearing the selection in an effect on `open`
 * would work, but it is a cascading render and it leaves a window where the
 * previous selection is still on screen. A modal that remembers what was last
 * ticked will eventually share the wrong thing with the wrong person, so the
 * state should not survive a close at all.
 */
export default function ShareModal({ open, ...props }: ShareModalProps) {
  if (!open || typeof document === "undefined") return null;
  return <ShareDialog {...props} />;
}

function ShareDialog({
  onClose,
  runId,
  runTitle,
  recipient,
  onShared,
}: Omit<ShareModalProps, "open">) {
  // Which side is being chosen. A fixed recipient means the teacher picks a
  // resource; otherwise they pick colleagues.
  const picking: "resources" | "colleagues" = recipient ? "resources" : "colleagues";

  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // Tab stays inside while it is open; it only exists while open.
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true);

  // Escape closes, focus moves in on open and returns to whatever opened it.
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  // Scroll lock, matching TopUpModal and AppShellV2's drawer.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = picking === "colleagues" ? listColleagues() : listRecentRuns(200);
    void load
      .then((rows) => {
        if (cancelled) return;
        if (picking === "colleagues") setColleagues(rows as Colleague[]);
        else setRuns(rows as ToolRun[]);
      })
      .catch(() => {
        if (!cancelled) setError("That list could not be loaded. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [picking]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const submit = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (picking === "colleagues") {
        await shareRun(runId!, [...selected]);
      } else {
        // One resource at a time to a fixed colleague, so each share carries its
        // own snapshot.
        for (const id of selected) {
          await shareRun(id, [recipient!.user_id]);
        }
      }
      onShared?.(selected.size);
      onClose();
    } catch {
      setError("That could not be shared. Try again.");
      setBusy(false);
    }
  };

  const term = query.trim().toLowerCase();

  const visibleColleagues = colleagues.filter((c) => {
    if (term === "") return true;
    return (
      displayName(c).toLowerCase().includes(term) ||
      (c.username ?? "").toLowerCase().includes(term)
    );
  });

  const visibleRuns = runs.filter((r) => {
    if (term === "") return true;
    return (
      (r.title ?? "").toLowerCase().includes(term) ||
      typeLabel(r.tool_slug).toLowerCase().includes(term)
    );
  });

  const count = selected.size;
  const empty = picking === "colleagues" ? colleagues.length === 0 : runs.length === 0;

  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="share-title" className={styles.modal}>
        <h2 id="share-title" className={styles.title} tabIndex={-1} ref={headingRef}>
          {recipient ? `Share with ${displayName(recipient)}` : "Share with colleagues"}
        </h2>
        <p className={styles.sub}>
          They get a copy in their library. Yours stays untouched.
        </p>

        {runTitle ? <p className={styles.subject}>{runTitle}</p> : null}

        {loading ? (
          <p className={styles.state} role="status">
            <CircleNotch className={styles.spin} />
            Loading
          </p>
        ) : empty ? (
          <p className={styles.state}>
            {picking === "colleagues"
              ? "You have no colleagues yet. Add one first, then you can share with them."
              : "You have not made anything yet. Once you do, you can share it from here."}
          </p>
        ) : (
          <>
            <label className={styles.search}>
              <MagnifyingGlass className={styles.searchIcon} />
              <span className={styles.srOnly}>
                {picking === "colleagues" ? "Find a colleague" : "Find a resource"}
              </span>
              <input
                className={styles.searchInput}
                inputMode="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={picking === "colleagues" ? "Find a colleague" : "Find a resource"}
              />
            </label>

            <div className={styles.picklist} role="group" aria-label="Select">
              {picking === "colleagues"
                ? visibleColleagues.map((c) => (
                    <PickRow
                      key={c.user_id}
                      on={selected.has(c.user_id)}
                      onClick={() => toggle(c.user_id)}
                      lead={<Avatar profile={c} />}
                      title={displayName(c)}
                      meta={c.username ? `@${c.username}` : "Colleague"}
                    />
                  ))
                : visibleRuns.map((r) => {
                    const tool = v2ToolForSlug(r.tool_slug);
                    return (
                      <PickRow
                        key={r.id}
                        on={selected.has(r.id)}
                        onClick={() => toggle(r.id)}
                        lead={
                          <ToolTile
                            icon={tool?.icon ?? "file-text"}
                            solid={toolSolid(tool)}
                            size="sm"
                          />
                        }
                        title={r.title?.trim() || "Untitled"}
                        meta={typeLabel(r.tool_slug)}
                      />
                    );
                  })}
            </div>
          </>
        )}

        {error ? (
          <p className={styles.error} role="status">
            {error}
          </p>
        ) : null}

        <div className={styles.foot}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.save}
            onClick={submit}
            disabled={count === 0 || busy || empty}
          >
            {busy ? "Sharing" : count > 0 ? `Share with ${count}` : "Select someone"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* A row in the picker. Both directions use it, so the checkbox, the hit area
   and the selected state are written once. */
function PickRow({
  on,
  onClick,
  lead,
  title,
  meta,
}: {
  on: boolean;
  onClick: () => void;
  lead: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.pick} ${on ? styles.pickOn : ""}`}
      onClick={onClick}
      aria-pressed={on}
    >
      {lead}
      <span className={styles.pickMain}>
        <span className={styles.pickTitle}>{title}</span>
        <span className={styles.pickMeta}>{meta}</span>
      </span>
      <span className={styles.box} aria-hidden="true">
        <Check className={styles.boxIcon} weight="bold" />
      </span>
    </button>
  );
}

function Avatar({ profile }: { profile: ColleagueProfile }) {
  if (profile.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.fav} src={profile.avatar_url} alt="" />;
  }
  return <span className={styles.fav}>{initialsOf(profile)}</span>;
}
