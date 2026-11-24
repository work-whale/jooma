/*
 * The Phase 1 lifecycle emails (Jooma 4.5 spec Step 6), as data.
 *
 * Copy is Ash's, rewritten where the owner's decisions make it untrue:
 *   - "credits" is "resources" everywhere.
 *   - The trial exports carry the Jooma mark (red note), so nothing promises
 *     the trial "clean exports"; E6 sells "no Jooma mark" as Pro's.
 *   - E8 sends WITHOUT the weekly idea until Ash approves the ideas list.
 *
 * Each email has one button. Account emails link to email settings in the
 * footer; marketing emails (E9a, E9b, E10) link to a signed one-click unsubscribe
 * (app/lib/unsub-link.ts) and carry the List-Unsubscribe header.
 * Sent through app/lib/email.ts by the cron, and only when switched on in
 * Admin, Emails & templates (lib/lifecycle-switch.ts).
 *
 * Pure.
 */

import { OFFER, PLAN_CONFIG, TOP_UP_PACKS, TRIAL } from "@/app/lib/plan-config";
import { PRO_EXTRA } from "@/app/lib/prompts";
import type { EmailKind, LifecycleId } from "@/app/lib/lifecycle";
import { lifecycleHtml } from "@/app/lib/lifecycle-html";

export const LIFECYCLE_IDS: LifecycleId[] = ["E1", "E2a", "E2b", "E3", "E4", "E5", "E6", "E7", "E8", "E9a", "E9b", "E10", "E11", "E12", "E13", "E14"];

export interface LifecycleVars {
  firstName: string;
  /** "Wednesday 25 November" */
  trialEnds: string;
  /** "Wednesday" */
  trialEndsDay: string;
  made: number;
  hours: number;
  /** "Pro" */
  plan: string;
  /** The new plan's allowance. */
  resources: number;
  /** "12 December": the next refill. */
  refill: string;
  /** "3 December": when a cancelled plan ends. */
  planEnds: string;
  /** The first resource's title, for E2b. */
  firstTitle?: string;
  /** "Sunday 6 December": when the second run-out offer ends (E9b). */
  offerEnds?: string;
  /** "Sunday" */
  offerEndsDay?: string;
  /** E11: resources used this period (the allowance is `resources`). */
  used?: number;
  /** E10: this week's idea, its tool page and its rounded cost. */
  idea?: { text: string; href: string; cost: number };
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  button: string;
  /** Where the button goes, on the site. */
  path: string;
  kind: EmailKind;
  /** Footer link: email settings for account mail, unsubscribe for marketing. */
  footerPath: string;
  footerLabel: "Email settings" | "Unsubscribe";
  /** RFC 8058 one-click target (List-Unsubscribe header), marketing only. */
  oneClickPath: string | null;
}

const n = (v: number) => v.toLocaleString("en-GB");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
const FREE = PLAN_CONFIG.free.resources;
const PRO = PLAN_CONFIG.pro;
const TOOLS = 35;

type Draft = Omit<RenderedEmail, "kind" | "footerPath" | "footerLabel" | "oneClickPath" | "heading"> & { heading?: string };

const MARKETING: ReadonlySet<LifecycleId> = new Set(["E9a", "E9b", "E10"]);

