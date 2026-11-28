#!/usr/bin/env node
/**
 * Fetches the LK20 curricula Jooma lists statements for from Udir's Grep
 * REST API (data.udir.no, NLOD) and saves one snapshot:
 *
 *   node scripts/fetch-norway-grep.mjs
 *
 * writes docs/standards/norway/grep-snapshot.json: each plan, each of its
 * competence aim sets, each aim, and each core element the aims link to, as
 * Grep returns them, with the fetch date. scripts/build-asia-standards.mjs
 * --country=norway builds from the snapshot, never from the live API, so a
 * build is repeatable; run this again only to take in a new version.
 *
 * The core four subjects (owner, 2026-11-28), in force from 2026-08-01:
 * Norwegian, Mathematics (Years 1 to 10 and the common core courses in
 * upper secondary), Natural science, English.
 */

import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://data.udir.no/kl06/v201906";
export const NORWAY_PLANS = ["NOR01-08", "MAT01-06", "MAT08-01", "MAT09-02", "MAT05-04", "MAT06-04", "NAT01-05", "ENG01-06"];

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const snapshot = { fetched: new Date().toISOString().slice(0, 10), source: BASE, plans: {}, sets: {}, aims: {}, coreElements: {} };
for (const code of NORWAY_PLANS) {
  const plan = await get(`${BASE}/laereplaner-lk20/${code}`);
  snapshot.plans[code] = plan;
  for (const ref of plan["kompetansemaal-kapittel"]?.kompetansemaalsett ?? []) {
    const set = await get(ref["url-data"]);
    snapshot.sets[set.kode] = set;
    for (const a of set.kompetansemaal ?? []) {
      if (snapshot.aims[a.kode]) continue;
      const aim = await get(a["url-data"]);
      snapshot.aims[aim.kode] = aim;
      for (const ke of aim["tilknyttede-kjerneelementer"] ?? []) {
        const ref2 = ke.referanse ?? ke;
        if (ref2?.kode && !snapshot.coreElements[ref2.kode]) snapshot.coreElements[ref2.kode] = await get(ref2["url-data"]);
      }
    }
  }
  console.log(code, Object.keys(snapshot.sets).length, "sets,", Object.keys(snapshot.aims).length, "aims so far");
}
mkdirSync("docs/standards/norway", { recursive: true });
writeFileSync("docs/standards/norway/grep-snapshot.json", JSON.stringify(snapshot, null, 1) + "\n");
console.log("core elements", Object.keys(snapshot.coreElements).length);
