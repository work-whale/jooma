import { test, expect } from "@playwright/test";
import { layout, siteUrl, WORDMARK_SRC } from "@/app/lib/email-templates/markup";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";
import { lifecycleOutgoing, renderLifecycleEmail, type LifecycleVars } from "@/app/lib/lifecycle-emails";
import { renderBroadcast } from "@/app/lib/email-templates/broadcast";

/*
 * The 4.5 automated emails (E1 to E14 and the E16 launch notice) share one
 * HTML builder. It must wear the same branded shell as the older emails (accent
 * bar, white card, purple button, copyright footer) plus the Jooma wordmark
 * image. Since 24 Nov every email's layout() shows the wordmark, so the older
 * transactional and bulk emails match.
 */

const SITE = "https://www.jooma.ai";
const URL_ = "https://www.jooma.ai/tools/quiz-generator";
const html = lifecycleHtml("Your trial has started", "Pro is yours.", "Open Jooma", URL_, `${SITE}/profile#email-settings`);

test.describe("wordmark", () => {
  test("is an absolute https image on the public domain", () => {
    expect(WORDMARK_SRC).toBe("https://www.jooma.ai/logo/Jooma-logo-v2-128.png");
    expect(WORDMARK_SRC.startsWith("https://")).toBe(true);
  });

  test("the header carries the image with its size and alt text", () => {
    const img = html.match(/<img\b[^>]*>/);
    expect(img).not.toBeNull();
    const tag = img![0];
    expect(tag).toContain(`src="${WORDMARK_SRC}"`);
    expect(tag).toContain('alt="Jooma"');
    expect(tag).toContain('width="96"');
    expect(tag).toContain('height="32"');
    // Exactly one image: the wordmark, nothing else slipped in.
    expect(html.match(/<img\b/g)).toHaveLength(1);
  });

  test("the old text-only header is gone", () => {
    expect(html).not.toContain(">Jooma</a>");
    expect(html).not.toContain("letter-spacing:-0.5px");
  });
});

test.describe("branded shell", () => {
  test("accent bar, white card and copyright line are there", () => {
    expect(html).toContain("background-color:#5B2ED6;height:5px");
    expect(html).toContain("background-color:#FFFFFF;border-radius:16px");
    expect(html).toContain(`&copy; ${new Date().getFullYear()} Jooma`);
    expect(html.toLowerCase().startsWith("<!doctype html>")).toBe(true);
  });

  test("the button is the purple one and points at the url", () => {
    expect(html).toContain("background-color:#5B2ED6;border-radius:12px");
    expect(html).toMatch(new RegExp(`<a href="${URL_}"[^>]*>Open Jooma</a>`));
    // The old dark button is gone.
    expect(html).not.toContain("#1E1138");
  });

  test("heading and paragraph use the shared styles", () => {
    expect(html).toMatch(/<h1 style="[^"]*font-weight:800[^"]*">Your trial has started<\/h1>/);
    expect(html).toMatch(/<p style="[^"]*line-height:1\.6[^"]*">Pro is yours\.<\/p>/);
  });
});

test.describe("every email gets the wordmark", () => {
  const content = "<p>hello</p>";

  test("layout() with no options shows the wordmark image, not the text header", () => {
    const out = layout(content);
    expect(out).toContain(
      `<td align="center" style="padding-bottom:26px;">\n              <a href="${siteUrl()}" style="text-decoration:none;"><img src="${WORDMARK_SRC}" width="96" height="32" alt="Jooma"`,
    );
    expect(out).not.toContain(">Jooma</a>");
    expect(out).not.toContain("letter-spacing:-0.5px");
    expect(out).toContain(content);
  });

  test("there is no option that brings the text header back", () => {
    expect(layout(content, {})).toBe(layout(content));
    expect(layout(content, { preheader: "p", footerHtml: "f" })).toContain(`src="${WORDMARK_SRC}"`);
  });

  test("a bulk email carries the wordmark too", () => {
    const b = renderBroadcast(
      { subject: "S", preheader: "", heading: "H", body: "B", ctaLabel: "Go", ctaUrl: "https://www.jooma.ai/x" },
      { email: "a@example.com", firstName: "Sam" },
      { purpose: "marketing", unsubscribeUrl: "https://www.jooma.ai/unsubscribe?t=1" },
    );
    expect(b.html).toContain(`src="${WORDMARK_SRC}"`);
    expect(b.html.match(/<img\b/g)).toHaveLength(1);
  });
});