function draft(id: LifecycleId, v: LifecycleVars): Draft {
  const hi = v.firstName ? `Hi ${v.firstName}, ` : "";
  switch (id) {
    case "E1":
      return {
        subject: `Your ${TRIAL.days} days of Pro have started`,
        preheader: "No card, nothing to cancel.",
        body:
          `${hi}Pro is yours free until ${v.trialEnds}. Tell Jooma what you're teaching in one sentence ` +
          "and you'll get a full deck, ready to edit and present. There's no card on your account, so there's nothing to cancel.",
        button: "Make your first deck",
        path: "/tools/slideshow",
      };
    case "E2a":
      return {
        subject: "Type one sentence. Get a whole lesson.",
        preheader: 'Try "Year 4, states of matter, 45 minutes".',
        body:
          "Most teachers start with a deck. Type the year group, the topic and how long the lesson is, " +
          "press Make, and you'll get slides, activities and questions you can edit.",
        button: "Try it now",
        path: "/tools/slideshow",
      };
    case "E2b":
      return {
        subject: "Now make the worksheet to match",
        preheader: "Same topic, three levels, answers included.",
        body:
          `You've made ${v.firstTitle ? v.firstTitle : "your first resource"}. Open Worksheets and pick the same topic. ` +
          "Jooma makes it at three levels, with the answers.",
        button: "Make the worksheet",
        path: "/tools/worksheet-generator",
      };
    case "E3":
      return {
        subject: "One worksheet, three levels",
        preheader: "And refining is free.",
        body:
          "Every worksheet comes at three levels, with the answers. Not quite right? Ask Jo to change it: " +
          "'make the middle level easier' or 'add a challenge question'. On Pro, refining never uses resources.",
        button: "Make a worksheet",
        path: "/tools/worksheet-generator",
      };
    case "E4":
      return {
        subject: "Pictures that fit the lesson",
        preheader: `A Pro feature you have until ${v.trialEnds.split(" ").slice(1).join(" ")}.`,
        body:
          "In Slides, switch on generated pictures and every image is made for your topic instead of coming from a stock library. " +
          `It's part of Pro, and it's yours free until ${v.trialEnds}.`,
        button: "Make a deck with pictures",
        path: "/tools/slideshow",
      };
    case "E5":
      return {
        subject: `Your Pro trial ends on ${v.trialEndsDay}`,
        preheader: "Here's what you've made so far.",
        body:
          `So far you've made ${plural(v.made, "resource", "resources")} and saved about ${plural(v.hours, "hour", "hours")}. ` +
          `On ${v.trialEnds} you'll move to Free: ${FREE} resources a week, library photos and a Jooma mark on exports. ` +
          `To keep generated pictures and ${n(PRO.resources)} resources a month, choose Pro: £${PRO.monthly} a month, or £${PRO.yearly} a year.`,
        button: "Keep Pro",
        path: "/pricing?pick=pro",
      };
    case "E6":
      return {
        subject: "Your Pro trial ends tonight",
        preheader: "Everything you've made stays in your library.",
        body:
          "Your Pro trial ends tonight at 23:59. Nothing gets deleted and you won't be charged: you'll move to Free and keep your library. " +
          `Choose Pro to keep generated pictures, exports with no Jooma mark and ${n(PRO.resources)} resources a month.`,
        button: "Keep Pro",
        path: "/pricing?pick=pro",
      };
    case "E7":
      return {
        subject: "You're on Free now. Here's what that means.",
        preheader: `${FREE} resources today, and every Sunday.`,
        body:
          `Your Pro trial has ended and you're on Free. You have ${FREE} resources to use today and ${FREE} more every Sunday, ` +
          `all ${TOOLS} tools, and everything you've made. Decks now use library photos and exports carry a small Jooma mark. ` +
          `Pro brings both back for £${PRO.monthly} a month.`,
        button: "See plans",
        path: "/pricing",
      };
    case "E8":
      return {
        subject: `Your ${FREE} resources are back`,
        preheader: "Enough for a deck, a worksheet and a quiz.",
        body: `Your free resources are back to ${FREE}. That's a deck, a worksheet and a quiz.`,
        button: "Plan this week",
        path: "/dashboard",
      };
    case "E9a":
      return {
        subject: "Ran out mid-plan?",
        preheader: "Your resources come back on Sunday.",
        body:
          `You've used this week's free resources, and they'll be back to ${FREE} on Sunday. ` +
          `If you plan more than one lesson a week, Pro gives you ${n(PRO.resources)} resources a month, ` +
          "plus generated pictures and exports with no Jooma mark.",
        button: "See Pro",
        path: "/pricing?plan=pro",
      };
    case "E9b":
      return {
        subject: `Your first month of Pro for £${OFFER.firstMonthPrice}`,
        preheader: `Half price until ${v.offerEndsDay ?? "Sunday"}.`,
        body:
          "You've run out of free resources twice now, so Free isn't keeping up with your planning. " +
          `Your first month of Pro is £${OFFER.firstMonthPrice} instead of £${PRO.monthly}. ` +
          `The offer ends on ${v.offerEnds ?? "Sunday"}.`,
        button: `Get Pro for £${OFFER.firstMonthPrice}`,
        path: "/pricing?plan=pro&interval=month",
      };
    case "E10": {
      const idea = v.idea ?? { text: "a quick quiz on this week's topic", href: "/tools", cost: 1 };
      return {
        subject: "One for this week",
        preheader: `Ready in one sentence: ${idea.text}.`,
        body:
          `Haven't been in for a while? Here's a quick one for this week: ${idea.text}. ` +
          `It takes one sentence and about ${plural(idea.cost, "resource", "resources")}.`,
        button: "Make it now",
        path: idea.href,
      };
    }
    case "E11": {
      // Standard exports are clean (red note), so Pro is sold on resources
      // and pictures, never on the Jooma mark.
      const from = Math.min(...TOP_UP_PACKS.map((p) => p.price));
      return {
        subject: `You've used ${n(v.used ?? 0)} of your ${n(v.resources)} resources`,
        preheader: `They refill on ${v.refill}.`,
        body:
          `Your resources refill on ${v.refill}. If you need more before then, top-ups start at £${from.toFixed(2)}. ` +
          `Or switch to Pro: double the resources and generated pictures for ${PRO_EXTRA} more a month.`,
        button: "Switch to Pro",
        path: "/pricing?plan=pro",
      };
    }
    case "E12":
      return {
        subject: `Welcome to ${v.plan}`,
        preheader: `${n(v.resources)} resources are ready.`,
        body:
          `Your ${v.plan} plan has started and your ${n(v.resources)} resources are ready. They refill on ${v.refill}. ` +
          "Stripe will send your receipt separately.",
        button: "Open Jooma",
        path: "/dashboard",
      };
    case "E13":
      return {
        subject: `Your plan ends on ${v.planEnds}`,
        preheader: "Everything you've made stays.",
        body:
          `You've cancelled ${v.plan}. You can keep using it until ${v.planEnds}, then you'll move to Free: ` +
          `everything you've made stays, and you'll get ${FREE} resources every Sunday. ` +
          "Changed your mind? You can keep your plan in one click.",
        button: `Keep ${v.plan}`,
        path: "/account/billing",
      };
    case "E14":
      return {
        subject: "Your payment didn't go through",
        preheader: `Update your card to keep ${v.plan}.`,
        body:
          `We couldn't take your ${v.plan} payment. Update your card and nothing changes. ` +
          "If the payment still fails after a few tries, your account will move to Free, and everything you've made stays safe.",
        button: "Update card",
        path: "/account/billing",
      };
  }
}

