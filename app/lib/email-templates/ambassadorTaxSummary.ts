import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * The yearly tax summary, sent each April for the UK tax year just ended to
 * every ambassador who was paid in it. Sent once per ambassador per tax year by
 * the daily ambassador-terms cron, which records it in ambassador_tax_summaries.
 *
 * A help for their self assessment, not a tax document, and it says so. The
 * admin override replaces the opening paragraph only.
 */
export function ambassadorTaxSummaryTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const taxYear = escapeHtml(params.taxYear);
  const totalPaid = escapeHtml(params.totalPaid);
  const payments = escapeHtml(params.payments);
  const period = escapeHtml(params.period);
  const statementsUrl = `${siteUrl()}/ambassador/statements`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, here is what we paid you as a Jooma Ambassador
      in the ${taxYear} tax year, to make your self assessment a little easier.
    </p>`;

  const row = (label: string, value: string) => `
      <tr>
        <td style="padding:6px 0;color:#6D6683;font-size:13px;width:150px;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;color:#1D1730;font-size:14px;font-weight:600;">${value}</td>
      </tr>`;

  return {
    subject: `Your Jooma Ambassador tax summary for ${taxYear}`,
    html: `
    <h1 ${H1}>Your ${taxYear} tax summary</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#F1ECFC;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px 0;color:#6D6683;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Paid to you</p>
        <p style="margin:0 0 10px 0;color:#1D1730;font-size:24px;font-weight:800;">${totalPaid}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          ${row("Tax year", period)}
          ${row("Payments", payments)}
        </table>
      </td></tr>
    </table>

    <p ${P}>
      Commission is paid gross, with nothing deducted, so declaring it to HMRC is
      your responsibility. The total already allows for any refunds we took back
      during the year. Every payment is listed month by month on your Statements
      tab, which you can download as a spreadsheet.
    </p>

    ${button("See my statements", statementsUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      This summary is to help you, not to replace your own records or advice from
      an accountant. If a figure looks wrong, reply to this email and we will
      check it.
    </p>
  `,
  };
}
