// ── Transactional email ──────────────────────────────────────────────────────
// SendGrid over its HTTP API. Supabase's built-in auth mailer is deliberately
// not used: its templates live in the Supabase dashboard rather than this repo,
// which would leave /admin/emails decorative, and its send rate limits bite on
// a bulk invite. Supabase still mints the auth tokens (generateLink), so no
// token or session logic lives here — only delivery.
//
// Subject lines, the live/paused switch and the body prose come from the
// email_templates table so an admin can reword or pause an email without a
// deploy. The *structure* stays in code: layout(), the CTA buttons, the reason
// and reply blocks, the security footnotes and every bit of escaping. An admin
// edits sentences, and the override runs through prose() in email-templates/
// shared.ts, which escapes before it wraps — so nothing typed into that
// textarea can inject markup into a teacher's inbox or break the email.
import "server-only";
import sgMail from "@sendgrid/mail";
import { supabaseAdmin } from "./supabase-admin";
import { TEMPLATES, type EmailTemplateKey } from "./email-templates";
import { interpolate, layout } from "./email-templates/markup";
import { isUndeliverable } from "./email-templates/broadcast";

export type { EmailTemplateKey };
// Defined alongside the templates so they can use them without importing this
// module (which imports the template registry) and creating a cycle. layout()
// and interpolate() live there too now, so the browser preview can render
// through the very same functions; they are re-exported here unchanged.
export { escapeHtml, siteUrl, button } from "./email-templates/shared";
export { interpolate, layout } from "./email-templates/markup";

let ready = false;

/** Set the API key on first use. Returns false when the key is absent, which
 *  every caller treats as "not sent" rather than an error — see send(). */
function init(): boolean {
  if (ready) return true;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  sgMail.setApiKey(key);
  ready = true;
  return true;
}

/** Whether email is configured at all. Used by /admin/emails to show whether
 *  these templates are actually going anywhere. */
export function mailerConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

/**
 * Who an email comes from, when the default is wrong for it.
 *
 * SENDGRID_FROM_EMAIL is noreply@jooma.ai, which is correct for automated mail
 * and wrong for a human reply to a school: "noreply" tells the reader not to
 * respond, and with no Reply-To header a mail client aims Reply at the From
 * address, so their answer would land in a mailbox nobody reads.
 *
 * Both fields are optional and no existing caller passes either, so every email
 * that predates this is byte-identical. Only enquiry replies override it.
 */
export interface EmailSender {
  /** Overrides SENDGRID_FROM_EMAIL. Must be a verified sender in SendGrid. */
  from?: string;
  /** Where Reply lands. Omitted from the payload entirely when absent. */
  replyTo?: string;
}

/**
 * The only place that talks to SendGrid.
 *
 * Catches and logs; never throws. Every caller here mutates the database first
 * and mails second, so a throw would either roll back a write that genuinely
 * succeeded or leave the caller to hand-wrap each call. A teacher whose invite
 * email bounced can be re-invited; an auth user created and then rolled back
 * because the mail failed is the worse outcome.
 */
async function send(
  to: string,
  subject: string,
  html: string,
  sender?: EmailSender,
): Promise<boolean> {
  const result = await deliver(to, subject, html, sender);
  return result.ok;
}

/** Extras only bulk email uses. Absent for every transactional send. */
interface DeliveryExtras {
  text?: string;
  headers?: Record<string, string>;
  categories?: string[];
}

/**
 * send(), but saying WHY it failed. Bulk email records the reason against each
 * recipient so the History tab can show it; transactional callers only need
 * the boolean and keep going through send().
 */
