import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent the moment someone signs and sends their ambassador application
 * (app/api/ambassadors/apply). Their receipt, and their record of what they
 * signed: the code they asked for, how we will pay them, and a link to the
 * agreement itself.
 *
 * The admin override replaces the opening paragraph only. The summary, the
 * "what happens now" steps and the link to the agreement stay in code.
 */
export function ambassadorApplicationReceivedTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const code = escapeHtml(params.code);
  const paidBy = escapeHtml(params.paidBy);
  const signedDate = escapeHtml(params.signedDate);
  const agreementUrl = `${siteUrl()}/ambassador/agreement`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, thank you for applying to the Jooma Ambassador
      Programme. Your application and signed agreement are with us, and nothing
      else is needed from you.
    </p>`;

  const row = (label: string, value: string) => `
      <tr>
        <td style="padding:6px 0;color:#6D6683;font-size:13px;width:150px;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;color:#1D1730;font-size:14px;font-weight:600;">${value}</td>
      </tr>`;

  return {
    subject: "We have your Jooma Ambassador application",
    html: `
    <h1 ${H1}>That is with us.</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#F1ECFC;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${row("The code you asked for", `<span style="font-family:monospace;letter-spacing:1px;">${code}</span>`)}
          ${row("We will pay you by", paidBy)}
          ${row("Agreement signed", signedDate)}
        </table>
      </td></tr>
    </table>

    <p ${P}><strong>What happens now</strong></p>
    <p ${P}>
      We read every application properly, so give us a couple of working days.
      If anything is unclear we will email you rather than turn you down. The
      moment we approve you, your code goes live exactly as you wrote it, your
      dashboard switches on, and your Pro account becomes free for twelve months.
    </p>
    <p ${P}>
      Until then your Jooma account works exactly as it did.
    </p>

    ${button("Read the agreement you signed", agreementUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      Keep this email as your record of applying. If you did not apply to the
      Jooma Ambassador Programme, reply to this email and we will look into it.
    </p>
  `,
  };
}
