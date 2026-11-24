import type { Curriculum, YearOption } from "./types";

/*
 * The five curricula Jooma has always offered. Their promptLabel is the exact
 * value the old Curriculum dropdown sent (app/lib/formOptions.ts), and they add
 * no prompt override, so a UK teacher's generations are unchanged.
 *
 * England, EYFS, Scotland and Wales (and the four islands, in british-isles.ts)
 * share England's year names (Nursery to Year 11) by reference. Northern
 * Ireland has its own numbering: Year N starts at age N + 3, there is no
 * Reception, GCSEs are taken in Year 12 and the sixth form is Years 13 and 14
 * (owner, 2026-11-24). Scotland's P1 to S6 is still a later, deliberate change.
 */

export const UK_YEARS: YearOption[] = [
  { label: "Nursery", age: 3 },
  { label: "Reception", age: 4 },
  ...Array.from({ length: 11 }, (_, i) => ({ label: `Year ${i + 1}`, age: i + 5 })),
];

/** Northern Ireland's years: Nursery (3), then Year 1 (P1, age 4) to Year 14
 *  (age 17). No Reception. */
export const NI_YEARS: YearOption[] = [
  { label: "Nursery", age: 3 },
  ...Array.from({ length: 14 }, (_, i) => ({ label: `Year ${i + 1}`, age: i + 4 })),
];

export const UK_CURRICULA: Curriculum[] = [
  {
    id: "england",
    region: "uk",
    country: "GB",
    state: "England",
    name: "National Curriculum in England",
    promptLabel: "2014 National Curriculum",
    versions: [{ label: "2014 National Curriculum", inForceFrom: "2014-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    verifiedOn: "2026-11-13",
    aliases: ["English National Curriculum"],
  },
  {
    id: "england-eyfs",
    region: "uk",
    country: "GB",
    state: "England",
    name: "Early Years Foundation Stage (EYFS)",
    promptLabel: "Early Years Foundation Stage (EYFS)",
    versions: [{ label: "EYFS statutory framework", inForceFrom: "2024-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    verifiedOn: "2026-11-13",
    aliases: ["EYFS"],
  },
  {
    id: "scotland",
    region: "uk",
    country: "GB",
    state: "Scotland",
    name: "Curriculum for Excellence",
    promptLabel: "Scottish Curriculum for Excellence",
    versions: [{ label: "Curriculum for Excellence", inForceFrom: "2010-08-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    alignment: { frameworks: ["cfe-early", "cfe-first", "cfe-second", "cfe-third-fourth"], adapted: false },
  },
  {
    id: "wales",
    region: "uk",
    country: "GB",
    state: "Wales",
    name: "Curriculum for Wales",
    promptLabel: "Welsh Curriculum",
    versions: [{ label: "Curriculum for Wales", inForceFrom: "2022-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    verifiedOn: "2026-11-13",
  },
  {
    id: "northern-ireland",
    region: "uk",
    country: "GB",
    state: "Northern Ireland",
    name: "Northern Ireland Curriculum",
    promptLabel: "Northern Ireland Curriculum",
    versions: [{ label: "Northern Ireland Curriculum (2007)", inForceFrom: "2007-09-01" }],
    years: NI_YEARS,
    defaultLanguage: "en-GB",
    alignment: { frameworks: ["nic-fs", "nic-ks1", "nic-ks2", "nic-ks3", "nic-ks4"], adapted: false },
  },
];
