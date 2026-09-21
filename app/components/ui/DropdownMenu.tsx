"use client";

import { useEffect, useRef, useState } from "react";

// One dropdown, replacing three ad-hoc implementations (QuizGeneratorForm,
// CpdSlideshowForm, and the since-removed LessonSlideshowForm). Only the quiz
// one closed on an outside click; the slideshow menus stayed open until you
// clicked an item or the trigger again, which is the bug this consolidation
// fixes.
//
// Deliberately not a headless-UI dependency: the app has no Radix or shadcn,
// and one menu with a backdrop and an Escape handler is less code than adding
// a component library for it.

export interface DropdownItem {
  label: string;
  onSelect?: () => void;
  /** Renders greyed and unclickable. Use with `note` to say why. */
  disabled?: boolean;
  /** Muted trailing text, e.g. "coming soon". */
  note?: string;
  icon?: React.ReactNode;
  /** Hairline above this item, to group formats. */
  separated?: boolean;
}

interface Props {
  /** The trigger. Rendered inside a <button>, so pass content, not a button. */
  trigger: React.ReactNode;
  items: DropdownItem[];
  /** Trigger classes, so each caller keeps its own button styling. */
  triggerClassName?: string;
  /** Menu width. Wide enough for the longest label. */
  menuClassName?: string;
  align?: "left" | "right";
  disabled?: boolean;
  ariaLabel?: string;
}

export default function DropdownMenu({
  trigger,
  items,
  triggerClassName = "",
  // Capped to the viewport so a menu can never be wider than the screen.
  menuClassName = "w-[min(16rem,calc(100vw-2rem))]",
  align = "right",
  disabled = false,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the trigger, so keyboard users are not
  // stranded at the top of the document. The backdrop below handles pointers.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const select = (item: DropdownItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect?.();
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <>
          {/* Full-viewport backdrop: closes on any outside click, including
              over other interactive elements. z-10 sits under the menu's z-20. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className={`absolute ${align === "right" ? "right-0" : "left-0"} mt-2 ${menuClassName} bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 overflow-hidden`}
          >
            {items.map((item) => (
              <div key={item.label}>
                {item.separated && <div className="my-1 h-px bg-gray-100" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => select(item)}
                  title={item.disabled && item.note ? item.note : undefined}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                    item.disabled
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-700 hover:bg-gray-50 cursor-pointer"
                  }`}
                >
                  {item.icon && <span className="shrink-0 text-gray-400">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                  {item.note && (
                    <span className="text-xs text-gray-400 shrink-0">({item.note})</span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
