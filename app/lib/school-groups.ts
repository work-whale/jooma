/*
 * The weekly list of schools with 3 or more Jooma teachers (Jooma 4.5 spec
 * Step 9, Phase 3), for outreach.
 *
 * Owner's choice (19 Nov): group on the school email domain plus the cleaned
 * school name the teacher typed at signup (profiles.school_name). Most
 * teachers sign up with free webmail (on 19 Nov production had no school
 * domain with 3 accounts, and 136 Gmail ones), so the typed name does most of
 * the work and the domain joins the rest up.
 *
 * The rules, in order:
 *   1. Free webmail, platforms many schools share (Hwb in Wales, C2k in
 *      Northern Ireland, LGfL in London, Glow in Scotland), test addresses and
 *      Jooma's own staff never make a school domain. Staff are not counted.
 *   2. A teacher with a school domain and a name goes in "domain + name". One
 *      domain with two names typed (a trust's shared domain) is two schools.
 *   3. A teacher with a school domain and no name joins that domain's school
 *      when exactly one name was typed there, otherwise "domain, no name".
 *   4. A webmail teacher with a name joins the one domain school with that
 *      name; if none or more than one has it, the name alone is the school.
 *   5. A teacher with neither is left out.
 *
 * Pure: the admin page and the Monday cron read the teachers (service role,
 * after their own checks) and ask this file for the list.
 */

import { PLAN_TIMEZONE } from "@/app/lib/plan-config";

export const MIN_TEACHERS = 3;
const WEEK_MS = 7 * 86_400_000;
const PAID = new Set(["standard", "pro", "max", "school"]);

export interface SchoolTeacher {
  id: string;
  email: string | null;
  /** profiles.school_name, as typed. */
  schoolName: string | null;
  /** The plan in force. */
  plan: string;
  /** profiles.job_role */
  role: string | null;
  firstName: string | null;
  createdAt: Date;
}

export interface SchoolMember {
  id: string;
  firstName: string | null;
  plan: string;
  role: string | null;
  createdAt: Date;
}

export interface SchoolGroup {
  key: string;
  /** The commonest spelling typed, else the domain. */
  label: string;
  /** The school email domain, or null when grouped on the name alone. */
  domain: string | null;
  teachers: number;
  plans: Record<string, number>;
  paying: number;
  seniorLeaders: number;
  /** Teachers who joined in the last 7 days. */
  joinedThisWeek: number;
  /** The third teacher joined in the last 7 days: new to the list. */
  newThisWeek: boolean;
  members: SchoolMember[];
}

/** Free personal email. A domain here says nothing about the school. */
const WEBMAIL = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "outlook.co.uk", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aol.co.uk",
  "btinternet.com", "btopenworld.com", "sky.com", "virginmedia.com", "ntlworld.com", "blueyonder.co.uk",
  "talktalk.net", "tiscali.co.uk", "plus.net",
  "protonmail.com", "proton.me", "mail.com", "gmx.com", "gmx.co.uk", "zoho.com",
]);

/** One domain for many schools: a whole nation's or region's teachers. */
const SHARED = new Set([
  "hwbcymru.net", // Wales (Hwb)
  "c2kni.net", "c2ken.net", // Northern Ireland (C2k)
  "lgflmail.org", "lgfl.net", // London Grid for Learning
  "glow.sch.uk", // Scotland (Glow)
]);

const STAFF = new Set(["jooma.ai"]);
const RESERVED_TLD = /\.(test|example|invalid|localhost)$/;

function domainOf(email: string | null): string | null {
  const m = /^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/.exec((email ?? "").trim().toLowerCase());
  return m ? m[1] : null;
}

/** The school's own email domain, or null when the address says nothing about the school. */
export function schoolDomain(email: string | null): string | null {
  const d = domainOf(email);
  if (!d || WEBMAIL.has(d) || SHARED.has(d) || STAFF.has(d) || RESERVED_TLD.test(d)) return null;
  return d;
}

function isStaff(email: string | null): boolean {
  const d = domainOf(email);
  return d !== null && STAFF.has(d);
}

/** A school name for matching: lower case, no punctuation, common variants merged. */
export function cleanSchoolName(name: string | null): string | null {
  if (!name) return null;
  const raw = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const words: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const w = raw[i];
    if (w === "c" && raw[i + 1] === "of" && raw[i + 2] === "e") {
      words.push("ce");
      i += 2;
    } else if (w === "c" && raw[i + 1] === "e") {
      words.push("ce");
      i += 1;
    } else if (w === "r" && raw[i + 1] === "c") {
      words.push("rc");
      i += 1;
    } else if (w === "cofe") {
      words.push("ce");
    } else if (w === "st") {
      words.push("saint");
    } else {
      words.push(w);
    }
  }
  if (words[0] === "the") words.shift();
  while (words[words.length - 1] === "school") words.pop();
  const out = words.join(" ");
  return out.length >= 2 ? out : null;
}