test.describe("preheader", () => {
  test("shown hidden when given", () => {
    const h = lifecycleHtml("S", "B", "Go", URL_, "https://x/p", "Email settings", { preheader: "No card, nothing to cancel." });
    expect(h).toMatch(/<div style="display:none;[^"]*">No card, nothing to cancel\.<\/div>/);
  });

  test("absent when not given, or empty", () => {
    expect(html).not.toContain("display:none");
    expect(lifecycleHtml("S", "B", "Go", URL_, "https://x/p", "Email settings", {})).not.toContain("display:none");
    expect(lifecycleHtml("S", "B", "Go", URL_, "https://x/p", "Email settings", { preheader: "" })).not.toContain("display:none");
  });

  test("is escaped", () => {
    const h = lifecycleHtml("S", "B", "Go", URL_, "https://x/p", "Email settings", { preheader: "<b>x</b>" });
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(h).not.toContain("<b>x</b>");
  });
});

test.describe("escaping", () => {
  const bad = `<script>alert("x")</script>`;
  const out = lifecycleHtml(bad, bad, bad, URL_, "https://x/p", bad);

  test("subject, body, button and footer label never emit a raw tag", () => {
    expect(out).not.toContain("<script>");
    expect(out.match(/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/g)).toHaveLength(4);
  });

  test("a url with a quote cannot break out of the href", () => {
    const evil = lifecycleHtml("S", "B", "Go", `https://x/a" onmouseover="alert(1)`, `https://x/p" onclick="y`);
    expect(evil).not.toContain(`" onmouseover="`);
    expect(evil).not.toContain(`" onclick="`);
    expect(evil).toContain("https://x/a&quot; onmouseover=&quot;alert(1)");
  });

  test("a url with an ampersand stays valid HTML", () => {
    expect(lifecycleHtml("S", "B", "Go", "https://x/a?b=1&c=2", "https://x/p")).toContain('href="https://x/a?b=1&amp;c=2"');
  });
});

test.describe("footer link", () => {
  test("defaults to Email settings and points at the footer url", () => {
    const h = lifecycleHtml("S", "B", "Go", URL_, "https://x/profile");
    expect(h).toMatch(/<a href="https:\/\/x\/profile"[^>]*>Email settings<\/a>/);
    expect(h).not.toContain("Unsubscribe");
  });

  test("shows Unsubscribe when given", () => {
    const h = lifecycleHtml("S", "B", "Go", URL_, "https://x/unsubscribe?t=1", "Unsubscribe");
    expect(h).toMatch(/<a href="https:\/\/x\/unsubscribe\?t=1"[^>]*>Unsubscribe<\/a>/);
    expect(h).not.toContain("Email settings");
  });
});

const vars: LifecycleVars = {
  firstName: "Sam",
  trialEnds: "Wednesday 25 November",
  trialEndsDay: "Wednesday",
  made: 3,
  hours: 1,
  plan: "Pro",
  resources: 1000,
  refill: "",
  planEnds: "",
  offerEnds: "Sunday 6 December",
  offerEndsDay: "Sunday",
};

test.describe("lifecycleOutgoing", () => {
  test("the email's preview line reaches the inbox (E1)", () => {
    const m = renderLifecycleEmail("E1", vars);
    expect(m.preheader).toBeTruthy();
    const { rendered } = lifecycleOutgoing(m, SITE);
    expect(rendered.html).toContain(`display:none`);
    expect(rendered.html).toContain(m.preheader);
    expect(rendered.html).toContain("<img");
  });

  test("a marketing email (E9a) has the unsubscribe link with the token url", () => {
    const m = renderLifecycleEmail("E9a", vars, { unsubToken: "tok/en 1" });
    const { rendered } = lifecycleOutgoing(m, SITE);
    const want = `${SITE}/unsubscribe?t=${encodeURIComponent("tok/en 1")}`;
    expect(rendered.html).toContain(`<a href="${want}"`);
    expect(rendered.html).toMatch(/>Unsubscribe<\/a>/);
    expect(rendered.html).not.toContain("Email settings");
    expect(rendered.html).toContain(m.preheader);
  });

  test("an account email (E1) links to email settings, not unsubscribe", () => {
    const { rendered } = lifecycleOutgoing(renderLifecycleEmail("E1", vars), SITE);
    expect(rendered.html).toContain(`<a href="${SITE}/profile#email-settings"`);
    expect(rendered.html).not.toContain("Unsubscribe");
  });
});
