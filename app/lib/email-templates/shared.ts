// Helpers the individual templates need. These live here rather than in
// email.ts so a template can import them without a circular import back through
// the registry that email.ts itself imports.
//
// The markup primitives themselves live in ./markup, which has no server
// dependency so the browser preview and the unit runner can use them too.
import "server-only";
import { escapeHtml, P } from "./markup";

export { siteUrl, escapeHtml, button, H1, P, SMALL, DIVIDER } from "./markup";

/**
 * Turn an admin-written body override into the paragraph markup the templates
 * already use.
 *
 * This is the whole of what /admin/emails can change about an email body. The
 * heading, the button, the reason and reply blocks, the security footnotes and
 * the layout all stay in code — an admin edits prose, not HTML, and cannot
 * break the structure of a transactional email from a textarea.
 *
 * Escaping happens first, so anything typed into that textarea renders as
 * visible text rather than markup: the only <br> in the output is one this
 * function put there. Blank lines separate paragraphs, single newlines become
 * line breaks — the conventions someone writing in a box already expects.
 *
 * Returns null for empty or whitespace-only input, which is what makes each
 * template fall back to its own wording.
 */
export function prose(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p ${P}>${escapeHtml(para).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/** Every template renders to this shape. */
export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * What every template function looks like. The second argument is the
 * admin-supplied body override, already interpolated; a template passes it
 * through prose() and uses its own wording when the result is null.
 */
export type EmailRenderer = (
  params: Record<string, string>,
  bodyOverride?: string | null,
) => RenderedEmail;