async function deliver(
  to: string,
  subject: string,
  html: string,
  sender?: EmailSender,
  extras?: DeliveryExtras,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!init()) {
    console.warn("[email] SENDGRID_API_KEY not set — skipping send", { to, subject });
    return { ok: false, error: "SendGrid is not configured" };
  }
  // The override still falls back to the env var, so a missing
  // ENQUIRY_FROM_EMAIL degrades to the normal sender rather than to no email.
  const from = sender?.from || process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    console.warn("[email] SENDGRID_FROM_EMAIL not set — skipping send", { to, subject });
    return { ok: false, error: "SendGrid sender is not configured" };
  }
  try {
    await sgMail.send({
      to,
      from: { email: from, name: "Jooma" },
      // Spread rather than `replyTo: undefined`: SendGrid rejects the key when
      // it is present and empty, so it must be absent, not blank.
      ...(sender?.replyTo ? { replyTo: sender.replyTo } : {}),
      subject,
      html,
      // Same rule as replyTo: absent unless set, so a transactional payload is
      // exactly what it always was.
      ...(extras?.text ? { text: extras.text } : {}),
      ...(extras?.headers ? { headers: extras.headers } : {}),
      ...(extras?.categories ? { categories: extras.categories } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed", { to, subject }, err);
    const message = err instanceof Error ? err.message : "Delivery failed";
    return { ok: false, error: message };
  }
}

/**
 * Send one bulk email, already rendered by renderBroadcast().
 *
 * Addresses on a reserved test domain (.test, .example, .invalid, .localhost)
 * are skipped rather than sent. The e2e fixtures live on @jooma.test and run
 * against staging with the real SendGrid key, so without this every test run
 * would bounce and chip away at the domain's sending reputation. Skipping
 * still exercises everything up to the network call.
 */
export async function sendBroadcastEmail(
  to: string,
  rendered: { subject: string; html: string; text: string },
  opts: { purpose: string; oneClickUrl: string | null },
): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
  if (isUndeliverable(to)) return { status: "skipped", error: "Test address, not sent" };

  // RFC 8058 one-click unsubscribe. Gmail and Yahoo require it of bulk senders,
  // and it is what puts "Unsubscribe" next to the sender name in the inbox.
  const headers = opts.oneClickUrl
    ? {
        "List-Unsubscribe": `<${opts.oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  const result = await deliver(to, rendered.subject, rendered.html, undefined, {
    text: rendered.text,
    headers,
    categories: ["broadcast", opts.purpose],
  });
  return result.ok ? { status: "sent" } : { status: "failed", error: result.error };
}

/**
 * Look up the admin-editable half of a template: its subject override and
 * whether it's live. Missing row = treat as live with the code default, so a
 * new template works before anyone has touched it in /admin/emails.
 */
async function templateSettings(
  key: EmailTemplateKey,
): Promise<{ live: boolean; subject: string | null; body: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select("live, subject, body")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return { live: true, subject: null, body: null };
  return { live: data.live, subject: data.subject, body: data.body };
}

/**
 * Render a template without sending — powers the /admin/emails preview.
 *
 * `bodyOverride` is passed in rather than read from the database so the preview
 * can show wording the admin is still typing, before they save it.
 */
export function generateEmailHtml(
  key: EmailTemplateKey,
  params: Record<string, string>,
  bodyOverride?: string | null,
): { subject: string; html: string } | null {
  const render = TEMPLATES[key];
  if (!render) return null;
  const override = bodyOverride ? interpolate(bodyOverride, params) : null;
  const { subject, html } = render(params, override);
  return { subject, html: layout(html) };
}

/**
 * Render and send. Returns false if the mailer isn't configured, the template
 * is paused in /admin/emails, or delivery failed — callers surface that rather
 * than claiming an email went out.
 */
export async function sendTemplate(
  key: EmailTemplateKey,
  to: string,
  params: Record<string, string>,
  /** Only set where the default noreply@ sender is wrong. See EmailSender. */
  sender?: EmailSender,
): Promise<boolean> {
  const render = TEMPLATES[key];
  if (!render) {
    console.error("[email] unknown template", key);
    return false;
  }

  const settings = await templateSettings(key);
  if (!settings.live) {
    console.warn("[email] template is paused in /admin/emails — not sending", { key, to });
    return false;
  }

  // Interpolate the override before it reaches the template, so {{firstName}}
  // works in a body exactly as it does in a subject. prose() escapes afterwards,
  // so a parameter carrying markup still cannot inject any.
  const override = settings.body ? interpolate(settings.body, params) : null;

  const { subject: defaultSubject, html } = render(params, override);
  const subject = settings.subject ? interpolate(settings.subject, params) : defaultSubject;
  return send(to, subject, layout(html), sender);
}
