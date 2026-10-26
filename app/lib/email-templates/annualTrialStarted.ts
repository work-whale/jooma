import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent once, the moment a teacher completes checkout for a free trial on a
 * yearly plan, by the Stripe webhook (sendAnnualTrialEmail).
 *
 * Every annual trial up to 2026-10-26 ended in a declined first charge from
 * someone who appears to have expected a monthly one, and the trial is too short
 * for Stripe's own reminder. So this says the amount and the date plainly, and
 * leads with the way to monthly: free and immediate during the trial.
 *
 * The button opens Profile's billing tab with the monthly switch already open
 * (?switch=month), so it is one click to Stripe's own preview of the change.
 *
 * The admin override replaces the opening paragraph only.
 */
export function annualTrialStartedTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const plan = escapeHtml(params.plan);
  const amount = escapeHtml(params.amount);
  const chargeDate = escapeHtml(params.chargeDate);
  const monthlyPrice = escapeHtml(params.monthlyPrice);
  const switchUrl = `${siteUrl()}/profile?section=subscription&switch=month`;
  const billingUrl = `${siteUrl()}/profile?section=subscription`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, thanks for trying Jooma ${plan}. You chose yearly
      billing, so when your free trial ends on <strong>${chargeDate}</strong> we
      will take <strong>${amount}</strong> for the whole year.
    </p>`;

  return {
    subject: `Your Jooma trial: ${params.amount} for the year on ${params.chargeDate}`,
    html: `
    <h1 ${H1}>Your annual trial has started.</h1>
    ${intro}

    <p ${P}><strong>Rather pay monthly?</strong> Switch now and nothing is charged
      today. Your trial carries on as it is, and from ${chargeDate} you pay
      ${monthlyPrice} a month instead.</p>

    ${button("Switch to monthly", switchUrl)}

    <p ${P}>Happy with yearly? There is nothing to do. And if Jooma is not for you,
      cancel any time before ${chargeDate} in
      <a href="${billingUrl}" style="color:#5B2ED6;">Usage and billing</a> and you
      pay nothing at all.</p>

    ${DIVIDER}

    <p ${SMALL}>
      You are getting this because you started a free trial on a yearly plan.
      Questions? <a href="${siteUrl()}/contact" style="color:#5B2ED6;">Get in touch</a>
      and a person will answer.
    </p>
  `,
  };
}
