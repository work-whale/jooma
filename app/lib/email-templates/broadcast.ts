// Bulk email: marketing, signup reminders, information and service notices,
// written by an admin in /admin/emails and sent to many people at once.
//
// PURE ON PURPOSE. The Compose tab renders its preview in the browser through
// renderBroadcast() on every keystroke, the sender renders each recipient's copy
// through the same function on the server, and the unit runner tests it
// directly. One renderer means the preview cannot drift from what lands.
//
// SAFETY. An admin types plain text with a small formatting subset, never HTML.
// Everything is escaped first and the only tags in the output are ones this
// file wrote. Links are limited to http(s) and mailto, so a javascript: href
// cannot reach an inbox.

import { H1, P, button, escapeHtml, interpolate, layout, siteUrl } from "./markup";

// ── Purposes ────────────────────────────────────────────────────────────────

export const PURPOSES = ["marketing", "signup_reminder", "information", "notice"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABEL: Record<Purpose, string> = {
  marketing: "Marketing",
  signup_reminder: "Signup reminder",
  information: "Information",
  notice: "Service notice",
};

export const PURPOSE_HINT: Record<Purpose, string> = {
  marketing: "News, offers and features. Skips anyone who unsubscribed.",
  signup_reminder: "Nudges people to finish signing up. Skips anyone who unsubscribed.",
  information: "General updates worth knowing. Skips anyone who unsubscribed.",
  notice:
    "Account, service or legal changes people must hear about. Goes to everyone in the audience, including people who unsubscribed, so use it only for that.",
};

export function isPurpose(p: unknown): p is Purpose {
  return typeof p === "string" && (PURPOSES as readonly string[]).includes(p);
}

/** Every purpose except a service notice honours the opt-out list and carries
 *  an unsubscribe link. Mirrors email_audience_members() in the migration. */
export function respectsOptOut(purpose: string): boolean {
  return purpose !== "notice";
}

// ── Audiences ───────────────────────────────────────────────────────────────

export const AUDIENCES = ["all_teachers", "free", "paying", "incomplete_signups", "emails"] as const;
export type AudienceKind = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<AudienceKind, string> = {
  all_teachers: "All teachers",
  free: "Free plan",
  paying: "Paying teachers",
  incomplete_signups: "Incomplete signups",
  emails: "Chosen addresses",
};

export const AUDIENCE_HINT: Record<AudienceKind, string> = {
  all_teachers: "Everyone who finished signing up.",
  free: "Finished signing up, on the free plan.",
  paying: "On any paid plan.",
  incomplete_signups: "Created an account but never finished their profile.",
  emails: "Specific people with a Jooma account, up to 50.",
};

/** Split a pasted list into clean addresses: commas, semicolons, spaces or new
 *  lines, lower-cased, de-duplicated, anything that is not an address dropped. */
export function parseEmailList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase().replace(/^<|>$/g, "");
    if (EMAIL_RE.test(e)) seen.add(e);
  }
  return [...seen];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Addresses on a domain reserved by RFC 2606 / RFC 6761 can never be
 * delivered. The e2e fixtures live on @jooma.test, and skipping these is what
 * lets the tests run the whole send pipeline on staging without bouncing.
 */
export function isUndeliverable(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain);
}

// ── Content ─────────────────────────────────────────────────────────────────

