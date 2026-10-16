"use client";

// Shared by the real signup journey (complete-profile) and the admin "Add
// teacher" modal, so both use the same country list and picker instead of
// drifting apart over time.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { COUNTRIES, DEFAULT_DIAL_CODE, type Country } from "@/app/lib/dial-codes";

export { COUNTRIES, DEFAULT_DIAL_CODE, type Country };

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, handler]);
}

export function Flag({ code, rounded, className }: { code: string; rounded?: boolean; className?: string }) {
  const src = `https://flagcdn.com/${code.toLowerCase()}.svg`;
  if (rounded) {
    return (
      <span className={`inline-block rounded-full overflow-hidden shrink-0 ${className ?? ""}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" className={`inline-block shrink-0 ${className ?? ""}`} />;
}

export default function DialCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = COUNTRIES.find((c) => c.code === value) ?? COUNTRIES[0];

  useClickOutside(wrapperRef, () => setOpen(false));

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 pl-3 pr-3 py-3 border border-line rounded-xl bg-white text-sm font-medium leading-tight tracking-tight focus:outline-none focus:border-dark transition-colors"
      >
        <Flag code={selected.code} rounded className="w-5 h-5" />
        <span>{selected.dial}</span>
        <ChevronDown className="w-4 h-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-64 max-h-72 overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          <ul role="listbox" className="py-1">
            {COUNTRIES.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-(--j-tint) transition-colors"
                >
                  <Flag code={c.code} rounded className="w-5 h-5" />
                  <span className="flex-1 text-left">{c.name}</span>
                  <span className="text-muted">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
