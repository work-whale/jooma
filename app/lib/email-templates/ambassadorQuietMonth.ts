import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent once when an ambassador goes one full calendar month with no new
 * subscriber, by the daily ambassador-terms cron. Clause 5 of the agreement
 * promises it: "we email to let you know. Nothing else happens."
 *
 * The admin override replaces the opening paragraph only.
 */
export function ambassadorQuietMonthTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const code = escapeHtml(params.code);
  const dashboardUrl = `${siteUrl()}/ambassador`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Hi ${firstName || "there"}, a quick note: nobody new started paying on
      ${code ? `your code ${code}` : "your code"} last month.
    </p>`;

  return {
    subject: "A quiet month on your Jooma code",
    html: `
    <h1 ${H1}>A quiet month.</h1>
    ${intro}

    <p ${P}>Nothing changes because of this. It is only to let you know, as your
      agreement says we will.</p>

    <p ${P}>If a second full month goes by with no new subscriber, your account
      moves to Under review and you will have 14 days to bring one in. August
      does not count.</p>

    ${button("Open my dashboard", dashboardUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      You are getting this because you are a Jooma Ambassador. Questions? Reply
      to this email and a person will answer.
    </p>
  `,
  };
}
