// Share a resource by link: WhatsApp, Viber, Messenger, Instagram, or copied.
//
// Pure, so it is unit tested without a browser (tests/unit/resource-links.spec.ts).
// The database side is supabase/migrations/*_favourites_and_resource_links.sql:
// create_resource_link() refuses any slug not in its own copy of the list
// below, and a unit test keeps the two identical.
//
// WHY AN ALLOWLIST. A public link ends up in WhatsApp groups, so it is for
// classroom resources only. Reports, pupil profiles, behaviour, SEND, letters,
// newsletters and staff documents can carry a pupil's, parent's or colleague's
// details, and keep colleague-only sharing. A new tool is not shareable until
// someone decides it should be, which is the safe default.

export const SHAREABLE_SLUGS: readonly string[] = [
  "slideshow",
  "worksheet-generator",
  "comprehension-generator",
  "model-text-generator",
  "phonics-support",
  "sensory-activities",
  "quiz-generator",
  "exam-question-generator",
  "model-answer-generator",
  "homework-generator",
  "lesson-planner",
  "medium-term-planner",
  "topic-overview",
  "eyfs-planner",
  "cover-lesson",
  "assembly-planner",
];

const SHAREABLE = new Set(SHAREABLE_SLUGS);

export function isShareableSlug(slug: string): boolean {
  return SHAREABLE.has(slug);
}

/** 16 random bytes as base64url without padding: exactly what the database makes. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function isLinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function shareLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/share/${token}`;
}

export type ShareTarget = {
  id: "whatsapp" | "viber" | "messenger" | "instagram" | "copy" | "more";
  label: string;
  /**
   * open:           follow href (a web page or an app's own link).
   * copy:           copy the link.
   * copy-then-open: copy the link, then open href, where it is pasted. For
   *                 the apps with no way to hand them a link from a web page.
   * native:         the phone's own share sheet (navigator.share).
   */
  kind: "open" | "copy" | "copy-then-open" | "native";
  href?: string;
};

export function shareTargets(opts: {
  url: string;
  title: string;
  /** A phone or tablet, where the apps' own links open the app. */
  mobile: boolean;
  /** navigator.share exists. */
  canNativeShare: boolean;
  /** A Facebook app id, for Messenger's send dialog on a computer. */
  facebookAppId?: string;
}): ShareTarget[] {
  const { url, title, mobile, canNativeShare } = opts;
  const text = encodeURIComponent(`${title}\n${url}`);
  const link = encodeURIComponent(url);
  const appId = opts.facebookAppId?.trim();
  const hasAppId = !!appId && /^\d+$/.test(appId);
  const sheet = mobile && canNativeShare;

  const targets: ShareTarget[] = [
    { id: "whatsapp", label: "WhatsApp", kind: "open", href: `https://wa.me/?text=${text}` },
    { id: "viber", label: "Viber", kind: "open", href: `viber://forward?text=${text}` },
    mobile
      ? { id: "messenger", label: "Messenger", kind: "open", href: `fb-messenger://share/?link=${link}` }
      : hasAppId
        ? {
            id: "messenger",
            label: "Messenger",
            kind: "open",
            href: `https://www.facebook.com/dialog/send?app_id=${appId}&link=${link}&redirect_uri=${link}`,
          }
        : { id: "messenger", label: "Messenger", kind: "copy-then-open", href: "https://www.messenger.com/" },
    // Instagram takes no link from a web page at all. On a phone its share
    // sheet entry does; anywhere else, copy and open the inbox to paste it.
    sheet
      ? { id: "instagram", label: "Instagram", kind: "native" }
      : { id: "instagram", label: "Instagram", kind: "copy-then-open", href: "https://www.instagram.com/direct/inbox/" },
    { id: "copy", label: "Copy link", kind: "copy" },
  ];
  if (sheet) targets.push({ id: "more", label: "More", kind: "native" });
  return targets;
}
