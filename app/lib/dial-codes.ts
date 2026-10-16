// The country list behind the dial code picker, and how a stored profile
// number becomes one a person can dial.
//
// profiles.dial_code holds the ISO country ("GB"), not the prefix ("+44"):
// the picker stores the country so two countries sharing +1 stay distinct.
// Anything that shows or reuses the number has to map it back, which is what
// profileMobile does. Kept out of DialCodeSelect.tsx because that file is a
// client component, and server code cannot read a client module's values.
//
// Pure, pinned by tests/unit/profile-mobile.spec.ts.

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

/** "+44", from "GB" or an already prefixed "+44" / "44". Null when unknown. */
export function dialPrefix(dialCode: string | null | undefined): string | null {
  const raw = String(dialCode ?? "").trim();
  if (!raw) return null;
  const country = COUNTRIES.find((c) => c.code === raw.toUpperCase());
  if (country) return country.dial;
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/**
 * A profile's number in international form, digits only after the plus:
 * ("GB", "07700 900412") gives "+447700900412". The leading 0 is the UK style
 * trunk prefix, dropped once the country code is in front. A number already
 * typed with a plus is kept as typed. Empty when there is no number.
 */
export function profileMobile(dialCode: string | null | undefined, phone: string | null | undefined): string {
  const typed = String(phone ?? "").replace(/[\s()-]/g, "");
  if (!typed) return "";
  if (typed.startsWith("+")) return typed;
  if (typed.startsWith("00")) return `+${typed.slice(2)}`;
  const prefix = dialPrefix(dialCode);
  if (!prefix) return typed;
  return `${prefix}${typed.replace(/^0+/, "")}`;
}
