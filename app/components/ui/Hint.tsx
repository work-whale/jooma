import type { ReactNode } from "react";

/*
 * A short description under a toolbar button, shown on hover or keyboard
 * focus. CSS only, so it appears at once, unlike a native `title`, and looks
 * the same everywhere. It hides while the control it describes has its menu
 * or panel open, where it would only sit on top of it.
 */
export default function Hint({ text, align = "center", children }: { text: string; align?: "center" | "end"; children: ReactNode }) {
  const place = align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="relative inline-flex group/hint">
      {children}
      <span
        role="tooltip"
        className={`absolute ${place} top-full mt-2 w-max max-w-56 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-medium leading-snug text-left whitespace-normal opacity-0 pointer-events-none transition-opacity delay-0 z-40 shadow-lg group-hover/hint:opacity-100 group-hover/hint:delay-300 group-has-focus-visible/hint:opacity-100 group-has-[[aria-expanded=true]]/hint:hidden`}
      >
        {text}
      </span>
    </span>
  );
}
