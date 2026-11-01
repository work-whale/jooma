"use client";

import Link from "next/link";
import { X } from "lucide-react";
import Modal from "@/app/components/Modal";
import { planCardPrice } from "@/app/lib/plan-copy";
import styles from "./guest.module.css";

/**
 * The prompt behind everything a locked account cannot do.
 *
 * AuthGateModal's counterpart for someone already signed in: the same triggers,
 * but what gets them past it is a plan rather than an account.
 */
export default function ChoosePlanModal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Overrides the lede, e.g. when today's free tries have been used. */
  message?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} width="min(440px, 94vw)">
      <div className={styles.gate} data-testid="choose-plan-gate">
        <button type="button" className={styles.gateClose} onClick={onClose} aria-label="Close">
          <X aria-hidden="true" />
        </button>
        <h2 className={styles.gateTitle}>{title}</h2>
        <p className={styles.gateLede}>
          {message ??
            `Plans start at ${planCardPrice("standard")} a month, with all thirty five tools, your exports and your credits.`}
        </p>
        <Link href="/pricing" className={styles.gateSubmit} style={{ display: "block", textDecoration: "none" }}>
          Choose a plan
        </Link>
      </div>
    </Modal>
  );
}
