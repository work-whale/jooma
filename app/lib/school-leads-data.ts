import "server-only";
import { supabaseAdmin } from "@/app/lib/supabase-admin";
import { planInForce } from "@/app/lib/account-plan";
import { groupSchools, type SchoolGroup, type SchoolTeacher } from "@/app/lib/school-groups";

/*
 * Reads every live teacher for the schools list (Phase 3): the profile fields
 * and the sign-in address, under the service role. Callers check access
 * first: the admin page through requireSection("see_people"), the Monday cron
 * through CRON_SECRET. Addresses are only used to find the school domain and
 * never leave this server: the page and the email show names and counts.
 */

const PAGE = 1000;
const MAX = 200_000;

interface ProfileRow {
  id: string;
  first_name: string | null;
  plan: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  school_name: string | null;
  job_role: string | null;
  created_at: string;
}

async function allEmails(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; page * PAGE <= MAX; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email) out.set(u.id, u.email);
    if (data.users.length < PAGE) break;
  }
  return out;
}

async function allProfiles(): Promise<ProfileRow[]> {
  const out: ProfileRow[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, first_name, plan, trial_ends_at, subscription_status, stripe_subscription_id, current_period_end, school_name, job_role, created_at",
      )
      .is("suspended_at", null)
      .is("deletion_scheduled_for", null)
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ProfileRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadSchoolGroups(now: Date): Promise<SchoolGroup[]> {
  const [emails, profiles] = await Promise.all([allEmails(), allProfiles()]);
  const teachers: SchoolTeacher[] = profiles.map((p) => ({
    id: p.id,
    email: emails.get(p.id) ?? null,
    schoolName: p.school_name,
    plan: planInForce(p, now),
    role: p.job_role,
    firstName: p.first_name,
    createdAt: new Date(p.created_at),
  }));
  return groupSchools(teachers, now);
}
