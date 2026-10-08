// Packs a sheet's measured pieces onto pages.
//
// Pure: the component measures each piece in the browser and hands the
// heights here, so the packing rules can be tested without one.

export interface PageUnit {
  height: number;
  /** Must share a page with the unit after it: a section heading and its
   *  first block, so a heading never sits alone at the foot of a page. */
  keepWithNext?: boolean;
  /** Starts a new page: the answers. */
  breakBefore?: boolean;
  /** Extra height when this unit is the first on its page. A long passage
   *  is split by paragraph, and the paragraph that opens a page also opens a
   *  new panel, whose padding and border have to fit too. */
  openHeight?: number;
}

/**
 * Indices of the units on each page, in order.
 *
 * Greedy, top to bottom. A unit taller than a whole page gets a page to
 * itself rather than being dropped. `gap` is the space between units.
 */
export function paginate(units: PageUnit[], pageHeight: number, gap = 0): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;

  const fits = (h: number) => current.length === 0 || used + gap + h <= pageHeight;
  const place = (i: number) => {
    used += current.length ? gap + units[i].height : units[i].height + (units[i].openHeight ?? 0);
    current.push(i);
  };
  const newPage = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.breakBefore && current.length) newPage();
    // A heading moves with its first block when the two do not fit together.
    const together = unit.keepWithNext && i + 1 < units.length ? unit.height + gap + units[i + 1].height : unit.height;
    if (!fits(together) && current.length) newPage();
    place(i);
  }
  newPage();
  return pages;
}
