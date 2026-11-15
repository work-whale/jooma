import { test, expect } from "@playwright/test";

import {
  CURRICULA_REGISTRY,
  REGIONS,
  inferCurriculum,
  languageAfterChoosing,
  regionSettingKey,
  regionsFromSettings,
  pickerGroups,
  visibleCurricula,
} from "@/app/lib/curricula";

/*
 * Which curriculum a teacher starts on, and which ones they are offered.
 *
 * Existing teachers have no curriculum on their profile. Theirs is inferred
 * once, from what their browser last picked or from their profile country, and
 * a banner asks them to confirm it. These are the pure rules behind that.
 */

const ALL_ON = REGIONS.map((r) => r.id);

test.describe("the region switches", () => {
  test("each region has one app_settings key, and the UK has none", () => {
    expect(regionSettingKey("british-isles")).toBe("curricula_british_isles");
    expect(regionSettingKey("australia-nz")).toBe("curricula_australia_nz");
    expect(regionSettingKey("uk")).toBeNull();
  });

  test("a region is on only when its row is exactly true", () => {
    const rows = [
      { key: "curricula_british_isles", value: true },
      { key: "curricula_usa", value: "true" },
      { key: "curricula_canada", value: 1 },
      { key: "curricula_ireland", value: false },
      { key: "signups_open", value: true },
    ];
    expect(regionsFromSettings(rows)).toEqual(["british-isles"]);
  });

  test("no rows, or junk, switches nothing on", () => {
    expect(regionsFromSettings([])).toEqual([]);
    expect(regionsFromSettings(null)).toEqual([]);
    expect(regionsFromSettings([{ key: "curricula_mars", value: true }, null, "x"] as never)).toEqual([]);
  });
});

test.describe("inferring an existing teacher's curriculum", () => {
  const ukOnly = visibleCurricula([], false);
  const everything = visibleCurricula(ALL_ON, false);

  test("the curriculum their browser last picked wins", () => {
    expect(inferCurriculum({ savedLabel: "Welsh Curriculum", country: "GB" }, ukOnly)).toBe("wales");
    expect(inferCurriculum({ savedLabel: "Jersey Curriculum", country: "GB" }, everything)).toBe("jersey");
  });

  test("a saved choice that is not offered is ignored", () => {
    expect(inferCurriculum({ savedLabel: "Jersey Curriculum", country: "GB" }, ukOnly)).toBe("england");
  });

  test("otherwise their country decides, when that country's curriculum is offered", () => {
    expect(inferCurriculum({ country: "JE" }, everything)).toBe("jersey");
    expect(inferCurriculum({ country: "GG" }, everything)).toBe("guernsey");
    expect(inferCurriculum({ country: "IM" }, everything)).toBe("isle-of-man");
    expect(inferCurriculum({ country: "GI" }, everything)).toBe("gibraltar");
    expect(inferCurriculum({ country: "JE" }, ukOnly)).toBe("england");
  });

  test("everyone else starts on England, as every teacher has until now", () => {
    for (const country of ["GB", "", null, undefined, "XX", "gb", 7]) {
      expect(inferCurriculum({ country: country as never }, everything), String(country)).toBe("england");
    }
    expect(inferCurriculum({ savedLabel: "nonsense" }, everything)).toBe("england");
  });

  test("an old saved label that meant EYFS still means EYFS", () => {
    expect(inferCurriculum({ savedLabel: "Early Years Foundation Stage (EYFS)" }, ukOnly)).toBe("england-eyfs");
  });
});

test.describe("the picker", () => {
  test("groups what is offered by region, UK first, nothing hidden leaks in", () => {
    const groups = pickerGroups(visibleCurricula(["british-isles"], false));
    expect(groups.map((g) => g.region)).toEqual(["uk", "british-isles"]);
    expect(groups[0].label).toBe("United Kingdom");
    const ids = groups.flatMap((g) => g.curricula.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(CURRICULA_REGISTRY.find((c) => c.id === id)?.region).toMatch(/^(uk|british-isles)$/);
  });

  test("an empty region is not shown", () => {
    const groups = pickerGroups(visibleCurricula([], false));
    expect(groups.map((g) => g.region)).toEqual(["uk"]);
  });

  test("every curriculum has its own prompt label, so a form's label alone identifies it", () => {
    const labels = CURRICULA_REGISTRY.map((c) => c.promptLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

test.describe("the language a curriculum brings with it", () => {
  test("sets the curriculum's language when the teacher never chose one", () => {
    for (const c of CURRICULA_REGISTRY) {
      expect(languageAfterChoosing(c.id, null), c.id).toBe(c.defaultLanguage === "en-GB" ? null : c.defaultLanguage);
    }
  });

  test("never overrides a language the teacher chose themselves", () => {
    for (const c of CURRICULA_REGISTRY) {
      expect(languageAfterChoosing(c.id, JSON.stringify("fr")), c.id).toBeNull();
      expect(languageAfterChoosing(c.id, JSON.stringify("en-GB")), c.id).toBeNull();
    }
  });

  test("an unknown curriculum changes nothing", () => {
    expect(languageAfterChoosing("nonsense", null)).toBeNull();
  });
});
