<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project docs

Before implementing navigation, routing, loading states, Suspense, skeletons, or URL state, read:

- `docs/instant-navigation-guide.md` — canonical reference for `<Link>`, `loading.tsx`, Suspense streaming, skeleton UI, URL state, debounced search, and the Suspense `key` trick
<!-- END:nextjs-agent-rules -->

Two language rules are enforced by `pnpm lint` (`scripts/check-language.mjs`): no em dashes or en dashes anywhere, and no standalone word "AI" in the landing page, its v2 components, `NavAuth`, or the shared copy table (`app/lib/copy.ts`, `app/lib/landing`). That is the marketing and signed-out surface, not the whole app. Terms and privacy are exempt because the disclosure is factual there.

# Database writes

Always ask before writing a migration or touching the schema. Schema changes go in a Supabase migration (`supabase/migrations/`) that the user pushes themselves; one-off data seeding can be applied directly if they prefer. Never let an anonymous or public-facing write go through a plain RLS insert policy. Public write paths (contact forms, ambassador signups, etc.) go through a `SECURITY DEFINER` RPC granted to `anon`, with a honeypot plus per-email and per-IP throttling. The same applies to reading another user's row: expose specific columns through a definer function, never a broad RLS policy, since a policy grants the whole row.

# Testing every feature

Every feature, bug fix and refactor is tested before release. A new feature gets tests, a bug fix gets a regression test, and a refactor gets a test proving behaviour is unchanged. Testing is local only (there is no CI), against the STAGING database that `.env.local` points at. Never aim a test at production.

## 1. Plan the tests before writing code

In the plan, list which layers below the change needs, and for each one the edge cases and refusal paths you will cover (wrong user, signed out, wrong plan or state, empty input, repeat calls, boundaries). Ask of every test: would it still pass if the code were wrong? If so, it is not testing anything. Say in the summary which cases were deliberately left untested and why.

## 2. Pick the layers

Keep it lean: two layers carry the weight, plus two narrow checks used only when a change calls for them.

| The change touches | Layer | Lives in | Run with |
| --- | --- | --- | --- |
| Pure logic: prompt building, schemas, parsing, normalising, pricing, exports | Unit | `tests/unit/` | `pnpm test:unit` |
| Anything a teacher sees or clicks | E2E | `tests/<domain>/` | `pnpm test:<domain>` |

Most of the testing belongs in unit tests, so put logic in pure functions where it can be tested without a browser. E2E stays slim: one or two specs per feature covering the main path, that the work is saved, and anything that must never happen (for example a pupil's name in a request body).

Narrow checks, only when relevant:

- **An RLS policy, RPC or definer function** added or changed: a `scripts/verify-*.mjs` style check (service role fixtures, every assertion through the ANON key as a signed-in throwaway user, since the service role bypasses RLS).
- **A new client dependency or heavy component:** compare the route sizes `next build` prints before and after, and lazy-load anything only some teachers use.

API routes do not need their own refusal tests: sign-in, plan and spend gates are enforced centrally in `proxy.ts`. A new generation route only has to be listed in `GENERATION_PATHS` (or `COST_BEARING_PATHS`).

## 3. Rules per layer

- **Unit:** no browser, server or database. Runs in seconds; run it while you work.
- **E2E:** the screens, signed in through the real login page. Reuse a dev server already on :3000; use `localhost`, never `127.0.0.1`. Mock model routes with `page.route` so the screen tests are free and repeatable. Each AI tool also has ONE live spec that really generates on staging and checks the result parses and renders; it is skipped unless `LIVE_MODEL=1` and is run when that tool's prompt or schema changes, since a mock never proves the model accepts the schema.

## 4. Before calling it done

Run the layers the change touched, and only those, and report the results honestly, failures included.
