// The building blocks every Jooma email is made of, with no server dependency.
//
// These used to live in shared.ts and email.ts, both marked server-only. They
// moved here, unchanged, so two more callers can reach them: the bulk email
// preview in /admin/emails renders in the browser as the admin types, and the
// unit runner cannot resolve "server-only". Both old modules re-export from
// here, so every existing import still works and every transactional email is
// byte-identical.
//
// Nothing in this file may read a secret. NEXT_PUBLIC_SITE_URL is public by
// definition, which is the only reason siteUrl() can live here.

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.jooma.ai").replace(/\/$/, "");
}

/** Escape before interpolating anything user-supplied into email HTML. */
export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bulletproof-ish CTA button, in the Jooma palette. */
export function button(text: string, href: string): string {
  return `
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#5B2ED6;border-radius:12px;padding:13px 30px;">
      <a href="${href}" style="color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;display:inline-block;">${text}</a>
    </td>
  </tr>
</table>`;
}

export const H1 = 'style="margin:0 0 10px 0;font-size:22px;font-weight:800;color:#1D1730;"';
export const P = 'style="margin:0 0 16px 0;color:#3C3552;font-size:15px;line-height:1.6;"';
export const SMALL = 'style="margin:0;color:#6D6683;font-size:13px;line-height:1.6;"';
export const DIVIDER = `
<table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 18px 0;">
  <tr><td style="border-top:1px solid #EAE6F5;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
</table>`;

/**
 * Fill {{placeholders}} in admin-edited wording. Double braces, not single.
 * /admin/emails shows the available names per template.
 *
 * One copy for every sender and every preview: a preview that interpolates
 * differently from the sender is worse than no preview.
 */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
}

export interface LayoutOptions {
  /** The grey line an inbox shows after the subject. Hidden in the body. */
  preheader?: string;
  /** Extra footer markup under the copyright line, e.g. an unsubscribe link.
   *  Must already be escaped. */
  footerHtml?: string;
}

/** Shared shell for every email: accent bar, logo, card, footer.
 *  Table-based and inline-styled because that is what email clients render.
 *
 *  With no options the output is exactly what it was before options existed,
 *  so the transactional emails do not change by a byte. */
export function layout(content: string, opts: LayoutOptions = {}): string {
  const base = siteUrl();
  const preheader = opts.preheader
    ? `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>`
    : "";
  const footer = opts.footerHtml
    ? `
              <p style="margin:8px 0 0 0;">${opts.footerHtml}</p>`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F7F5FC;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${preheader}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F5FC;">
    <tr><td style="background-color:#5B2ED6;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr>
      <td style="padding:40px 20px 0 20px;" align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:26px;">
              <a href="${base}" style="text-decoration:none;font-size:22px;font-weight:800;color:#5B2ED6;letter-spacing:-0.5px;">Jooma</a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;padding:38px 34px;border:1px solid #EAE6F5;">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 0 40px 0;color:#6D6683;font-size:12px;line-height:1.6;">
              <p style="margin:0;">&copy; ${new Date().getFullYear()} Jooma. All rights reserved.</p>${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
