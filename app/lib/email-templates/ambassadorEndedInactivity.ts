import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * The written notice when an admin ends an agreement for inactivity, sent from
 * the admin console (app/api/admin/ambassadors). Clause 5 requires it to give
 * the reason; clause 6 says what happens next, which this repeats.
 *
 * The admin override replaces the opening paragraph only. The reason, the
 * dates, and what they keep stay in code.
 */
export function ambassadorEndedInactivityTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const reason = escapeHtml(params.reason);
  const proEnds = escapeHtml(params.proEnds);
  const agreementEnds = escapeHtml(params.agreementEnds);
  const dashboardUrl = `${siteUrl()}/ambassador`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, we are writing to tell you that we have ended
      your Jooma Ambassador agreement, under clause 5, because no new subscriber
      joined on your code during the review.
    </p>`;

  return {
    subject: "Your Jooma Ambassador agreement has ended",
    html: `
    <h1 ${H1}>Your agreement has ended.</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#F6F4FB;border:1px solid #E2DDF0;border-radius:12px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px 0;color:#5B5470;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Our reason</p>
        <p style="margin:0;color:#1D1730;font-size:15px;line-height:1.5;">${reason}</p>
      </td></tr>
    </table>

    <p ${P}>What happens now:</p>
    <ul style="margin:0 0 16px 0;padding-left:20px;color:#3C3552;font-size:15px;line-height:1.6;">
      <li>you are no longer a Jooma Ambassador, and the crown and verified badge come off your profile;</li>
      <li>your free Pro ends on ${proEnds}, and your account moves to no plan. It stays open and nothing you have made is deleted, but you cannot create anything new until you choose a plan. We never charge you unless you choose one yourself;</li>
      <li>everyone already on your code keeps paying you, at the same rates, until ${agreementEnds}. Your dashboard and statements stay so you can watch it;</li>
      <li>your balance is paid in full at the next payout, whatever the amount.</li>
    </ul>

    ${button("Open my dashboard", dashboardUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      Thank you for the teachers you brought to Jooma. Questions? Reply to this
      email and a person will answer.
    </p>
  `,
  };
}
