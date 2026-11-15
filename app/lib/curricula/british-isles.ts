import type { Curriculum } from "./types";
import { UK_YEARS } from "./uk";

/*
 * Jersey, Guernsey, the Isle of Man and Gibraltar. Each teaches a curriculum
 * built on England's National Curriculum, with the same year groups, key
 * stages and GCSEs, so they keep England's terms and only name their own
 * curriculum and its local content. Checked 2026-11-14.
 */

export const BRITISH_ISLES_CURRICULA: Curriculum[] = [
  {
    id: "jersey",
    region: "british-isles",
    country: "JE",
    place: "Jersey",
    name: "Jersey Curriculum",
    promptLabel: "Jersey Curriculum",
    versions: [{ label: "Jersey Curriculum (based on the 2014 National Curriculum in England)", inForceFrom: "2014-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    context: "The Jersey Curriculum is based on the National Curriculum in England, with the same year groups, key stages and GCSEs, plus Jersey's own local content. Use Jersey examples where a local example helps.",
    verifiedOn: "2026-11-14",
  },
  {
    id: "guernsey",
    region: "british-isles",
    country: "GG",
    place: "Guernsey",
    name: "Bailiwick of Guernsey Curriculum",
    promptLabel: "Bailiwick of Guernsey Curriculum",
    versions: [{ label: "Bailiwick of Guernsey Curriculum (The Big Picture)", inForceFrom: "2017-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    context: "The Bailiwick of Guernsey Curriculum, known as The Big Picture, runs from age 5 to 19 and has regard to the National Curriculum in England, with the same year groups, key stages and GCSEs. Use Bailiwick examples where a local example helps.",
    verifiedOn: "2026-11-14",
  },
  {
    id: "isle-of-man",
    region: "british-isles",
    country: "IM",
    place: "the Isle of Man",
    name: "Isle of Man Curriculum",
    promptLabel: "Isle of Man Curriculum",
    versions: [{ label: "Essentials for Learning (E4L), Education (Curriculum) Order 2011", inForceFrom: "2011-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    context: "The Isle of Man's curriculum statement is Essentials for Learning (E4L). Its content is largely drawn from the National Curriculum in England, with the same year groups, key stages, GCSEs and A levels, and it draws on the Island's own geography, culture and history. Use Manx examples where a local example helps.",
    verifiedOn: "2026-11-14",
  },
  {
    id: "gibraltar",
    region: "british-isles",
    country: "GI",
    place: "Gibraltar",
    name: "National Curriculum in England (as taught in Gibraltar)",
    promptLabel: "National Curriculum (Gibraltar)",
    versions: [{ label: "2014 National Curriculum, as taught in Gibraltar", inForceFrom: "2014-09-01" }],
    years: UK_YEARS,
    defaultLanguage: "en-GB",
    context: "Gibraltar's schools teach the National Curriculum in England and sit GCSEs and A levels, with differences in how Spanish and religious education are taught. Gibraltar's schools are not inspected by Ofsted and do not sit the KS2 SATs, so do not mention either.",
    verifiedOn: "2026-11-14",
  },
];