function commonest(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/** Schools with at least `min` teachers, most teachers first. */
export function groupSchools(teachers: readonly SchoolTeacher[], now: Date, min = MIN_TEACHERS): SchoolGroup[] {
  const unique = new Map<string, SchoolTeacher>();
  for (const t of teachers) if (!unique.has(t.id) && !isStaff(t.email)) unique.set(t.id, t);

  const tagged = [...unique.values()].map((t) => ({ t, d: schoolDomain(t.email), n: cleanSchoolName(t.schoolName) }));

  // Names typed on each school domain, and the domains each name was typed on.
  const namesOnDomain = new Map<string, Set<string>>();
  const domainsForName = new Map<string, Set<string>>();
  for (const { d, n } of tagged) {
    if (!d || !n) continue;
    if (!namesOnDomain.has(d)) namesOnDomain.set(d, new Set());
    namesOnDomain.get(d)!.add(n);
    if (!domainsForName.has(n)) domainsForName.set(n, new Set());
    domainsForName.get(n)!.add(d);
  }

  const groups = new Map<string, { domain: string | null; list: SchoolTeacher[] }>();
  for (const { t, d, n } of tagged) {
    let domain: string | null = null;
    let name: string | null = null;
    if (d && n) {
      domain = d;
      name = n;
    } else if (d) {
      const names = namesOnDomain.get(d);
      domain = d;
      name = names && names.size === 1 ? [...names][0] : null;
    } else if (n) {
      const domains = domainsForName.get(n);
      domain = domains && domains.size === 1 ? [...domains][0] : null;
      name = n;
    } else {
      continue;
    }
    const key = `${domain ?? ""}|${name ?? ""}`;
    if (!groups.has(key)) groups.set(key, { domain, list: [] });
    groups.get(key)!.list.push(t);
  }

  const weekAgo = now.getTime() - WEEK_MS;
  const out: SchoolGroup[] = [];
  for (const [key, { domain, list }] of groups) {
    if (list.length < min) continue;
    const byJoin = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const plans: Record<string, number> = {};
    for (const t of list) plans[t.plan] = (plans[t.plan] ?? 0) + 1;
    const typed = list.map((t) => t.schoolName?.trim()).filter((v): v is string => Boolean(v));
    out.push({
      key,
      label: commonest(typed) ?? domain ?? key,
      domain,
      teachers: list.length,
      plans,
      paying: list.filter((t) => PAID.has(t.plan)).length,
      seniorLeaders: list.filter((t) => t.role === "senior_leader").length,
      joinedThisWeek: list.filter((t) => t.createdAt.getTime() >= weekAgo).length,
      newThisWeek: byJoin[min - 1].createdAt.getTime() >= weekAgo,
      members: byJoin.map((t) => ({ id: t.id, firstName: t.firstName, plan: t.plan, role: t.role, createdAt: t.createdAt })),
    });
  }
  return out.sort((a, b) => b.teachers - a.teachers || a.label.localeCompare(b.label));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Monday email to the Jooma team: school names and counts, never a teacher's address. */
export function schoolsDigest(
  groups: readonly SchoolGroup[],
  site: string,
  now: Date,
): { subject: string; html: string; text: string } {
  const link = `${site.replace(/\/+$/, "")}/admin/school-leads`;
  const fresh = groups.filter((g) => g.newThisWeek);
  const week = new Intl.DateTimeFormat("en-GB", { timeZone: PLAN_TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(now);
  const subject = `Schools with 3+ Jooma teachers: ${plural(groups.length, "school", "schools")}, ${fresh.length} new this week`;
  const line = (g: SchoolGroup) =>
    `${g.label}${g.domain && g.domain !== g.label ? ` (${g.domain})` : ""}: ${plural(g.teachers, "teacher", "teachers")}, ${g.paying} paying` +
    (g.joinedThisWeek ? `, ${g.joinedThisWeek} joined this week` : "");

  const textParts = [`Week of ${week}.`];
  if (groups.length === 0) {
    textParts.push("No school has 3 or more teachers yet.");
  } else {
    if (fresh.length) textParts.push(`New this week:\n${fresh.map((g) => `  ${line(g)}`).join("\n")}`);
    textParts.push(`All schools:\n${groups.map((g) => `  ${line(g)}`).join("\n")}`);
  }
  textParts.push(`Teachers, plans and roles for each school: ${link}`);
  const text = textParts.join("\n\n");

  const row = (g: SchoolGroup) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(g.label)}${g.newThisWeek ? ' <strong style="color:#1E7A4C">New</strong>' : ""}` +
    `${g.domain && g.domain !== g.label ? `<br><span style="color:#8E87A4;font-size:12px">${esc(g.domain)}</span>` : ""}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${g.teachers}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${g.paying}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${g.joinedThisWeek}</td></tr>`;
  const body =
    groups.length === 0
      ? `<p style="font-size:15px">No school has 3 or more teachers yet.</p>`
      : `<p style="font-size:15px">${plural(groups.length, "school has", "schools have")} 3 or more Jooma teachers. ${fresh.length} reached 3 this week.</p>` +
        `<table style="border-collapse:collapse;font-size:14px;width:100%"><tr style="text-align:left;color:#8E87A4">` +
        `<th style="padding:6px 8px">School</th><th style="padding:6px 8px;text-align:right">Teachers</th>` +
        `<th style="padding:6px 8px;text-align:right">Paying</th><th style="padding:6px 8px;text-align:right">Joined this week</th></tr>` +
        groups.map(row).join("") +
        `</table>`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1D1730;max-width:640px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${esc(subject)}</h1><p style="color:#8E87A4">Week of ${esc(week)}.</p>${body}
<p><a href="${esc(link)}" style="display:inline-block;background:#1E1138;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none">Open the list in admin</a></p></body></html>`;
  return { subject, html, text };
}

/** Monday 08:00 to 08:59 UK time. The cron runs at 07:00 and 08:00 UTC on Mondays so one of them is 08:00 UK all year. */
export function isDigestTime(now: Date): boolean {
  const p: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat("en-GB", {
    timeZone: PLAN_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)) {
    p[type] = value;
  }
  return p.weekday === "Mon" && Number(p.hour) === 8;
}
