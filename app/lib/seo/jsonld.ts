import { PLANS, type PlanId } from "@/app/lib/plans";
import { planCardName } from "@/app/lib/plan-copy";
import { V2_TOOLS, type V2Tool } from "@/app/lib/tools";
import type { FaqItem } from "@/app/lib/landing/faq";
import { toolPagePath, type ToolPage } from "./tool-pages";
import {
  BRAND_DEFINITION,
  COMPANY_NUMBER,
  CONTACT_EMAIL,
  LEGAL_NAME,
  SAME_AS,
  SITE_URL,
} from "./brand";

/**
 * The structured data (schema.org JSON-LD) the public pages publish.
 *
 * Pure functions returning plain objects, so a page renders whichever nodes it
 * needs and the unit tests can check them without a browser. Nodes refer to
 * each other by @id, so the homepage's graph says once who the organisation is
 * and every other node points at it.
 *
 * What this is for, honestly: Google has shown FAQ rich results only for
 * government and health sites since 2023, so none of this buys FAQ dropdowns.
 * It is how search engines and assistants (Bing feeds ChatGPT's search) work
 * out what Jooma is, who makes it, what it costs and what people ask about it,
 * without having to infer it from page layout.
 *
 * Every figure is derived from the same sources the visible page uses, and
 * there is deliberately no aggregateRating: there are no reviews to rate, and
 * Google treats a self-written rating as spam.
 */

type Node = Record<string, unknown>;

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;

/** The plans a visitor can buy today, in the order the pricing section shows. */
const PRICED_PLANS: PlanId[] = ["standard", "pro", "max"];

export function organization(): Node {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Jooma",
    // "Jooma" alone is shared with an unrelated business in search results;
    // this is the name with what it is attached.
    alternateName: "Jooma teaching resources",
    legalName: LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo/Jooma-logo-v2-round-light-1024.png`,
    description: BRAND_DEFINITION,
    email: CONTACT_EMAIL,
    areaServed: { "@type": "Country", name: "United Kingdom" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      url: `${SITE_URL}/contact`,
      areaServed: "GB",
      availableLanguage: "en-GB",
    },
    ...(SAME_AS.length > 0 ? { sameAs: SAME_AS } : {}),
    ...(COMPANY_NUMBER
      ? {
          identifier: {
            "@type": "PropertyValue",
            propertyID: "Companies House",
            value: COMPANY_NUMBER,
          },
        }
      : {}),
  };
}

export function website(): Node {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "Jooma",
    url: SITE_URL,
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID },
  };
}

/** One Offer per plan and billing period, priced from PLANS. */
export function offers(): Node[] {
  return PRICED_PLANS.flatMap((id) => {
    const plan = PLANS[id];
    const name = planCardName(id);
    const out: Node[] = [];
    if (plan.priceMonthly) {
      out.push(offer(`${name}, monthly`, plan.priceMonthly, "MON"));
    }
    if (plan.priceYearly) {
      out.push(offer(`${name}, yearly`, plan.priceYearly, "ANN"));
    }
    return out;
  });
}

function offer(name: string, price: number, unitCode: "MON" | "ANN"): Node {
  return {
    "@type": "Offer",
    name,
    price: price.toFixed(2),
    priceCurrency: "GBP",
    url: `${SITE_URL}/#pricing`,
    availability: "https://schema.org/InStock",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: price.toFixed(2),
      priceCurrency: "GBP",
      valueAddedTaxIncluded: true,
      // UN/CEFACT codes, which is what schema.org asks for here.
      unitCode,
    },
  };
}

export function softwareApplication(): Node {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: "Jooma",
    url: SITE_URL,
    description: BRAND_DEFINITION,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "en-GB",
    audience: { "@type": "EducationalAudience", educationalRole: "teacher" },
    // The tools under the names teachers search for ("Report Writer", not
    // "Reports"), which is the V1 label each tool keeps as a synonym.
    featureList: V2_TOOLS.map((t) => t.label),
    offers: offers(),
    publisher: { "@id": ORG_ID },
  };
}

/** One tool, on its public page: the same app and offers, narrowed to what
 *  this tool makes, and tied back to the whole app by isPartOf. */
export function toolApplication(page: ToolPage, tool: V2Tool): Node {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}${toolPagePath(page)}#app`,
    name: `Jooma ${tool.label}`,
    alternateName: tool.name,
    url: `${SITE_URL}${toolPagePath(page)}`,
    description: page.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "en-GB",
    audience: { "@type": "EducationalAudience", educationalRole: "teacher" },
    featureList: page.features,
    offers: offers(),
    isPartOf: { "@id": APP_ID },
    publisher: { "@id": ORG_ID },
  };
}

export function faqPage(items: FaqItem[]): Node {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbs(items: { name: string; path: string }[]): Node {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** Several nodes as one document, which is how a page should publish them. */
export function graph(nodes: Node[]): Node {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Serialised for a <script type="application/ld+json">. "<" is escaped so a
 *  string in the data can never close the script tag early. */
export function toScript(data: Node): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
