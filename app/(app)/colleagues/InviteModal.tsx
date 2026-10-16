"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./colleagues.module.css";
import { useFocusTrap } from "@/app/lib/useFocusTrap";

/*
 * Invite a colleague.
 *
 * Two things the prototype has that are not here, both deliberate.
 *
 * THE 200 CREDIT BONUS. The prototype's subheading reads "They get 200 bonus
 * credits when they join. So do you." The developer handover lists that number
 * as an open decision (§8.3) and there is no credit ledger to write a grant
 * against. Promising credits that never arrive is worse than not mentioning
 * them, so the line is about what the invite actually does. When the number is
 * settled, the sentence and the grant ship together.
 *
 * THE PERMANENT LINK. The prototype offers "Or share your link:
 * jooma.ai/join/ashteaches". That is a different mechanism from a one-shot
 * hashed token: a permanent handle-based link needs its own accept path into
 * colleague_edges and its own definer function. Omitted rather than shown
 * greyed out, because a dead control is worse than no control.
 */

/* A gate, so the body below only exists while the modal is open. That unmount
   is the reset: a half-typed address should not still be sitting there next
   time. Same arrangement as ShareModal. */
export default function InviteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return <InviteDialog onClose={onClose} />;
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // Tab stays inside while it is open; it only exists while open.
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, true);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const submit = async () => {
    const value = email.trim();
    if (value === "" || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/colleagues/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "That invite could not be sent.");
        return;
      }
      setSentTo(value);
      setEmail("");
    } catch {
      setError("That invite could not be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="invite-title" className={styles.modal}>
        <h2 id="invite-title" className={styles.modalTitle}>
          Invite a colleague
        </h2>
        <p className={styles.modalSub}>
          They get their own Jooma account. Once they join, you can share resources straight
          into each other&rsquo;s libraries.
        </p>

        {sentTo ? (
          <p className={styles.modalNote} role="status">
            Invite sent to {sentTo}. They will appear in your colleagues once they join and you
            connect.
          </p>
        ) : (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="invite-email">
              Their email address
            </label>
            <input
              id="invite-email"
              ref={inputRef}
              className={styles.input}
              type="email"
              autoComplete="off"
              value={email}
              placeholder="name@school.sch.uk"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
        )}

        {error ? (
          <p className={styles.error} role="status">
            {error}
          </p>
        ) : null}

        <div className={styles.modalFoot}>
          <button type="button" className={styles.modalCancel} onClick={onClose}>
            {sentTo ? "Close" : "Cancel"}
          </button>
          {sentTo ? (
            <button type="button" className={styles.modalSave} onClick={() => setSentTo(null)}>
              Invite someone else
            </button>
          ) : (
            <button
              type="button"
              className={styles.modalSave}
              onClick={submit}
              disabled={email.trim() === "" || busy}
            >
              {busy ? "Sending" : "Send invite"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
