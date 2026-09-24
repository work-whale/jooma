// The admin role list, and the labels that go with it.
//
// WHY THIS FILE EXISTS
//
// The four roles were previously written out in three separate places: the
// select in TeamView, the picker in AddAdminModal, and the matrix columns in
// between. Adding or removing a role meant finding all three, and the SQL that
// actually enforces the list is somewhere else again. This is the single TS
// source; the SQL side is listed below so the full set is findable from here.
//
// THE SQL SIDE, WHICH THIS FILE CANNOT REACH
//
// Postgres validates the same list in three places, and all three must change
// together with this one:
//   1. the admin_team.role CHECK constraint
//   2. the inline `p_role not in (...)` guard in admin_set_role()
//   3. the same guard in admin_grant_admin()
//
// No "use client": imported by both client components and route handlers.

export const ADMIN_ROLES = ["super_admin", "support", "finance", "marketing"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  support: "Support",
  finance: "Finance",
  marketing: "Marketing",
};

/** One line on what the role is for, shown under the picker when choosing it. */
export const ROLE_HINT: Record<string, string> = {
  super_admin: "Everything, including managing admins.",
  support: "Teacher accounts, grants, password resets.",
  finance: "Plans, prices, refunds, invoices.",
  marketing: "Stats and bulk emails. No teacher data, no billing, no settings.",
};

/** Which sidebar section each permission unlocks. One per nav group, plus
 *  Stats, which is its own group so a role can hold it without see_overview. */
export const SECTION_PERMISSIONS = [
  "see_overview",
  "see_stats",
  "see_people",
  "see_money",
  "see_product",
  "see_support",
  "see_content",
  "see_admin",
] as const;

export const PERMISSION_LABEL: Record<string, string> = {
  // Sections: what they can see.
  see_overview: "See the dashboard",
  see_stats: "See stats",
  see_people: "See teachers and schools",
  see_money: "See plans, payments and promos",
  see_product: "See usage, tools and flags",
  see_support: "See the inbox and enquiries",
  see_content: "See copy, emails and announcements",
  see_admin: "See team, audit and settings",
  // Actions: what they can do.
  see_teachers: "See teacher accounts",
  reset_passwords: "Reset passwords",
  view_as_teacher: "View as a teacher",
  invite_teachers: "Invite teachers",
  grant_allowance: "Grant resources or AI images",
  suspend_accounts: "Suspend accounts",
  change_plan: "Change a plan or price",
  issue_refunds: "Issue refunds",
  edit_copy: "Edit website copy",
  onboard_school: "Onboard a school",
  toggle_tools: "Turn tools on and off",
  see_deletions: "See deletion requests",
  manage_admins: "Manage admins",
  export_personal_data: "Export personal data",
  send_email_campaigns: "Send bulk emails",
};

// Display order matters here — it reads as a story from least to most
// sensitive, which is how someone auditing it will scan. Sections come first:
// "what can they see" is the coarser question, and answering it first makes the
// action rows below easier to read.
export const PERMISSION_ORDER = [
  ...SECTION_PERMISSIONS,
  "see_teachers",
  "reset_passwords",
  "view_as_teacher",
  "invite_teachers",
  "grant_allowance",
  "suspend_accounts",
  "change_plan",
  "issue_refunds",
  "edit_copy",
  "send_email_campaigns",
  "onboard_school",
  "toggle_tools",
  "see_deletions",
  "manage_admins",
  "export_personal_data",
];
