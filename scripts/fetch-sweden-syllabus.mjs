#!/usr/bin/env node
/**
 * Fetches the Swedish syllabuses Jooma lists statements for from Skolverket's
 * Syllabus API (api.skolverket.se/syllabus, v1, the active version; v2 is
 * alpha) and saves one snapshot:
 *
 *   node scripts/fetch-sweden-syllabus.mjs
 *
 * writes docs/standards/sweden/syllabus-snapshot.json: each syllabus as the
 * API returns it, with the fetch date. scripts/build-asia-standards.mjs
 * --country=sweden builds from the snapshot, never from the live API, so a
 * build is repeatable; run this again only to take in a new version.
 *
 * Terms of use: "Villkoren i Skolverkets källicens (Creative Commons)",
 * linking CC0 1.0 (https://www.skolverket.se/om-skolverket/oppna-data/
 * api-for-laroplaner-kurs--och-amnesplaner, read 2026-11-28).
 *
 * The core four subjects (owner, 2026-11-28): Swedish, mathematics, science,
 * English. Compulsory school (Lgr22) course syllabuses, and the upper
 * secondary GY25 grade-subject syllabuses (in force for students starting
 * from 2025-07-01; the Gy11 course syllabuses they replace run out by
 * 2030-06-30 and are not listed).
 */

import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://api.skolverket.se/syllabus/v1";
export const SWEDEN_COMPULSORY = ["GRGRSVE01", "GRGRMAT01", "GRGRENG01", "GRGRBIO01", "GRGRFYS01", "GRGRKEM01"];
export const SWEDEN_UPPER = ["SVEN", "MATE", "ENGE", "NATU", "BIOG", "FYSK", "KEMI"];

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const date = new Date().toISOString().slice(0, 10);
const snapshot = { fetched: date, source: BASE, subjects: {} };
for (const code of [...SWEDEN_COMPULSORY, ...SWEDEN_UPPER]) {
  const res = await get(`${BASE}/subjects/${code}?date=${date}`);
  snapshot.subjects[code] = res.subject;
  console.log(code, res.subject.name, "version", res.subject.version);
}
mkdirSync("docs/standards/sweden", { recursive: true });
writeFileSync("docs/standards/sweden/syllabus-snapshot.json", JSON.stringify(snapshot, null, 1) + "\n");
