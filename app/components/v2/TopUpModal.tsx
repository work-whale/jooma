"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTopUp } from "@/app/lib/useTopUp";
import { useTopUpPacks } from "@/app/lib/useTopUpPacks";
import { packCredits } from "@/app/lib/topup-packs";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import styles from "./TopUpModal.module.css";

/*
 * Top up credits.
 *
 * Lists the credit packs this teacher's plan may buy, read live from
 * topup_packs, and starts a one-off Stripe Checkout for the chosen one. With a
 * single pack configured — which is the case today — this renders as one row
 * and behaves exactly as it did when the pack was hardcoded.
 *
 * Sizes are shown in CREDITS and prices in POUNDS, both derived from the pack
 * row: credits via toCredits(pack.unit), never a written-down number. See the
 * note above PENCE_PER_CREDIT in lib/plans.ts for why teachers never see pence
 * of model spend.
 *
 * The list filters on `available_to`, but that is presentation only — RLS does
 * not enforce that column, so /api/stripe/topup checks it again before taking
 * any money.
 *
 * Credits appear here, in the sidebar meter and on the account page. Nowhere
 * else: no per-tool costs on cards, no chips on list rows.
 */

const nf = new Intl.NumberFormat("en-GB");

export default function TopUpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { start, loading, error } = useTopUp();
  // Only queried while open, so opening the sidebar does not fetch packs for a
  // dialog nobody asked for.
  const { packs, loading: loadingPacks, empty } = useTopUpPacks(open);
  // Null until the teacher picks one. The DEFAULT is derived below rather than
  // written into state by an effect: the packs arrive asynchronously, so an
  // effect would set state on the render after they land and cascade a second
  // one. Deriving it means the first pack is selected the moment the list
  // exists.
  const [chosen, setChosen] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // A chosen pack that is still in the list wins; otherwise the first (lowest
  // sort). The membership test matters: a pack can vanish between renders if it
  // is deactivated while the dialog is open.
  const selected =
    (chosen && packs.some((p) => p.id === chosen) ? chosen : null) ??
    packs[0]?.id ??
    null;

  // Escape closes, and focus moves into the dialog on open so a keyboard user
  // is not left behind on the page underneath.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Not while a checkout is being opened: dismissing the dialog mid-flight
      // hides the error if it fails, and the redirect lands anyway if it works.
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, loading]);

  // Tab stays inside while open, and focus goes back to whatever opened it
  // (the sidebar's top-up button) on close.
  useFocusTrap(dialogRef, open);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // Scroll lock, matching AppShellV2's drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Rendered through a portal so the dialog is not clipped by the sidebar's
  // `overflow-y: auto`, which is the element it is opened from.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className={styles.modal}
      >
        <h2 id="topup-title" className={styles.title}>
          Top up credits
        </h2>
        <p className={styles.sub}>
          A top up sits on top of your monthly refill and is used first.
        </p>

        {loadingPacks ? (
          <p className={styles.note}>Loading…</p>
        ) : empty ? (
          <p className={styles.note}>
            There are no top ups available on your plan right now.
          </p>
        ) : (
          <div
            className={styles.packs}
            role="radiogroup"
            aria-label="Choose a top up"
          >
            {packs.map((pack) => {
              const isSelected = pack.id === selected;
              return (
                <button
                  key={pack.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={loading}
                  onClick={() => setChosen(pack.id)}
                  className={`${styles.pack} ${isSelected ? "" : styles.packIdle}`}
                >
                  <span className={styles.packName}>
                    {nf.format(packCredits(pack))} credits
                    {/* The pack's own name, when it says more than the size
                        does. Skipped when it is the generic seeded label. */}
                    {pack.name && !/^AI credit top-up$/i.test(pack.name) && (
                      <span className={styles.packSub}>{pack.name}</span>
                    )}
                  </span>
                  <span className={styles.packPrice}>
                    £{pack.priceGbp.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className={styles.note}>
          Top ups run to the end of the month, alongside your plan allowance.
        </p>

        {error && (
          <p className={styles.note} style={{ color: "#c2342b" }} role="alert">
            {error}
          </p>
        )}

        <div className={styles.foot}>
          <button
            type="button"
            className={styles.cancel}
            onClick={onClose}
            disabled={loading}
          >
            Not now
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={styles.save}
            onClick={() => void start(selected)}
            disabled={loading || loadingPacks || !selected}
          >
            {loading ? "Starting checkout…" : "Continue"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
