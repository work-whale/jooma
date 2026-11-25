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
const STAGE2 = ["africa", "asia", "caribbean", "europe", "middle-east"] as const;

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

  test("the five Stage 2 regions have their own keys", () => {
    expect(regionSettingKey("middle-east")).toBe("curricula_middle_east");
    for (const id of ["africa", "asia", "caribbean", "europe"] as const) expect(regionSettingKey(id)).toBe(`curricula_${id}`);
  });

  test("each Stage 2 region is on only for a row that is exactly true, and switches on nothing else", () => {
    for (const id of STAGE2) {
      const key = regionSettingKey(id)!;
      expect(regionsFromSettings([{ key, value: true }]), id).toEqual([id]);
      for (const value of [false, "true", 1, "on", null, undefined, {}, [true]]) {
        expect(regionsFromSettings([{ key, value }]), `${id} ${JSON.stringify(value)}`).toEqual([]);
      }
      // Only that row is present: no other region comes on with it.
      expect(regionsFromSettings([{ key, value: true }, ...STAGE2.filter((o) => o !== id).map((o) => ({ key: regionSettingKey(o)!, value: false }))]), id).toEqual([id]);
    }
    expect(regionsFromSettings([]), "missing rows").toEqual([]);
    expect(regionsFromSettings(STAGE2.map((id) => ({ key: regionSettingKey(id)!, value: true })))).toEqual(
      REGIONS.filter((r) => (STAGE2 as readonly string[]).includes(r.id)).map((r) => r.id),
    );
  });

  test("a malformed row cannot switch a Stage 2 region on", () => {
    const rows = [null, "curricula_asia", { value: true }, { key: 7, value: true }, { key: "curricula_asia" }, { key: "Curricula_Asia", value: true }, { key: "curricula-asia", value: true }];
    expect(regionsFromSettings(rows as never)).toEqual([]);
    expect(regionsFromSettings({ key: "curricula_asia", value: true } as never)).toEqual([]);
  });

  test("a Stage 2 region with no curricula yet never appears in the picker", () => {
    const groups = pickerGroups(visibleCurricula(ALL_ON, true));
    for (const id of STAGE2) {
      const has = CURRICULA_REGISTRY.some((c) => c.region === id && c.verifiedOn);
      expect(groups.some((g) => g.region === id), id).toBe(has);
    }
    for (const g of groups) expect(g.curricula.length, g.region).toBeGreaterThan(0);
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

test.describe("Africa: starting a teacher on their own country's curriculum", () => {
  const COUNTRY_TO_ID = { ZA: "south-africa", KE: "kenya", NG: "nigeria", GH: "ghana", UG: "uganda" } as const;
  const africaOn = visibleCurricula(["africa"], false);

  test("each country's own curriculum is the start when Africa is offered", () => {
    for (const [country, id] of Object.entries(COUNTRY_TO_ID)) expect(inferCurriculum({ country }, africaOn), country).toBe(id);
  });

  test("with Africa off, or only another region on, they start on England", () => {
    for (const offered of [visibleCurricula([], false), visibleCurricula(["asia", "europe", "usa"], false)]) {
      for (const country of Object.keys(COUNTRY_TO_ID)) expect(inferCurriculum({ country }, offered), country).toBe("england");
    }
  });

  test("the country must match exactly, and a saved browser choice still wins", () => {
    for (const country of ["ke", "KEN", "Kenya", " KE", "ZZ", "EG"]) expect(inferCurriculum({ country }, africaOn), country).toBe("england");
    expect(inferCurriculum({ savedLabel: "Ugandan Curriculum (NCDC)", country: "KE" }, africaOn)).toBe("uganda");
    // A saved Africa choice is ignored when Africa is no longer offered.
    expect(inferCurriculum({ savedLabel: "Ugandan Curriculum (NCDC)", country: "UG" }, visibleCurricula([], false))).toBe("england");
  });

  test("the picker lists Africa after the UK, in order, and an admin sees it with the switch off", () => {
    const groups = pickerGroups(africaOn);
    expect(groups.map((g) => g.region)).toEqual(["uk", "africa"]);
    expect(groups[1].label).toBe("Africa");
    expect(groups[1].curricula.map((c) => c.id)).toEqual(["south-africa", "kenya", "nigeria", "ghana", "uganda"]);
    expect(pickerGroups(visibleCurricula([], false)).map((g) => g.region)).toEqual(["uk"]);
    expect(pickerGroups(visibleCurricula([], true)).some((g) => g.region === "africa")).toBe(true);
  });

  test("choosing one leaves the output language alone (British English)", () => {
    for (const id of Object.values(COUNTRY_TO_ID)) expect(languageAfterChoosing(id, null), id).toBeNull();
  });
});

test.describe("Asia: starting a teacher on their own country's curriculum", () => {
  const COUNTRY_TO_ID = { IN: "india-cbse", PK: "pakistan", PH: "philippines", MY: "malaysia", SG: "singapore", HK: "hong-kong" } as const;
  const asiaOn = visibleCurricula(["asia"], false);

  test("each country's own curriculum is the start when Asia is offered", () => {
    for (const [country, id] of Object.entries(COUNTRY_TO_ID)) expect(inferCurriculum({ country }, asiaOn), country).toBe(id);
  });

  test("with Asia off, or only another region on, they start on England", () => {
    for (const offered of [visibleCurricula([], false), visibleCurricula(["africa", "europe", "usa"], false)]) {
      for (const country of Object.keys(COUNTRY_TO_ID)) expect(inferCurriculum({ country }, offered), country).toBe("england");
    }
  });

  test("the country must match exactly, and a saved browser choice still wins", () => {
    for (const country of ["in", "IND", "India", " IN", "hk", "HKG", "CN", "JP"]) expect(inferCurriculum({ country }, asiaOn), country).toBe("england");
    expect(inferCurriculum({ savedLabel: "Singapore Curriculum (MOE)", country: "IN" }, asiaOn)).toBe("singapore");
    // A saved Asia choice is ignored when Asia is no longer offered.
    expect(inferCurriculum({ savedLabel: "Singapore Curriculum (MOE)", country: "SG" }, visibleCurricula([], false))).toBe("england");
  });

  test("the picker lists Asia after the UK, in order, and an admin sees it with the switch off", () => {
    const groups = pickerGroups(asiaOn);
    expect(groups.map((g) => g.region)).toEqual(["uk", "asia"]);
    expect(groups[1].label).toBe("Asia");
    expect(groups[1].curricula.map((c) => c.id)).toEqual(["india-cbse", "pakistan", "philippines", "malaysia", "singapore", "hong-kong"]);
    expect(pickerGroups(visibleCurricula([], true)).some((g) => g.region === "asia")).toBe(true);
  });

  test("only the Philippines brings American English with it, and a stored choice is never overridden", () => {
    expect(languageAfterChoosing("philippines", null)).toBe("en-US");
    for (const id of ["india-cbse", "pakistan", "malaysia", "singapore", "hong-kong"]) expect(languageAfterChoosing(id, null), id).toBeNull();
    for (const id of Object.values(COUNTRY_TO_ID)) expect(languageAfterChoosing(id, "fr-FR"), id).toBeNull();
  });
});
