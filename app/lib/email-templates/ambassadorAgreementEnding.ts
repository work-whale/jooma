import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent a month before an ambassador's twelve-month agreement ends, once, by the
 * daily ambassador-terms cron (app/api/cron/ambassador-terms). The agreement
 * promises it: "We will write to you a month before it ends to ask whether you
 * want to continue."
 *
 * The admin override replaces the opening paragraph only. The date, what
 * changes when it ends, and how to carry on stay in code.
 */
export function ambassadorAgreementEndingTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const endDate = escapeHtml(params.endDate);
  const code = escapeHtml(params.code);
  const agreementUrl = `${siteUrl()}/ambassador/agreement`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, your Jooma Ambassador agreement is coming to
      the end of its twelve months. Thank you for every teacher you have brought
      to Jooma this year.
    </p>`;

  return {
    subject: "Your Jooma Ambassador agreement ends next month",
    html: `
    <h1 ${H1}>Your agreement ends next month.</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#FDF7E7;border:1px solid #EEDCA8;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px 0;color:#7A5610;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Agreement ends</p>
        <p style="margin:0;color:#1D1730;font-size:18px;font-weight:800;">${endDate}</p>
      </td></tr>
    </table>

    <p ${P}><strong>Would you like to carry on?</strong> Reply to this email and
      tell us. If you do, we will send you a new agreement before this one ends.</p>

    <p ${P}>If you would rather stop, there is nothing to do. When it ends:</p>
    <ul style="margin:0 0 16px 0;padding-left:20px;color:#3C3552;font-size:15px;line-height:1.6;">
      <li>payments made after ${endDate} no longer earn you commission${code ? `, and ${code} stops being offered` : ""};</li>
      <li>your free Pro ends and your account moves to no plan. Nothing you have made is deleted, and you can keep Pro by choosing it on your plans page. We never charge you unless you do;</li>
      <li>anything we still owe you is paid in full at the next payout, whatever the amount.</li>
    </ul>

    ${button("See my agreement", agreementUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      You are getting this because you are a Jooma Ambassador. Questions? Reply
      to this email and a person will answer.
    </p>
  `,
  };
}
