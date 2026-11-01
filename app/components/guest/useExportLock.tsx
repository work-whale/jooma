"use client";

import { useState, type ReactNode } from "react";
import type { DropdownItem } from "@/app/components/ui/DropdownMenu";
import { useExportLocked } from "@/app/lib/useAccountAccess";
import ChoosePlanModal from "./ChoosePlanModal";

/*
 * Stops an account that has never paid taking its work out of Jooma: Export,
 * Copy, Print and Present open the plan prompt instead.
 *
 * Enforced in the browser only, the same as the hero. Every export is built on
 * the client from output the page already holds, so there is no server moment at
 * which to refuse. It is a prompt to subscribe, not a protection.
 *
 * Unlocked while the account state is loading and if it cannot be read, so a
 * database blip never stops a paying teacher exporting.
 */

const TITLE = "Choose a plan to export your work";

export interface ExportLock {
  /** Wraps a handler so a locked account gets the prompt rather than the action. */
  guard: <A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A) => unknown;
  /** The same over a whole export menu. */
  guardItems: (items: DropdownItem[]) => DropdownItem[];
  /** Render this wherever the hook is used. Null until it is needed. */
  modal: ReactNode;
}

export function useExportLock(): ExportLock {
  const locked = useExportLocked();
  const [open, setOpen] = useState(false);

  const guard: ExportLock["guard"] =
    (fn) =>
    (...args) => {
      if (locked) {
        setOpen(true);
        return undefined;
      }
      return fn(...args);
    };

  return {
    guard,
    guardItems: (items) =>
      items.map((item) => (item.onSelect ? { ...item, onSelect: guard(item.onSelect) as typeof item.onSelect } : item)),
    modal: open ? <ChoosePlanModal open title={TITLE} onClose={() => setOpen(false)} /> : null,
  };
}
