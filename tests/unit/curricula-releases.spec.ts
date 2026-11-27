import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  CURRICULA_REGISTRY,
  RELEASES,
  REGIONS,
  type Curriculum,
  isOffered,
  releaseSettingKey,
  releasesFromSettings,
  visibleCurricula,
} from "@/app/lib/curricula";

/*
 * Stage 3 release switches (docs/curricula-stage3-build.md A.8, A.9).
 *
 * The Stage 2 region switches are already on, so a Stage 3 country put in
 * "middle-east" or "europe" would show the moment it merged. Each Stage 3 batch
 * therefore also carries a release switch, and a teacher sees an entry only
 * when its region AND its release are on.
 */

const ALL_REGIONS = REGIONS.map((r) => r.id);
const ALL_RELEASES = RELEASES.map((r) => r.id);

function entry(over: Partial<Curriculum>): Curriculum {
  return {
    id: "fixture",
    region: "middle-east",
    country: "XX",
    name: "Fixture",
    promptLabel: "Fixture",
    versions: [{ label: "v1", inForceFrom: "2020-01-01" }],
    years: [{ label: "Grade 1", age: 6 }],
    defaultLanguage: "en-GB",
    verifiedOn: "2026-11-27",
    ...over,
  } as Curriculum;
}

test.describe("release switch keys", () => {
  test("five Stage 3 batches, keyed by letter", () => {
    expect(ALL_RELEASES).toEqual(["s3-a", "s3-b", "s3-c", "s3-d", "s3-e"]);
    expect(releaseSettingKey("s3-a")).toBe("curricula_s3_a");
    expect(releaseSettingKey("s3-e")).toBe("curricula_s3_e");
  });

  test("a release is on only when its row is exactly true", () => {
    expect(releasesFromSettings([{ key: "curricula_s3_a", value: true }])).toEqual(["s3-a"]);
    for (const value of [false, "true", 1, "on", null, undefined, {}, [true]]) {
      expect(releasesFromSettings([{ key: "curricula_s3_a", value }]), JSON.stringify(value)).toEqual([]);
    }
    expect(releasesFromSettings(null)).toEqual([]);
    expect(releasesFromSettings("curricula_s3_a")).toEqual([]);
    expect(releasesFromSettings([null, 7, { value: true }])).toEqual([]);
  });

  test("a region row never switches a release on, and a release row never switches a region on", () => {
    expect(releasesFromSettings([{ key: "curricula_middle_east", value: true }])).toEqual([]);
    expect(releasesFromSettings(ALL_RELEASES.map((id) => ({ key: releaseSettingKey(id), value: true })))).toEqual(ALL_RELEASES);
  });

  test("every release key is whitelisted by the newest migration that defines public_settings()", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const newest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => /create or replace function (public\.)?public_settings\(/i.test(readFileSync(path.join(dir, f), "utf8")))
      .pop()!;
    const sql = readFileSync(path.join(dir, newest), "utf8");
    for (const id of ALL_RELEASES) expect(sql, newest).toContain(`'${releaseSettingKey(id)}'`);
    // And the region keys are still there: the redefinition must not drop them.
    for (const key of ["curricula_africa", "curricula_middle_east", "curricula_usa"]) expect(sql, newest).toContain(`'${key}'`);
  });
});

test.describe("an entry with a release", () => {
  const gated = entry({ release: "s3-a" });

  test("shows to a teacher only when its region and its release are both on", () => {
    expect(isOffered(gated, ["middle-east"], ["s3-a"], false)).toBe(true);
    expect(isOffered(gated, ["middle-east"], [], false), "release off").toBe(false);
    expect(isOffered(gated, [], ["s3-a"], false), "region off").toBe(false);
    expect(isOffered(gated, [], [], false), "both off").toBe(false);
    expect(isOffered(gated, ["middle-east"], ["s3-b"], false), "another batch on").toBe(false);
  });

  test("always shows to an admin, but never when unverified", () => {
    expect(isOffered(gated, [], [], true)).toBe(true);
    expect(isOffered(entry({ release: "s3-a", verifiedOn: undefined }), ALL_REGIONS, ALL_RELEASES, true)).toBe(false);
    expect(isOffered(entry({ release: "s3-a", verifiedOn: undefined }), ALL_REGIONS, ALL_RELEASES, false)).toBe(false);
  });

  test("an entry without a release behaves as before: its region alone decides", () => {
    const plain = entry({});
    expect(isOffered(plain, ["middle-east"], [], false)).toBe(true);
    expect(isOffered(plain, [], ALL_RELEASES, false)).toBe(false);
    expect(isOffered(entry({ region: "uk" }), [], [], false)).toBe(true);
  });
});

test.describe("the live registry", () => {
  test("Stage 1 and 2 are offered exactly as before, whatever the release switches say", () => {
    const stage12 = CURRICULA_REGISTRY.filter((c) => !c.release).map((c) => c.id);
    for (const regions of [[], ALL_REGIONS, ["usa"], ["middle-east", "europe"]]) {
      const without = visibleCurricula(regions, false).filter((c) => !c.release).map((c) => c.id);
      const withAll = visibleCurricula(regions, false, ALL_RELEASES).filter((c) => !c.release).map((c) => c.id);
      expect(withAll, regions.join(",")).toEqual(without);
    }
    // All regions on, no releases: every verified non-Stage-3 entry, nothing gated.
    expect(visibleCurricula(ALL_REGIONS, false).map((c) => c.id)).toEqual(
      CURRICULA_REGISTRY.filter((c) => !c.release && (c.verifiedOn || c.region === "uk")).map((c) => c.id),
    );
    expect(stage12.length, "Stage 1 (85) + Stage 2 (15): none carries a release").toBe(100);
  });

  test("no Stage 3 entry is offered to a teacher while its release is off", () => {
    const shown = visibleCurricula(ALL_REGIONS, false);
    expect(shown.filter((c) => c.release)).toEqual([]);
  });
});
