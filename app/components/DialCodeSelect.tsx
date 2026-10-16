"use client";

// Shared by the real signup journey (complete-profile) and the admin "Add
// teacher" modal, so both use the same country list and picker instead of
// drifting apart over time.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type Country = { name: string; code: string; dial: string };

export const COUNTRIES: Country[] = [
  { name: "United Kingdom", code: "GB", dial: "+44" },
  { name: "Ireland", code: "IE", dial: "+353" },
  { name: "France", code: "FR", dial: "+33" },
  { name: "Germany", code: "DE", dial: "+49" },
  { name: "Netherlands", code: "NL", dial: "+31" },
  { name: "Spain", code: "ES", dial: "+34" },
  { name: "Italy", code: "IT", dial: "+39" },
  { name: "Portugal", code: "PT", dial: "+351" },
  { name: "Belgium", code: "BE", dial: "+32" },
  { name: "Sweden", code: "SE", dial: "+46" },
  { name: "Norway", code: "NO", dial: "+47" },
  { name: "Denmark", code: "DK", dial: "+45" },
  { name: "Finland", code: "FI", dial: "+358" },
  { name: "Poland", code: "PL", dial: "+48" },
  { name: "Switzerland", code: "CH", dial: "+41" },
  { name: "Austria", code: "AT", dial: "+43" },
  { name: "United States", code: "US", dial: "+1" },
  { name: "Canada", code: "CA", dial: "+1" },
  { name: "Australia", code: "AU", dial: "+61" },
  { name: "New Zealand", code: "NZ", dial: "+64" },
  { name: "South Africa", code: "ZA", dial: "+27" },
  { name: "India", code: "IN", dial: "+91" },
  { name: "Singapore", code: "SG", dial: "+65" },
  { name: "Hong Kong", code: "HK", dial: "+852" },
  { name: "Japan", code: "JP", dial: "+81" },
  { name: "United Arab Emirates", code: "AE", dial: "+971" },
];

export const DEFAULT_DIAL_CODE = "GB";

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
