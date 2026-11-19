import { test, expect } from "@playwright/test";
import {
  cleanSchoolName,
  groupSchools,
  isDigestTime,
  schoolDomain,
  schoolsDigest,
  type SchoolTeacher,
} from "@/app/lib/school-groups";

/*
 * Phase 3 (spec Step 9): the weekly list of schools with 3 or more Jooma
 * teachers, for outreach. Grouped on the school email domain plus the cleaned
 * school name the teacher typed at signup (profiles.school_name).
 *
 * Edge cases. Cleaning: case, spaces, punctuation, St/St./Saint, C of E/CofE,
 * & and "and", a trailing "School", a leading "The"; two different schools
 * that share a first word stay apart; blank or one letter is no name.
 * Domains: free webmail, shared platforms used by many schools (Hwb in Wales,
 * C2k in Northern Ireland, LGfL in London, Glow in Scotland), Jooma staff and
 * test addresses never form a school; case does not matter; a malformed
 * address has no domain. Grouping: exactly 3 is listed and 2 is not; a
 * teacher with neither a school domain nor a name is ignored; the same
 * teacher twice counts once; a webmail teacher who typed the same school as a
 * domain group joins it, but not when two domain groups share that name; one
 * domain with two schools typed (a trust) splits by name; a teacher who typed
 * nothing joins the domain's one named school, and stays apart when there are
 * two; staff are never counted. "New this week" means the third teacher
 * joined in the last 7 days. The email: names and counts only, never an
 * address; names escaped; an empty week still sends; no dashes. The send
 * time: Monday 08:00 UK in winter and in summer.
 */

const NOW = new Date("2026-11-23T08:05:00Z"); // Monday

let n = 0;
const teacher = (over: Partial<SchoolTeacher>): SchoolTeacher => ({
  id: `t${++n}`,
  email: `t${n}@gmail.com`,
  schoolName: null,
  plan: "free",
  role: null,
  firstName: null,
  createdAt: new Date("2026-09-01T09:00:00Z"),
  ...over,
});

test.describe("cleanSchoolName", () => {
  test("ignores case, spacing and punctuation", () => {
    expect(cleanSchoolName("  Oakwood   PRIMARY ")).toBe("oakwood primary");
    expect(cleanSchoolName("St. Mary's Primary")).toBe(cleanSchoolName("st marys primary"));
  });

  test("St, St. and Saint are the same", () => {
    expect(cleanSchoolName("St Mary's")).toBe(cleanSchoolName("Saint Marys"));
    expect(cleanSchoolName("St. Mary's")).toBe(cleanSchoolName("Saint Marys"));
  });

  test("C of E, CofE and CE are the same; & is and", () => {
    const a = cleanSchoolName("Holy Trinity C of E Primary");
    expect(cleanSchoolName("Holy Trinity CofE Primary")).toBe(a);
    expect(cleanSchoolName("Holy Trinity CE Primary")).toBe(a);
    expect(cleanSchoolName("Brook & Vale Academy")).toBe(cleanSchoolName("Brook and Vale Academy"));
  });

  test("a trailing School and a leading The are dropped", () => {
    expect(cleanSchoolName("The Oakwood Primary School")).toBe("oakwood primary");
    expect(cleanSchoolName("Oakwood School")).toBe("oakwood");
  });

  test("different schools stay different", () => {
    expect(cleanSchoolName("St Mary's Primary")).not.toBe(cleanSchoolName("St Mary's High"));
    expect(cleanSchoolName("Oakwood Academy")).not.toBe(cleanSchoolName("Oakwood Primary"));
  });

  test("blank, one letter or only filler is no name", () => {
    expect(cleanSchoolName(null)).toBeNull();
    expect(cleanSchoolName("   ")).toBeNull();
    expect(cleanSchoolName("x")).toBeNull();
    expect(cleanSchoolName("The School")).toBeNull();
  });
});

test.describe("schoolDomain", () => {
  test("a school's own domain counts, in any case", () => {
    expect(schoolDomain("a.b@Oakwood.Hants.SCH.UK")).toBe("oakwood.hants.sch.uk");
    expect(schoolDomain("head@brookvale.org.uk")).toBe("brookvale.org.uk");
  });

  test("free webmail is never a school", () => {
    for (const d of ["gmail.com", "googlemail.com", "hotmail.co.uk", "outlook.com", "yahoo.co.uk", "icloud.com", "btinternet.com", "sky.com", "live.co.uk"]) {
      expect(schoolDomain(`a@${d}`), d).toBeNull();
    }
  });

  test("platforms shared by many schools are never one school", () => {
    for (const d of ["hwbcymru.net", "c2kni.net", "c2ken.net", "lgflmail.org", "glow.sch.uk"]) {
      expect(schoolDomain(`a@${d}`), d).toBeNull();
    }
  });

  test("staff, test and malformed addresses have no school domain", () => {
    expect(schoolDomain("ash@jooma.ai")).toBeNull();
    expect(schoolDomain("e2e@jooma.test")).toBeNull();
    expect(schoolDomain("x@school.example")).toBeNull();
    expect(schoolDomain("not-an-email")).toBeNull();
    expect(schoolDomain(null)).toBeNull();
  });
});

