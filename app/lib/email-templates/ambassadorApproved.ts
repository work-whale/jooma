import { button, escapeHtml, prose, siteUrl, DIVIDER, H1, P, SMALL, type RenderedEmail } from "./shared";

/**
 * Sent when an admin approves an ambassador application
 * (app/api/admin/ambassadors/applications/[id]). The code is live in Stripe by
 * the time this goes out, so it can be shared straight away.
 *
 * The admin override replaces the opening paragraph only. The code block, the
 * share link, the dates and the button stay in code: they are what the
 * ambassador acts on.
 */
export function ambassadorApprovedTemplate(
  params: Record<string, string>,
  bodyOverride?: string | null,
): RenderedEmail {
  const firstName = escapeHtml(params.firstName);
  const code = escapeHtml(params.code);
  const offer = escapeHtml(params.offer);
  const agreementEnds = escapeHtml(params.agreementEnds);
  const proLine = escapeHtml(params.proLine);
  const base = siteUrl();
  const dashboardUrl = `${base}/ambassador`;
  const shareUrl = `${base}/signup?code=${encodeURIComponent(params.code ?? "")}`;

  const intro =
    prose(bodyOverride) ??
    `
    <p ${P}>
      Congratulations ${firstName || ""}, you are now a Jooma Ambassador. Your
      code is live and your dashboard is switched on.
    </p>`;

  return {
    subject: "You're a Jooma Ambassador",
    html: `
    <h1 ${H1}>Welcome to the programme.</h1>
    ${intro}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0;background-color:#FDF7E7;border:1px solid #EEDCA8;border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 4px 0;color:#7A5610;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your code</p>
        <p style="margin:0 0 8px 0;color:#1D1730;font-size:24px;font-weight:800;letter-spacing:2px;font-family:monospace;">${code}</p>
        <p style="margin:0;color:#7A5610;font-size:13px;line-height:1.5;">
          Teachers who use it get ${offer || "money off their first payment"}.
          Or share this link, which applies it for them:<br />
          <a href="${escapeHtml(shareUrl)}" style="color:#5B2ED6;word-break:break-all;">${escapeHtml(shareUrl)}</a>
        </p>
      </td></tr>
    </table>

    <p ${P}>
      You earn on every payment a teacher you bring in makes while your agreement
      runs, every month for monthly plans and once for yearly ones. Your
      dashboard shows each sign-up and every pound as it happens, and we pay you
      on the 15th of each month for the month before.
    </p>
    <p ${P}>
      Your agreement runs until <strong>${agreementEnds}</strong>. ${proLine}
    </p>

    ${button("Open my dashboard", dashboardUrl)}

    ${DIVIDER}

    <p ${SMALL}>
      Please say that you are paid whenever you promote Jooma, with #ad or
      "paid partnership" on every post. It is part of your agreement and the
      law. Questions? Reply to this email and a person will answer.
    </p>
  `,
  };
}
