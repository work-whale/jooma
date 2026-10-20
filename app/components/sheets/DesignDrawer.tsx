"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./DesignDrawer.module.css";

/**
 * The Design panel as a sidebar on the right, over the page and its header,
 * so the sheet keeps its place and every change shows on it at once. Inline,
 * it sat above the sheet on a phone and pushed it a long scroll away.
 *
 * Portalled to the body: the signed in workspace clips its own overflow, and
 * nothing around the result should be able to clip this. Escape closes it.
 */
export default function DesignDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.drawer} data-testid="sheet-design-drawer">
      {children}
    </div>,
    document.body,
  );
}
