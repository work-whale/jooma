"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Country = { name: string; code: string; dial: string };

const COUNTRIES: Country[] = [
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

const DEFAULT_CODE = "GB";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [dialCountry, setDialCountry] = useState(DEFAULT_CODE);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<string | null>(null);

  const canSubmit =
    firstName.trim() !== "" &&
    surname.trim() !== "" &&
    phone.trim() !== "" &&
    country !== null;

  return (
    <div className="min-h-screen p-6 flex" style={{ backgroundColor: "#F1EFE3" }}>
      <div className="w-full max-w-9xl mx-auto grid gap-6 lg:grid-cols-2">
        {/* Illustration panel */}
        <div
          className="rounded-3xl p-10 flex items-center justify-center"
          style={{ backgroundColor: "#E8E6D9" }}
        >
          <Image
            src="/svgs/teacher.svg"
            alt=""
            width={467}
            height={662}
            priority
            className="w-auto h-full max-h-full object-contain"
          />
        </div>

        {/* Form panel */}
        <div
          className="rounded-3xl px-10 py-12 flex flex-col"
          style={{ backgroundColor: "#FAF9F5" }}
        >
          <div className="mx-auto w-full max-w-110 flex-1 flex flex-col justify-center">
            <h1 className="text-center text-3xl font-medium text-muted mb-6">Jooma</h1>

            <div className="text-center mb-8">
              <h2 className="text-4xl font-medium leading-tight tracking-tight">
                Save hours
                <br />
                of planning time
              </h2>
              <p className="mt-3 text-sm text-muted font-light">
                Create differentiated lessons instantly with AI.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                sessionStorage.removeItem("jooma:auth-email");
                router.push("/");
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <Field label="First name" htmlFor="firstName">
                  <TextInput
                    id="firstName"
                    value={firstName}
                    onChange={setFirstName}
                    placeholder="First name"
                  />
                </Field>
                <Field label="Surname" htmlFor="surname">
                  <TextInput
                    id="surname"
                    value={surname}
                    onChange={setSurname}
                    placeholder="Surname"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Phone number" htmlFor="phone">
                  <div className="flex gap-2">
                    <DialCodeSelect value={dialCountry} onChange={setDialCountry} />
                    <input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone number"
                      className="flex-1 min-w-0 px-4 py-3 border border-line rounded-xl bg-white text-sm leading-tight tracking-tight font-medium placeholder-[#A5A5A5] placeholder:font-light focus:outline-none focus:border-dark transition-colors"
                    />
                  </div>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Country" htmlFor="country">
                  <CountrySelect value={country} onChange={setCountry} />
                </Field>
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  Create account
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm mb-2 leading-tight tracking-tight font-medium"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 border border-line rounded-xl bg-white text-sm leading-tight tracking-tight font-medium placeholder-[#A5A5A5] placeholder:font-light focus:outline-none focus:border-dark transition-colors"
    />
  );
}

function Flag({ code, rounded, className }: { code: string; rounded?: boolean; className?: string }) {
  const src = `https://flagcdn.com/${code.toLowerCase()}.svg`;
  if (rounded) {
    return (
      <span
        className={`inline-block rounded-full overflow-hidden shrink-0 ${className ?? ""}`}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" className={`inline-block shrink-0 ${className ?? ""}`} />;
}

function DialCodeSelect({
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
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#F1EFE3] transition-colors"
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

function CountrySelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = value ? COUNTRIES.find((c) => c.code === value) ?? null : null;

  useClickOutside(wrapperRef, () => setOpen(false));

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const displayValue = open ? query : selected?.name ?? "";

  return (
    <div ref={wrapperRef} className="relative">
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className={`w-full flex items-center gap-3 pl-4 pr-10 py-3 border rounded-xl bg-white text-sm leading-tight tracking-tight font-medium transition-colors cursor-text ${
          open ? "border-dark" : "border-line hover:border-dark"
        }`}
      >
        {selected && !open && <Flag code={selected.code} className="w-6 h-4" />}
        <input
          ref={inputRef}
          id="country"
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search or select a country"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex-1 min-w-0 bg-transparent text-left placeholder-[#A5A5A5] placeholder:font-light focus:outline-none"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No matches</p>
          ) : (
            <ul role="listbox" className="py-1">
              {filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F1EFE3] transition-colors"
                  >
                    <Flag code={c.code} className="w-6 h-4" />
                    <span className="text-left">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, handler]);
}
