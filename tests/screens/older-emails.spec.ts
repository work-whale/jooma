import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { TEMPLATES, type EmailTemplateKey } from "@/app/lib/email-templates";
import { SAMPLE_PARAMS } from "@/app/lib/email-templates/samples";
import { layout } from "@/app/lib/email-templates/markup";
import { renderBroadcast } from "@/app/lib/email-templates/broadcast";

/*
 * Screenshots of the pre-4.5 emails (the transactional templates in
 * app/lib/email-templates and one bulk email) as they go out, wordmark header
 * included since 24 Nov. The text-header "before" shots were taken earlier
 * into today/, which this spec no longer writes.
 *
 * Not a test: skipped unless SCREENSHOTS=1. No server, account or database.
 * The templates import "server-only", so preload a stub for it, e.g.
 *   NODE_OPTIONS="--require <stub.cjs>" SCREENSHOTS=1 E2E_BASE_URL=http://localhost:3000 \
 *     npx playwright test tests/screens/older-emails.spec.ts
 */

test.skip(process.env.SCREENSHOTS !== "1", "Screenshots only: set SCREENSHOTS=1");

const OUT = `docs/screenshots/${process.env.SHOTS_DIR ?? "2026-11-24-older-emails"}`;

test("older emails: today and with the wordmark", async ({ page }) => {
  mkdirSync(`${OUT}/wordmark`, { recursive: true });
  await page.setViewportSize({ width: Number(process.env.EMAIL_WIDTH ?? 640), height: 400 });
  const out: { key: string; subject: string }[] = [];

  for (const key of Object.keys(TEMPLATES) as EmailTemplateKey[]) {
    const { subject, html } = TEMPLATES[key](SAMPLE_PARAMS[key], null);
    await page.setContent(layout(html));
    await page.screenshot({ path: `${OUT}/wordmark/${key}.png`, fullPage: true });
    out.push({ key, subject });
  }

  // A bulk email from Admin, Emails & templates, as a marketing send.
  const b = renderBroadcast(
    {
      subject: "New in Jooma this term",
      preheader: "Three things to try before half term.",
      heading: "New in Jooma this term, {{firstName}}",
      body: "Here are three things teachers have loved this month.\n\nTry the new worksheet levels, ask Jo to change a slide, and share a resource by link.",
      ctaLabel: "Open Jooma",
      ctaUrl: "https://www.jooma.ai/dashboard",
    },
    { email: "sam@example.com", firstName: "Sam" },
    { purpose: "marketing", unsubscribeUrl: "https://www.jooma.ai/unsubscribe?t=sample" },
  );
  await page.setContent(b.html);
  await page.screenshot({ path: `${OUT}/wordmark/bulk_email.png`, fullPage: true });
  out.push({ key: "bulk_email", subject: b.subject });

  writeFileSync(`${OUT}/emails.json`, JSON.stringify(out, null, 2));
});
