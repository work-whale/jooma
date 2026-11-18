"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import styles from "./PromptSheet.module.css";

/*
 * One sheet for the Jooma 4.5 prompts (P2, P3, P5). Portalled to <body>;
 * Escape and the scrim close it; focus stays inside. The caller decides what
 * every button does; this only lays them out.
 */

export interface SheetButton {
  label: string;
  onClick: () => void;
  kind?: "primary" | "secondary" | "link";
  disabled?: boolean;
}

export default function PromptSheet({
  id,
  kicker,
  pictures,
  title,
  children,
  buttons,
  onClose,
}: {
  id: string;
  kicker?: string;
  /** Orange kicker: the picture prompt. */
  pictures?: boolean;
  title: string;
  children?: ReactNode;
  buttons: SheetButton[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button[data-first]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={styles.sheet}
        data-testid={`prompt-${id}`}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X weight="bold" />
        </button>
        {kicker && <span className={`${styles.kicker} ${pictures ? styles.kickerPic : ""}`}>{kicker}</span>}
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {children}
        <div className={styles.actions}>
          {buttons.map((b, i) => (
            <button
              key={b.label}
              type="button"
              data-first={i === 0 ? "" : undefined}
              className={styles[b.kind ?? (i === 0 ? "primary" : "secondary")]}
              onClick={b.onClick}
              disabled={b.disabled}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { styles as promptStyles };
