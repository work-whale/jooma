/**
 * The strip that hides content scrolling behind a tool's sticky result header.
 *
 * ResultPanel's own header sticks 2rem below the shell's top bar on desktop
 * (HEADER_STICKY), which leaves a gap above it. This strip sticks directly under
 * the bar, never over it: it used to stick at top 0, and once the top bar became
 * sticky it painted across the bar's lower half and cut the title in two. Without something opaque filling that gap, the page
 * content scrolls through it. This is that filler, so its background MUST track
 * the page background or the seam reappears.
 *
 * It was the same line copy-pasted into 32 of the 35 tool forms, each with the
 * page background written out as a literal. That is exactly the "duplicate
 * rules drift" trap in the developer handover: one of them was always going to
 * be missed on a rebrand. One component now, one edit next time.
 *
 * `h-0` below `lg` because the header is not offset there, so there is no gap
 * to fill. The negative margins bleed it to the gutter edges, matching the
 * page's `px-4 sm:px-6 lg:px-10` rhythm.
 */
export default function StickyMask() {
  return (
    <div
      className="sticky z-20 h-0 lg:h-8 -mx-4 sm:-mx-6 lg:-mx-10"
      style={{ top: "var(--topbar-h, 0px)", backgroundColor: "var(--j-bg)" }}
      aria-hidden="true"
    />
  );
}
