// The ambassador application: its options, and the rules every field follows.
//
// Shared by the three-step form (so a mistake shows on the step it was made on)
// and by /api/ambassadors/apply and /api/ambassadors/details (so nothing reaches
// the database that the form would have refused). The table's own checks in
// 20261014000000_ambassador_programme_v2.sql are the backstop, not the
// messages: these are.
//
// Pure, pinned by tests/unit/ambassador-application.spec.ts.

export const SOURCE_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "ambassador", label: "Referred by an ambassador" },
  { value: "inbound", label: "Inbound" },
  { value: "other", label: "Other" },
] as const;
export type InviteSource = (typeof SOURCE_OPTIONS)[number]["value"];

export function sourceLabel(value: string | null | undefined): string {
  return SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? "Unknown";
}

export const REACH_OPTIONS = [
  { value: "under_1k", label: "Under 1,000" },
  { value: "1k_5k", label: "1,000 to 5,000" },
  { value: "5k_25k", label: "5,000 to 25,000" },
  { value: "25k_100k", label: "25,000 to 100,000" },
  { value: "over_100k", label: "Over 100,000" },
] as const;

export function reachLabel(value: string | null | undefined): string {
  return REACH_OPTIONS.find((o) => o.value === value)?.label ?? "Not given";
}

export const TAX_OPTIONS = [
  { value: "self_assessment", label: "Self assessment, as an individual" },
  { value: "limited_company", label: "Through a limited company" },
  { value: "not_sure", label: "I am not sure yet" },
] as const;

/** The one way an ambassador declares commission. Earlier applications could
 *  pick another, so TAX_OPTIONS stays to label those rows. */
export const TAX_STATUS = "self_assessment";

export function taxLabel(value: string | null | undefined): string {
  return TAX_OPTIONS.find((o) => o.value === value)?.label ?? "Not given";
}

/** The channels asked for, in the mockup's order. At least one is needed. */
export const CHANNELS = [
  { key: "instagram", label: "Instagram", prefix: "instagram.com/" },
  { key: "tiktok", label: "TikTok", prefix: "tiktok.com/@" },
  { key: "x_handle", label: "X", prefix: "x.com/" },
  { key: "facebook", label: "Facebook", prefix: "facebook.com/" },
  { key: "youtube", label: "YouTube", prefix: "youtube.com/@" },
  { key: "linkedin", label: "LinkedIn", prefix: "linkedin.com/in/" },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];

/** What a code looks like, shown under the code field. */
export const CODE_EXAMPLES = ["PRIYA-4K2", "MRSJONES", "YEAR4MATHS", "MISSKTEACHES"];

// ── The code ─────────────────────────────────────────────────────────────────

/** Uppercase, no spaces. What is stored and what Stripe is given. */
export function normaliseAmbassadorCode(raw: string): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Why a code cannot be used as written, or null if it can. */
export function codeProblem(raw: string): string | null {
  const code = normaliseAmbassadorCode(raw);
  if (!code) return "Choose the code teachers will type.";
  if (code.length < 4) return "Use at least 4 characters.";
  if (code.length > 20) return "Use 20 characters or fewer.";
  if (!/^[A-Z0-9-]+$/.test(code)) return "Use letters, numbers and hyphens only.";
  if (!/[A-Z]/.test(code)) return "Include at least one letter.";
  if (code.startsWith("-") || code.endsWith("-")) return "Start and end with a letter or number.";
  return null;
}

// ── Small normalisers ────────────────────────────────────────────────────────

/** "@priya", "instagram.com/priya", "https://www.tiktok.com/@priya/" all become "priya". */
export function normaliseHandle(raw: string): string {
  let h = String(raw ?? "").trim();
  h = h.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  h = h.replace(/^[a-z]+\.[a-z]+\/(in\/)?/i, "");
  h = h.replace(/^@/, "").replace(/\/+$/, "");
  return h;
}

/** Six digits, however typed, as "04-00-75". Anything else is returned as is
 *  for the validator to refuse. */
