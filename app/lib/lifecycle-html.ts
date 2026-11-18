// The plain HTML the 4.5 lifecycle and launch-day emails share: a heading, one
// paragraph, one button, and the email settings link.

export function lifecycleHtml(subject: string, body: string, button: string, url: string, footerUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1D1730;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:22px">${esc(subject)}</h1><p style="font-size:16px;line-height:1.5">${esc(body)}</p>
<p><a href="${url}" style="display:inline-block;background:#1E1138;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none">${esc(button)}</a></p>
<p style="font-size:12px;color:#8E87A4"><a href="${footerUrl}" style="color:#8E87A4">Email settings</a></p></body></html>`;
}
