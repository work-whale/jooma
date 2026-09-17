import { Fragment, type ReactNode } from "react";

/**
 * Render the `**bold**` runs the generators emit.
 *
 * Jooma's slide prompt requires every body to mark vocabulary with paired
 * asterisks and every bullet to lead with a bold noun, so real captured output
 * is full of them. Printing the markers raw would make genuine output look like
 * a bug on the landing page.
 *
 * A local four-line helper rather than the app's own renderInlineBold: that one
 * lives inside MiniSlide, the 36KB absolutely-positioned canvas renderer, and
 * dragging the editor onto the marketing page to parse asterisks would cost far
 * more than it saves. The two only have to agree on `**`.
 */
export function boldRuns(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <b key={i}>{part.slice(2, -2)}</b>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