export function normaliseSortCode(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 6) return String(raw ?? "").trim();
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export function normaliseAccountNumber(raw: string): string {
  return String(raw ?? "").replace(/[\s-]/g, "");
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── The steps ────────────────────────────────────────────────────────────────
// Social, Payout, Agreement. There is no Personal step: name, email and mobile
// come from the account (signup asks for them), and the rest of Personal is an
// "About you" block on the Payout step.

export interface PersonalInput {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  date_of_birth: string;
  address_line: string;
  town: string;
  postcode: string;
  school: string;
  teaches: string;
}

export interface ChannelsInput {
  instagram: string;
  tiktok: string;
  x_handle: string;
  facebook: string;
  youtube: string;
  linkedin: string;
  reach: string;
  note: string;
}

export interface PayoutInput {
  payout_method: "bank" | "paypal";
  account_holder: string;
  sort_code: string;
  account_number: string;
  bank_name: string;
  paypal_email: string;
  tax_status: string;
  utr: string;
  requested_code: string;
}

export interface AgreementInput {
  signature_name: string;
  read: boolean;
  tax: boolean;
  disclosure: boolean;
}

export type FieldErrors = Record<string, string>;

function required(value: string, max: number, message: string, errors: FieldErrors, key: string) {
  const v = String(value ?? "").trim();
  if (!v) errors[key] = message;
  else if (v.length > max) errors[key] = `Keep this under ${max} characters.`;
}

/** Whole years between a date of birth and `now`. */
export function ageOn(dob: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  const before = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (before) age -= 1;
  return age;
}

export function validatePersonal(p: PersonalInput, now = new Date()): FieldErrors {
  const e: FieldErrors = {};
  required(p.first_name, 60, "Enter your first name.", e, "first_name");
  required(p.last_name, 60, "Enter your last name.", e, "last_name");
  if (!EMAIL.test(String(p.email ?? "").trim())) e.email = "Enter a valid email address.";
  const mobile = String(p.mobile ?? "").replace(/[\s()-]/g, "");
  if (!/^\+?\d{7,15}$/.test(mobile)) e.mobile = "Enter a mobile number, digits only, like +44 7700 900412.";
  const age = ageOn(p.date_of_birth, now);
  if (age === null) e.date_of_birth = "Enter your date of birth.";
  else if (age < 18) e.date_of_birth = "You need to be 18 or over to join.";
  else if (age > 110) e.date_of_birth = "Check your date of birth.";
  required(p.address_line, 160, "Enter your address.", e, "address_line");
  required(p.town, 80, "Enter your town or city.", e, "town");
  const pc = String(p.postcode ?? "").trim();
  if (pc.length < 2 || pc.length > 12) e.postcode = "Enter your postcode.";
  if ((p.school ?? "").length > 160) e.school = "Keep this under 160 characters.";
  if ((p.teaches ?? "").length > 160) e.teaches = "Keep this under 160 characters.";
  return e;
}

/** The Personal fields signup does not collect, asked on the Payout step.
 *  Mobile is among them only for an account that has none. */
export const ABOUT_YOU_FIELDS = ["mobile", "date_of_birth", "address_line", "town", "postcode"] as const;

/** validatePersonal, narrowed to the About you block. */
export function validateAboutYou(p: PersonalInput, now = new Date()): FieldErrors {
  const all = validatePersonal(p, now);
  const e: FieldErrors = {};
  for (const k of ABOUT_YOU_FIELDS) if (all[k]) e[k] = all[k];
  return e;
}

/** A mobile number the form would accept. */
export function isMobile(raw: string | null | undefined): boolean {
  return /^\+?\d{7,15}$/.test(String(raw ?? "").replace(/[\s()-]/g, ""));
}

/**
 * The applicant's Personal details: name and email from the account, always,
 * so the form cannot send someone else's. The mobile is the account's when it
 * has a usable one, otherwise what they typed in About you.
 */
export function personalFromAccount(
  typed: PersonalInput,
  account: { first_name: string | null; surname: string | null; email: string | null; mobile: string },
): PersonalInput {
  return {
    ...typed,
    first_name: account.first_name ?? "",
    last_name: account.surname ?? "",
    email: account.email ?? "",
    mobile: isMobile(account.mobile) ? account.mobile : typed.mobile,
    school: "",
    teaches: "",
  };
}

export function validateChannels(c: ChannelsInput): FieldErrors {
  const e: FieldErrors = {};
  const any = CHANNELS.some((ch) => normaliseHandle(c[ch.key]).length > 0);
  if (!any) e.channels = "Add at least one account you post from.";
  for (const ch of CHANNELS) {
    if (normaliseHandle(c[ch.key]).length > 100) e[ch.key] = "That handle is too long.";
  }
  if (!REACH_OPTIONS.some((o) => o.value === c.reach)) e.reach = "Choose roughly how many followers.";
  if ((c.note ?? "").length > 2000) e.note = "Keep this under 2,000 characters.";
  return e;
}

/** Where to pay them, and tax. The code is checked separately (codeProblem),
 *  because it lives on the same step but is not part of updating payout details. */
export function validatePayoutDetails(p: Omit<PayoutInput, "tax_status" | "utr" | "requested_code">): FieldErrors {
  const e: FieldErrors = {};
  required(p.account_holder, 120, "Enter the name on the account.", e, "account_holder");
  if (p.payout_method === "bank") {
    if (!/^\d{2}-\d{2}-\d{2}$/.test(normaliseSortCode(p.sort_code))) e.sort_code = "A sort code is 6 digits.";
    if (!/^\d{8}$/.test(normaliseAccountNumber(p.account_number))) e.account_number = "An account number is 8 digits.";
    required(p.bank_name, 120, "Enter your bank's name.", e, "bank_name");
  } else if (p.payout_method === "paypal") {
    if (!EMAIL.test(String(p.paypal_email ?? "").trim())) e.paypal_email = "Enter the email address of your PayPal account.";
  } else {
    e.payout_method = "Choose how we pay you.";
  }
  return e;
}

export function validateTax(t: { tax_status: string; utr: string }): FieldErrors {
  const e: FieldErrors = {};
  if (t.tax_status !== TAX_STATUS) e.tax_status = "Commission is declared through self assessment.";
  const utr = String(t.utr ?? "").replace(/\s/g, "");
  if (utr && !/^\d{10}$/.test(utr)) e.utr = "A UTR is 10 digits.";
  return e;
}

export function validatePayout(p: PayoutInput): FieldErrors {
  const e = { ...validatePayoutDetails(p), ...validateTax(p) };
  const codeIssue = codeProblem(p.requested_code);
  if (codeIssue) e.requested_code = codeIssue;
  return e;
}

export function validateAgreement(a: AgreementInput): FieldErrors {
  const e: FieldErrors = {};
  if (!a.read || !a.tax || !a.disclosure) e.declarations = "Tick all three to continue.";
  const sig = String(a.signature_name ?? "").trim();
  if (sig.length < 4) e.signature_name = "Type your full name to sign.";
  else if (sig.length > 120) e.signature_name = "That name is too long.";
  return e;
}

export interface ApplicationInput {
  personal: PersonalInput;
  channels: ChannelsInput;
  payout: PayoutInput;
  agreement: AgreementInput;
}

/** The row submit_ambassador_application() inserts, minus what the server adds
 *  (version, IP, user agent). */
export type ApplicationPayload = Record<string, string | null | Record<string, boolean>>;

export type ValidationResult =
  | { ok: true; payload: ApplicationPayload }
  | { ok: false; errors: FieldErrors };

/** Check every step and produce the normalised payload. */
export function validateApplication(input: ApplicationInput, now = new Date()): ValidationResult {
  const errors = {
    ...validatePersonal(input.personal, now),
    ...validateChannels(input.channels),
    ...validatePayout(input.payout),
    ...validateAgreement(input.agreement),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const p = input.personal;
  const c = input.channels;
  const pay = input.payout;
  const bank = pay.payout_method === "bank";
  const opt = (v: string) => (String(v ?? "").trim() ? String(v).trim() : null);

  return {
    ok: true,
    payload: {
      first_name: p.first_name.trim(),
      last_name: p.last_name.trim(),
      email: p.email.trim().toLowerCase(),
      mobile: p.mobile.trim(),
      date_of_birth: p.date_of_birth,
      address_line: p.address_line.trim(),
      town: p.town.trim(),
      postcode: p.postcode.trim().toUpperCase(),
      school: opt(p.school),
      teaches: opt(p.teaches),
      instagram: opt(normaliseHandle(c.instagram)),
      tiktok: opt(normaliseHandle(c.tiktok)),
      x_handle: opt(normaliseHandle(c.x_handle)),
      facebook: opt(normaliseHandle(c.facebook)),
      youtube: opt(normaliseHandle(c.youtube)),
      linkedin: opt(normaliseHandle(c.linkedin)),
      reach: c.reach,
      note: opt(c.note),
      payout_method: pay.payout_method,
      account_holder: pay.account_holder.trim(),
      sort_code: bank ? normaliseSortCode(pay.sort_code) : null,
      account_number: bank ? normaliseAccountNumber(pay.account_number) : null,
      bank_name: bank ? pay.bank_name.trim() : null,
      paypal_email: bank ? null : pay.paypal_email.trim().toLowerCase(),
      tax_status: TAX_STATUS,
      utr: opt(String(pay.utr ?? "").replace(/\s/g, "")),
      requested_code: normaliseAmbassadorCode(pay.requested_code),
      signature_name: input.agreement.signature_name.trim(),
      declarations: {
        read: input.agreement.read,
        tax: input.agreement.tax,
        disclosure: input.agreement.disclosure,
      },
    },
  };
}

/** "•••• 5678". */
export function maskAccount(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "Not given";
}