/**
 * What the cron hands to sendBroadcastEmail for one rendered email: the
 * message and the options. Marketing mail gets the RFC 8058 one-click URL (the
 * List-Unsubscribe header) and an "Unsubscribe" footer; account mail gets
 * neither. Until 19 Nov the cron passed null for every header and always
 * labelled the footer "Email settings", so E9a, E9b and E10 went out without
 * the header and with an unsubscribe link that said "Email settings".
 */
export function lifecycleOutgoing(
  m: RenderedEmail,
  site: string,
): {
  rendered: { subject: string; html: string; text: string };
  opts: { purpose: "lifecycle"; oneClickUrl: string | null };
} {
  const base = site.replace(/\/+$/, "");
  return {
    rendered: {
      subject: m.subject,
      html: lifecycleHtml(m.subject, m.body, m.button, base + m.path, base + m.footerPath, m.footerLabel, { preheader: m.preheader }),
      text: `${m.body}\n\n${m.button}: ${base}${m.path}\n\n${m.footerLabel}: ${base}${m.footerPath}`,
    },
    opts: { purpose: "lifecycle", oneClickUrl: m.oneClickPath ? base + m.oneClickPath : null },
  };
}

export function renderLifecycleEmail(
  id: LifecycleId,
  v: LifecycleVars,
  opts: { unsubToken?: string } = {},
): RenderedEmail {
  const d = draft(id, v);
  if (!MARKETING.has(id)) {
    return { heading: d.subject, ...d, kind: "account", footerPath: "/profile#email-settings", footerLabel: "Email settings", oneClickPath: null };
  }
  // Marketing (spec Step 6 rule 4): an unsubscribe link in the footer, and
  // one-click in the inbox. Never sent without one.
  if (!opts.unsubToken) throw new Error(`${id} is marketing and needs an unsubscribe token`);
  const t = encodeURIComponent(opts.unsubToken);
  return {
    heading: d.subject,
    ...d,
    kind: "marketing",
    footerPath: `/unsubscribe?t=${t}`,
    footerLabel: "Unsubscribe",
    oneClickPath: `/api/email/unsubscribe?t=${t}`,
  };
}
