/**
 * Whether this deployment may appear in a search index.
 *
 * Only production. Staging runs as a branch of the same Vercel project, so it
 * serves the same pages on another host, and nothing used to stop a crawler
 * that found that host from indexing it. The www canonicals limited the damage
 * but did not prevent it. Local dev has no VERCEL_ENV at all and is not
 * indexable either, which is harmless.
 *
 * Read by robots.ts, the root layout's metadata and the proxy's X-Robots-Tag
 * header, so all three agree.
 */
export function isIndexable(vercelEnv: string | undefined = process.env.VERCEL_ENV) {
  return vercelEnv === "production";
}
