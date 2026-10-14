import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent when an admin declines an ambassador application
 * (app/api/admin/ambassadors/applications/[id]). The under-review page told
 * them we would be in touch, so this is that message, rather than leaving them
 * to find out by visiting /ambassador.
 *
 * The admin's reason, when one was typed in the review drawer, is quoted as
 * written. The admin override replaces the opening paragraph only.
 */
export function ambassadorDeclinedTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const reason = escapeHtml(params.reason);
  const dashboardUrl = `${siteUrl()}/dashboard`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, thank you for applying to the Jooma Ambassador
      Programme and for the time you put into it. We are keeping the programme
      small for now, and we are not able to offer you a place at the moment.
    </p>`;

  const reasonBlock = reason
    ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#F1ECFC;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px 0;color:#6D6683;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">From the team</p>
        <p style="margin:0;color:#1D1730;font-size:15px;line-height:1.5;">${reason}</p>
      </td></tr>
    </table>`
    : "";

  return {
    subject: "Your Jooma Ambassador application",
    html: `
    <h1 ${H1}>Not this time.</h1>
    ${intro}
    ${reasonBlock}

    <p ${P}>
      Nothing about your Jooma account has changed. Your plan, your library and
      everything you have made are exactly as they were, and the code you asked
      for has been released.
    </p>

    ${button("Open Jooma", dashboardUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      If you think we have misunderstood something about your application, reply
      to this email and a person will read it.
    </p>
  `,
  };
}
