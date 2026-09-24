import { test, expect } from "@playwright/test";
import {
  formatBody,
  isUndeliverable,
  parseEmailList,
  plainBody,
  renderBroadcast,
  respectsOptOut,
  safeHref,
  validateBroadcast,
  EMPTY_CONTENT,
  type BroadcastContent,
} from "@/app/lib/email-templates/broadcast";
import { interpolate, layout } from "@/app/lib/email-templates/markup";

// Bulk email rendering. Pure, so it runs here without a browser or a database.
// The same function renders the admin's live preview and every recipient's
// copy, so what these pin is what lands in an inbox.

const content = (over: Partial<BroadcastContent> = {}): BroadcastContent => ({
  ...EMPTY_CONTENT,
  subject: "Hello {{firstName}}",
  body: "Body text.",
  ...over,
});

test.describe("formatBody", () => {
  test("escapes anything typed, so no markup reaches an inbox", () => {
    const html = formatBody(`<script>alert(1)</script> & <b>bold</b>`);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  test("blank lines make paragraphs, single new lines make breaks", () => {
    const html = formatBody("One\ntwo\n\nThree");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("One<br />two");
  });

  test("a block of dashed lines becomes a list", () => {
    const html = formatBody("- apples\n- pears");
    expect(html).toContain("<ul");
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain("apples</li>");
  });

  test("bold, italic and links", () => {
    const html = formatBody("**big** and *small* and [Jooma](https://www.jooma.ai/pricing?a=1&b=2)");
    expect(html).toContain("<strong>big</strong>");
    expect(html).toContain("<em>small</em>");
    expect(html).toContain('href="https://www.jooma.ai/pricing?a=1&amp;b=2"');
    expect(html).toContain(">Jooma</a>");
  });

  test("a javascript: link is left as plain text, never an href", () => {
    const html = formatBody("[click](javascript:alert(1))");
    expect(html).not.toContain("href=");
    expect(html).toContain("[click]");
  });

  test("a link label cannot break out of its attribute", () => {
    const html = formatBody('[x](https://a.example/"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover');
  });

  test("empty input renders nothing", () => {
    expect(formatBody("   \n\n  ")).toBe("");
  });
});

test.describe("safeHref", () => {
  test("allows http, https and mailto only", () => {
    expect(safeHref("https://jooma.ai")).toBe("https://jooma.ai");
    expect(safeHref("http://jooma.ai")).toBe("http://jooma.ai");
    expect(safeHref("mailto:hello@jooma.ai")).toBe("mailto:hello@jooma.ai");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });
});

test.describe("renderBroadcast", () => {
  const sam = { email: "sam@school.example", firstName: "Sam" };

  test("fills placeholders, and falls back when there is no name", () => {
    const named = renderBroadcast(content(), sam, { purpose: "marketing", unsubscribeUrl: "https://x/u" });
    expect(named.subject).toBe("Hello Sam");

    // Incomplete signups have no profile, so no first name.
    const nameless = renderBroadcast(content(), { email: "a@b.example", firstName: null }, {
      purpose: "signup_reminder",
      unsubscribeUrl: "https://x/u",
    });
    expect(nameless.subject).toBe("Hello there");
  });

  test("a placeholder value carrying markup is escaped", () => {
    const r = renderBroadcast(
      content({ body: "Hi {{firstName}}" }),
      { email: "a@b.example", firstName: "<img src=x onerror=alert(1)>" },
      { purpose: "marketing", unsubscribeUrl: null },
    );
    expect(r.html).not.toContain("<img src=x");
  });

  test("the subject is always one line", () => {
    const r = renderBroadcast(content({ subject: "Line one\nLine two" }), sam, {
      purpose: "marketing",
      unsubscribeUrl: null,
    });
    expect(r.subject).toBe("Line one Line two");
  });

  test("every purpose but a notice carries the unsubscribe link", () => {
    for (const purpose of ["marketing", "signup_reminder", "information"]) {
      const r = renderBroadcast(content(), sam, { purpose, unsubscribeUrl: "https://www.jooma.ai/unsubscribe?t=abc" });
      expect(r.html, purpose).toContain("https://www.jooma.ai/unsubscribe?t=abc");
      expect(r.text, purpose).toContain("Unsubscribe: https://www.jooma.ai/unsubscribe?t=abc");
    }
    const notice = renderBroadcast(content(), sam, { purpose: "notice", unsubscribeUrl: "https://x/u" });
    expect(notice.html).not.toContain("Unsubscribe");
    expect(notice.html).toContain("service notice");
  });

  test("the button needs a safe link, and a placeholder link resolves", () => {
    const withButton = renderBroadcast(
      content({ ctaLabel: "Finish", ctaUrl: "{{completeSignupUrl}}" }),
      sam,
      { purpose: "signup_reminder", unsubscribeUrl: null },
    );
    expect(withButton.html).toContain("/login");
    expect(withButton.html).toContain(">Finish</a>");

    const unsafe = renderBroadcast(content({ ctaLabel: "Go", ctaUrl: "javascript:alert(1)" }), sam, {
      purpose: "marketing",
      unsubscribeUrl: null,
    });
    expect(unsafe.html).not.toContain(">Go</a>");
  });

  test("the preheader is hidden in the body", () => {
    const r = renderBroadcast(content({ preheader: "Peek text" }), sam, { purpose: "marketing", unsubscribeUrl: null });
    expect(r.html).toContain("display:none");
    expect(r.html).toContain("Peek text");
  });
});

test.describe("layout", () => {
  // The transactional emails call layout() with no options. Adding the options
  // must not change a byte of what they send.
  test("with no options, matches the output from before options existed", () => {
    const year = new Date().getFullYear();
    const before = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#F7F5FC;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F5FC;">
    <tr><td style="background-color:#5B2ED6;height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr>
      <td style="padding:40px 20px 0 20px;" align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:26px;">
              <a href="https://www.jooma.ai" style="text-decoration:none;font-size:22px;font-weight:800;color:#5B2ED6;letter-spacing:-0.5px;">Jooma</a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;border-radius:16px;padding:38px 34px;border:1px solid #EAE6F5;">
              CONTENT
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 0 40px 0;color:#6D6683;font-size:12px;line-height:1.6;">
              <p style="margin:0;">&copy; ${year} Jooma. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      expect(layout("CONTENT")).toBe(before);
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});

test.describe("helpers", () => {
  test("interpolate leaves unknown placeholders empty", () => {
    expect(interpolate("{{a}} {{b}}", { a: "x" })).toBe("x ");
  });

  test("reserved test domains are never delivered", () => {
    expect(isUndeliverable("e2e-sam-abc@jooma.test")).toBe(true);
    expect(isUndeliverable("someone@example")).toBe(true);
    expect(isUndeliverable("a@b.invalid")).toBe(true);
    expect(isUndeliverable("teacher@school.org.uk")).toBe(false);
    // Only the domain counts, not a lookalike in the local part.
    expect(isUndeliverable("test@jooma.ai")).toBe(false);
  });

  test("a pasted list becomes clean, unique addresses", () => {
    expect(parseEmailList("A@x.com, b@y.com;\n<c@z.com>  a@x.com not-an-email")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  test("only a service notice ignores opt-outs", () => {
    expect(respectsOptOut("marketing")).toBe(true);
    expect(respectsOptOut("signup_reminder")).toBe(true);
    expect(respectsOptOut("information")).toBe(true);
    expect(respectsOptOut("notice")).toBe(false);
  });

  test("plain text drops the formatting marks", () => {
    expect(plainBody("**Hi** *there* [site](https://jooma.ai)")).toBe("Hi there site (https://jooma.ai)");
  });

  test("validation mirrors the database's rules", () => {
    expect(validateBroadcast(content({ subject: "" }))).toMatch(/subject/);
    expect(validateBroadcast(content({ body: " " }))).toMatch(/body/);
    expect(validateBroadcast(content({ ctaLabel: "Go" }))).toMatch(/both/);
    expect(validateBroadcast(content({ ctaLabel: "Go", ctaUrl: "ftp://x" }))).toMatch(/https/);
    expect(validateBroadcast(content({ ctaLabel: "Go", ctaUrl: "{{siteUrl}}" }))).toBeNull();
    expect(validateBroadcast(content())).toBeNull();
  });
});
