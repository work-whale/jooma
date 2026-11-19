import { requireSection } from "../access";
import { loadSchoolGroups } from "@/app/lib/school-leads-data";
import { MIN_TEACHERS } from "@/app/lib/school-groups";
import { ROLE_OPTIONS } from "@/app/lib/signup-questions";
import { C, Card, CardBody, CardHeader, CardTitle, EmptyState, Note, PageHead, PLAN_TONE, Tag } from "../ui";

/*
 * Jooma 4.5, Phase 3 (spec Step 9): schools with 3 or more Jooma teachers,
 * for outreach. Grouped on the school email domain plus the cleaned school
 * name (rules in app/lib/school-groups.ts, unit tested). Emailed to the team
 * every Monday at 08:00 UK by /api/cron/school-leads.
 *
 * Teachers' addresses are read only to find the school domain and are never
 * shown: first name, plan, role and join date are enough to pick a contact in
 * Teachers.
 */

export const dynamic = "force-dynamic";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro_trial: "Pro trial",
  standard: "Standard",
  pro: "Pro",
  max: "Max",
  school: "School",
};
const ROLE_NAMES = new Map<string, string>(ROLE_OPTIONS.map((r) => [r.value, r.label]));
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

export default async function SchoolLeadsPage() {
  await requireSection("see_people");
  const now = new Date();
  const groups = await loadSchoolGroups(now);
  const fresh = groups.filter((g) => g.newThisWeek).length;

  return (
    <>
      <PageHead
        title="Schools with 3+ teachers"
        sub={`Schools with ${MIN_TEACHERS} or more Jooma teachers, for outreach. ${groups.length} now, ${fresh} new to the list in the last 7 days. Emailed to the team every Monday at 08:00.`}
      />
      <div className="grid gap-5">
        <Note>
          Teachers are grouped by their school email domain and the school name they typed at signup (spelling,
          &quot;St&quot; and &quot;C of E&quot; differences are ignored). Gmail, Hotmail and other personal addresses,
          and domains many schools share (Hwb, C2k, LGfL, Glow), only count through the typed name. Closed and
          suspended accounts and Jooma staff are left out.
        </Note>
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              title={`No school has ${MIN_TEACHERS} or more teachers yet`}
              body="School names come from the signup question added in Phase 2, so this list fills up as new teachers join."
            />
          </Card>
        ) : (
          groups.map((g) => (
            <Card key={g.key}>
              <CardHeader>
                <CardTitle>
                  {g.label}
                  {g.domain && g.domain !== g.label && (
                    <span className="font-normal ml-2" style={{ color: C.muted }}>
                      {g.domain}
                    </span>
                  )}
                </CardTitle>
                {g.newThisWeek && <Tag tone="ok">New this week</Tag>}
                <Tag tone="brand">{g.teachers} teachers</Tag>
                <Tag tone={g.paying ? "ok" : "plain"}>{g.paying} paying</Tag>
                {g.seniorLeaders > 0 && <Tag tone="warn">{g.seniorLeaders} senior leader{g.seniorLeaders === 1 ? "" : "s"}</Tag>}
              </CardHeader>
              <CardBody tight>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: C.muted }}>
                      <th className="px-4 py-2 font-semibold">First name</th>
                      <th className="px-4 py-2 font-semibold">Role</th>
                      <th className="px-4 py-2 font-semibold">Plan</th>
                      <th className="px-4 py-2 font-semibold">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.members.map((m) => (
                      <tr key={m.id} className="border-t" style={{ borderColor: C.divider }}>
                        <td className="px-4 py-2" style={{ color: C.ink }}>
                          {m.firstName || "Not given"}
                        </td>
                        <td className="px-4 py-2" style={{ color: C.ink2 }}>
                          {(m.role && ROLE_NAMES.get(m.role)) || "Not given"}
                        </td>
                        <td className="px-4 py-2">
                          <Tag tone={PLAN_TONE[m.plan] ?? "plain"}>{PLAN_NAMES[m.plan] ?? m.plan}</Tag>
                        </td>
                        <td className="px-4 py-2 tabular-nums" style={{ color: C.ink2 }}>
                          {DATE.format(m.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
