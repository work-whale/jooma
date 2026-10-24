import { PLANS, TRIAL_DAYS, planCredits } from "@/app/lib/plans";
import { maxYearlySavingPercent, planCardPrice } from "@/app/lib/plan-copy";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";

/**
 * The landing page FAQ, as data.
 *
 * Plain strings rather than markup because two things read them: the FAQ
 * section itself, and the FAQPage structured data that tells search engines
 * and assistants what the questions and answers are. One list means the two
 * cannot drift.
 *
 * Every figure is derived (prices, credits, trial length, free tries), never
 * typed, so an answer cannot quote an allowance the product does not give. The
 * closing banner used to promise "five free resources a month", which no
 * account has had since the free plan was retired.
 */
export type FaqItem = { q: string; a: string };

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "three", the way the landing page writes small numbers. */
export function inWords(n: number): string {
  return WORDS[n] ?? String(n);
}

export function faqQuestions(): FaqItem[] {
  const proCredits = planCredits("pro")?.toLocaleString("en-GB") ?? "1,000";
  const proPrice = PLANS.pro.priceMonthly?.toFixed(2) ?? "7.99";
  const tries = inWords(FREE_TRIES_PER_DAY);
  const trialDays = inWords(TRIAL_DAYS);
  const saving = maxYearlySavingPercent(["standard", "pro", "max"]);

  return [
    {
      q: "What actually is Jooma?",
      a: "Thirty five tools that make the things teachers make. You pick a tool, answer a few questions such as year group, subject and topic, and it hands you a finished resource you can edit, print or present. There is no prompt writing and nothing to learn.",
    },
    {
      q: "Is Jooma free to try?",
      a: `Yes. You can make slides, a worksheet or a comprehension on this page with no account and no card, ${tries} times a day. Every plan then starts with ${trialDays} days free. Your card is taken when you start, nothing is charged until the trial ends, and you can cancel before then.`,
    },
    {
      q: "How much does Jooma cost?",
      a: `Standard is ${planCardPrice("standard")} a month, Pro is ${planCardPrice("pro")} and Max is ${planCardPrice("max")}, with VAT included.${saving > 0 ? ` Paying yearly saves up to ${saving}%.` : ""} Every plan has all thirty five tools; the difference is how many credits you get each month. Schools and trusts are priced by size.`,
    },
    {
      q: "What is a credit?",
      a: `How we price the work. Bigger jobs such as a full teaching deck cost more than a single worksheet. Pro gives you ${proCredits} credits a month and you can top up any time. Editing or refining something you have already made never costs anything.`,
    },
    {
      q: "Is it aligned to the UK curriculum?",
      a: "Yes. Every tool is written around the national curriculum for England, Scotland, Wales and Northern Ireland. You choose your curriculum once and it applies everywhere, so year group and key stage are built in rather than bolted on.",
    },
    {
      q: "Who is Jo?",
      a: "Jo is the assistant built into Jooma. Tell it what you are teaching in plain English and it opens the right tool with the details already filled in. It asks a question back if something is unclear, so you are never guessing what it will produce.",
    },
    {
      q: "Can I share resources with colleagues?",
      a: "Yes. Add colleagues by username or email, then share any resource straight to their library. They get their own copy to edit, and yours stays untouched. Most schools end up with a shared bank of resources built by the people who teach there.",
    },
    {
      q: "Can I edit what it makes?",
      a: "All of it. Every resource opens in an editor when it is done, so you can change the wording, the difficulty or a single question. Everything saves to your library so you can pick it up next year.",
    },
    {
      q: "Is pupil data safe?",
      a: "Jooma never asks for pupil names or personal data and you should not enter any. Everything you make belongs to you and is stored in the UK, in London. What you type is processed by our providers under UK GDPR safeguards, and our privacy policy names each of them.",
    },
    {
      q: "What if my school wants it for everyone?",
      a: `Schools and trusts get pooled credits, an admin dashboard, usage reporting and one invoice. Get in touch and we will put a quote together. For a single teacher, Pro is £${proPrice} a month.`,
    },
  ];
}