export interface BroadcastContent {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

export const EMPTY_CONTENT: BroadcastContent = {
  subject: "",
  preheader: "",
  heading: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
};

/** The snake_case row the database returns, as the editor's shape. */
export function contentFromRow(row: {
  subject: string | null;
  preheader: string | null;
  heading: string | null;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
}): BroadcastContent {
  return {
    subject: row.subject ?? "",
    preheader: row.preheader ?? "",
    heading: row.heading ?? "",
    body: row.body ?? "",
    ctaLabel: row.cta_label ?? "",
    ctaUrl: row.cta_url ?? "",
  };
}

/** The editor's shape, as the snake_case payload the RPCs take. */
export function contentToRow(c: BroadcastContent) {
  return {
    subject: c.subject,
    preheader: c.preheader,
    heading: c.heading,
    body: c.body,
    cta_label: c.ctaLabel,
    cta_url: c.ctaUrl,
  };
}

/**
 * What is wrong with this email, in words an admin can act on, or null.
 * admin_create_email_campaign() checks the same things and has the last word;
 * this copy exists so the form can say so before a round trip.
 */
export function validateBroadcast(c: BroadcastContent): string | null {
  if (!c.subject.trim()) return "The email needs a subject.";
  if (c.subject.trim().length > 200) return "Keep the subject under 200 characters.";
  if (!c.body.trim()) return "The email needs a body.";
  if (c.body.length > 20000) return "The body is too long.";
  const label = c.ctaLabel.trim();
  const url = c.ctaUrl.trim();
  if (Boolean(label) !== Boolean(url)) return "A button needs both a label and a link.";
  if (url && !/^(https?:\/\/|\{\{\w+\}\})/.test(url)) {
    return "The button link must start with https:// or be a placeholder.";
  }
  return null;
}

// ── Recipients and placeholders ─────────────────────────────────────────────

export interface BroadcastRecipient {
  email: string;
  firstName: string | null;
}

/** Who the preview pretends to be writing to. */
export const BROADCAST_SAMPLE: BroadcastRecipient = {
  email: "sam.taylor@example.com",
  firstName: "Sam",
};

export const PLACEHOLDERS: { name: string; hint: string }[] = [
  { name: "firstName", hint: "Their first name, or \"there\" when we do not know it" },
  { name: "email", hint: "Their email address" },
  { name: "siteUrl", hint: "The Jooma home page" },
  { name: "completeSignupUrl", hint: "Where to finish signing up" },
];

export function broadcastParams(r: BroadcastRecipient): Record<string, string> {
  const base = siteUrl();
  return {
    // Incomplete signups have no profile, so no name. "Hi there" reads
    // naturally; "Hi ," does not.
    firstName: r.firstName?.trim() || "there",
    email: r.email,
    siteUrl: base,
    // /login rather than /complete-profile: the reader usually has no session
    // any more, and signing in lands a profileless account on the form anyway
    // (the profile gate in proxy.ts). Google users take the same route.
    completeSignupUrl: `${base}/login`,
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const LINK_STYLE = "color:#5B2ED6;font-weight:700;text-decoration:underline;";
const UL = 'style="margin:0 0 16px 0;padding:0 0 0 22px;color:#3C3552;font-size:15px;line-height:1.6;"';
const LI = 'style="margin:0 0 6px 0;"';
const BULLET = /^\s*[-*•]\s+/;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** A link target we are willing to put in an href, or null. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(u)) return u;
  if (/^mailto:[^\s<>"']+$/i.test(u)) return u;
  return null;
}

/** **bold** and *italic*, applied to text that is ALREADY escaped. Asterisks
 *  survive escaping untouched, so nothing typed can smuggle a tag in here. */
function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
}

/** One line: links first (so a URL's characters are never read as emphasis),
 *  every other stretch escaped and then emphasised. */
function inline(raw: string): string {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(LINK)) {
    const at = m.index ?? 0;
    out += emphasis(escapeHtml(raw.slice(last, at)));
    const href = safeHref(m[2]);
    out += href
      ? `<a href="${escapeHtml(href)}" style="${LINK_STYLE}">${emphasis(escapeHtml(m[1]))}</a>`
      : emphasis(escapeHtml(m[0]));
    last = at + m[0].length;
  }
  return out + emphasis(escapeHtml(raw.slice(last)));
}

/**
 * The body box, as email HTML.
 *
 *   blank line        new paragraph
 *   single new line   line break
 *   - item            bulleted list (every line of the block)
 *   **bold** *italic* [text](https://...)
 */
export function formatBody(text: string): string {
  const trimmed = text.replace(/\r\n?/g, "\n").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => BULLET.test(l))) {
        const items = lines.map((l) => `<li ${LI}>${inline(l.replace(BULLET, ""))}</li>`).join("");
        return `<ul ${UL}>${items}</ul>`;
      }
      return `<p ${P}>${lines.map(inline).join("<br />")}</p>`;
    })
    .join("\n");
}

