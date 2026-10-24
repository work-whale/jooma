import { v2ToolsByCategory } from "@/app/lib/tools";
import { PLANS, TRIAL_DAYS, planCredits, type PlanId } from "@/app/lib/plans";
import { planCardName, planCardPrice } from "@/app/lib/plan-copy";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";
import { BRAND_DEFINITION, CONTACT_EMAIL, LEGAL_NAME, SITE_URL } from "@/app/lib/seo/brand";

/**
 * Served at /llms.txt: a plain summary of the site for language models and the
 * assistants built on them (the llms.txt convention, llmstxt.org).
 *
 * An assistant asked "what is Jooma" answers from whatever it can read
 * quickly, and most of them do not run JavaScript. This gives them the facts in
 * one place: what it is, who it is for, every tool, the prices and the free
 * offer, where data lives. Built from the same sources as the pages
 * (tools.ts, plans.ts, trial-limits.ts, brand.ts), so it cannot drift from them.
 *
 * Only states what the public site already states. Safeguarding detection, for
 * one, is real but not yet described publicly, so it is not described here.
 *
 * Public in app/lib/route-access.ts; without that a signed-out crawler would be
 * bounced to /login, which is what happened to robots.txt and the sitemap.
 * Static: nothing in it depends on the request.
 */
export const dynamic = "force-static";

const PRICED_PLANS: PlanId[] = ["standard", "pro", "max"];

export function GET() {
  const categories = v2ToolsByCategory();
  const toolCount = categories.reduce((n, c) => n + c.tools.length, 0);
  const tools = categories
    .map(({ name, tools }) => {
      const lines = tools.map((t) => `- ${t.name} (${t.label}): ${t.description}`);
      return [`### ${name}`, "", ...lines].join("\n");
    })
    .join("\n\n");

  const plans = PRICED_PLANS.map((id) => {
    const plan = PLANS[id];
    const credits = planCredits(id)?.toLocaleString("en-GB");
    const yearly = plan.priceYearly ? `, or ${planCardPrice(id, "year")} a year` : "";
    return `- ${planCardName(id)}: ${planCardPrice(id)} a month${yearly}. ${credits} credits a month.`;
  }).join("\n");

  const body = `# Jooma

> ${BRAND_DEFINITION}

Jooma is a web app for teachers and school leaders in the UK. A teacher picks a tool, answers a few questions (year group, subject, topic) and gets a finished resource to edit, print or present. Documents download as PDF or Word; slideshows download as PowerPoint or PDF. It uses AI models from OpenAI and Anthropic to draft each resource; the teacher reviews and edits everything it makes. It has a built-in assistant called Jo that opens the right tool from a plain English request.

${LEGAL_NAME ? `Made by ${LEGAL_NAME}. ` : ""}Website: ${SITE_URL}. About: ${SITE_URL}/about. Data protection for schools: ${SITE_URL}/trust

## Who it is for

Classroom teachers, early years practitioners, SENCOs and school leaders in England, Scotland, Wales and Northern Ireland. Every tool is written around the UK national curricula, with year groups and key stages built in.

## Tools

${categories.length} categories, ${toolCount} tools. Each is listed by its current name, then the older name teachers may search for.

${tools}

## Prices

All prices are in GBP and include VAT. Every plan includes every tool; plans differ in monthly credits.

${plans}
- Schools and trusts: priced by size, invoiced yearly, with pooled credits and an admin dashboard. Enquiries: ${SITE_URL}/contact?type=school

## Free use

Anyone can try Jooma on the homepage with no account and no card: slides, a worksheet or a comprehension, ${FREE_TRIES_PER_DAY} times a day. Every paid plan starts with a ${TRIAL_DAYS} day free trial; the card is taken at the start and nothing is charged until the trial ends.

## Data

Jooma never asks for pupil names or personal data, and teachers should not enter any. Account data and resources are stored in the UK (London). Prompts are processed by the AI providers named in the privacy policy. Full details: ${SITE_URL}/privacy

## Key pages

- [Home, with the free try](${SITE_URL}/)
- [Pricing](${SITE_URL}/#pricing)
- [All teacher tools](${SITE_URL}/teacher-tools)
- [About Jooma](${SITE_URL}/about)
- [Trust and data protection for schools](${SITE_URL}/trust)
- [Contact and school enquiries](${SITE_URL}/contact)
- [Privacy policy](${SITE_URL}/privacy)
- [Terms of service](${SITE_URL}/terms)

## Contact

${CONTACT_EMAIL}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
