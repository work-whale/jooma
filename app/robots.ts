import type { MetadataRoute } from "next";
import { isIndexable } from "@/app/lib/seo/indexable";

/**
 * Served at /robots.txt.
 *
 * There was no robots.txt at all, so that path fell through to the catch-all
 * and returned the app's HTML. A crawler asking what it may fetch was handed a
 * login page.
 *
 * The `disallow` list is the private half of the route tree. None of it is
 * reachable signed out anyway (the proxy bounces to /login), so this changes no
 * permissions; it stops crawlers spending requests on URLs that can only
 * redirect, and keeps them out of the API surface.
 *
 * `sitemap` is how the sitemap gets discovered without anybody submitting it by
 * hand, which matters here because the Search Console property was only just
 * verified.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://www.jooma.ai";

  // Staging and previews: nothing. See app/lib/seo/indexable.ts.
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        // Auth plumbing: nothing to read, and several of these carry
        // single-use tokens in the query string that have no business in a
        // search index.
        "/auth/",
        "/verify",
        "/create-password",
        "/complete-profile",
        // NOT /login, /signup or /forgot-password, though they are just as
        // empty. Each now carries a noindex, and a crawler can only see a
        // noindex on a page it is allowed to fetch: disallowing them here would
        // freeze /login in the index where Search Console already shows it.
        // Behind a session.
        "/admin",
        "/dashboard",
        "/profile",
        "/tools/",
        "/editor",
        "/colleagues",
        "/assistant",
        "/welcome",
        "/announcements",
        // A redirect, not a page. See app/(app)/pricing/page.tsx.
        "/pricing",
        // A test fixture, and the holding page.
        "/sentry-example-page",
        "/maintenance",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
