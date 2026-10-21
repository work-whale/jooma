import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent the day an ambassador moves to Under review (two full calendar months
 * with no new subscriber), by the daily ambassador-terms cron. Clause 5
 * promises it: "We tell you the day it happens."
 *
 * The admin override replaces the opening paragraph only. The deadline and
 * what happens next stay in code.
 */
export function ambassadorUnderReviewTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const deadline = escapeHtml(params.deadline);
  const code = escapeHtml(params.code);
  const dashboardUrl = `${siteUrl()}/ambassador`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, it has been two full months since a new
      teacher started paying on ${code ? `your code ${code}` : "your code"}, so
      as of today your account is Under review.
    </p>`;

  return {
    subject: "Your Jooma Ambassador account is under review",
    html: `
    <h1 ${H1}>Your account is under review.</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#FDF7E7;border:1px solid #EEDCA8;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px 0;color:#7A5610;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Bring in one new subscriber by</p>
        <p style="margin:0;color:#1D1730;font-size:18px;font-weight:800;">${deadline}</p>
      </td></tr>
    </table>

    <p ${P}><strong>One is enough.</strong> If a new teacher makes their first
      payment on your code by then, the review closes and nothing changes.</p>

    <p ${P}>If not, we may end your agreement. We would write to you first with
      the reason. Everyone already on your code would keep paying you for the
      rest of your twelve months, and anything we owe you would be paid at the
      next payout.</p>

    ${button("Open my dashboard", dashboardUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      You are getting this because you are a Jooma Ambassador. Questions? Reply
      to this email and a person will answer.
    </p>
  `,
  };
}
