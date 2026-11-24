// The HTML the 4.5 lifecycle and launch-day emails share: a heading, one
// paragraph, one button, and the footer link (email settings on account mail,
// unsubscribe on marketing).
//
// It is built from the same pieces as every older Jooma email (layout(),
// button(), H1, P in email-templates/markup.ts), so these emails wear the same
// shell: accent bar, white card, purple button, copyright footer. The header
// shows the wordmark image. markup.ts has no server-only import, so this stays
// usable from unit tests and the admin preview.

import { H1, P, button, escapeHtml, layout } from "@/app/lib/email-templates/markup";

export function lifecycleHtml(
  subject: string,
  body: string,
  buttonLabel: string,
  url: string,
  footerUrl: string,
  footerLabel = "Email settings",
  opts: { preheader?: string } = {},
): string {
  const content = `<h1 ${H1}>${escapeHtml(subject)}</h1>
<p ${P}>${escapeHtml(body)}</p>${button(escapeHtml(buttonLabel), escapeHtml(url))}`;
  const footerHtml = `<a href="${escapeHtml(footerUrl)}" style="color:#6D6683;text-decoration:underline;">${escapeHtml(footerLabel)}</a>`;
  return layout(content, { preheader: opts.preheader, footerHtml });
}
