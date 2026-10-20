// Jo's "try it on a desktop" nudge on a phone (components/jo/DesktopHintPill).

export const DESKTOP_HINT_TEXT = "Would you like a better experience? Try Jooma on your desktop.";

/** The tool the hint is remembered against, so it shows once per tool per
 *  session: /editor/abc and /editor/xyz are one tool, and so is every page
 *  under /tools/quiz-generator. */
export function hintScope(pathname: string): string {
  const [, first = "", second = ""] = pathname.split("/");
  return first === "tools" && second ? `/tools/${second}` : `/${first}`;
}
