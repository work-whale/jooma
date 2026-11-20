import type { Curriculum, YearOption } from "./types";

/*
 * The five curricula Jooma has always offered. Their promptLabel is the exact
 * value the old Curriculum dropdown sent (app/lib/formOptions.ts), and they add
 * no prompt override, so a UK teacher's generations are unchanged.
 *
 * They keep England's year names (Nursery to Year 11) for all five, as the
 * forms always have. Scotland's P1 to S6 and Northern Ireland's numbering are
 * a later, deliberate change, not a side effect of this one.
 */

export const UK_YEARS: YearOption[] = [
  { label: "Nursery", age: 3 },
  { label: "Reception", age: 4 },
  ...Array.from({ length: 11 }, (_, i) => ({ label: `Year ${i + 1}`, age: i + 5 })),
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
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    alignment: { frameworks: ["nic-fs", "nic-ks1", "nic-ks2"], adapted: false },
  },
];
