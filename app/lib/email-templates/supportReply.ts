import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent when support replies to a teacher's conversation.
 *
 * The reply body is included rather than only linking to it: a teacher who
 * asked "why can't I generate anything" wants the answer in the notification,
 * not a round trip through a login screen to read one sentence.
 *
 * Internal notes must never reach this function. The gate is in
 * /api/support/reply, which only mails when is_note is false — see the comment
 * there, and the header of 20260805001500_support.sql for why the distinction
 * is load-bearing.
 */
export function supportReplyTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const subject = escapeHtml(params.subject);
  const body = escapeHtml(params.body);
  const reference = escapeHtml(params.reference);
  const base = siteUrl();
  const href = params.threadId
    ? `${base}/help?thread=${encodeURIComponent(params.threadId)}`
    : `${base}/help`;

  return {
    // The admin-editable override in email_templates uses {{subject}}; this is
    // the fallback when nobody has set one.
    subject: `Re: ${params.subject || "your message"}`,
    html: `
    <h1 ${H1}>We&rsquo;ve replied to your message</h1>
    ${
      // Only the lead-in is overridable. The block below carries the support
      // agent's actual answer — the reason this email exists — and must never
      // be replaceable by a template setting.
      prose(bodyOverride) ??
      `<p ${P}>
      About <strong style="color:#1D1730;">${subject}</strong>:
    </p>`
    }

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 8px 0;background-color:#F1ECFC;border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;color:#1D1730;font-size:15px;line-height:1.6;white-space:pre-wrap;">${body}</p>
      </td></tr>
    </table>

    ${button("Reply in Jooma", href)}

    ${DIVIDER}

    <p ${SMALL}>
      Reply from your Jooma account so the whole conversation stays in one
      place${reference ? `, reference ${reference}` : ""}.
    </p>
  `,
  };
}
