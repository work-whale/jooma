import { test, expect } from "@playwright/test";
import {
  LIFECYCLE_CATALOGUE,
  lifecycleMaySend,
  parseLifecycleSwitch,
  sampleLifecycleVars,
} from "@/app/lib/lifecycle-switch";
import { LIFECYCLE_IDS, renderLifecycleEmail } from "@/app/lib/lifecycle-emails";

/*
 * The switch for the automatic teacher emails, moved from the Vercel variable
 * LIFECYCLE_EMAILS into Admin, Emails & templates (owner, 20 Nov). Stored as
 * app_settings.lifecycle_emails = { enabled, off: [ids] }.
 *
 * Edge cases. The setting: missing, null, a bare boolean, a string, a broken
 * object all read as OFF (a bug or a failed read must never start sending
 * to real teachers); unknown ids in `off` are dropped. Sending: off when the
 * master switch is off, whatever the per-email list says; one email turned
 * off stays off while the master is on; LIFECYCLE_EMAILS=off in Vercel is an
 * emergency stop that beats the admin switch; the old LIFECYCLE_EMAILS=on no
 * longer turns sending on by itself. The admin list: every email the cron can
 * send is listed once, its account or marketing label matches what the email
 * really is, and every one renders from the sample values with no dashes and
 * none of the words the copy rules ban.
 */

test.describe("parseLifecycleSwitch", () => {
  test("anything but a well formed object is off", () => {
    for (const v of [undefined, null, true, "on", 1, [], {}, { enabled: "true" }]) {
      expect(parseLifecycleSwitch(v), JSON.stringify(v)).toEqual({ enabled: false, off: [] });
    }
  });

  test("reads enabled and the emails turned off, dropping unknown ids", () => {
    expect(parseLifecycleSwitch({ enabled: true, off: ["E8", "E99", 3, "E14"] })).toEqual({ enabled: true, off: ["E8", "E14"] });
  });
});

test.describe("lifecycleMaySend", () => {
  const on = { enabled: true, off: [] };

  test("nothing sends while the master switch is off", () => {
    expect(lifecycleMaySend({ enabled: false, off: [] }, "E1", {})).toBe(false);
  });

  test("an email turned off stays off while the rest send", () => {
    const sw = { enabled: true, off: ["E8" as const] };
    expect(lifecycleMaySend(sw, "E8", {})).toBe(false);
    expect(lifecycleMaySend(sw, "E1", {})).toBe(true);
  });

  test("LIFECYCLE_EMAILS=off in Vercel stops everything", () => {
    expect(lifecycleMaySend(on, "E1", { LIFECYCLE_EMAILS: "off" })).toBe(false);
  });

  // Security review (20 Nov): only the exact "off" stopped, so a typo like
  // "Off" or "false" let emails through. Anything set but "on" now stops.
  test("any value but empty or on is a stop, whatever its spelling", () => {
    for (const v of ["Off", "OFF", " off ", "false", "0", "no", "stop"]) {
      expect(lifecycleMaySend(on, "E1", { LIFECYCLE_EMAILS: v }), v).toBe(false);
    }
    expect(lifecycleMaySend(on, "E1", { LIFECYCLE_EMAILS: "on" })).toBe(true);
    expect(lifecycleMaySend(on, "E1", { LIFECYCLE_EMAILS: " ON " })).toBe(true);
    expect(lifecycleMaySend(on, "E1", { LIFECYCLE_EMAILS: "" })).toBe(true);
    expect(lifecycleMaySend(on, "E1", {})).toBe(true);
  });

  test("the old LIFECYCLE_EMAILS=on does not start sending by itself", () => {
    expect(lifecycleMaySend({ enabled: false, off: [] }, "E1", { LIFECYCLE_EMAILS: "on" })).toBe(false);
  });
});

test.describe("the admin list", () => {
  test("every email the cron sends is listed once", () => {
    expect(LIFECYCLE_CATALOGUE.map((e) => e.id).sort()).toEqual([...LIFECYCLE_IDS].sort());
  });

  test("each row's account or marketing label is what the email really is", () => {
    const vars = sampleLifecycleVars();
    for (const e of LIFECYCLE_CATALOGUE) {
      const m = renderLifecycleEmail(e.id, vars, { unsubToken: "sample" });
      expect(m.kind, e.id).toBe(e.kind);
    }
  });

  test("every email renders from the sample values within the copy rules", () => {
    const vars = sampleLifecycleVars();
    for (const e of LIFECYCLE_CATALOGUE) {
      const m = renderLifecycleEmail(e.id, vars, { unsubToken: "sample" });
      const text = `${m.subject} ${m.preheader} ${m.body} ${m.button}`;
      expect(text, e.id).not.toMatch(/[–—]|\bAI\b|\bcredits?\b|\btokens?\b|undefined|NaN/);
      expect(e.when.length, e.id).toBeGreaterThan(3);
    }
  });
});

// Security review (20 Nov): admin_set_lifecycle_emails refuses unknown ids,
// so the database's list must be exactly the code's, or a real email could
// never be switched off (or a stray id be stored).
test("the database's list of email ids is the code's", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sql: string = require("node:fs").readFileSync("supabase/migrations/20261120000100_lifecycle_switch_guard.sql", "utf8");
  const list = /v_known\s+text\[\]\s*:=\s*array\[([^\]]+)\]/.exec(sql)?.[1] ?? "";
  const ids = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  expect(ids.sort()).toEqual([...LIFECYCLE_IDS].sort());
});