/** The same body as plain text, for the text/plain part. Clients that show it
 *  (and spam filters that read it) get words, not markdown. */
export function plainBody(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .replace(LINK, (_, label: string, url: string) => (safeHref(url) ? `${label} (${url})` : `${label}`))
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/^\s*[*•]\s+/gm, "- ");
}

// ── Unsubscribe ─────────────────────────────────────────────────────────────

/** The page a reader lands on from the footer link. Asks before acting, so a
 *  link scanner that fetches every URL in an email cannot unsubscribe anyone. */
export function unsubscribePageUrl(token: string): string {
  return `${siteUrl()}/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** The RFC 8058 target for the List-Unsubscribe header: a POST, which scanners
 *  do not send, so it may act immediately. */
export function oneClickUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

function footerFor(purpose: string, unsubscribeUrl: string | null): string {
  if (!respectsOptOut(purpose)) {
    return "You are receiving this service notice because you have a Jooma account.";
  }
  const why =
    purpose === "signup_reminder"
      ? "You are receiving this because you started creating a Jooma account."
      : "You are receiving this because you have a Jooma account.";
  if (!unsubscribeUrl) return why;
  return `${why} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6D6683;text-decoration:underline;">Unsubscribe</a>`;
}

// ── Render ──────────────────────────────────────────────────────────────────

export interface RenderedBroadcast {
  subject: string;
  html: string;
  text: string;
}

/**
 * One recipient's copy of a bulk email.
 *
 * Placeholders are filled BEFORE formatting, so a value carrying markup is
 * escaped along with everything else, the same order prose() uses for the
 * transactional templates.
 */
export function renderBroadcast(
  content: BroadcastContent,
  recipient: BroadcastRecipient,
  opts: { purpose: string; unsubscribeUrl: string | null },
): RenderedBroadcast {
  const params = broadcastParams(recipient);
  const fill = (s: string) => interpolate(s, params);

  // Subjects are one line. A pasted newline would be rejected by some servers
  // and split the header on others.
  const subject = fill(content.subject).replace(/\s+/g, " ").trim();
  const heading = fill(content.heading).trim();
  const body = fill(content.body);
  const ctaLabel = fill(content.ctaLabel).trim();
  const ctaHref = safeHref(fill(content.ctaUrl));
  const preheader = fill(content.preheader).trim();

  const parts: string[] = [];
  if (heading) parts.push(`<h1 ${H1}>${escapeHtml(heading)}</h1>`);
  const formatted = formatBody(body);
  if (formatted) parts.push(formatted);
  if (ctaLabel && ctaHref) parts.push(button(escapeHtml(ctaLabel), escapeHtml(ctaHref)));

  const footer = footerFor(opts.purpose, opts.unsubscribeUrl);
  const html = layout(parts.join("\n"), {
    preheader: preheader || undefined,
    footerHtml: footer,
  });

  const textParts: string[] = [];
  if (heading) textParts.push(heading);
  if (body.trim()) textParts.push(plainBody(body));
  if (ctaLabel && ctaHref) textParts.push(`${ctaLabel}: ${ctaHref}`);
  const unsubscribeLine =
    respectsOptOut(opts.purpose) && opts.unsubscribeUrl
      ? `\n\nUnsubscribe: ${opts.unsubscribeUrl}`
      : "";
  const text = `${textParts.join("\n\n")}\n\n--\nJooma${unsubscribeLine}\n`;

  return { subject, html, text };
}

/** Kept beside the renderer so the preview can show the same small print. */
export const FORMATTING_HELP =
  "Blank line for a new paragraph. Start lines with - for a list. **bold**, *italic*, [link text](https://...).";
