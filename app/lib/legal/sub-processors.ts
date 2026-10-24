/**
 * Who processes personal data on Jooma's behalf, and why.
 *
 * One list, read by the privacy policy (section 5) and the schools trust page
 * (/trust), so the page a school's data protection officer reads and the legal
 * policy can never name different companies. Add a provider here and both
 * pages show it.
 *
 * If a provider is added that transfers data outside the UK, privacy section 11
 * (International Transfers) names those providers in prose and needs the same
 * change.
 */
export interface SubProcessor {
  name: string;
  purpose: string;
}

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: "Supabase",
    purpose: "Database, authentication and file storage. Hosted in the UK (London).",
  },
  {
    name: "OpenAI",
    purpose: "AI content generation. Your prompts are sent to OpenAI's API. See openai.com/privacy",
  },
  {
    name: "Anthropic",
    purpose: "AI content generation. Your prompts are sent to Anthropic's API. See anthropic.com/legal/privacy",
  },
  {
    name: "Stripe",
    purpose: "Payment processing. See stripe.com/gb/privacy",
  },
  {
    name: "Twilio SendGrid",
    purpose:
      "Delivery of account, service and product news emails. SendGrid tells us whether each email was delivered, bounced or reported as spam, and we use that only to stop emailing addresses that bounce or complain. Operated by Twilio Inc. See twilio.com/en-us/legal/privacy",
  },
  {
    name: "Sentry",
    purpose:
      "Error monitoring and diagnostics, which may record your IP address and account identifier when something goes wrong. Operated by Functional Software, Inc. See sentry.io/privacy",
  },
  {
    name: "Vercel",
    purpose: "Hosting and edge delivery. See vercel.com/legal/privacy-policy",
  },
  {
    name: "Meta",
    purpose:
      "Advertising measurement. We send a one-way encrypted (hashed) form of your email address, advertising cookie identifiers, and the amount and currency of a subscription payment, so we can tell which adverts led to signups. Operated by Meta Platforms Ireland Ltd. See facebook.com/privacy/policy",
  },
];
