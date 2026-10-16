"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/app/lib/useFocusTrap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  height?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  width = "min(640px, 95vw)",
  height,
  actions,
  children,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two rAFs ensure the element is in the DOM before we add the visible class
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus in on open, kept inside while open, and handed back to whatever
  // opened it on close, so a keyboard or switch user is never left behind on
  // the page underneath or dropped at the top of the document.
  useFocusTrap(panelRef, mounted);
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      // Untitled modals (ConfirmModal and friends) draw their own heading, so
      // that names the dialog instead. Set on the node rather than through
      // state: it is the caller's markup, only known once it is mounted.
      if (title === undefined) {
        const heading = panel.querySelector<HTMLElement>("h1, h2, h3");
        if (heading) {
          if (!heading.id) heading.id = `${titleId}-heading`;
          panel.setAttribute("aria-labelledby", heading.id);
        }
      }
      // An autoFocus field inside wins; otherwise the panel itself, so the
      // first Tab lands on the first control rather than skipping it.
      if (!panel.contains(document.activeElement)) panel.focus();
    }
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
    // Once per open: re-running on a title change would steal focus back to
    // the panel and bounce it to the opener mid-dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center"
      style={{
        transition: "background-color 200ms ease",
        backgroundColor: visible ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
        // Clear of the notch and the home indicator on a phone; 1rem anywhere
        // without insets, as before.
        padding:
          "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))",
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl flex flex-col focus:outline-none"
        style={{
          width,
          height,
          // dvh, not vh: on a phone 90vh is measured with the URL bar
          // collapsed, so the bottom of the modal sat under it.
          maxHeight: height ? undefined : "90dvh",
          transition: "opacity 200ms ease, transform 200ms ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1) translateY(0)" : "scale(0.96) translateY(8px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title !== undefined || actions !== undefined) && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
            {title !== undefined && (
              <span id={titleId} className="text-sm font-semibold text-gray-900">{title}</span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {actions}
              {/* Named, since it is an icon on its own, and 48px to tap
                  through the after: layer while it draws at 28px. gray-500
                  rather than 400 so the icon itself clears 3:1 on white. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="relative p-1.5 text-gray-500 hover:text-gray-700 active:bg-gray-100 transition-colors rounded after:absolute after:-inset-2.5 after:content-['']"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
