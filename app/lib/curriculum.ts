// Countries for the "Align to curriculum" picker in the slideshow generator.
//
// The curriculum data itself lives in app/lib/national-curriculum: real
// statements, by year, from the official documents. This file used to hold a
// list of GCSE strands that the picker offered for every year, which is how a
// Year 3 deck came to be "aligned" to KS4 biology. Only England has data, so
// the picker shows the other countries as coming soon rather than offering an
// empty dropdown.

export interface Country {
  id: string;
  name: string;
  /** flagcdn.com slug. UK subdivisions use the `gb-xxx` format (e.g.
   *  `gb-eng`, `gb-sct`). Standard countries use the 2-letter ISO code. */
  flagCode: string;
}

export const COUNTRIES: Country[] = [
  { id: "england",          name: "England",          flagCode: "gb-eng" },
  { id: "scotland",         name: "Scotland",         flagCode: "gb-sct" },
  { id: "wales",            name: "Wales",            flagCode: "gb-wls" },
  { id: "northern-ireland", name: "Northern Ireland", flagCode: "gb-nir" },
  { id: "usa",              name: "USA",              flagCode: "us" },
  { id: "australia",        name: "Australia",        flagCode: "au" },
  { id: "canada",           name: "Canada",           flagCode: "ca" },
];
