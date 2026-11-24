/*
 * England's year names, read by age, for curricula that number their years
 * differently (today: Northern Ireland, where Year N starts at age N + 3).
 *
 * A few tool rules are written against England's labels (the KS1 reading
 * skills for Years 1 and 2, the KS2 SATs styles setting Year 6, the slide theme
 * for primary years). For a teacher on their own list the label is first read
 * at the same age in England, so NI Year 3 (age 6) counts as England's Year 2.
 * Every other curriculum, a guest and an unknown value come back unchanged.
 *
 * Relative imports only (scripts/curricula-status.mjs loads the registry in
 * plain Node). index.ts must NOT import this file: that would be a cycle.
 */

import type { YearOption } from "./types";
import { getCurriculum } from "./index";
import { UK_YEARS } from "./uk";

/** England's year names by starting age, Nursery (3) to Year 13 (17), sixth form included. */
const ENGLAND: readonly YearOption[] = [...UK_YEARS, { label: "Year 12", age: 16 }, { label: "Year 13", age: 17 }];

/** A UK or island curriculum with its own year list (today: Northern Ireland).
 *  Null for every other curriculum, so tool logic outside it is unchanged. */
function ownUkList(curriculum: unknown) {
  const c = getCurriculum(curriculum);
  return c && (c.region === "uk" || c.region === "british-isles") && c.years !== UK_YEARS ? c : null;
}

/** The age England's year label starts at, sixth form included; undefined for any other label. */
export function englandYearAge(label: string): number | undefined {
  return ENGLAND.find((y) => y.label === label)?.age;
}

/** England's label for this curriculum's year, by age. The label as given for any
 *  curriculum on England's list, any non-UK system, an unknown curriculum, or a
 *  label the list lacks. */
export function englandYearFor(curriculum: unknown, label: string): string {
  const c = ownUkList(curriculum);
  const age = c?.years.find((y) => y.label === label)?.age;
  return age === undefined ? label : (ENGLAND.find((y) => y.age === age)?.label ?? label);
}

/** The inverse: this curriculum's label at the age of England's label; the label as
 *  given where englandYearFor would not remap, or where no year has that age. */
export function yearForEnglandYear(curriculum: unknown, englandLabel: string): string {
  const c = ownUkList(curriculum);
  const age = englandYearAge(englandLabel);
  if (!c || age === undefined) return englandLabel;
  return c.years.find((y) => y.age === age)?.label ?? englandLabel;
}
