import {
  House,
  SquaresFour,
  Folder,
  CalendarBlank,
  UsersThree,
  ChatTeardropDots,
  Crown,
} from "@phosphor-icons/react/dist/ssr";

/*
 * The signed-in app's destinations: the desktop rail, which on a phone is the
 * drawer the top bar's burger opens (SideNavV2).
 */

export interface NavItem {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string; weight?: "regular" | "fill" }>;
  /** Which count to show, if any. */
  count?: "tools" | "resources" | "colleagues";
  /**
   * Features designed but not built. Rendered as a disabled row with a
   * "Soon" pill rather than a link, so the shape of the product is visible
   * without promising something that does not work yet.
   */
  soon?: boolean;
  /** The ambassador's own page, drawn in gold. */
  gold?: boolean;
}

export const NAV: NavItem[] = [
  { label: "Today", href: "/dashboard", Icon: House },
  { label: "Make", href: "/tools", Icon: SquaresFour, count: "tools" },
  { label: "Library", href: "/folders", Icon: Folder, count: "resources" },
  { label: "Timetable", href: "/timetable", Icon: CalendarBlank },
  { label: "Colleagues", href: "/colleagues", Icon: UsersThree, count: "colleagues" },
  // Named for what it is, not what powers it. The language rules in
  // scripts/check-language.mjs fail the build on "AI" in teacher-facing copy,
  // which is what the old "AI assistant" label was.
  { label: "Ask Jo", href: "/assistant", Icon: ChatTeardropDots },
];

/** Appended for ambassadors only. Gold, because it is meant to feel like a
 *  members' room rather than another tool. */
export const AMBASSADOR_NAV: NavItem = {
  label: "Ambassador",
  href: "/ambassador",
  Icon: Crown,
  gold: true,
};
