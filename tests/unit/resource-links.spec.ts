import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  SHAREABLE_SLUGS,
  isLinkToken,
  isShareableSlug,
  shareLinkUrl,
  shareTargets,
  type ShareTarget,
} from "@/app/lib/resource-links";
import { V2_TOOLS } from "@/app/lib/tools";

/*
 * Share a resource by link, to WhatsApp, Viber, Messenger and Instagram.
 *
 * Edge cases: a tool that holds pupil or staff details is never shareable,
 * whatever the slug list elsewhere says; the SQL allowlist and this one cannot
 * drift; the title and link survive characters that would break a URL (&, #,
 * spaces, an apostrophe, emoji); a phone and a computer get different
 * Messenger and Instagram routes; Messenger on a computer only uses the
 * Facebook dialog when an app id exists; a token that is not exactly the
 * database's shape is refused before any query.
 */

const TOKEN = "AbCdEfGhIjKlMnOpQrSt-_";

test("classroom resources are shareable", () => {
  for (const slug of [
    "slideshow",
    "worksheet-generator",
    "comprehension-generator",
    "quiz-generator",
    "homework-generator",
    "model-text-generator",
    "phonics-support",
    "lesson-planner",
  ]) {
    expect(isShareableSlug(slug), slug).toBe(true);
  }
});

test("anything holding pupil, parent or staff details is not", () => {
  for (const slug of [
    "report-writer",
    "one-page-profile",
    "behaviour-support-plan",
    "targeted-intervention",
    "pupil-premium-planner",
    "risk-assessment",
    "smart-targets",
    "ect-report-writer",
    "letter-writer",
    "newsletter-writer",
    "meeting-planner",
    "lesson-observation-report",
    "learning-walk-report",
    "performance-management",
    "school-improvement-plan",
    "inspection-prep",
    "policy-generator",
    "eyfs-action-plan",
    "cpd-slideshow",
    // A removed tool and nonsense.
    "lesson-slideshow",
    "",
    "SLIDESHOW",
  ]) {
    expect(isShareableSlug(slug), slug).toBe(false);
  }
});

test("every shareable slug is a real tool", () => {
  const slugs = V2_TOOLS.map((t) => t.href.replace("/tools/", ""));
  for (const s of SHAREABLE_SLUGS) expect(slugs, s).toContain(s);
});

test("the SQL allowlist matches this one exactly", () => {
  // The database refuses a link for anything else, so a slug added here but
  // not there would show a Link tab that always fails.
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_favourites_and_resource_links.sql"));
  expect(file, "migration present").toBeTruthy();
  const sql = readFileSync(path.join(dir, file!), "utf8");
  const m = sql.match(/resource_link_slugs\(\)[\s\S]*?array\[([\s\S]*?)\]/);
  expect(m, "allowlist found in the migration").toBeTruthy();
  const inSql = [...m![1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]).sort();
  expect(inSql).toEqual([...SHAREABLE_SLUGS].sort());
});

test("token shape", () => {
  expect(isLinkToken(TOKEN)).toBe(true);
  expect(isLinkToken(TOKEN.slice(1))).toBe(false);
  expect(isLinkToken(TOKEN + "a")).toBe(false);
  expect(isLinkToken("AbCdEfGhIjKlMnOpQrSt+/")).toBe(false);
  expect(isLinkToken("../../etc/passwd....aa")).toBe(false);
  expect(isLinkToken(undefined)).toBe(false);
});

test("the link is the origin plus /share/<token>, with no trailing slash trouble", () => {
  expect(shareLinkUrl("https://jooma.ai", TOKEN)).toBe(`https://jooma.ai/share/${TOKEN}`);
  expect(shareLinkUrl("https://jooma.ai/", TOKEN)).toBe(`https://jooma.ai/share/${TOKEN}`);
});

const url = `https://jooma.ai/share/${TOKEN}`;
const title = "Fractions & decimals #2: Year 5's quiz 🎉";

function byId(targets: ShareTarget[], id: ShareTarget["id"]) {
  const t = targets.find((x) => x.id === id);
  if (!t) throw new Error(`no ${id}`);
  return t;
}

test("WhatsApp and Viber carry the title and link, fully encoded", () => {
  for (const mobile of [true, false]) {
    const targets = shareTargets({ url, title, mobile, canNativeShare: mobile });
    const wa = byId(targets, "whatsapp");
    expect(wa.kind).toBe("open");
    expect(wa.href).toBe(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`);
    // Decoding gives back exactly what was put in.
    expect(new URL(wa.href!).searchParams.get("text")).toBe(`${title}\n${url}`);

    const viber = byId(targets, "viber");
    expect(viber.kind).toBe("open");
    expect(viber.href).toBe(`viber://forward?text=${encodeURIComponent(`${title}\n${url}`)}`);
  }
});

test("Messenger: the app on a phone", () => {
  const m = byId(shareTargets({ url, title, mobile: true, canNativeShare: true }), "messenger");
  expect(m.kind).toBe("open");
  expect(m.href).toBe(`fb-messenger://share/?link=${encodeURIComponent(url)}`);
});

test("Messenger on a computer: the Facebook dialog only with an app id", () => {
  const withId = byId(
    shareTargets({ url, title, mobile: false, canNativeShare: false, facebookAppId: "123456" }),
    "messenger",
  );
  expect(withId.kind).toBe("open");
  const u = new URL(withId.href!);
  expect(u.origin + u.pathname).toBe("https://www.facebook.com/dialog/send");
  expect(u.searchParams.get("app_id")).toBe("123456");
  expect(u.searchParams.get("link")).toBe(url);
  expect(u.searchParams.get("redirect_uri")).toBe(url);

  for (const facebookAppId of [undefined, "", "  ", "not-digits"]) {
    const m = byId(shareTargets({ url, title, mobile: false, canNativeShare: false, facebookAppId }), "messenger");
    expect(m.kind, String(facebookAppId)).toBe("copy-then-open");
    expect(m.href).toBe("https://www.messenger.com/");
  }
});

test("Instagram: the phone's share sheet, else copy and open the inbox", () => {
  expect(byId(shareTargets({ url, title, mobile: true, canNativeShare: true }), "instagram").kind).toBe("native");
  for (const opts of [
    { mobile: false, canNativeShare: false },
    { mobile: false, canNativeShare: true },
    { mobile: true, canNativeShare: false },
  ]) {
    const ig = byId(shareTargets({ url, title, ...opts }), "instagram");
    expect(ig.kind, JSON.stringify(opts)).toBe("copy-then-open");
    expect(ig.href).toBe("https://www.instagram.com/direct/inbox/");
  }
});

test("always a Copy link, and More only where a share sheet exists", () => {
  const phone = shareTargets({ url, title, mobile: true, canNativeShare: true });
  expect(byId(phone, "copy").kind).toBe("copy");
  expect(phone.some((t) => t.id === "more")).toBe(true);

  const desk = shareTargets({ url, title, mobile: false, canNativeShare: false });
  expect(byId(desk, "copy").kind).toBe("copy");
  expect(desk.some((t) => t.id === "more")).toBe(false);
  // The order on screen.
  expect(desk.map((t) => t.id)).toEqual(["whatsapp", "viber", "messenger", "instagram", "copy"]);
});

test("no em or en dashes in any label", () => {
  for (const t of shareTargets({ url, title, mobile: true, canNativeShare: true })) {
    expect(t.label).not.toMatch(/[–—]/);
  }
});