test.describe("groupSchools", () => {
  test("three teachers on one school domain are listed, two are not", () => {
    const three = [1, 2, 3].map(() => teacher({ email: `x${n}@oakwood.sch.uk` }));
    const two = [1, 2].map(() => teacher({ email: `y${n}@brook.sch.uk` }));
    const out = groupSchools([...three, ...two], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("oakwood.sch.uk");
    expect(out[0].teachers).toBe(3);
    expect(out[0].label).toBe("oakwood.sch.uk");
  });

  test("webmail teachers who typed the same school are grouped, labelled by the commonest spelling", () => {
    const out = groupSchools(
      [
        teacher({ schoolName: "St Mary's Primary" }),
        teacher({ schoolName: "St Mary's Primary" }),
        teacher({ schoolName: "saint marys primary school" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("St Mary's Primary");
    expect(out[0].domain).toBeNull();
    expect(out[0].teachers).toBe(3);
  });

  test("a teacher with neither a school domain nor a name is ignored", () => {
    const out = groupSchools([teacher({}), teacher({}), teacher({})], NOW);
    expect(out).toHaveLength(0);
  });

  test("the same teacher twice counts once", () => {
    const a = teacher({ schoolName: "Oakwood Primary" });
    const out = groupSchools([a, a, a, teacher({ schoolName: "Oakwood Primary" })], NOW);
    expect(out).toHaveLength(0);
  });

  test("a webmail teacher joins the domain group with the same school name", () => {
    const out = groupSchools(
      [
        teacher({ email: "a@oakwood.sch.uk", schoolName: "Oakwood Primary" }),
        teacher({ email: "b@oakwood.sch.uk", schoolName: "Oakwood Primary School" }),
        teacher({ email: "c@gmail.com", schoolName: "oakwood primary" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("oakwood.sch.uk");
    expect(out[0].teachers).toBe(3);
  });

  test("a webmail teacher does not join when two domains share that name", () => {
    const out = groupSchools(
      [
        teacher({ email: "a@st-marys-leeds.sch.uk", schoolName: "St Mary's Primary" }),
        teacher({ email: "b@st-marys-leeds.sch.uk", schoolName: "St Mary's Primary" }),
        teacher({ email: "c@st-marys-york.sch.uk", schoolName: "St Mary's Primary" }),
        teacher({ email: "d@st-marys-york.sch.uk", schoolName: "St Mary's Primary" }),
        teacher({ email: "e@gmail.com", schoolName: "St Mary's Primary" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  test("one domain with two schools typed (a trust) splits by name", () => {
    const trust = "@brooktrust.org.uk";
    const out = groupSchools(
      [
        teacher({ email: `a${trust}`, schoolName: "Brook Primary" }),
        teacher({ email: `b${trust}`, schoolName: "Brook Primary" }),
        teacher({ email: `c${trust}`, schoolName: "Brook Primary" }),
        teacher({ email: `d${trust}`, schoolName: "Vale Academy" }),
        teacher({ email: `e${trust}`, schoolName: "Vale Academy" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Brook Primary");
    expect(out[0].domain).toBe("brooktrust.org.uk");
    expect(out[0].teachers).toBe(3);
  });

  test("a teacher who typed nothing joins the domain's only named school", () => {
    const out = groupSchools(
      [
        teacher({ email: "a@oakwood.sch.uk", schoolName: "Oakwood Primary" }),
        teacher({ email: "b@oakwood.sch.uk", schoolName: "Oakwood Primary" }),
        teacher({ email: "c@oakwood.sch.uk" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Oakwood Primary");
    expect(out[0].teachers).toBe(3);
  });

  test("a teacher who typed nothing stays apart when the domain has two named schools", () => {
    const trust = "@brooktrust.org.uk";
    const out = groupSchools(
      [
        teacher({ email: `a${trust}`, schoolName: "Brook Primary" }),
        teacher({ email: `b${trust}`, schoolName: "Brook Primary" }),
        teacher({ email: `c${trust}`, schoolName: "Vale Academy" }),
        teacher({ email: `d${trust}` }),
      ],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  test("Jooma staff never count", () => {
    const out = groupSchools(
      [
        teacher({ email: "a@jooma.ai", schoolName: "Oakwood Primary" }),
        teacher({ schoolName: "Oakwood Primary" }),
        teacher({ schoolName: "Oakwood Primary" }),
      ],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  test("new this week only when the third teacher joined in the last 7 days", () => {
    const old = new Date("2026-10-01T09:00:00Z");
    const recent = new Date("2026-11-20T09:00:00Z");
    const eightDays = new Date("2026-11-15T08:00:00Z");
    const fresh = groupSchools(
      [
        teacher({ schoolName: "Fresh Primary", createdAt: old }),
        teacher({ schoolName: "Fresh Primary", createdAt: old }),
        teacher({ schoolName: "Fresh Primary", createdAt: recent }),
      ],
      NOW,
    );
    expect(fresh[0].newThisWeek).toBe(true);
    const stale = groupSchools(
      [
        teacher({ schoolName: "Stale Primary", createdAt: old }),
        teacher({ schoolName: "Stale Primary", createdAt: old }),
        teacher({ schoolName: "Stale Primary", createdAt: eightDays }),
        teacher({ schoolName: "Stale Primary", createdAt: recent }), // a 4th this week: not new to the list
      ],
      NOW,
    );
    expect(stale[0].newThisWeek).toBe(false);
    expect(stale[0].joinedThisWeek).toBe(1);
  });

  test("counts plans, paying teachers and senior leaders, most teachers first", () => {
    const out = groupSchools(
      [
        teacher({ schoolName: "Small Primary", plan: "free" }),
        teacher({ schoolName: "Small Primary", plan: "free" }),
        teacher({ schoolName: "Small Primary", plan: "pro_trial" }),
        teacher({ schoolName: "Big High", plan: "pro", role: "senior_leader" }),
        teacher({ schoolName: "Big High", plan: "standard" }),
        teacher({ schoolName: "Big High", plan: "free" }),
        teacher({ schoolName: "Big High", plan: "max", role: "senior_leader" }),
      ],
      NOW,
    );
    expect(out.map((g) => g.label)).toEqual(["Big High", "Small Primary"]);
    expect(out[0].paying).toBe(3);
    expect(out[0].seniorLeaders).toBe(2);
    expect(out[0].plans).toEqual({ pro: 1, standard: 1, free: 1, max: 1 });
    expect(out[1].paying).toBe(0);
    expect(out[1].members.map((m) => m.id)).toHaveLength(3);
  });
});

test.describe("schoolsDigest", () => {
  const groups = groupSchools(
    [
      teacher({ email: "a@oakwood.sch.uk", schoolName: "Oak <b>wood</b>", createdAt: new Date("2026-11-21T09:00:00Z") }),
      teacher({ email: "b@oakwood.sch.uk", schoolName: "Oak <b>wood</b>" }),
      teacher({ email: "c@oakwood.sch.uk", schoolName: "Oak <b>wood</b>" }),
    ],
    NOW,
  );

  test("names and counts, never an address, names escaped", () => {
    const m = schoolsDigest(groups, "https://jooma.ai", NOW);
    expect(m.subject).toContain("1 school");
    expect(m.html).toContain("Oak &lt;b&gt;wood&lt;/b&gt;");
    expect(m.html).not.toContain("<b>wood</b>");
    for (const body of [m.html, m.text]) {
      expect(body).not.toContain("a@oakwood.sch.uk");
      expect(body).toContain("https://jooma.ai/admin/school-leads");
      expect(body).not.toMatch(/[–—]/);
    }
    expect(m.text).toContain("New this week");
  });

  test("an empty week still sends a short note", () => {
    const m = schoolsDigest([], "https://jooma.ai", NOW);
    expect(m.subject).toContain("0 schools");
    expect(m.text).toContain("No school has 3 or more teachers yet");
  });
});

test.describe("isDigestTime", () => {
  test("Monday 08:00 UK in winter (08:00 UTC) and summer (07:00 UTC)", () => {
    expect(isDigestTime(new Date("2026-11-23T08:00:00Z"))).toBe(true);
    expect(isDigestTime(new Date("2027-06-07T07:00:00Z"))).toBe(true);
  });

  test("not the other hour, and not other days", () => {
    expect(isDigestTime(new Date("2026-11-23T07:00:00Z"))).toBe(false);
    expect(isDigestTime(new Date("2027-06-07T08:00:00Z"))).toBe(false);
    expect(isDigestTime(new Date("2026-11-22T08:00:00Z"))).toBe(false);
  });
});
